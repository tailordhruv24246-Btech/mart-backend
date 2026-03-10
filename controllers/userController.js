const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

const MANAGEABLE_ROLES = ['admin', 'subadmin', 'salesman', 'delivery'];
const READABLE_ROLES = ['admin', 'subadmin', 'salesman', 'delivery', 'customer'];

const mapUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  role: row.role,
  is_active: Number(row.is_active) === 1,
  address: row.address || '',
  createdAt: row.created_at,
});

const getUsers = async (req, res, next) => {
  try {
    const { role } = req.query;
    const includeCustomers = String(req.query?.include_customers || '').toLowerCase();
    const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';
    const hasRoleFilter = normalizedRole && READABLE_ROLES.includes(normalizedRole);

    const rolesToFetch = includeCustomers === '1' || includeCustomers === 'true'
      ? READABLE_ROLES
      : MANAGEABLE_ROLES;
    const rolePlaceholders = rolesToFetch.map(() => '?').join(', ');

    const [rows] = await db.query(
      `SELECT id, name, email, phone, role, is_active, address, created_at
       FROM users
       WHERE role IN (${rolePlaceholders})
       ${hasRoleFilter ? 'AND role = ?' : ''}
       ORDER BY created_at DESC`,
      hasRoleFilter ? [...rolesToFetch, normalizedRole] : rolesToFetch
    );

    return sendSuccess(res, rows.map(mapUser), 'Users fetched successfully');
  } catch (error) {
    next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    const { name, email, phone, role = 'salesman', password, is_active = true, address } = req.body;

    if (!name || !email || !password || !role) {
      return sendError(res, 'Name, email, password and role are required.', 400);
    }

    if (!MANAGEABLE_ROLES.includes(role)) {
      return sendError(res, 'Invalid role selected.', 400);
    }

    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return sendError(res, 'Email already exists.', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      `INSERT INTO users (name, email, phone, password, role, is_active, address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), email.trim().toLowerCase(), phone || null, hashedPassword, role, is_active ? 1 : 0, address || null]
    );

    const [created] = await db.query(
      `SELECT id, name, email, phone, role, is_active, address, created_at
       FROM users
       WHERE id = ?`,
      [result.insertId]
    );

    return sendSuccess(res, mapUser(created[0]), 'User created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, phone, role, password, is_active, address } = req.body;

    const [existingUser] = await db.query('SELECT id, email FROM users WHERE id = ?', [id]);
    if (existingUser.length === 0) {
      return sendError(res, 'User not found.', 404);
    }

    if (role && !MANAGEABLE_ROLES.includes(role)) {
      return sendError(res, 'Invalid role selected.', 400);
    }

    if (email && email.trim().toLowerCase() !== existingUser[0].email.toLowerCase()) {
      const [duplicate] = await db.query('SELECT id FROM users WHERE email = ? AND id <> ?', [email.trim().toLowerCase(), id]);
      if (duplicate.length > 0) {
        return sendError(res, 'Email already exists.', 409);
      }
    }

    const fields = [];
    const values = [];

    if (typeof name === 'string') {
      fields.push('name = ?');
      values.push(name.trim());
    }
    if (typeof email === 'string') {
      fields.push('email = ?');
      values.push(email.trim().toLowerCase());
    }
    if (typeof phone !== 'undefined') {
      fields.push('phone = ?');
      values.push(phone || null);
    }
    if (typeof address !== 'undefined') {
      fields.push('address = ?');
      values.push(address || null);
    }
    if (typeof role === 'string') {
      fields.push('role = ?');
      values.push(role);
    }
    if (typeof is_active !== 'undefined') {
      fields.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 12);
      fields.push('password = ?');
      values.push(hashedPassword);
    }

    if (fields.length === 0) {
      return sendError(res, 'No fields to update.', 400);
    }

    values.push(id);
    await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

    const [updated] = await db.query(
      `SELECT id, name, email, phone, role, is_active, address, created_at
       FROM users
       WHERE id = ?`,
      [id]
    );

    return sendSuccess(res, mapUser(updated[0]), 'User updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (Number(id) === Number(req.user.id)) {
      return sendError(res, 'You cannot delete your own account.', 400);
    }

    const [existingUser] = await db.query('SELECT id FROM users WHERE id = ?', [id]);
    if (existingUser.length === 0) {
      return sendError(res, 'User not found.', 404);
    }

    await db.query('DELETE FROM users WHERE id = ?', [id]);
    return sendSuccess(res, {}, 'User deleted successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = { getUsers, createUser, updateUser, deleteUser };
