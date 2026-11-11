const test = require("node:test"),
  assert = require("node:assert/strict");
function validPeriod(s, e) {
  const a = new Date(s),
    b = new Date(e);
  return (
    !Number.isNaN(+a) &&
    !Number.isNaN(+b) &&
    b > a &&
    b - a <= 1000 * 60 * 60 * 24 * 90
  );
}
test("chấp nhận thời gian thuê hợp lệ", () =>
  assert.equal(validPeriod("2026-10-10T08:00", "2026-10-12T08:00"), true));
test("từ chối thời gian kết thúc trước thời gian bắt đầu", () =>
  assert.equal(validPeriod("2026-10-12T08:00", "2026-10-10T08:00"), false));
test("từ chối thời gian thuê quá 90 ngày", () =>
  assert.equal(validPeriod("2026-01-01T08:00", "2026-05-01T08:00"), false));
