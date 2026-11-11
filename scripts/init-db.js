require("dotenv").config();
const fs = require("fs"),
  path = require("path"),
  mysql = require("mysql2/promise");
(async () => {
  let c;
  try {
    for (const key of ["DB_HOST", "DB_USER", "DB_NAME"]) {
      if (!process.env[key])
        throw new Error(`Thiếu cấu hình ${key} trong .env`);
    }
    if (!/^[A-Za-z0-9_]+$/.test(process.env.DB_NAME)) {
      throw new Error("DB_NAME chỉ được chứa chữ, số và dấu gạch dưới.");
    }
    c = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      multipleStatements: true,
    });
    await c.query(
      `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
    await c.changeUser({ database: process.env.DB_NAME });
    const sql = fs.readFileSync(
      path.join(__dirname, "../db/migrations/001_init.sql"),
      "utf8",
    );
    await c.query(sql);
    await c.query(`INSERT IGNORE INTO tblXeOTo(MaXeHienThi,TenXe,BienSo,LoaiXe,SoCho,HangXe,NamSanXuat,MoTa,DonGiaGio) VALUES
('XE0015','Toyota Fortuner 2.4AT','30H-123.45','SUV',7,'Toyota',2023,'SUV mạnh mẽ, rộng rãi cho những chuyến đi xa. 7 chỗ ngồi thoải mái.',55000),
('XE0027','Ford Everest Titanium','30K-678.90','SUV',7,'Ford',2024,'SUV cao cấp với không gian rộng và nhiều tiện nghi.',70000),
('XE0034','Hyundai Santa Fe','30L-246.80','SUV',7,'Hyundai',2023,'Thiết kế hiện đại, phù hợp cho gia đình và nhóm bạn.',65000),
('XE0008','Toyota Vios G','30A-888.88','Sedan',5,'Toyota',2024,'Sedan tiết kiệm, linh hoạt di chuyển nội thành.',35000),
('XE0011','Honda City RS','30B-555.55','Sedan',5,'Honda',2023,'Sedan thể thao, tiện nghi và tiết kiệm nhiên liệu.',40000),
('XE0042','Mitsubishi Xpander','30C-222.22','MPV',7,'Mitsubishi',2024,'MPV rộng rãi cho cả gia đình.',50000)`);
    console.log("Đã tạo cơ sở dữ liệu và dữ liệu xe mẫu.");
  } catch (e) {
    console.error("Không thể khởi tạo DB:", e.message);
    process.exitCode = 1;
  } finally {
    if (c) await c.end();
  }
})();
