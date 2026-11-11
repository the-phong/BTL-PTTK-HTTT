const { query } = require("../../shared/db");
exports.findByEmail = async (email) => {
  const [r] = await query(
    "SELECT t.MaTV,t.HoTen,t.Email,t.MatKhau,k.MaKH,k.MaKhachHang FROM tblThanhVien t JOIN tblKhachHang k ON k.MaTV=t.MaTV WHERE t.Email=? LIMIT 1",
    [email],
  );
  return r[0] || null;
};
