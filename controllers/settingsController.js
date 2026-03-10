const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

const SETTINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS app_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(120) NOT NULL UNIQUE,
    setting_value TEXT DEFAULT NULL,
    updated_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_setting_key (setting_key)
  ) ENGINE=InnoDB
`;

const DEFAULT_SETTINGS = {
  brandName: 'Mart',
  adminPanelName: 'Mart Admin',
  deliveryPanelName: 'Mart Delivery',
  websiteName: 'Mart',
  websiteTagline: 'Your one-stop shop for daily essentials',
  supportEmail: 'support@mart.com',
  supportPhone: '+91 98765 43210',
  storeAddress: '123 Main St, Mumbai, Maharashtra 400001',
  currency: 'INR',
  currencySymbol: '₹',
  defaultGST: '18',
  invoicePrefix: 'INV',
  orderPrefix: 'ORD',
  lowStockAlert: '10',
  enableSMS: 'false',
  enableEmail: 'true',
  timezone: 'Asia/Kolkata',
  logoUrl: '',
};

const PUBLIC_KEYS = [
  'brandName',
  'adminPanelName',
  'deliveryPanelName',
  'websiteName',
  'websiteTagline',
  'supportEmail',
  'supportPhone',
  'storeAddress',
  'currency',
  'currencySymbol',
  'logoUrl',
];

const toAbsoluteAssetUrl = (req, value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || /^data:/i.test(raw) || /^blob:/i.test(raw)) return raw;
  if (raw.startsWith('/')) {
    return `${req.protocol}://${req.get('host')}${raw}`;
  }
  return raw;
};

const normalizeSettingsForResponse = (req, settings) => ({
  ...settings,
  logoUrl: toAbsoluteAssetUrl(req, settings?.logoUrl),
});

const ensureSettingsTable = async () => {
  await db.query(SETTINGS_TABLE_SQL);
};

const rowsToSettings = (rows) => rows.reduce((acc, row) => {
  acc[row.setting_key] = row.setting_value ?? '';
  return acc;
}, {});

const getAllSettingsMap = async () => {
  await ensureSettingsTable();
  const [rows] = await db.query('SELECT setting_key, setting_value FROM app_settings');
  return { ...DEFAULT_SETTINGS, ...rowsToSettings(rows) };
};

const upsertSettings = async (settings, userId = null) => {
  await ensureSettingsTable();

  const keys = Object.keys(settings || {});
  if (!keys.length) return;

  const placeholders = keys.map(() => '(?, ?, ?)').join(', ');
  const values = keys.flatMap((key) => [key, settings[key] == null ? '' : String(settings[key]), userId]);

  await db.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
    values
  );
};

const getSettings = async (req, res, next) => {
  try {
    const settings = await getAllSettingsMap();
    return sendSuccess(res, normalizeSettingsForResponse(req, settings), 'Settings fetched');
  } catch (error) {
    next(error);
  }
};

const getPublicSettings = async (req, res, next) => {
  try {
    const settings = await getAllSettingsMap();
    const publicSettings = PUBLIC_KEYS.reduce((acc, key) => {
      acc[key] = settings[key] ?? '';
      return acc;
    }, {});

    return sendSuccess(res, normalizeSettingsForResponse(req, publicSettings), 'Public settings fetched');
  } catch (error) {
    next(error);
  }
};

const updateSettings = async (req, res, next) => {
  try {
    const allowedKeys = Object.keys(DEFAULT_SETTINGS);
    const payload = { ...req.body };

    if (req.file) {
      payload.logoUrl = `/uploads/settings/${req.file.filename}`;
    }

    const sanitized = Object.entries(payload).reduce((acc, [key, value]) => {
      if (allowedKeys.includes(key)) {
        acc[key] = value;
      }
      return acc;
    }, {});

    if (!Object.keys(sanitized).length) {
      return sendError(res, 'No valid settings provided.', 400);
    }

    await upsertSettings(sanitized, req.user?.id || null);
    const updated = await getAllSettingsMap();

    return sendSuccess(res, normalizeSettingsForResponse(req, updated), 'Settings updated successfully');
  } catch (error) {
    next(error);
  }
};

const downloadBackup = async (req, res, next) => {
  try {
    const [dbInfoRows] = await db.query('SELECT DATABASE() AS dbName');
    const dbName = dbInfoRows?.[0]?.dbName || process.env.DB_NAME || 'mart_db';

    const [tables] = await db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = ? AND table_type = 'BASE TABLE'
       ORDER BY table_name ASC`,
      [dbName]
    );

    const backupPayload = {
      generatedAt: new Date().toISOString(),
      generatedBy: req.user?.id || null,
      database: dbName,
      settings: await getAllSettingsMap(),
      tables: {},
    };

    for (const table of tables) {
      const tableName = table.table_name;
      const [rows] = await db.query(`SELECT * FROM \`${tableName}\``);
      backupPayload.tables[tableName] = rows;
    }

    const backupDir = path.join(__dirname, '..', 'uploads', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const fileName = `mart-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filePath = path.join(backupDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(backupPayload, null, 2), 'utf8');

    return res.download(filePath, fileName, (error) => {
      if (error) {
        return next(error);
      }
      fs.unlink(filePath, () => {});
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getSettings, getPublicSettings, updateSettings, downloadBackup };
