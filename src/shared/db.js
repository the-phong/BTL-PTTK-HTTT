const mysql = require("mysql2/promise");
let pool;
function getPool() {
  if (!pool)
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      timezone: "Z",
      decimalNumbers: true,
    });
  return pool;
}
module.exports = {
  getPool,
  query: (sql, params = []) => getPool().execute(sql, params),
};
