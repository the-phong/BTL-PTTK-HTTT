const mysql = require("mysql2/promise");
let pool;
function getPool() {
  if (!pool) {
    for (const key of ["DB_HOST", "DB_USER", "DB_NAME"]) {
      if (!process.env[key])
        throw new Error(`Thiếu cấu hình ${key} trong .env`);
    }
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      timezone: "+07:00",
      dateStrings: ["DATETIME", "TIMESTAMP"],
      decimalNumbers: true,
    });
  }
  return pool;
}
module.exports = {
  getPool,
  query: (sql, params = []) => getPool().execute(sql, params),
};
