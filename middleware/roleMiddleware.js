const { sendError } = require('../utils/response');

const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Authentication required.', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(
        res,
        `Access denied. Required roles: ${allowedRoles.join(', ')}. Your role: ${req.user.role}`,
        403
      );
    }

    next();
  };
};

module.exports = roleMiddleware;
