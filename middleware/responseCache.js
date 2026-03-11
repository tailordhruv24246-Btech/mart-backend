const crypto = require('crypto');

const CACHE_TTL_SECONDS = Number(process.env.API_CACHE_TTL_SECONDS || 20);
const CACHE_MAX_ENTRIES = Number(process.env.API_CACHE_MAX_ENTRIES || 2000);
const CACHE_SWEEP_INTERVAL_MS = Number(process.env.API_CACHE_SWEEP_INTERVAL_MS || 60000);

const cacheStore = new Map();

const now = () => Date.now();

const getCacheKey = (req) => {
  // Include auth context to prevent leaking cached responses between users.
  const token = String(req.headers.authorization || '');
  const identity = req.user?.id ? `u:${req.user.id}` : (token ? `t:${crypto.createHash('sha1').update(token).digest('hex').slice(0, 12)}` : 'public');
  return `${req.method}:${req.originalUrl}:${identity}`;
};

const pruneExpired = () => {
  const current = now();
  for (const [key, value] of cacheStore.entries()) {
    if (!value || value.expiresAt <= current) {
      cacheStore.delete(key);
    }
  }
};

const enforceCacheLimit = () => {
  if (cacheStore.size <= CACHE_MAX_ENTRIES) return;

  // Map keeps insertion order; delete oldest entries first.
  const overflow = cacheStore.size - CACHE_MAX_ENTRIES;
  let removed = 0;
  for (const key of cacheStore.keys()) {
    cacheStore.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
};

const purgeCache = (prefixes = []) => {
  if (!Array.isArray(prefixes) || prefixes.length === 0) {
    cacheStore.clear();
    return;
  }

  for (const key of cacheStore.keys()) {
    if (prefixes.some((prefix) => key.includes(prefix))) {
      cacheStore.delete(key);
    }
  }
};

const responseCache = (ttlSeconds = CACHE_TTL_SECONDS) => (req, res, next) => {
  if (req.method !== 'GET') return next();

  const cacheKey = getCacheKey(req);
  const cached = cacheStore.get(cacheKey);

  if (cached && cached.expiresAt > now()) {
    res.set('X-Cache', 'HIT');
    return res.status(cached.statusCode).json(cached.payload);
  }

  if (cached && cached.expiresAt <= now()) {
    cacheStore.delete(cacheKey);
  }

  const originalJson = res.json.bind(res);

  res.json = (payload) => {
    // Cache only successful API responses.
    if (res.statusCode >= 200 && res.statusCode < 300) {
      cacheStore.set(cacheKey, {
        statusCode: res.statusCode,
        payload,
        expiresAt: now() + Math.max(1, Number(ttlSeconds || 1)) * 1000,
      });
      enforceCacheLimit();
      res.set('X-Cache', 'MISS');
    }

    return originalJson(payload);
  };

  return next();
};

const clearResponseCache = (prefixes = []) => (req, res, next) => {
  purgeCache(prefixes);
  return next();
};

module.exports = {
  responseCache,
  clearResponseCache,
  purgeCache,
};

const sweepTimer = setInterval(pruneExpired, Math.max(5000, CACHE_SWEEP_INTERVAL_MS));
sweepTimer.unref();
