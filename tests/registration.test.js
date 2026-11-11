const test = require("node:test");
const assert = require("node:assert/strict");
const { normalize, validate } = require("../src/features/registration/service");

const validInput = {
  name: "Nguyễn Thế Phong",
  birth: "2005-01-01",
  phone: "0912345678",
  email: "NTP@Example.Test",
  address: "Hà Đông, Hà Nội",
  password: "safe-password-123",
  confirm: "safe-password-123",
};

test("chuẩn hóa các cách viết cùng số điện thoại Việt Nam", () => {
  for (const phone of [
    "0912345678",
    "+84 912.345.678",
    "84-912-345-678",
    "0084 912 345 678",
  ]) {
    assert.equal(normalize({ ...validInput, phone }).phone, "0912345678");
  }
});

test("từ chối mật khẩu vượt giới hạn 72 byte của bcrypt", () => {
  const password = "đ".repeat(40);
  const errors = validate(
    normalize({ ...validInput, password, confirm: password }),
  );
  assert.ok(errors.some((error) => error.includes("72 byte")));
});
