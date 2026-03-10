const mysql = require('mysql2/promise');
require('dotenv').config();

const buildSslConfig = () => {
  const sslMode = String(process.env.DB_SSL_MODE || '').toUpperCase();
  const sslEnabled = process.env.DB_SSL === 'true' || sslMode === 'REQUIRED';

  if (!sslEnabled) return undefined;

  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
  const ca = process.env.DB_SSL_CA || process.env.DB_CA_CERT || undefined;

  // Keep config env-driven so local and cloud DBs both work.
  return {
    rejectUnauthorized,
    ...(ca ? { ca } : {}),
  };
};

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
  ssl: buildSslConfig(),
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