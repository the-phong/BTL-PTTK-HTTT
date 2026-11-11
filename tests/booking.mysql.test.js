require("dotenv").config();
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const repo = require("../src/features/booking/repository");
const { getPool } = require("../src/shared/db");
const { after } = require("node:test");

const enabled = process.env.RUN_DB_TESTS === "1";
const prefix = `TEST${crypto.randomBytes(4).toString("hex")}`;
if (enabled) after(async () => getPool().end());

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

test(
  "MySQL + HTTP: đăng nhập, tìm, chọn, xác nhận và chỉ chủ phiếu được xem",
  { skip: !enabled },
  async () => {
    const bcrypt = require("bcryptjs");
    const request = require("supertest");
    const app = require("../src/app");
    const fixtureData = await fixture();
    const password = "integration-password-123";
    const hash = await bcrypt.hash(password, 4);
    const pool = getPool();
    const [otherMember] = await pool.execute(
      "INSERT INTO tblThanhVien(HoTen,NgaySinh,SoDienThoai,Email,DiaChi,MatKhau) VALUES(?,?,?,?,?,?)",
      [
        "Other Customer",
        "2000-01-01",
        `0966${Date.now().toString().slice(-6)}`,
        `${prefix}-other@example.test`,
        "Test address",
        hash,
      ],
    );
    await pool.execute(
      "INSERT INTO tblKhachHang(MaTV,MaKhachHang) VALUES(?,?)",
      [otherMember.insertId, `${prefix}-OTHER`],
    );
    await pool.execute("UPDATE tblThanhVien SET MatKhau=? WHERE MaTV=?", [
      hash,
      fixtureData.memberId,
    ]);
    const [[member]] = await pool.execute(
      "SELECT Email,SoDienThoai FROM tblThanhVien WHERE MaTV=?",
      [fixtureData.memberId],
    );
    const csrf = (html) => {
      const match = /name="_csrf" value="([a-f0-9]+)"/.exec(html);
      assert.ok(match, "form có CSRF token");
      return match[1];
    };
    const startDate = new Date(Date.now() + 3 * 86400000);
    startDate.setUTCHours(1, 0, 0, 0);
    const format = (date) =>
      new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 13) + ":00";
    const start = format(startDate);
    const end = format(new Date(startDate.getTime() + 24 * 3600000));

    try {
      const agent = request.agent(app);
      const login = await agent.get("/dang-nhap").expect(200);
      await agent
        .post("/dang-nhap")
        .type("form")
        .send({
          email: `  ${member.Email.toUpperCase()}  `,
          password,
          _csrf: csrf(login.text),
        })
        .expect(302);

      const profile = await agent.get("/thong-tin-ca-nhan").expect(200);
      assert.match(profile.text, /Thông tin cá nhân/);
      const duplicateProfile = await agent
        .post("/thong-tin-ca-nhan")
        .type("form")
        .send({
          name: "Khách Hàng Đã Sửa",
          birth: "2000-01-01",
          phone: member.SoDienThoai,
          email: `${prefix}-other@example.test`,
          address: "Địa chỉ mới tại Hà Nội",
          _csrf: csrf(profile.text),
        })
        .expect(422);
      assert.match(
        duplicateProfile.text,
        /Email hoặc số điện thoại đã được sử dụng/,
      );
      const updatedProfile = await agent
        .post("/thong-tin-ca-nhan")
        .type("form")
        .send({
          name: "Khách Hàng Đã Sửa",
          birth: "2000-01-01",
          phone: member.SoDienThoai,
          email: `${prefix}-updated@example.test`,
          address: "Địa chỉ mới tại Hà Nội",
          _csrf: csrf(profile.text),
        })
        .expect(200);
      assert.match(updatedProfile.text, /Thông tin cá nhân đã được cập nhật/);
      const [[updatedMember]] = await pool.execute(
        "SELECT HoTen,Email FROM tblThanhVien WHERE MaTV=?",
        [fixtureData.memberId],
      );
      assert.equal(updatedMember.HoTen, "Khách Hàng Đã Sửa");
      assert.equal(
        updatedMember.Email,
        `${prefix}-updated@example.test`.toLowerCase(),
      );

      const search = await agent
        .get("/dat-xe/tim")
        .query({ type: "SUV", seats: "7", start, end })
        .expect(200);
      assert.match(search.text, /Xin chào, Sửa/);
      assert.match(search.text, /Test car/);
      await agent
        .post("/dat-xe/chon")
        .type("form")
        .send({
          carId: fixtureData.carId,
          _csrf: csrf(search.text),
        })
        .expect(302);
      const cart = await agent.get("/dat-xe/gio-hang").expect(200);
      assert.match(cart.text, /1\.200\.000/);
      const confirmed = await agent
        .post("/dat-xe/xac-nhan")
        .type("form")
        .send({
          _csrf: csrf(cart.text),
        })
        .expect(302);
      assert.match(confirmed.headers.location, /^\/dat-xe\/phieu\/\d+$/);
      const detail = await agent.get(confirmed.headers.location).expect(200);
      assert.match(detail.text, /Test car/);
      const otherAgent = request.agent(app);
      const otherLogin = await otherAgent.get("/dang-nhap").expect(200);
      await otherAgent
        .post("/dang-nhap")
        .type("form")
        .send({
          email: `${prefix}-other@example.test`,
          password,
          _csrf: csrf(otherLogin.text),
        })
        .expect(302);
      await otherAgent.get(confirmed.headers.location).expect(404);
      const [[saved]] = await pool.execute(
        "SELECT ct.ThoiGianNhan,ct.ThoiGianTra,ct.DonGiaGio,p.TongTien FROM tblChiTietPhieuDat ct JOIN tblPhieuDatXe p ON p.MaPhieu=ct.MaPhieu WHERE p.MaKH=?",
        [fixtureData.customerId],
      );
      assert.equal(saved.DonGiaGio, 50000);
      assert.equal(saved.TongTien, 1200000);
      assert.equal(saved.ThoiGianNhan.slice(0, 16).replace(" ", "T"), start);
      assert.equal(saved.ThoiGianTra.slice(0, 16).replace(" ", "T"), end);
      assert.equal(
        await repo.detail(
          fixtureData.customerId + 999999,
          Number(confirmed.headers.location.split("/").pop()),
        ),
        null,
      );
    } finally {
      await cleanup(fixtureData);
      await pool.execute("DELETE FROM tblThanhVien WHERE MaTV=?", [
        otherMember.insertId,
      ]);
    }
  },
);

