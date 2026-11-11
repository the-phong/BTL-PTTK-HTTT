const bcrypt = require("bcryptjs"),
  repo = require("./repository");
async function register(d) {
  const errors = [];
  if (!d.name || d.name.trim().length < 2)
    errors.push("Họ tên phải có ít nhất 2 ký tự.");
  if (!d.birth || Number.isNaN(Date.parse(d.birth)))
    errors.push("Ngày sinh không hợp lệ.");
  if (!/^\+?[0-9\s.-]{9,15}$/.test(d.phone || ""))
    errors.push("Số điện thoại không hợp lệ.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email || ""))
    errors.push("Email không hợp lệ.");
  if (!d.address || d.address.trim().length < 5)
    errors.push("Vui lòng nhập địa chỉ.");
  if ((d.password || "").length < 8)
    errors.push("Mật khẩu cần ít nhất 8 ký tự.");
  if (d.password !== d.confirm) errors.push("Mật khẩu xác nhận không khớp.");
  if (errors.length) return { errors };
  if (await repo.exists(d.email, d.phone))
    return { errors: ["Email hoặc số điện thoại đã được sử dụng."] };
  try {
    return {
      created: await repo.create({
        ...d,
        hash: await bcrypt.hash(d.password, 12),
      }),
    };
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY")
      return { errors: ["Email hoặc số điện thoại đã được sử dụng."] };
    throw e;
  }
}
module.exports = { register };
