const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { generateToken } = require('../utils/jwt');
const { sendSuccess, sendError } = require('../utils/response');

// POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const { name, email, phone, password, role = 'customer', address } = req.body;

    if (!name || !email || !password) {
      return sendError(res, 'Name, email and password are required.', 400);
    }

    // Check if email exists
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return sendError(res, 'Email already registered.', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO users (name, email, phone, password, role, address) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, phone || null, hashedPassword, role, address || null]
    );

    // If customer role, also create customer record
    if (role === 'customer') {
      await db.query(
        'INSERT INTO customers (user_id, name, email, phone, address) VALUES (?, ?, ?, ?, ?)',
        [result.insertId, name, email, phone || null, address || null]
      );
    }

    const token = generateToken({ id: result.insertId, email, role, name });

    return sendSuccess(
      res,
      {
        token,
        user: {
          id: result.insertId,
          name,
          email,
          role,
          phone: phone || null,
          address: address || null,
        },
      },
      'Registration successful',
      201
    );
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '').trim();

    if (!email || !password) {
      return sendError(res, 'Email and password are required.', 400);
    }

    const [users] = await db.query('SELECT * FROM users WHERE LOWER(TRIM(email)) = ? AND is_active = 1', [email]);
    if (users.length === 0) {
      return sendError(res, 'Invalid credentials.', 401);
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendError(res, 'Invalid credentials.', 401);
    }

    const token = generateToken({ id: user.id, email: user.email, role: user.role, name: user.name });

    return sendSuccess(res, {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone },
    }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/reset-password
const resetPassword = async (req, res, next) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return sendError(res, 'Email and new password are required.', 400);
    }

    const [users] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return sendError(res, 'No account found with this email.', 404);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);

    return sendSuccess(res, {}, 'Password reset successfully.');
  } catch (error) {
    next(error);
  }
};

// GET /api/auth/me
const getMe = async (req, res, next) => {
  try {
    const [users] = await db.query(
      'SELECT id, name, email, phone, role, address, profile_image, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (users.length === 0) {
      return sendError(res, 'User not found.', 404);
    }
    return sendSuccess(res, users[0], 'User profile fetched');
  } catch (error) {
    next(error);
  }
};

// PATCH /api/auth/me
const updateMe = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return sendError(res, 'Unauthorized.', 401);

    const { name, email, phone, address } = req.body || {};
    const [existingUsers] = await db.query('SELECT email, phone FROM users WHERE id = ?', [userId]);
    if (!existingUsers.length) return sendError(res, 'User not found.', 404);
    const currentUser = existingUsers[0];

    if (typeof email !== 'undefined') {
      const incomingEmail = String(email || '').trim().toLowerCase();
      const currentEmail = String(currentUser.email || '').trim().toLowerCase();
      if (incomingEmail && incomingEmail !== currentEmail) {
        return sendError(res, 'Email cannot be changed.', 400);
      }
    }

    if (typeof phone !== 'undefined') {
      const incomingPhone = String(phone || '').trim();
      const currentPhone = String(currentUser.phone || '').trim();
      if (incomingPhone && incomingPhone !== currentPhone) {
        return sendError(res, 'Phone number cannot be changed.', 400);
      }
    }

    const fields = [];
    const values = [];

    if (typeof name === 'string') {
      const cleanName = name.trim();
      if (!cleanName) return sendError(res, 'Name cannot be empty.', 400);
      fields.push('name = ?');
      values.push(cleanName);
    }

    if (typeof address !== 'undefined') {
      fields.push('address = ?');
      values.push(address ? String(address).trim() : null);
    }

    if (fields.length === 0) {
      return sendError(res, 'Only name and address can be updated.', 400);
    }

    values.push(userId);
    await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

    const [updatedRows] = await db.query(
      'SELECT id, name, email, phone, role, address, profile_image, created_at FROM users WHERE id = ?',
      [userId]
    );

    const updatedUser = updatedRows?.[0];

    if (String(updatedUser?.role || '').toLowerCase() === 'customer') {
      await db.query(
        `UPDATE customers
         SET name = ?, email = ?, phone = ?, address = ?
         WHERE user_id = ?`,
        [updatedUser.name, updatedUser.email, updatedUser.phone || null, updatedUser.address || null, userId]
      );
    }

    return sendSuccess(res, updatedUser, 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, resetPassword, getMe, updateMe };
