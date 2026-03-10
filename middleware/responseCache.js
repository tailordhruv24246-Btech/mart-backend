const CACHE_TTL_SECONDS = Number(process.env.API_CACHE_TTL_SECONDS || 20);

const cacheStore = new Map();

const now = () => Date.now();

const getCacheKey = (req) => `${req.method}:${req.originalUrl}`;

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

  const originalJson = res.json.bind(res);

  res.json = (payload) => {
    // Cache only successful API responses.
    if (res.statusCode >= 200 && res.statusCode < 300) {
      cacheStore.set(cacheKey, {
        statusCode: res.statusCode,
        payload,
        expiresAt: now() + Math.max(1, Number(ttlSeconds || 1)) * 1000,
      });
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
