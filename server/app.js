const express = require('express');
const path = require('node:path');

const db = require('./db');
const { seed } = require('./seed');
const { storageMode } = require('./lib/storage');

const authRoutes = require('./routes/auth');
const wasteRoutes = require('./routes/waste');
const classifyRoutes = require('./routes/classify');
const tpsRoutes = require('./routes/tps');
const routingRoutes = require('./routes/routing');
const deliveryRoutes = require('./routes/deliveries');
const complianceRoutes = require('./routes/compliance');
const mbgRoutes = require('./routes/mbg');
const notificationRoutes = require('./routes/notifications');
const geoRoutes = require('./routes/geo');
const adminRoutes = require('./routes/admin');

const app = express();
app.set('trust proxy', 1);

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://res.cloudinary.com https://*.tile.openstreetmap.org",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
].join('; ');

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': CSP,
    'X-Permitted-Cross-Domain-Policies': 'none',
  });
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  if (req.path.startsWith('/api/')) {
    res.set('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin.replace(/\/$/, ''))) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'Vary': 'Origin',
      });
    }
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
  }
  next();
});
app.use(express.json({ limit: '3mb' }));

let bootPromise = null;
function boot() {
  if (!bootPromise) {
    bootPromise = (async () => {
      await db.init();
      const userCount = Number((await db.get('SELECT COUNT(*) AS c FROM user'))?.c ?? 0);
      if (userCount === 0) {
        await seed();
        console.log('Database kosong — seed dijalankan otomatis.');
      }
      await db.run(
        `UPDATE reset_sandi SET digunakan_pada = datetime('now')
         WHERE digunakan_pada IS NULL AND kedaluwarsa_pada < datetime('now')`
      );
      console.log(`Foto storage: ${storageMode()}`);
    })().catch((e) => {
      bootPromise = null;
      throw e;
    });
  }
  return bootPromise;
}

app.use(async (_req, _res, next) => {
  try {
    await boot();
    next();
  } catch (e) {
    next(e);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/waste', wasteRoutes);
app.use('/api/classify', classifyRoutes);
app.use('/api/tps', tpsRoutes);
app.use('/api/routing', routingRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/mbg', mbgRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', async (_req, res) => {
  let dbInfo = { dialek: 'unknown' };
  try {
    dbInfo = await db.engineInfo();
  } catch {
    /* DB belum siap */
  }
  const { engineStatus } = require('./lib/routing');
  res.json({
    status: 'ok',
    service: 'EcoMatch',
    db: dbInfo,
    ai_routing: engineStatus(),
    routing: { provider: process.env.ROUTE_PROVIDER || 'osrm', fallback: 'haversine' },
    skpl: 'SKPL_EcoMatch_v2.0',
  });
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get(/^\/(?!api|uploads).*/, (_req, res) => {
  const page = path.join(__dirname, '..', 'public', 'index.html');
  res.sendFile(page);
});

app.use((err, req, res, _next) => {
  let status = err.status || 500;
  let message = err.message || 'Terjadi kesalahan server';
  if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = 'File terlalu besar (maksimal 1 MB)';
  } else if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
    status = 400;
    message = 'File tidak diizinkan';
  } else if (status >= 500) {
    message = 'Terjadi kesalahan server';
  }
  const payload = {
    ts: new Date().toISOString(),
    level: status >= 500 ? 'error' : 'warn',
    method: req.method,
    path: req.originalUrl,
    status,
    message: err.message || message,
  };
  console.error(JSON.stringify(payload));
  res.status(status).json({ error: message });
});

module.exports = { app, boot };
