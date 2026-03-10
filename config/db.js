const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'mart_db',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 40),
  maxIdle: Number(process.env.DB_MAX_IDLE || 20),
  idleTimeout: Number(process.env.DB_IDLE_TIMEOUT_MS || 60000),
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
  queueLimit: 0,
  charset: 'utf8mb4',
  decimalNumbers: true,
  timezone: 'Z',
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

pool.getConnection()
  .then((conn) => {
    console.log('✅ MySQL Connected Successfully');
    conn.release();
  })
  .catch((err) => {
    console.error('❌ MySQL Connection Error:', err.message);
  });

module.exports = pool;