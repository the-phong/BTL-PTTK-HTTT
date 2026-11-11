const { getPool } = require("../../shared/db");
async function exists(email, phone) {
  const [r] = await getPool().execute(
    "SELECT MaTV FROM tblThanhVien WHERE Email=? OR SoDienThoai=? LIMIT 1",
    [email, phone],
  );
  return r.length > 0;
}
async function create(data) {
  const c = await getPool().getConnection();
  try {
    await c.beginTransaction();
    const [u] = await c.execute(
      "INSERT INTO tblThanhVien(HoTen,NgaySinh,SoDienThoai,Email,DiaChi,MatKhau) VALUES(?,?,?,?,?,?)",
      [data.name, data.birth, data.phone, data.email, data.address, data.hash],
    );
    const [k] = await c.execute(
      "INSERT INTO tblKhachHang(MaTV,MaKhachHang) VALUES(?,?)",
      [u.insertId, `KH${String(u.insertId).padStart(6, "0")}`],
    );
    await c.commit();
    return { memberId: u.insertId, customerId: k.insertId };
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
module.exports = { exists, create };
