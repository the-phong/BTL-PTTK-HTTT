require("dotenv").config();
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const repo = require("../src/features/registration/repository");

function token(html) {
  const match = /name="_csrf" value="([a-f0-9]+)"/.exec(html);
  assert.ok(match, "CSRF token must be in form");
  return match[1];
}

function profile(overrides = {}) {
  return {
    name: "Nguyễn Thế Phong",
    birth: "2005-01-01",
    phone: "0123456789",
    email: "ntp@example.test",
    address: "96A Trần Phú, Hà Đông",
    password: "strong-password-123",
    confirm: "strong-password-123",
    ...overrides,
  };
}

test("HTTP đăng ký: kiểm tra giới hạn độ dài trước khi lưu", async () => {
  const agent = request.agent(app);
  const form = await agent.get("/dang-ky").expect(200);
  const response = await agent
    .post("/dang-ky")
    .type("form")
    .send({
      ...profile({ name: "A".repeat(121) }),
      _csrf: token(form.text),
    })
    .expect(422);
  assert.match(response.text, /120 ký tự/);
});

test("HTTP đăng ký: yêu cầu CSRF cho bước xem lại", async () => {
  await request(app).post("/dang-ky").type("form").send(profile()).expect(403);
});

test("HTTP đăng ký: xem lại, chỉnh sửa, xác nhận rồi mới lưu", async () => {
  const oldExists = repo.exists;
  const oldCreate = repo.create;
  let writes = 0;
  repo.exists = async () => false;
  repo.create = async () => {
    writes++;
    return { memberId: 1, customerId: 1 };
  };
  try {
    const agent = request.agent(app);
    const form = await agent.get("/dang-ky").expect(200);
    const review = await agent
      .post("/dang-ky")
      .type("form")
      .send({
        ...profile({ email: "  NTP@EXAMPLE.TEST  " }),
        _csrf: token(form.text),
      })
      .expect(200);
    assert.match(review.text, /Xác nhận đăng ký/);
    assert.match(review.text, /ntp@example.test/);
    assert.equal(writes, 0);
    const edit = await agent.get("/dang-ky/sua").expect(200);
    assert.match(edit.text, /Nguyễn Thế Phong/);
    const success = await agent
      .post("/dang-ky/xac-nhan")
      .type("form")
      .send({
        _csrf: token(review.text),
      })
      .expect(200);
    assert.match(success.text, /Đăng ký thành công/);
    assert.equal(writes, 1);
    await agent
      .post("/dang-ky/xac-nhan")
      .type("form")
      .send({
        _csrf: token(edit.text),
      })
      .expect(302);
    assert.equal(writes, 1);
  } finally {
    repo.exists = oldExists;
    repo.create = oldCreate;
  }
});
