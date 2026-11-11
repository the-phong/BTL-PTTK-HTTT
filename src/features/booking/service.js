const repo = require("./repository");
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
exports.search = async (f) => {
  if (!validPeriod(f.start, f.end))
    return {
      error: "Thời gian trả phải sau thời gian nhận và không quá 90 ngày.",
    };
  return { cars: await repo.search(f) };
};
exports.confirm = async (customerId, items) => {
  if (!items?.length) throw Error("Vui lòng chọn ít nhất một xe.");
  return repo.confirm(customerId, items);
};
exports.history = repo.history;
exports.detail = repo.detail;