test(
  "MySQL: lỗi ở chi tiết thứ hai rollback cả phiếu và chi tiết thứ nhất",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    const pool = getPool();
    const [second] = await pool.execute(
      "INSERT INTO tblXeOTo(MaXeHienThi,TenXe,BienSo,LoaiXe,SoCho,HangXe,NamSanXuat,DonGiaGio) VALUES(?,?,?,?,?,?,?,?)",
      [
        `${prefix}-2`,
        "Second test car",
        `${prefix}-2`,
        "SUV",
        7,
        "Test",
        2024,
        50000,
      ],
    );
    try {
      await assert.rejects(
        repo.confirm(f.customerId, [
          {
            id: f.carId,
            start: "2090-01-01T08:00",
            end: "2090-01-02T08:00",
            quotedPrice: 50000,
            hours: 24,
          },
          {
            id: second.insertId,
            start: "2090-01-01T08:00",
            end: "2090-01-02T08:00",
            quotedPrice: 50000,
            hours: 0.001,
          },
        ]),
      );
      const [[row]] = await pool.execute(
        "SELECT COUNT(*) AS count FROM tblPhieuDatXe WHERE MaKH=?",
        [f.customerId],
      );
      assert.equal(row.count, 0);
    } finally {
      await pool.execute("DELETE FROM tblXeOTo WHERE MaXe=?", [
        second.insertId,
      ]);
      await cleanup(f);
    }
  },
);

