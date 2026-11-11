const { getPool } = require("../../shared/db");
exports.search = async (f) => {
  const params = [],
    where = ["x.TrangThai='SAN_SANG'"];
  if (f.type) {
    where.push("x.LoaiXe=?");
    params.push(f.type);
  }
  if (f.seats) {
    where.push("x.SoCho>=?");
    params.push(Number(f.seats));
  }
  if (f.start && f.end) {
    where.push(
      "NOT EXISTS (SELECT 1 FROM tblChiTietPhieuDat ct JOIN tblPhieuDatXe p ON p.MaPhieu=ct.MaPhieu WHERE ct.MaXe=x.MaXe AND p.TrangThai IN ('CHO_XAC_NHAN','DA_XAC_NHAN') AND ct.ThoiGianNhan < ? AND ct.ThoiGianTra > ?)",
    );
    params.push(f.end, f.start);
  }
  const [rows] = await getPool().execute(
    `SELECT x.* FROM tblXeOTo x WHERE ${where.join(" AND ")} ORDER BY x.DonGiaGio`,
    params,
  );
  return rows;
};
exports.confirm = async (customerId, items) => {
  const c = await getPool().getConnection();
  try {
    await c.beginTransaction();
    const [locks] = await c.execute(
      `SELECT MaXe,DonGiaGio,TrangThai FROM tblXeOTo WHERE MaXe IN (${items.map(() => "?").join(",")}) ORDER BY MaXe FOR UPDATE`,
      items.map((i) => Number(i.id)),
    );
    if (
      locks.length !== items.length ||
      locks.some((x) => x.TrangThai !== "SAN_SANG")
    )
      throw Error("Một số xe không còn khả dụng.");
    let total = 0;
    const prepared = [];
    for (const i of items) {
      const x = locks.find((a) => a.MaXe === Number(i.id));
      if (!x) throw Error("Xe không tồn tại.");
      const hours = (new Date(i.end) - new Date(i.start)) / 3600000;
      if (!(hours > 0)) throw Error("Khoảng thời gian thuê không hợp lệ.");
      const [busy] = await c.execute(
        "SELECT ct.MaChiTiet FROM tblChiTietPhieuDat ct JOIN tblPhieuDatXe p ON p.MaPhieu=ct.MaPhieu WHERE ct.MaXe=? AND p.TrangThai IN ('CHO_XAC_NHAN','DA_XAC_NHAN') AND ct.ThoiGianNhan < ? AND ct.ThoiGianTra > ? LIMIT 1 FOR UPDATE",
        [i.id, i.end, i.start],
      );
      if (busy.length)
        throw Error(
          "Xe vừa được khách hàng khác đặt trong khoảng thời gian này.",
        );
      const cost = Number(x.DonGiaGio) * hours;
      total += cost;
      prepared.push({ x, start: i.start, end: i.end, hours, cost });
    }
    const code = `PD${Date.now()}`;
    const [p] = await c.execute(
      "INSERT INTO tblPhieuDatXe(MaPhieuHienThi,MaKH,TongTien) VALUES(?,?,?)",
      [code, customerId, total],
    );
    for (const i of prepared)
      await c.execute(
        "INSERT INTO tblChiTietPhieuDat(MaPhieu,MaXe,ThoiGianNhan,ThoiGianTra,DonGiaGio,SoGio,ThanhTien) VALUES(?,?,?,?,?,?,?)",
        [
          p.insertId,
          i.x.MaXe,
          i.start.replace("T", " "),
          i.end.replace("T", " "),
          i.x.DonGiaGio,
          i.hours,
          i.cost,
        ],
      );
    await c.commit();
    return { id: p.insertId, code, total };
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
};
exports.history = async (customerId) => {
  const { query } = require("../../shared/db");
  const [r] = await query(
    "SELECT p.*,p.MaPhieuHienThi FROM tblPhieuDatXe p WHERE p.MaKH=? ORDER BY p.ThoiGianDat DESC",
    [customerId],
  );
  return r;
};
exports.detail = async (customerId, id) => {
  const { query } = require("../../shared/db");
  const [p] = await query(
    "SELECT p.* FROM tblPhieuDatXe p WHERE p.MaKH=? AND p.MaPhieu=?",
    [customerId, id],
  );
  if (!p) return null;
  const [items] = await query(
    "SELECT ct.*,x.TenXe,x.BienSo,x.MaXeHienThi FROM tblChiTietPhieuDat ct JOIN tblXeOTo x ON x.MaXe=ct.MaXe WHERE ct.MaPhieu=?",
    [id],
  );
  return { ...p, items };
};
