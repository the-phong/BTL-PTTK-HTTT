const bcrypt = require("bcryptjs");
const personalData = require("../../shared/personalData");
const repo = require("./repository");

function normalize(input) {
  return {
    ...personalData.normalize(input),
    password: typeof input.password === "string" ? input.password : "",
    confirm: typeof input.confirm === "string" ? input.confirm : "",
  };
}

function validate(data) {
  const errors = personalData.validate(data);
  if (data.password.length < 8 || Buffer.byteLength(data.password, "utf8") > 72)
    errors.push("Mật khẩu phải có ít nhất 8 ký tự và không quá 72 byte UTF-8.");
  if (data.password !== data.confirm)
    errors.push("Mật khẩu xác nhận không khớp.");
  return errors;
}

async function prepare(input) {
  const data = normalize(input);
  const errors = validate(data);
  if (errors.length) return { errors, data };
  if (await repo.exists(data.email, data.phone)) {
    return { errors: ["Email hoặc số điện thoại đã được sử dụng."], data };
  }
  const hash = await bcrypt.hash(data.password, 12);
  const { password, confirm, ...profile } = data;
  return { data: { ...profile, hash } };
}

async function complete(data) {
  if (!data?.hash || !data?.email)
    throw new Error("Thông tin đăng ký đã hết hạn.");
  try {
    return { created: await repo.create(data) };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return { errors: ["Email hoặc số điện thoại đã được sử dụng."] };
    }
    throw error;
  }
}

module.exports = { normalize, validate, prepare, complete };
