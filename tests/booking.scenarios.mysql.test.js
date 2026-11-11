require("dotenv").config();
const test = require("node:test");
const { after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const request = require("supertest");
const app = require("../src/app");
const service = require("../src/features/booking/service");
const repository = require("../src/features/booking/repository");
const { getPool } = require("../src/shared/db");

const enabled = process.env.RUN_DB_TESTS === "1";
const T1 = { start: "2090-11-12T08:00", end: "2090-11-13T08:00" };
const T3 = { start: "2090-11-13T08:00", end: "2090-11-14T08:00" };
const T4 = { start: "2090-11-12T08:00", end: "2090-11-14T08:00" };
const suffix = () => crypto.randomBytes(5).toString("hex");
const csrf = (html) => {
  const match = /name="_csrf" value="([a-f0-9]+)"/.exec(html);
  assert.ok(match);
  return match[1];
};

async function fixture() {
  const pool = getPool();
  const tag = suffix();
  const email = `sea-${tag}@example.test`;
  const hash = await bcrypt.hash("scenario-password", 4);
  const [member] = await pool.execute(
    "INSERT INTO tblThanhVien(HoTen,NgaySinh,SoDienThoai,Email,DiaChi,MatKhau) VALUES(?,?,?,?,?,?)",
    [
      "Khách Tìm Xe",
      "2000-01-01",
      `09${String(crypto.randomInt(0, 100000000)).padStart(8, "0")}`,
      email,
      "Hà Nội, Việt Nam",
      hash,
    ],
  );
  const [customer] = await pool.execute(
    "INSERT INTO tblKhachHang(MaTV,MaKhachHang) VALUES(?,?)",
    [member.insertId, `SEA-${tag}`],
  );
  const cars = [];
  for (const [index, type, seats, status] of [
    [1, "SUV", 7, "SAN_SANG"],
    [2, "SUV", 7, "SAN_SANG"],
    [3, "SUV", 5, "SAN_SANG"],
    [4, "Sedan", 7, "SAN_SANG"],
    [5, "SUV", 7, "BAO_TRI"],
  ]) {
    const code = `SEA-${tag}-${index}`;
    const [car] = await pool.execute(
      "INSERT INTO tblXeOTo(MaXeHienThi,TenXe,BienSo,LoaiXe,SoCho,HangXe,NamSanXuat,DonGiaGio,TrangThai) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        code,
        `Scenario car ${index}`,
        code,
        type,
        seats,
        "Test",
        2024,
        50000,
        status,
      ],
    );
    cars.push(car.insertId);
  }
  return {
    tag,
    memberId: member.insertId,
    customerId: customer.insertId,
    email,
    cars,
  };
}
async function cleanup(f) {
  const pool = getPool();
  await pool.execute("DELETE FROM tblPhieuDatXe WHERE MaKH=?", [f.customerId]);
  for (const id of f.cars)
    await pool.execute("DELETE FROM tblXeOTo WHERE MaXe=?", [id]);
  await pool.execute("DELETE FROM tblThanhVien WHERE MaTV=?", [f.memberId]);
}
async function agentFor(f) {
  const agent = request.agent(app);
  const form = await agent.get("/dang-nhap").expect(200);
  await agent
    .post("/dang-nhap")
    .type("form")
    .send({
      email: f.email,
      password: "scenario-password",
      _csrf: csrf(form.text),
    })
    .expect(302);
  return agent;
}
async function select(agent, carId, period) {
  const search = await agent
    .get("/dat-xe/tim")
    .query({
      type: "SUV",
      seats: "7",
      ...period,
    })
    .expect(200);
  await agent
    .post("/dat-xe/chon")
    .type("form")
    .send({
      carId,
      _csrf: csrf(search.text),
    })
    .expect(302);
}
if (enabled) after(async () => getPool().end());

