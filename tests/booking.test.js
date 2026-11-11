const test = require("node:test");
const assert = require("node:assert/strict");
const service = require("../src/features/booking/service");

function futurePeriod(days = 2) {
  const vn = (date) =>
    new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 13) + ":00";
  const start = new Date(Date.now() + days * 86400000);
  start.setUTCHours(1, 0, 0, 0);
  return {
    start: vn(start),
    end: vn(new Date(start.getTime() + 24 * 3600000)),
  };
}

test("validPeriod kiểm tra giờ thuê thực tế", () => {
  const period = futurePeriod();
  assert.equal(service.validPeriod(period.start, period.end), true);
  assert.equal(service.validPeriod(period.end, period.start), false);
  assert.equal(service.validPeriod("2027-02-30T08:00", period.end), false);
  assert.equal(
    service.validPeriod("2027-01-01T08:30", "2027-01-02T08:00"),
    false,
  );
});

test("search từ chối bộ lọc ngoài miền giá trị trước khi truy vấn", async () => {
  const period = futurePeriod();
  assert.match(
    (await service.search({ ...period, type: "INVALID", seats: "" })).error,
    /Bộ lọc/,
  );
  assert.match(
    (await service.search({ ...period, type: "SUV", seats: "abc" })).error,
    /Bộ lọc/,
  );
});

module.exports = { futurePeriod };
