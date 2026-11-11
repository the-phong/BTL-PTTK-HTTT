require("dotenv").config();
const test = require("node:test");
const { after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const request = require("supertest");
const app = require("../src/app");
const service = require("../src/features/booking/service");
const repo = require("../src/features/booking/repository");
const { getPool } = require("../src/shared/db");

const enabled = process.env.RUN_DB_TESTS === "1";
const T1 = { start: "2090-11-12T08:00", end: "2090-11-13T08:00" };
const item = (id, period = T1) => ({
  id,
  ...period,
  quotedPrice: 50000,
  hours: 24,
});
const suffix = () => crypto.randomBytes(5).toString("hex");
const csrf = (html) => {
  const match = /name="_csrf" value="([a-f0-9]+)"/.exec(html);
  assert.ok(match);
  return match[1];
};

async function fixture() {
  const pool = getPool();
  const tag = suffix();
  const password = "book-test-password";
  const hash = await bcrypt.hash(password, 4);
  const customers = [];
  for (let i = 0; i < 2; i++) {
    const email = `book-${tag}-${i}@example.test`;
    const [member] = await pool.execute(
      "INSERT INTO tblThanhVien(HoTen,NgaySinh,SoDienThoai,Email,DiaChi,MatKhau) VALUES(?,?,?,?,?,?)",
      [
        "Khách Đặt Xe",
        "2000-01-01",
        `09${String(crypto.randomInt(0, 100000000)).padStart(8, "0")}`,
        email,
        "Hà Nội, Việt Nam",
        hash,
      ],
    );
    const [customer] = await pool.execute(
      "INSERT INTO tblKhachHang(MaTV,MaKhachHang) VALUES(?,?)",
      [member.insertId, `BOOK-${tag}-${i}`],
    );
    customers.push({
      memberId: member.insertId,
      customerId: customer.insertId,
      email,
      password,
    });
  }
  const cars = [];
  for (let i = 0; i < 2; i++) {
    const code = `BOOK-${tag}-${i}`;
    const [car] = await pool.execute(
      "INSERT INTO tblXeOTo(MaXeHienThi,TenXe,BienSo,LoaiXe,SoCho,HangXe,NamSanXuat,DonGiaGio) VALUES(?,?,?,?,?,?,?,?)",
      [code, `Booking car ${i}`, code, "SUV", 7, "Test", 2024, 50000],
    );
    cars.push(car.insertId);
  }
  return { customers, cars };
}
async function cleanup(f) {
  const pool = getPool();
  for (const customer of f.customers) {
    await pool.execute("DELETE FROM tblPhieuDatXe WHERE MaKH=?", [
      customer.customerId,
    ]);
  }
  for (const carId of f.cars)
    await pool.execute("DELETE FROM tblXeOTo WHERE MaXe=?", [carId]);
  for (const customer of f.customers)
    await pool.execute("DELETE FROM tblThanhVien WHERE MaTV=?", [
      customer.memberId,
    ]);
}
async function count(customerId) {
  const [[row]] = await getPool().execute(
    "SELECT COUNT(*) AS total FROM tblPhieuDatXe WHERE MaKH=?",
    [customerId],
  );
  return row.total;
}
async function agentFor(customer) {
  const agent = request.agent(app);
  const login = await agent.get("/dang-nhap").expect(200);
  await agent
    .post("/dang-nhap")
    .type("form")
    .send({
      email: customer.email,
      password: customer.password,
      _csrf: csrf(login.text),
    })
    .expect(302);
  return agent;
}
async function select(agent, carId) {
  const search = await agent
    .get("/dat-xe/tim")
    .query({ type: "SUV", seats: "7", ...T1 })
    .expect(200);
  await agent
    .post("/dat-xe/chon")
    .type("form")
    .send({ carId, _csrf: csrf(search.text) })
    .expect(302);
}
if (enabled) after(async () => getPool().end());

test(
  "BOOK-01: một xe tạo một phiếu, một chi tiết",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    try {
      const result = await repo.confirm(f.customers[0].customerId, [
        item(f.cars[0]),
      ]);
      const [[row]] = await getPool().execute(
        "SELECT COUNT(*) AS total FROM tblChiTietPhieuDat WHERE MaPhieu=?",
        [result.id],
      );
      assert.equal(await count(f.customers[0].customerId), 1);
      assert.equal(row.total, 1);
    } finally {
      await cleanup(f);
    }
  },
);

test(
  "BOOK-02: hai xe tạo một phiếu, hai chi tiết",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    try {
      const result = await repo.confirm(
        f.customers[0].customerId,
        f.cars.map((id) => item(id)),
      );
      const [[row]] = await getPool().execute(
        "SELECT COUNT(*) AS total FROM tblChiTietPhieuDat WHERE MaPhieu=?",
        [result.id],
      );
      assert.equal(await count(f.customers[0].customerId), 1);
      assert.equal(row.total, 2);
    } finally {
      await cleanup(f);
    }
  },
);