test(
  "MySQL: một phiếu lưu hai khoảng thuê độc lập",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    const pool = getPool();
    const [second] = await pool.execute(
      "INSERT INTO tblXeOTo(MaXeHienThi,TenXe,BienSo,LoaiXe,SoCho,HangXe,NamSanXuat,DonGiaGio) VALUES(?,?,?,?,?,?,?,?)",
      [
        `${prefix}-DIFF`,
        "Second car",
        `${prefix}-DIFF`,
        "SUV",
        7,
        "Test",
        2024,
        50000,
      ],
    );
    try {
      const result = await repo.confirm(f.customerId, [
        {
          id: f.carId,
          start: "2090-01-01T08:00",
          end: "2090-01-02T08:00",
          quotedPrice: 50000,
          hours: 24,
        },
        {
          id: second.insertId,
          start: "2090-01-01T08:00",
          end: "2090-01-03T08:00",
          quotedPrice: 50000,
          hours: 48,
        },
      ]);
      const [rows] = await pool.execute(
        "SELECT MaXe,ThoiGianNhan,ThoiGianTra,SoGio,ThanhTien FROM tblChiTietPhieuDat WHERE MaPhieu=? ORDER BY MaXe",
        [result.id],
      );
      assert.equal(rows.length, 2);
      assert.deepEqual(
        rows.map((row) => Number(row.SoGio)),
        [24, 48],
      );
      assert.deepEqual(
        rows.map((row) => Number(row.ThanhTien)),
        [1200000, 2400000],
      );
      assert.equal(result.total, 3600000);
    } finally {
      await cleanup(f);
      await pool.execute("DELETE FROM tblXeOTo WHERE MaXe=?", [
        second.insertId,
      ]);
    }
  },
);

test(
  "MySQL: hai khách khác nhau cùng đặt một xe, chỉ một khách được xác nhận",
  { skip: !enabled },
  async () => {
    const first = await fixture();
    const pool = getPool();
    const [member] = await pool.execute(
      "INSERT INTO tblThanhVien(HoTen,NgaySinh,SoDienThoai,Email,DiaChi,MatKhau) VALUES(?,?,?,?,?,?)",
      [
        "Second Customer",
        "2000-01-01",
        `0977${Date.now().toString().slice(-6)}`,
        `${prefix}-second@example.test`,
        "Test address",
        "test-only",
      ],
    );
    const [customer] = await pool.execute(
      "INSERT INTO tblKhachHang(MaTV,MaKhachHang) VALUES(?,?)",
      [member.insertId, `${prefix}-SECOND`],
    );
    const start = "2090-04-01T08:00";
    const end = "2090-04-03T08:00";
    const items = [
      { id: first.carId, start, end, quotedPrice: 50000, hours: 48 },
    ];
    try {
      const results = await Promise.allSettled([
        repo.confirm(first.customerId, items),
        repo.confirm(customer.insertId, items),
      ]);
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        results.filter((result) => result.status === "rejected").length,
        1,
      );
      assert.match(
        results.find((result) => result.status === "rejected").reason.message,
        /đặt trong khoảng thời gian này/,
      );
      const [[saved]] = await pool.execute(
        `SELECT COUNT(*) AS total FROM tblChiTietPhieuDat ct
         JOIN tblPhieuDatXe p ON p.MaPhieu = ct.MaPhieu
         WHERE ct.MaXe = ? AND p.MaKH IN (?, ?)`,
        [first.carId, first.customerId, customer.insertId],
      );
      assert.equal(saved.total, 1);
      const unavailable = await repo.search({ start, end });
      assert.equal(
        unavailable.some((car) => car.MaXe === first.carId),
        false,
      );
      const adjacent = await repo.search({
        start: end,
        end: "2090-04-04T08:00",
      });
      assert.equal(
        adjacent.some((car) => car.MaXe === first.carId),
        true,
      );
    } finally {
      await pool.execute("DELETE FROM tblPhieuDatXe WHERE MaKH IN (?, ?)", [
        first.customerId,
        customer.insertId,
      ]);
      await pool.execute("DELETE FROM tblThanhVien WHERE MaTV=?", [
        member.insertId,
      ]);
      await cleanup(first);
    }
  },
);

