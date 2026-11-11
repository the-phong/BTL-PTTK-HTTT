require("dotenv").config();
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const repo = require("../src/features/booking/repository");
const { getPool } = require("../src/shared/db");

const enabled = process.env.RUN_DB_TESTS === "1";
const prefix = `TEST${crypto.randomBytes(4).toString("hex")}`;

async function fixture() {
  const pool = getPool();
  const [member] = await pool.execute(
    "INSERT INTO tblThanhVien(HoTen,NgaySinh,SoDienThoai,Email,DiaChi,MatKhau) VALUES(?,?,?,?,?,?)",
    [
      "Integration Test",
      "2000-01-01",
      `09${crypto.randomBytes(4).toString("hex").slice(0, 8).replace(/[a-f]/g, "1")}`,
      `${prefix}@example.test`,
      "Test address",
      "test-only",
    ],
  );
  const [customer] = await pool.execute(
    "INSERT INTO tblKhachHang(MaTV,MaKhachHang) VALUES(?,?)",
    [member.insertId, prefix],
  );
  const [car] = await pool.execute(
    "INSERT INTO tblXeOTo(MaXeHienThi,TenXe,BienSo,LoaiXe,SoCho,HangXe,NamSanXuat,DonGiaGio) VALUES(?,?,?,?,?,?,?,?)",
    [prefix, "Test car", prefix, "SUV", 7, "Test", 2024, 50000],
  );
  return {
    memberId: member.insertId,
    customerId: customer.insertId,
    carId: car.insertId,
  };
}

async function cleanup(f) {
  const pool = getPool();
  await pool.execute("DELETE FROM tblPhieuDatXe WHERE MaKH=?", [f.customerId]);
  await pool.execute("DELETE FROM tblXeOTo WHERE MaXe=?", [f.carId]);
  await pool.execute("DELETE FROM tblThanhVien WHERE MaTV=?", [f.memberId]);
}

test(
  "MySQL: chỉ một trong hai yêu cầu đồng thời được đặt cùng xe",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    const start = "2090-01-01T08:00";
    const end = "2090-01-02T08:00";
    const items = [{ id: f.carId, start, end, quotedPrice: 50000, hours: 24 }];
    try {
      const results = await Promise.allSettled([
        repo.confirm(f.customerId, items),
        repo.confirm(f.customerId, items),
      ]);
      assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
      assert.equal(results.filter((x) => x.status === "rejected").length, 1);
      const [rows] = await getPool().execute(
        "SELECT COUNT(*) AS count FROM tblPhieuDatXe WHERE MaKH=?",
        [f.customerId],
      );
      assert.equal(rows[0].count, 1);
    } finally {
      await cleanup(f);
    }
  },
);

test(
  "MySQL: giá thay đổi làm rollback toàn bộ phiếu",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    try {
      await assert.rejects(
        repo.confirm(f.customerId, [
          {
            id: f.carId,
            start: "2090-01-01T08:00",
            end: "2090-01-02T08:00",
            quotedPrice: 40000,
            hours: 24,
          },
        ]),
        /Đơn giá đã thay đổi/,
      );
      const [rows] = await getPool().execute(
        "SELECT COUNT(*) AS count FROM tblPhieuDatXe WHERE MaKH=?",
        [f.customerId],
      );
      assert.equal(rows[0].count, 0);
    } finally {
      await cleanup(f);
    }
  },
);
