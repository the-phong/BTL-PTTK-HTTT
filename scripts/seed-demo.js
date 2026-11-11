require("dotenv").config();

const bcrypt = require("bcryptjs");
const { getPool } = require("../src/shared/db");

const CUSTOMER_NAMES = [
  "Nguyễn Thế Phong",
  "Trần Minh Anh",
  "Lê Quốc Bảo",
  "Phạm Thu Hà",
  "Đỗ Đức Huy",
  "Vũ Ngọc Linh",
];
const STAFF = [
  ["Nguyễn Văn An", "NHAN_VIEN_TIEP_NHAN"],
  ["Trần Thị Bình", "NHAN_VIEN_TIEP_NHAN"],
  ["Lê Minh Cường", "NHAN_VIEN_TIEP_NHAN"],
  ["Phạm Ngọc Dung", "NHAN_VIEN_TIEP_NHAN"],
  ["Hoàng Quốc Đạt", "NHAN_VIEN_KY_THUAT"],
  ["Đỗ Văn Hùng", "NHAN_VIEN_KY_THUAT"],
  ["Vũ Thị Lan", "NHAN_VIEN_KY_THUAT"],
  ["Nguyễn Hoài Nam", "QUAN_LY"],
  ["Trần Thanh Tâm", "QUAN_LY"],
  ["Phạm Gia Minh", "QUAN_TRI"],
];
const MODELS = [
  ["Toyota Vios G", "Toyota", "Sedan", 5, "Xăng", 38000],
  ["Honda City RS", "Honda", "Sedan", 5, "Xăng", 42000],
  ["Hyundai Accent", "Hyundai", "Sedan", 5, "Xăng", 39000],
  ["Kia Seltos", "Kia", "SUV", 5, "Xăng", 48000],
  ["Toyota Fortuner 2.4AT", "Toyota", "SUV", 7, "Dầu", 55000],
  ["Ford Everest Titanium", "Ford", "SUV", 7, "Dầu", 70000],
  ["Hyundai Santa Fe", "Hyundai", "SUV", 7, "Dầu", 65000],
  ["Mitsubishi Xpander", "Mitsubishi", "MPV", 7, "Xăng", 50000],
  ["Toyota Innova Cross", "Toyota", "MPV", 7, "Xăng", 57000],
  ["Ford Ranger", "Ford", "Bán tải", 5, "Dầu", 60000],
  ["VinFast VF 8", "VinFast", "SUV", 5, "Điện", 72000],
  ["Hyundai i10", "Hyundai", "Hatchback", 5, "Xăng", 34000],
];
const pad = (value, length = 4) => String(value).padStart(length, "0");
const sqlDate = (date) => {
  const vietnam = new Date(date.getTime() + 7 * 3600000);
  return vietnam.toISOString().slice(0, 19).replace("T", " ");
};
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);

async function upsertMember(
  connection,
  { code, name, role, email, phone, hash },
) {
  await connection.execute(
    `INSERT INTO tblThanhVien(HoTen,NgaySinh,SoDienThoai,Email,DiaChi,MatKhau,VaiTro)
     VALUES(?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE MaTV = LAST_INSERT_ID(MaTV)`,
    [name, "1998-01-01", phone, email, "Hà Nội, Việt Nam", hash, role],
  );
  const [[row]] = await connection.execute(
    "SELECT MaTV,VaiTro FROM tblThanhVien WHERE Email=?",
    [email],
  );
  if (row.VaiTro !== role)
    throw new Error(`Email ${email} đã tồn tại với vai trò khác`);
  return row.MaTV;
}

