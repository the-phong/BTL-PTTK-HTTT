const personalData = require("../../shared/personalData");
const repo = require("./repository");

exports.get = repo.findByMemberId;

exports.update = async (memberId, input) => {
  const data = personalData.normalize(input);
  const errors = personalData.validate(data);
  if (errors.length) return { errors, data };
  if (await repo.existsOther(memberId, data.email, data.phone)) {
    return { errors: ["Email hoặc số điện thoại đã được sử dụng."], data };
  }
  try {
    const updated = await repo.update(memberId, data);
    if (!updated)
      return { errors: ["Không tìm thấy tài khoản khách hàng."], data };
    return { data };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return { errors: ["Email hoặc số điện thoại đã được sử dụng."], data };
    }
    throw error;
  }
};