test(
  "SEA-01: lọc SUV 7 chỗ, loại xe khác và xe bảo trì",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    try {
      const result = await service.search({ type: "SUV", seats: "7", ...T1 });
      const ids = new Set(result.cars.map((car) => car.MaXe));
      assert.equal(ids.has(f.cars[0]), true);
      assert.equal(ids.has(f.cars[1]), true);
      for (const id of f.cars.slice(2)) assert.equal(ids.has(id), false);
      assert.ok(
        result.cars.every(
          (car) =>
            car.LoaiXe === "SUV" &&
            car.SoCho === 7 &&
            car.TrangThai === "SAN_SANG",
        ),
      );
    } finally {
      await cleanup(f);
    }
  },
);

test("SEA-02: giờ trả trước giờ nhận bị từ chối", async () => {
  const result = await service.search({
    type: "SUV",
    seats: "7",
    start: T1.end,
    end: T1.start,
  });
  assert.match(result.error, /Giờ nhận/);
});

test("SEA-03: ngày không tồn tại và thuê quá 90 ngày bị từ chối", async () => {
  for (const period of [
    { start: "2090-02-30T08:00", end: "2090-03-02T08:00" },
    { start: "2090-01-01T08:00", end: "2090-04-03T08:00" },
  ]) {
    const result = await service.search({ type: "SUV", seats: "7", ...period });
    assert.ok(result.error);
  }
});

test(
  "SEA-04: xe có lịch trùng không xuất hiện trong tìm kiếm",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    try {
      await repository.confirm(f.customerId, [
        { id: f.cars[0], ...T1, quotedPrice: 50000, hours: 24 },
      ]);
      const result = await service.search({ type: "SUV", seats: "7", ...T1 });
      assert.equal(
        result.cars.some((car) => car.MaXe === f.cars[0]),
        false,
      );
    } finally {
      await cleanup(f);
    }
  },
);

test(
  "SEA-05: thời gian nhận bằng giờ trả của phiếu trước vẫn có thể thuê",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    try {
      await repository.confirm(f.customerId, [
        { id: f.cars[0], ...T1, quotedPrice: 50000, hours: 24 },
      ]);
      const result = await service.search({ type: "SUV", seats: "7", ...T3 });
      assert.equal(
        result.cars.some((car) => car.MaXe === f.cars[0]),
        true,
      );
    } finally {
      await cleanup(f);
    }
  },
);

test("SEA-06: 25 xe được chia 12, 12, 1", { skip: !enabled }, async () => {
  const pool = getPool();
  const tag = suffix();
  const ids = [];
  try {
    for (let index = 0; index < 25; index++) {
      const code = `PAGE-${tag}-${index}`;
      const [result] = await pool.execute(
        "INSERT INTO tblXeOTo(MaXeHienThi,TenXe,BienSo,LoaiXe,SoCho,HangXe,NamSanXuat,DonGiaGio) VALUES(?,?,?,?,?,?,?,?)",
        [code, `Page car ${index}`, code, "Hatchback", 16, "Test", 2024, 50000],
      );
      ids.push(result.insertId);
    }
    const filters = { type: "Hatchback", seats: "16", ...T1 };
    const pages = await Promise.all(
      [1, 2, 3].map((page) => service.search(filters, page)),
    );
    assert.deepEqual(
      pages.map((page) => page.cars.length),
      [12, 12, 1],
    );
    assert.deepEqual(
      pages.map((page) => page.total),
      [25, 25, 25],
    );
    assert.equal(
      new Set(pages.flatMap((page) => page.cars.map((car) => car.MaXe))).size,
      25,
    );
  } finally {
    for (const id of ids)
      await pool.execute("DELETE FROM tblXeOTo WHERE MaXe=?", [id]);
  }
});

test(
  "CART-01: chọn X trong T1, giỏ giữ 24 giờ",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    try {
      const agent = await agentFor(f);
      await select(agent, f.cars[0], T1);
      const cart = await agent.get("/dat-xe/gio-hang").expect(200);
      assert.match(cart.text, /24 giờ/);
      assert.match(cart.text, /1\.200\.000/);
    } finally {
      await cleanup(f);
    }
  },
);

