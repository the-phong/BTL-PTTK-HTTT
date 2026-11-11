function normalize(input) {
  const rawPhone =
    typeof input.phone === "string"
      ? input.phone.replace(/[\s.-]/g, "").trim()
      : "";
  const phone = /^(?:\+84|0084|84)\d{9}$/.test(rawPhone)
    ? `0${rawPhone.replace(/^(?:\+84|0084|84)/, "")}`
    : rawPhone;
  return {
    name: typeof input.name === "string" ? input.name.trim() : "",
    birth: typeof input.birth === "string" ? input.birth : "",
    phone,
    email:
      typeof input.email === "string" ? input.email.trim().toLowerCase() : "",
    address: typeof input.address === "string" ? input.address.trim() : "",
  };
}

function validate(data) {
  const errors = [];
  if (data.name.length < 2 || data.name.length > 120)
    errors.push("Họ tên phải có từ 2 đến 120 ký tự.");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data.birth);
  const year = match ? Number(match[1]) : null;
  const birthday = match ? new Date(`${data.birth}T00:00:00+07:00`) : null;
  const actual =
    birthday && !Number.isNaN(+birthday)
      ? new Date(birthday.getTime() + 7 * 3600000).toISOString().slice(0, 10)
      : null;
  if (year < 1000 || actual !== data.birth || birthday > new Date())
    errors.push("Ngày sinh không hợp lệ.");
  if (!/^\+?[0-9]{9,15}$/.test(data.phone) || data.phone.length > 20)
    errors.push("Số điện thoại không hợp lệ.");
  if (data.email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    errors.push("Email không hợp lệ hoặc vượt quá 190 ký tự.");
  if (data.address.length < 5 || data.address.length > 255)
    errors.push("Địa chỉ phải có từ 5 đến 255 ký tự.");
  return errors;
}

module.exports = { normalize, validate };
