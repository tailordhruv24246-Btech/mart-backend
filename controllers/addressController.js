const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

let addressTableReady = false;

const ensureAddressTable = async () => {
  if (addressTableReady) return;

  await db.query(
    `CREATE TABLE IF NOT EXISTS user_addresses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      label VARCHAR(60) DEFAULT NULL,
      recipient_name VARCHAR(120) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      address_line TEXT NOT NULL,
      city VARCHAR(100) NOT NULL,
      state VARCHAR(100) NOT NULL,
      pincode VARCHAR(15) NOT NULL,
      landmark VARCHAR(200) DEFAULT NULL,
      is_default TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_addresses_user (user_id)
    ) ENGINE=InnoDB`
  );

  addressTableReady = true;
};

const toAddressLine = (address) => {
  const parts = [
    address.address_line,
    address.city,
    address.state,
    address.pincode,
  ].filter(Boolean);
  return parts.join(', ');
};

const getAddresses = async (req, res, next) => {
  try {
    await ensureAddressTable();

    const isAdmin = ['admin', 'subadmin'].includes(String(req.user?.role || '').toLowerCase());
    const requestedUserId = Number(req.query?.user_id || 0);
    const targetUserId = isAdmin && requestedUserId > 0 ? requestedUserId : req.user.id;

    const [rows] = await db.query(
      `SELECT id, label, recipient_name, phone, address_line, city, state, pincode, landmark, is_default, created_at, updated_at
       FROM user_addresses
       WHERE user_id = ?
       ORDER BY is_default DESC, updated_at DESC`,
      [targetUserId]
    );

    const data = rows.map((row) => ({
      ...row,
      is_default: Number(row.is_default || 0) === 1,
      full_address: toAddressLine(row),
    }));

    return sendSuccess(res, data, 'Addresses fetched');
  } catch (error) {
    return next(error);
  }
};

const createAddress = async (req, res, next) => {
  try {
    await ensureAddressTable();

    const {
      label,
      recipient_name,
      phone,
      address_line,
      city,
      state,
      pincode,
      landmark,
      is_default = false,
    } = req.body || {};

    if (!recipient_name || !phone || !address_line || !city || !state || !pincode) {
      return sendError(res, 'recipient_name, phone, address_line, city, state and pincode are required.', 400);
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [existing] = await conn.query('SELECT id FROM user_addresses WHERE user_id = ?', [req.user.id]);
      const markDefault = Boolean(is_default) || existing.length === 0;

      if (markDefault) {
        await conn.query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
      }

      const [result] = await conn.query(
        `INSERT INTO user_addresses
          (user_id, label, recipient_name, phone, address_line, city, state, pincode, landmark, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          label || null,
          recipient_name,
          phone,
          address_line,
          city,
          state,
          pincode,
          landmark || null,
          markDefault ? 1 : 0,
        ]
      );

      await conn.commit();

      const [rows] = await db.query('SELECT * FROM user_addresses WHERE id = ?', [result.insertId]);
      const payload = rows[0] ? { ...rows[0], is_default: Number(rows[0].is_default || 0) === 1, full_address: toAddressLine(rows[0]) } : null;

      return sendSuccess(res, payload, 'Address added', 201);
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  } catch (error) {
    return next(error);
  }
};

const updateAddress = async (req, res, next) => {
  try {
    await ensureAddressTable();

    const addressId = Number(req.params?.id);
    if (!addressId) return sendError(res, 'Invalid address id.', 400);

    const [rows] = await db.query('SELECT * FROM user_addresses WHERE id = ? AND user_id = ?', [addressId, req.user.id]);
    if (!rows.length) return sendError(res, 'Address not found.', 404);

    const current = rows[0];
    const nextPayload = {
      label: req.body?.label ?? current.label,
      recipient_name: req.body?.recipient_name ?? current.recipient_name,
      phone: req.body?.phone ?? current.phone,
      address_line: req.body?.address_line ?? current.address_line,
      city: req.body?.city ?? current.city,
      state: req.body?.state ?? current.state,
      pincode: req.body?.pincode ?? current.pincode,
      landmark: req.body?.landmark ?? current.landmark,
      is_default: typeof req.body?.is_default === 'undefined' ? Number(current.is_default || 0) === 1 : Boolean(req.body?.is_default),
    };

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      if (nextPayload.is_default) {
        await conn.query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
      }

      await conn.query(
        `UPDATE user_addresses
         SET label = ?, recipient_name = ?, phone = ?, address_line = ?, city = ?, state = ?, pincode = ?, landmark = ?, is_default = ?
         WHERE id = ? AND user_id = ?`,
        [
          nextPayload.label,
          nextPayload.recipient_name,
          nextPayload.phone,
          nextPayload.address_line,
          nextPayload.city,
          nextPayload.state,
          nextPayload.pincode,
          nextPayload.landmark,
          nextPayload.is_default ? 1 : 0,
          addressId,
          req.user.id,
        ]
      );

      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    const [updated] = await db.query('SELECT * FROM user_addresses WHERE id = ? AND user_id = ?', [addressId, req.user.id]);
    const payload = updated[0] ? { ...updated[0], is_default: Number(updated[0].is_default || 0) === 1, full_address: toAddressLine(updated[0]) } : null;

    return sendSuccess(res, payload, 'Address updated');
  } catch (error) {
    return next(error);
  }
};

const removeAddress = async (req, res, next) => {
  try {
    await ensureAddressTable();

    const addressId = Number(req.params?.id);
    if (!addressId) return sendError(res, 'Invalid address id.', 400);

    const [rows] = await db.query('SELECT * FROM user_addresses WHERE id = ? AND user_id = ?', [addressId, req.user.id]);
    if (!rows.length) return sendError(res, 'Address not found.', 404);

    const wasDefault = Number(rows[0].is_default || 0) === 1;
    await db.query('DELETE FROM user_addresses WHERE id = ? AND user_id = ?', [addressId, req.user.id]);

    if (wasDefault) {
      const [fallback] = await db.query(
        'SELECT id FROM user_addresses WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
        [req.user.id]
      );
      if (fallback.length) {
        await db.query('UPDATE user_addresses SET is_default = 1 WHERE id = ? AND user_id = ?', [fallback[0].id, req.user.id]);
      }
    }

    return sendSuccess(res, {}, 'Address deleted');
  } catch (error) {
    return next(error);
  }
};

const setDefaultAddress = async (req, res, next) => {
  try {
    await ensureAddressTable();

    const addressId = Number(req.params?.id);
    if (!addressId) return sendError(res, 'Invalid address id.', 400);

    const [rows] = await db.query('SELECT id FROM user_addresses WHERE id = ? AND user_id = ?', [addressId, req.user.id]);
    if (!rows.length) return sendError(res, 'Address not found.', 404);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
      await conn.query('UPDATE user_addresses SET is_default = 1 WHERE id = ? AND user_id = ?', [addressId, req.user.id]);
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    return sendSuccess(res, {}, 'Default address updated');
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAddresses,
  createAddress,
  updateAddress,
  removeAddress,
  setDefaultAddress,
};