test(
  "HTTP + MySQL: hai giỏ cùng xe, khách xác nhận sau nhận thông báo xung đột",
  { skip: !enabled },
  async () => {
    const request = require("supertest");
    const bcrypt = require("bcryptjs");
    const app = require("../src/app");
    const first = await fixture();
    const pool = getPool();
    const password = "race-test-password";
    const hash = await bcrypt.hash(password, 4);
    await pool.execute("UPDATE tblThanhVien SET MatKhau=? WHERE MaTV=?", [
      hash,
      first.memberId,
    ]);
    const [member] = await pool.execute(
      "INSERT INTO tblThanhVien(HoTen,NgaySinh,SoDienThoai,Email,DiaChi,MatKhau) VALUES(?,?,?,?,?,?)",
      [
        "Second Customer",
        "2000-01-01",
        `0965${Date.now().toString().slice(-6)}`,
        `${prefix}-race@example.test`,
        "Test address",
        hash,
      ],
    );
    const [customer] = await pool.execute(
      "INSERT INTO tblKhachHang(MaTV,MaKhachHang) VALUES(?,?)",
      [member.insertId, `${prefix}-RACE`],
    );
    const token = (html) => {
      const match = /name="_csrf" value="([a-f0-9]+)"/.exec(html);
      assert.ok(match);
      return match[1];
    };
    const format = (date) =>
      new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 13) + ":00";
    const startDate = new Date(Date.now() + 4 * 86400000);
    startDate.setUTCHours(1, 0, 0, 0);
    const start = format(startDate);
    const end = format(new Date(startDate.getTime() + 24 * 3600000));
    const agents = [request.agent(app), request.agent(app)];
    const emails = [`${prefix}@example.test`, `${prefix}-race@example.test`];
    try {
      for (let index = 0; index < agents.length; index++) {
        const agent = agents[index];
        const login = await agent.get("/dang-nhap").expect(200);
        await agent
          .post("/dang-nhap")
          .type("form")
          .send({
            email: emails[index],
            password,
            _csrf: token(login.text),
          })
          .expect(302);
        const search = await agent
          .get("/dat-xe/tim")
          .query({
            type: "SUV",
            seats: "7",
            start,
            end,
          })
          .expect(200);
        assert.match(search.text, /Test car/);
        await agent
          .post("/dat-xe/chon")
          .type("form")
          .send({
            carId: first.carId,
            _csrf: token(search.text),
          })
          .expect(302);
      }
      const firstCart = await agents[0].get("/dat-xe/gio-hang").expect(200);
      const secondCart = await agents[1].get("/dat-xe/gio-hang").expect(200);
      assert.match(firstCart.text, /Test car/);
      assert.match(secondCart.text, /Test car/);
      const winner = await agents[0]
        .post("/dat-xe/xac-nhan")
        .type("form")
        .send({
          _csrf: token(firstCart.text),
        })
        .expect(302);
      assert.match(winner.headers.location, /^\/dat-xe\/phieu\/\d+$/);
      const loser = await agents[1]
        .post("/dat-xe/xac-nhan")
        .type("form")
        .send({
          _csrf: token(secondCart.text),
        })
        .expect(302);
      assert.equal(loser.headers.location, "/dat-xe/gio-hang");
      const loserCart = await agents[1].get(loser.headers.location).expect(200);
      assert.match(loserCart.text, /Xe vừa được khách hàng khác đặt/);
      const [[count]] = await pool.execute(
        "SELECT COUNT(*) AS total FROM tblChiTietPhieuDat WHERE MaXe=? AND ThoiGianNhan=?",
        [first.carId, start.replace("T", " ") + ":00"],
      );
      assert.equal(count.total, 1);
    } finally {
      await pool.execute("DELETE FROM tblPhieuDatXe WHERE MaKH IN (?, ?)", [
        first.customerId,
        customer.insertId,
      ]);
      await pool.execute("DELETE FROM tblThanhVien WHERE MaTV=?", [
        member.insertId,
      ]);
      await cleanup(first);
    }
  },
);

