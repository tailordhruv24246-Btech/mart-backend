const { verifyToken } = require('../utils/jwt');
const { sendError } = require('../utils/response');

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 'No token provided. Access denied.', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return sendError(res, 'Token expired. Please login again.', 401);
    }
    return sendError(res, 'Invalid token. Access denied.', 401);
  }
};

module.exports = authMiddleware;
