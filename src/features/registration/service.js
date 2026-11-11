const bcrypt = require("bcryptjs"),
  repo = require("./repository");
async function register(d) {
  d = {
    ...d,
    name: typeof d.name === "string" ? d.name.trim() : "",
    address: typeof d.address === "string" ? d.address.trim() : "",
    email: typeof d.email === "string" ? d.email.trim().toLowerCase() : "",
    phone:
      typeof d.phone === "string" ? d.phone.replace(/[\s.-]/g, "").trim() : "",
  };
  const errors = [];
  if (!d.name || d.name.trim().length < 2)
    errors.push("Họ tên phải có ít nhất 2 ký tự.");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.birth || "");
  const birthday = match ? new Date(`${d.birth}T00:00:00+07:00`) : null;
  const actualDate =
    birthday &&
    new Date(birthday.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  if (
    !birthday ||
    Number.isNaN(+birthday) ||
    actualDate !== d.birth ||
    birthday > new Date()
  )
    errors.push("Ngày sinh không hợp lệ.");
  if (!/^\+?[0-9]{9,15}$/.test(d.phone || ""))
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