test(
  "BOOK-03: xe bị đặt ngay trước xác nhận thì không tạo phiếu thứ hai",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    try {
      await repo.confirm(f.customers[0].customerId, [item(f.cars[0])]);
      await assert.rejects(
        repo.confirm(f.customers[1].customerId, [item(f.cars[0])]),
        /đặt trong khoảng thời gian này/,
      );
      assert.equal(await count(f.customers[1].customerId), 0);
    } finally {
      await cleanup(f);
    }
  },
);

test(
  "BOOK-04: hai khách cùng xác nhận một xe chỉ một phiếu thành công",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    try {
      const results = await Promise.allSettled(
        f.customers.map((customer) =>
          repo.confirm(customer.customerId, [item(f.cars[0])]),
        ),
      );
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        (await count(f.customers[0].customerId)) +
          (await count(f.customers[1].customerId)),
        1,
      );
    } finally {
      await cleanup(f);
    }
  },
);

test(
  "BOOK-05: giá đổi sau khi xem giỏ thì từ chối giá cũ",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    try {
      const agent = await agentFor(f.customers[0]);
      await select(agent, f.cars[0]);
      const cart = await agent.get("/dat-xe/gio-hang").expect(200);
      assert.match(cart.text, /1\.200\.000/);
      await getPool().execute("UPDATE tblXeOTo SET DonGiaGio=? WHERE MaXe=?", [
        60000,
        f.cars[0],
      ]);
      const response = await agent
        .post("/dat-xe/xac-nhan")
        .type("form")
        .send({ _csrf: csrf(cart.text) })
        .expect(302);
      assert.equal(response.headers.location, "/dat-xe/gio-hang");
      assert.equal(await count(f.customers[0].customerId), 0);
      const refreshed = await agent.get("/dat-xe/gio-hang").expect(200);
      assert.match(refreshed.text, /Đơn giá đã thay đổi/);
      assert.match(refreshed.text, /1\.440\.000/);
    } finally {
      await cleanup(f);
    }
  },
);

test(
  "BOOK-06: lỗi khi ghi chi tiết thứ hai rollback phiếu và chi tiết thứ nhất",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    const pool = getPool();
    const trigger = `trg_book06_${suffix()}`;
    await pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON tblChiTietPhieuDat FOR EACH ROW BEGIN
    IF NEW.MaXe = ${f.cars[1]} THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'BOOK-06 forced failure';
    END IF;
  END`);
    try {
      await assert.rejects(
        repo.confirm(
          f.customers[0].customerId,
          f.cars.map((id) => item(id)),
        ),
        /BOOK-06 forced failure/,
      );
      assert.equal(await count(f.customers[0].customerId), 0);
      const [[row]] = await pool.execute(
        "SELECT COUNT(*) AS total FROM tblChiTietPhieuDat WHERE MaXe IN (?, ?)",
        f.cars,
      );
      assert.equal(row.total, 0);
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${trigger}`);
      await cleanup(f);
    }
  },
);

test("BOOK-07: giỏ rỗng không tạo phiếu", { skip: !enabled }, async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      service.confirm(f.customers[0].customerId, []),
      /ít nhất một xe/,
    );
    assert.equal(await count(f.customers[0].customerId), 0);
  } finally {
    await cleanup(f);
  }
});

test(
  "BOOK-08: xác nhận liên tục từ cùng giỏ chỉ lưu một phiếu",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    try {
      const agent = await agentFor(f.customers[0]);
      await select(agent, f.cars[0]);
      const cart = await agent.get("/dat-xe/gio-hang").expect(200);
      const form = { _csrf: csrf(cart.text) };
      const responses = await Promise.all([
        agent.post("/dat-xe/xac-nhan").type("form").send(form),
        agent.post("/dat-xe/xac-nhan").type("form").send(form),
      ]);
      assert.equal(
        responses.filter((response) =>
          /^\/dat-xe\/phieu\/\d+$/.test(response.headers.location || ""),
        ).length,
        1,
      );
      assert.equal(await count(f.customers[0].customerId), 1);
    } finally {
      await cleanup(f);
    }
  },
);

test(
  "BOOK-09: khách A mở URL phiếu của B nhận HTTP 404",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    try {
      const booking = await repo.confirm(f.customers[1].customerId, [
        item(f.cars[0]),
      ]);
      const agent = await agentFor(f.customers[0]);
      await agent.get(`/dat-xe/phieu/${booking.id}`).expect(404);
    } finally {
      await cleanup(f);
    }
  },
);

test(
  "BOOK-10: mã phiếu dạng PD000001, duy nhất và trùng dữ liệu DB",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    try {
      const first = await repo.confirm(f.customers[0].customerId, [
        item(f.cars[0]),
      ]);
      const second = await repo.confirm(f.customers[0].customerId, [
        item(f.cars[1]),
      ]);
      for (const booking of [first, second]) {
        const [[row]] = await getPool().execute(
          "SELECT MaPhieuHienThi FROM tblPhieuDatXe WHERE MaPhieu=?",
          [booking.id],
        );
        assert.match(booking.code, /^PD\d{6,}$/);
        assert.equal(booking.code, `PD${String(booking.id).padStart(6, "0")}`);
        assert.equal(row.MaPhieuHienThi, booking.code);
      }
      assert.notEqual(first.code, second.code);
    } finally {
      await cleanup(f);
    }
  },
);
