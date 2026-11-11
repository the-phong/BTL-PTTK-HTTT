const { query } = require("../../shared/db");

exports.findByMemberId = async (memberId) => {
  const [rows] = await query(
    `SELECT t.MaTV, t.HoTen, DATE_FORMAT(t.NgaySinh, '%Y-%m-%d') AS NgaySinh,
            t.SoDienThoai, t.Email, t.DiaChi, k.MaKH, k.MaKhachHang
     FROM tblThanhVien t
     JOIN tblKhachHang k ON k.MaTV = t.MaTV
     WHERE t.MaTV = ? LIMIT 1`,
    [memberId],
  );
  return rows[0] || null;
};

exports.existsOther = async (memberId, email, phone) => {
  const [rows] = await query(
    "SELECT MaTV FROM tblThanhVien WHERE MaTV <> ? AND (Email = ? OR SoDienThoai = ?) LIMIT 1",
    [memberId, email, phone],
  );
  return rows.length > 0;
};

exports.update = async (memberId, data) => {
  const [result] = await query(
    `UPDATE tblThanhVien
     SET HoTen = ?, NgaySinh = ?, SoDienThoai = ?, Email = ?, DiaChi = ?
     WHERE MaTV = ?`,
    [data.name, data.birth, data.phone, data.email, data.address, memberId],
  );
  return result.affectedRows > 0;
};
