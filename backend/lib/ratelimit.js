const buckets = new Map();

/**
 * Fixed-window rate limit sederhana (in-memory, per instance).
 * return true = diizinkan; false = melewati batas.
 */
function hit(key, { limit = 5, windowMs = 15 * 60000 } = {}) {
  const now = Date.now();
  const row = buckets.get(key);
  if (!row || now >= row.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  row.count += 1;
  return row.count <= limit;
}

function reset(key) {
  buckets.delete(key);
}

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (now >= v.resetAt) buckets.delete(k);
  }
}, 60000).unref?.();

module.exports = { hit, reset, clientIp };
