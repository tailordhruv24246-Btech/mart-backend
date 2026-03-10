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

    return sendSuccess(res, { token, user: { id: result.insertId, name, email, role } }, 'Registration successful', 201);
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

module.exports = { register, login, resetPassword, getMe };
