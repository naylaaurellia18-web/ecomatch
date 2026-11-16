/* Reset total schema public di database produksi (Neon) — HANYA lewat DATABASE_URL di .env.
 * Pemakaian: node scripts/reset-neon.js
 */
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL tidak ditemukan di .env');
  process.exit(1);
}

const { Client } = require('pg');
(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE');
  await c.query('CREATE SCHEMA public');
  await c.query('GRANT ALL ON SCHEMA public TO public');
  const t = await c.query(
    `SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'`
  );
  console.log('Neon: schema public di-reset. sisa tabel =', t.rows[0].n);
  await c.end();
})().catch((e) => {
  console.error('GAGAL reset:', e.message);
  process.exit(1);
});