async function seed() {
  for (const key of ["DB_HOST", "DB_USER", "DB_NAME"]) {
    if (!process.env[key]) throw new Error(`Thiếu cấu hình ${key} trong .env`);
  }
  const password = process.env.DEMO_SEED_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error("DEMO_SEED_PASSWORD cần có ít nhất 8 ký tự trong .env");
  }
  const hash = await bcrypt.hash(password, 12);
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const customers = [];

    for (let index = 0; index < CUSTOMER_NAMES.length; index++) {
      const number = index + 1;
      const memberId = await upsertMember(connection, {
        code: `DEMO-KH-${pad(number, 2)}`,
        name: CUSTOMER_NAMES[index],
        role: "KHACH_HANG",
        email: `demo.kh${pad(number, 2)}@example.test`,
        phone: `09870000${pad(number, 2)}`,
        hash,
      });
      const customerCode = `DEMO-KH-${pad(number, 2)}`;
      await connection.execute(
        `INSERT INTO tblKhachHang(MaTV,MaKhachHang) VALUES(?,?)
         ON DUPLICATE KEY UPDATE MaKH = LAST_INSERT_ID(MaKH)`,
        [memberId, customerCode],
      );
      const [[customer]] = await connection.execute(
        "SELECT MaKH FROM tblKhachHang WHERE MaTV=?",
        [memberId],
      );
      customers.push(customer.MaKH);
    }

    for (let index = 0; index < STAFF.length; index++) {
      const number = index + 1;
      await upsertMember(connection, {
        code: `DEMO-NV-${pad(number, 2)}`,
        name: STAFF[index][0],
        role: STAFF[index][1],
        email: `demo.nv${pad(number, 2)}@example.test`,
        phone: `09780000${pad(number, 2)}`,
        hash,
      });
    }

    const vehicles = [];
    for (let index = 1; index <= 300; index++) {
      const model = MODELS[(index - 1) % MODELS.length];
      const code = `DEMO-XE-${pad(index)}`;
      const plate = `30D-${pad(index, 5)}`;
      const status =
        index % 37 === 0
          ? "BAO_TRI"
          : index % 53 === 0
            ? "NGUNG_CHO_THUE"
            : "SAN_SANG";
      const year = 2021 + (index % 5);
      const price = model[5] + (index % 4) * 2000;
      await connection.execute(
        `INSERT INTO tblXeOTo(MaXeHienThi,TenXe,BienSo,LoaiXe,SoCho,HangXe,NamSanXuat,HopSo,NhienLieu,MoTa,DonGiaGio,TrangThai)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE MaXe = LAST_INSERT_ID(MaXe)`,
        [
          code,
          model[0],
          plate,
          model[2],
          model[3],
          model[1],
          year,
          "Tự động",
          model[4],
          `${model[0]} đời ${year}, phù hợp cho hành trình thuê xe tự lái.`,
          price,
          status,
        ],
      );
      const [[car]] = await connection.execute(
        "SELECT MaXe,DonGiaGio,TrangThai FROM tblXeOTo WHERE MaXeHienThi=?",
        [code],
      );
      vehicles.push(car);
    }

    const ready = vehicles.filter((car) => car.TrangThai === "SAN_SANG");
    const anchor = new Date();
    anchor.setUTCHours(1, 0, 0, 0);
    let detailIndex = 0;
    let insertedBookings = 0;
    let insertedDetails = 0;

    for (let index = 0; index < 72; index++) {
      const code = `DEMO-PD-${pad(index + 1)}`;
      const [[existing]] = await connection.execute(
        "SELECT MaPhieu FROM tblPhieuDatXe WHERE MaPhieuHienThi=?",
        [code],
      );
      const count = index % 3 === 0 ? 3 : index % 3 === 1 ? 2 : 1;
      const selected = ready.slice(detailIndex, detailIndex + count);
      detailIndex += count;
      if (existing) continue;

      let start;
      let end;
      let status;
      if (index < 24) {
        start = addDays(anchor, -120 + index * 3);
        end = addDays(start, 2);
        status = "HOAN_TAT";
      } else if (index < 36) {
        start = addDays(anchor, -1);
        end = addDays(anchor, 2 + (index % 3));
        status = "DA_XAC_NHAN";
      } else {
        start = addDays(anchor, 3 + (index - 36) * 2);
        end = addDays(start, 2);
        status = "DA_XAC_NHAN";
      }
      const hours = (end - start) / 3600000;
      const total = selected.reduce(
        (sum, car) => sum + Number(car.DonGiaGio) * hours,
        0,
      );
      const [booking] = await connection.execute(
        "INSERT INTO tblPhieuDatXe(MaPhieuHienThi,MaKH,ThoiGianDat,TrangThai,TongTien) VALUES(?,?,?,?,?)",
        [
          code,
          customers[index % customers.length],
          sqlDate(addDays(start, -5)),
          status,
          total,
        ],
      );
      insertedBookings++;
      for (const car of selected) {
        await connection.execute(
          "INSERT INTO tblChiTietPhieuDat(MaPhieu,MaXe,ThoiGianNhan,ThoiGianTra,DonGiaGio,SoGio,ThanhTien) VALUES(?,?,?,?,?,?,?)",
          [
            booking.insertId,
            car.MaXe,
            sqlDate(start),
            sqlDate(end),
            car.DonGiaGio,
            hours,
            Number(car.DonGiaGio) * hours,
          ],
        );
        insertedDetails++;
      }
    }

    await connection.commit();
    console.log(
      `Đã chuẩn bị 300 xe, 6 khách hàng, 10 nhân viên; thêm ${insertedBookings} phiếu và ${insertedDetails} chi tiết.`,
    );
    console.log(
      "Tài khoản demo: demo.kh01@example.test ... demo.kh06@example.test",
    );
    console.log(
      "Nhân viên demo: demo.nv01@example.test ... demo.nv10@example.test",
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

if (require.main === module) {
  seed().catch((error) => {
    console.error("Không thể tạo dữ liệu demo:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { seed };