test(
  "CART-02: X trong T1, Y trong T4 giữ hai khoảng riêng",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    try {
      const agent = await agentFor(f);
      await select(agent, f.cars[0], T1);
      await select(agent, f.cars[1], T4);
      const cart = await agent.get("/dat-xe/gio-hang").expect(200);
      assert.match(cart.text, /24 giờ/);
      assert.match(cart.text, /48 giờ/);
      assert.match(cart.text, /3\.600\.000/);
      assert.match(cart.text, /2090-11-13 08:00/);
      assert.match(cart.text, /2090-11-14 08:00/);
    } finally {
      await cleanup(f);
    }
  },
);

test(
  "CART-03: chọn X lần hai không tạo dòng trùng",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    try {
      const agent = await agentFor(f);
      await select(agent, f.cars[0], T1);
      await select(agent, f.cars[0], T1);
      const cart = await agent.get("/dat-xe/gio-hang").expect(200);
      assert.match(cart.text, /Xe đã có trong danh sách/);
      assert.equal((cart.text.match(/Scenario car 1/g) || []).length, 1);
      assert.match(cart.text, /1\.200\.000/);
    } finally {
      await cleanup(f);
    }
  },
);

test(
  "CART-04: xóa X trong giỏ X,Y chỉ còn Y và tổng tiền mới",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    try {
      const agent = await agentFor(f);
      await select(agent, f.cars[0], T1);
      await select(agent, f.cars[1], T4);
      const cart = await agent.get("/dat-xe/gio-hang").expect(200);
      await agent
        .post("/dat-xe/xoa")
        .type("form")
        .send({ carId: f.cars[0], _csrf: csrf(cart.text) })
        .expect(302);
      const updated = await agent.get("/dat-xe/gio-hang").expect(200);
      assert.doesNotMatch(updated.text, /Scenario car 1/);
      assert.match(updated.text, /Scenario car 2/);
      assert.match(updated.text, /2\.400\.000/);
      assert.doesNotMatch(updated.text, /3\.600\.000/);
    } finally {
      await cleanup(f);
    }
  },
);

test(
  "CART-05: giá xe thay đổi, giỏ cập nhật giá và thông báo",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    try {
      const agent = await agentFor(f);
      await select(agent, f.cars[0], T1);
      await getPool().execute("UPDATE tblXeOTo SET DonGiaGio=? WHERE MaXe=?", [
        60000,
        f.cars[0],
      ]);
      const cart = await agent.get("/dat-xe/gio-hang").expect(200);
      assert.match(cart.text, /Đơn giá đã thay đổi/);
      assert.match(cart.text, /1\.440\.000/);
    } finally {
      await cleanup(f);
    }
  },
);

test(
  "CART-06: xe bị khách khác đặt khi còn trong giỏ thì loại và báo",
  { skip: !enabled },
  async () => {
    const f = await fixture();
    const pool = getPool();
    const tag = suffix();
    const [otherMember] = await pool.execute(
      "INSERT INTO tblThanhVien(HoTen,NgaySinh,SoDienThoai,Email,DiaChi,MatKhau) VALUES(?,?,?,?,?,?)",
      [
        "Khách Thứ Hai",
        "2000-01-01",
        `09${String(crypto.randomInt(0, 100000000)).padStart(8, "0")}`,
        `other-${tag}@example.test`,
        "Hà Nội, Việt Nam",
        "test-only",
      ],
    );
    const [otherCustomer] = await pool.execute(
      "INSERT INTO tblKhachHang(MaTV,MaKhachHang) VALUES(?,?)",
      [otherMember.insertId, `OTHER-${tag}`],
    );
    try {
      const agent = await agentFor(f);
      await select(agent, f.cars[0], T1);
      await repository.confirm(otherCustomer.insertId, [
        { id: f.cars[0], ...T1, quotedPrice: 50000, hours: 24 },
      ]);
      const cart = await agent.get("/dat-xe/gio-hang").expect(200);
      assert.match(cart.text, /không còn khả dụng và đã bị loại khỏi giỏ/);
      assert.doesNotMatch(cart.text, /<article class="cart-item">/);
    } finally {
      await pool.execute("DELETE FROM tblPhieuDatXe WHERE MaKH=?", [
        otherCustomer.insertId,
      ]);
      await pool.execute("DELETE FROM tblThanhVien WHERE MaTV=?", [
        otherMember.insertId,
      ]);
      await cleanup(f);
    }
  },
);
