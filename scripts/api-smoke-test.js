const fs = require('fs');
const path = require('path');

const base = process.env.API_BASE || 'https://mart-backend-jlfj.onrender.com';
const routeDir = path.join(__dirname, '..', 'routes');

const prefixMap = {
  auth: '/api/auth',
  category: '/api/categories',
  product: '/api/products',
  purchase: '/api/purchases',
  order: '/api/orders',
  pos: '/api/pos',
  report: '/api/reports',
  user: '/api/users',
  settings: '/api/settings',
  inventory: '/api/inventory',
  cart: '/api/cart',
  address: '/api/addresses',
  wishlist: '/api/wishlist',
  admin: '/api/admin',
};

function discoverEndpoints() {
  const files = fs.readdirSync(routeDir).filter((f) => f.endsWith('Routes.js'));
  const rgx = /router\.(get|post|put|delete|patch)\(\s*['\"]([^'\"]+)['\"]/g;
  const endpoints = [];

  for (const file of files) {
    const txt = fs.readFileSync(path.join(routeDir, file), 'utf8');
    const key = file.replace('Routes.js', '');
    const prefix = prefixMap[key];
    if (!prefix) continue;

    let hit;
    while ((hit = rgx.exec(txt)) !== null) {
      const method = hit[1].toUpperCase();
      let p = hit[2].replace(/:\w+/g, '1');
      if (p === '*') continue;
      endpoints.push({ method, url: `${base}${prefix}${p}` });
    }
  }

  const seen = new Set();
  return endpoints.filter((e) => {
    const k = `${e.method} ${e.url}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function testOne(endpoint) {
  const opts = {
    method: endpoint.method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
    opts.body = '{}';
  }

  try {
    const res = await fetch(endpoint.url, opts);
    const body = await res.text();
    return {
      ...endpoint,
      status: res.status,
      ok: res.status < 500,
      body: body.slice(0, 180).replace(/\s+/g, ' ').trim(),
    };
  } catch (err) {
    return {
      ...endpoint,
      status: 0,
      ok: false,
      body: String(err.message || err),
    };
  }
}

(async () => {
  const endpoints = discoverEndpoints();
  const results = [];

  for (const e of endpoints) {
    // Sequential to avoid rate spikes on free tier.
    results.push(await testOne(e));
  }

  const total = results.length;
  const non5xx = results.filter((r) => r.ok).length;
  const failures = results.filter((r) => !r.ok);

  console.log(`TOTAL_ENDPOINTS=${total}`);
  console.log(`NON_5XX=${non5xx}`);
  console.log(`FAILED_5XX_OR_NETWORK=${failures.length}`);

  const statusCounts = {};
  for (const r of results) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  }

  console.log('---STATUS_COUNTS---');
  Object.keys(statusCounts)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((k) => console.log(`${k}:${statusCounts[k]}`));

  if (failures.length > 0) {
    console.log('---FAILURES---');
    for (const f of failures) {
      console.log(`${f.method} ${f.url} -> ${f.status} | ${f.body}`);
    }
  }
})();
