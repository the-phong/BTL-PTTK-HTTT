const bcrypt = require("bcryptjs"),
  repo = require("./repository");
exports.authenticate = async (email, password) => {
  const u = await repo.findByEmail(email || "");
  if (!u || !(await bcrypt.compare(password || "", u.MatKhau))) return null;
  return {
    id: u.MaTV,
    customerId: u.MaKH,
    customerCode: u.MaKhachHang,
    name: u.HoTen,
    email: u.Email,
  };
};
