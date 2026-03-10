const { Server } = require('socket.io');
const { verifyToken } = require('../utils/jwt');

let ioInstance = null;

const ADMIN_ROLES = new Set(['admin', 'subadmin', 'salesman']);

const extractToken = (socket) => {
  const authToken = socket.handshake?.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.replace(/^Bearer\s+/i, '').trim();
  }

  const headerToken = socket.handshake?.headers?.authorization;
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.replace(/^Bearer\s+/i, '').trim();
  }

  const queryToken = socket.handshake?.query?.token;
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.replace(/^Bearer\s+/i, '').trim();
  }

  return '';
};

const initRealtime = (httpServer, { isAllowedOrigin }) => {
  ioInstance = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (typeof isAllowedOrigin === 'function' && isAllowedOrigin(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Socket CORS blocked for origin: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  ioInstance.use((socket, next) => {
    try {
      const token = extractToken(socket);
      if (!token) return next(new Error('Authentication token missing'));

      const user = verifyToken(token);
      if (!user?.id) return next(new Error('Invalid token payload'));

      socket.user = user;
      return next();
    } catch (error) {
      return next(new Error('Authentication failed'));
    }
  });

  ioInstance.on('connection', (socket) => {
    const role = String(socket.user?.role || '').toLowerCase();

    if (ADMIN_ROLES.has(role)) {
      socket.join('admins');
    }

    socket.emit('realtime:connected', {
      id: socket.id,
      role,
      connectedAt: new Date().toISOString(),
    });
  });

  return ioInstance;
};

const emitAdminNotification = (payload = {}) => {
  if (!ioInstance) return;

  const notification = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: payload.type || 'info',
    title: payload.title || 'Admin Notification',
    message: payload.message || 'You have a new update.',
    priority: payload.priority || 'normal',
    meta: payload.meta || {},
    createdAt: new Date().toISOString(),
  };

  ioInstance.to('admins').emit('admin:notification', notification);
};

module.exports = {
  initRealtime,
  emitAdminNotification,
};