async function secondCustomer() {
  const pool = getPool();
  const suffix = crypto.randomBytes(5).toString("hex");
  const [member] = await pool.execute(
    "INSERT INTO tblThanhVien(HoTen,NgaySinh,SoDienThoai,Email,DiaChi,MatKhau) VALUES(?,?,?,?,?,?)",
    [
      "Second Customer",
      "2000-01-01",
      `098${String(Date.now()).slice(-7)}`,
      `race-${suffix}@example.test`,
      "Test address",
      "test-only",
    ],
  );
  const [customer] = await pool.execute(
    "INSERT INTO tblKhachHang(MaTV,MaKhachHang) VALUES(?,?)",
    [member.insertId, `RACE-${suffix}`],
  );
  return { memberId: member.insertId, customerId: customer.insertId };
}

test(
  "MySQL: hai khách thuê cùng xe giao nhau một phần thì khách thứ hai bị từ chối",
  { skip: !enabled },
  async () => {
    const car = await fixture();
    const other = await secondCustomer();
    const pool = getPool();
    try {
      await repo.confirm(car.customerId, [
        {
          id: car.carId,
          start: "2090-05-12T08:00",
          end: "2090-05-13T08:00",
          quotedPrice: 50000,
          hours: 24,
        },
      ]);
      const overlap = { start: "2090-05-12T18:00", end: "2090-05-14T08:00" };
      const results = await repo.search(overlap);
      assert.equal(
        results.some((row) => row.MaXe === car.carId),
        false,
      );
      await assert.rejects(
        repo.confirm(other.customerId, [
          {
            id: car.carId,
            ...overlap,
            quotedPrice: 50000,
            hours: 38,
          },
        ]),
        /đặt trong khoảng thời gian này/,
      );
      const [[count]] = await pool.execute(
        "SELECT COUNT(*) AS total FROM tblChiTietPhieuDat WHERE MaXe=?",
        [car.carId],
      );
      assert.equal(count.total, 1);
    } finally {
      await pool.execute("DELETE FROM tblPhieuDatXe WHERE MaKH=?", [
        other.customerId,
      ]);
      await pool.execute("DELETE FROM tblThanhVien WHERE MaTV=?", [
        other.memberId,
      ]);
      await cleanup(car);
    }
  },
);

test(
  "MySQL: hai khách thuê hai xe khác nhau cùng thời gian đều được xác nhận",
  { skip: !enabled },
  async () => {
    const first = await fixture();
    const second = await secondCustomer();
    const pool = getPool();
    const suffix = crypto.randomBytes(5).toString("hex");
    const [car] = await pool.execute(
      "INSERT INTO tblXeOTo(MaXeHienThi,TenXe,BienSo,LoaiXe,SoCho,HangXe,NamSanXuat,DonGiaGio) VALUES(?,?,?,?,?,?,?,?)",
      [
        `DIFF-${suffix}`,
        "Different car",
        `DIFF-${suffix}`,
        "SUV",
        7,
        "Test",
        2024,
        50000,
      ],
    );
    const period = {
      start: "2090-06-12T08:00",
      end: "2090-06-13T08:00",
      quotedPrice: 50000,
      hours: 24,
    };
    try {
      const results = await Promise.allSettled([
        repo.confirm(first.customerId, [{ id: first.carId, ...period }]),
        repo.confirm(second.customerId, [{ id: car.insertId, ...period }]),
      ]);
      assert.deepEqual(
        results.filter((result) => result.status === "rejected").map((result) => ({
          code: result.reason.code,
          message: result.reason.message,
        })),
        [],
      );
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        2,
      );
      const [[count]] = await pool.execute(
        "SELECT COUNT(*) AS total FROM tblPhieuDatXe WHERE MaKH IN (?, ?)",
        [first.customerId, second.customerId],
      );
      assert.equal(count.total, 2);
    } finally {
      await pool.execute("DELETE FROM tblPhieuDatXe WHERE MaKH=?", [
        second.customerId,
      ]);
      await pool.execute("DELETE FROM tblXeOTo WHERE MaXe=?", [car.insertId]);
      await pool.execute("DELETE FROM tblThanhVien WHERE MaTV=?", [
        second.memberId,
      ]);
      await cleanup(first);
    }
  },
);
