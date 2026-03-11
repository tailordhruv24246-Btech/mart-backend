const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const http = require('http');
require('dotenv').config();
const { initRealtime } = require('./realtime/socket');

// Import routes
const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const orderRoutes = require('./routes/orderRoutes');
const posRoutes = require('./routes/posRoutes');
const reportRoutes = require('./routes/reportRoutes');
const userRoutes = require('./routes/userRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const cartRoutes = require('./routes/cartRoutes');
const addressRoutes = require('./routes/addressRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.set('etag', 'strong');
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(compression());

// ============================================================
// CORS CONFIGURATION
// ============================================================
const allowedOrigins = [
  'http://localhost:5173', // Customer Frontend
  'http://localhost:5174', // Admin Frontend
  'http://localhost:5175', // Delivery Frontend
  'https://sappymart-frontend.netlify.app', // Admin (Netlify)
  'https://www.sappymart-frontend.netlify.app',
];

const extraOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const localNetworkOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})(?::(5173|5174|5175))?$/;

const isAllowedOrigin = (origin) => (
  allowedOrigins.includes(origin) ||
  extraOrigins.includes(origin) ||
  localNetworkOriginPattern.test(origin)
);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    // Do not throw here, otherwise browsers see a 500 on preflight.
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 hours preflight cache
}));

// ============================================================
// BODY PARSERS
// ============================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, res, next) => {
  // Help clients/proxies reuse connections and avoid cache-related guesswork.
  res.setHeader('Connection', 'keep-alive');
  next();
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  immutable: false,
}));

// ============================================================
// REQUEST LOGGER (Development)
// ============================================================
if (process.env.NODE_ENV === 'development' && process.env.ENABLE_REQUEST_LOGS === 'true') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });
}

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Mart Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ============================================================
// API ROUTES — All prefixed with /api
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/admin', adminRoutes);

// ============================================================
// 404 HANDLER
// ============================================================
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================
app.use(errorHandler);

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const httpServer = http.createServer(app);

// Keep sockets alive longer so clients can reuse TCP connections.
httpServer.keepAliveTimeout = Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || 65000);
httpServer.headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS || 66000);
httpServer.requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS || 30000);

initRealtime(httpServer, { isAllowedOrigin });

httpServer.listen(PORT, HOST, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║        🛒 MART BACKEND SERVER            ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  ✅ Server running on ${HOST}:${PORT}      ║`);
  console.log(`║  📦 Environment: ${(process.env.NODE_ENV || 'development').padEnd(22)}║`);
  console.log('║                                          ║');
  console.log('║  🌐 Allowed Origins:                     ║');
  console.log('║   • http://localhost:5173 (Customer)     ║');
  console.log('║   • http://localhost:5174 (Admin)        ║');
  console.log('║   • http://localhost:5175 (Delivery)     ║');
  console.log('║   • Local network IPs on 5173-5175       ║');
  console.log('║                                          ║');
  console.log(`║  📡 API Base: http://${HOST}:${PORT}/api  ║`);
  console.log(`║  💊 Health:   http://${HOST}:${PORT}/health║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;





