require("dotenv").config();
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const bcrypt = require("bcryptjs");
const app = require("../src/app");
const loginRepo = require("../src/features/login/repository");
const bookingRepo = require("../src/features/booking/repository");

function csrf(html) {
  const match = /name="_csrf" value="([a-f0-9]+)"/.exec(html);
  assert.ok(match);
  return match[1];
}

function period() {
  const start = new Date(Date.now() + 48 * 3600000);
  start.setUTCHours(1, 0, 0, 0);
  const format = (value) =>
    new Date(value.getTime() + 7 * 3600000).toISOString().slice(0, 13) + ":00";
  return {
    start: format(start),
    end: format(new Date(start.getTime() + 24 * 3600000)),
  };
}

test("HTTP: đăng nhập, tìm xe, chọn xe, xem giỏ và xác nhận", async () => {
  const originalLogin = loginRepo.findByEmail;
  const originalSearch = bookingRepo.search;
  const originalSearchPage = bookingRepo.searchPage;
  const originalConfirm = bookingRepo.confirm;
  const hash = await bcrypt.hash("test-password", 4);
  const calls = [];
  loginRepo.findByEmail = async (email) => {
    assert.equal(email, "customer@example.test");
    return {
      MaTV: 1,
      MaKH: 2,
      MaKhachHang: "KH000002",
      HoTen: "Khách Hàng",
      Email: "customer@example.test",
      MatKhau: hash,
    };
  };
  bookingRepo.search = async () => [
    {
      MaXe: 10,
      MaXeHienThi: "XE0010",
      TenXe: "Toyota Fortuner",
      BienSo: "30H-123.45",
      LoaiXe: "SUV",
      SoCho: 7,
      HangXe: "Toyota",
      NamSanXuat: 2024,
      DonGiaGio: 55000,
      TrangThai: "SAN_SANG",
    },
  ];
  bookingRepo.searchPage = async (_filters, page) => ({
    cars: await bookingRepo.search(),
    total: 26,
    page,
    totalPages: 3,
  });
  bookingRepo.confirm = async (customerId, items) => {
    calls.push({ customerId, items });
    return { id: 99, code: "PD99", total: 1320000 };
  };
  try {
    const agent = request.agent(app);
    const login = await agent.get("/dang-nhap").expect(200);
    await agent
      .post("/dang-nhap")
      .type("form")
      .send({
        email: "  CUSTOMER@EXAMPLE.TEST  ",
        password: "test-password",
        _csrf: csrf(login.text),
      })
      .expect(302);
    const dates = period();
    const search = await agent
      .get("/dat-xe/tim")
      .query({ type: "SUV", seats: "7", ...dates })
      .expect(200);
    assert.match(search.text, /55\.000/);
    assert.match(search.text, /Trang 1 \/ 3/);
    const secondPage = await agent
      .get("/dat-xe/tim")
      .query({ type: "SUV", seats: "7", ...dates, page: 2 })
      .expect(200);
    assert.match(secondPage.text, /Trang 2 \/ 3/);
    const shortPageLink = await agent.get("/dat-xe/tim?page=2").expect(200);
    assert.match(shortPageLink.text, /Trang 2 \/ 3/);
    const forged = await agent
      .get("/dat-xe/gio-hang?error=FAKE_SYSTEM_ERROR")
      .expect(200);
    assert.doesNotMatch(forged.text, /FAKE_SYSTEM_ERROR/);
    await agent
      .post("/dat-xe/chon")
      .type("form")
      .send({ carId: 10, _csrf: csrf(search.text) })
      .expect(302);
    const cart = await agent.get("/dat-xe/gio-hang").expect(200);
    assert.match(cart.text, /1\.320\.000/);
    await agent
      .post("/dat-xe/xac-nhan")
      .type("form")
      .send({ _csrf: csrf(cart.text) })
      .expect(302);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].customerId, 2);
    assert.equal(calls[0].items[0].quotedPrice, 55000);
    assert.equal(calls[0].items[0].start, dates.start);
  } finally {
    loginRepo.findByEmail = originalLogin;
    bookingRepo.search = originalSearch;
    bookingRepo.searchPage = originalSearchPage;
    bookingRepo.confirm = originalConfirm;
  }
});

test("HTTP: hai xe giữ hai khoảng thuê khác nhau trong cùng phiếu", async () => {
  const originalLogin = loginRepo.findByEmail;
  const originalSearch = bookingRepo.search;
  const originalSearchPage = bookingRepo.searchPage;
  const originalConfirm = bookingRepo.confirm;
  const hash = await bcrypt.hash("test-password", 4);
  const cars = [10, 11].map((id) => ({
    MaXe: id,
    MaXeHienThi: `XE${id}`,
    TenXe: `Xe ${id}`,
    BienSo: `30A-${id}`,
    LoaiXe: "SUV",
    SoCho: 7,
    HangXe: "Test",
    NamSanXuat: 2024,
    DonGiaGio: 50000,
    TrangThai: "SAN_SANG",
  }));
  let confirmed;
  loginRepo.findByEmail = async () => ({
    MaTV: 1,
    MaKH: 2,
    MaKhachHang: "KH000002",
    HoTen: "Khách Hàng",
    Email: "customer@example.test",
    MatKhau: hash,
  });
  bookingRepo.search = async () => cars;
  bookingRepo.searchPage = async (_filters, page) => ({
    cars,
    total: 2,
    page,
    totalPages: 1,
  });
  bookingRepo.confirm = async (_customerId, items) => {
    confirmed = items;
    return { id: 99, code: "PD99", total: 3600000 };
  };
  try {
    const agent = request.agent(app);
    const login = await agent.get("/dang-nhap").expect(200);
    await agent
      .post("/dang-nhap")
      .type("form")
      .send({
        email: "customer@example.test",
        password: "test-password",
        _csrf: csrf(login.text),
      })
      .expect(302);

    const first = period();
    const second = {
      start: first.start,
      end: new Date(
        new Date(`${first.end}+07:00`).getTime() + 86400000 + 7 * 3600000,
      )
        .toISOString()
        .slice(0, 16),
    };
    const firstSearch = await agent
      .get("/dat-xe/tim")
      .query({ type: "SUV", seats: "7", ...first })
      .expect(200);
    await agent
      .post("/dat-xe/chon")
      .type("form")
      .send({ carId: 10, _csrf: csrf(firstSearch.text) })
      .expect(302);
    const secondSearch = await agent
      .get("/dat-xe/tim")
      .query({ type: "SUV", seats: "7", ...second })
      .expect(200);
    await agent
      .post("/dat-xe/chon")
      .type("form")
      .send({ carId: 11, _csrf: csrf(secondSearch.text) })
      .expect(302);
    const cart = await agent.get("/dat-xe/gio-hang").expect(200);
    assert.match(cart.text, /1\.200\.000/);
    assert.match(cart.text, /2\.400\.000/);
    assert.match(cart.text, /3\.600\.000/);
    await agent
      .post("/dat-xe/xac-nhan")
      .type("form")
      .send({ _csrf: csrf(cart.text) })
      .expect(302);
    assert.deepEqual(
      confirmed.map((item) => item.hours),
      [24, 48],
    );
    assert.deepEqual(
      confirmed.map((item) => item.start),
      [first.start, second.start],
    );
    assert.deepEqual(
      confirmed.map((item) => item.end),
      [first.end, second.end],
    );
  } finally {
    loginRepo.findByEmail = originalLogin;
    bookingRepo.search = originalSearch;
    bookingRepo.searchPage = originalSearchPage;
    bookingRepo.confirm = originalConfirm;
  }
});
