#!/usr/bin/env node
/**
 * Backup database — lokal (SQLite) atau Turso/libSQL (via env).
 *
 * Lokal:   node scripts/backup-db.js
 * Turso:   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/backup-db.js
 *
 * Output: backups/food_rescue-<timestamp>.json (+ .sql ringkas untuk restore manual)
 */
const fs = require('node:fs');
const path = require('node:path');

const OUT_DIR = path.join(__dirname, '..', 'backups');
const TABLES = [
  'user',
  'surplus_makanan',
  'kebutuhan_pangan',
  'alokasi',
  'kode_otp',
  'reset_sandi',
  'notifikasi',
  'outbox_pesan',
  'log_audit',
];

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function dumpSqliteLocal() {
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = path.join(__dirname, '..', 'data', 'food_rescue.db');
  if (!fs.existsSync(dbPath)) throw new Error(`DB lokal tidak ada: ${dbPath}`);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const dump = {};
  for (const t of TABLES) {
    try {
      dump[t] = db.prepare(`SELECT * FROM ${t}`).all();
    } catch {
      dump[t] = [];
    }
  }
  db.close();
  return dump;
}

async function dumpCloud() {
  const { createClient } = require('@libsql/client');
  const url = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN;
  if (!url) throw new Error('TURSO_DATABASE_URL belum di-set');
  const client = createClient({ url, authToken: authToken || undefined });
  const dump = {};
  for (const t of TABLES) {
    try {
      const r = await client.execute(`SELECT * FROM ${t}`);
      dump[t] = (r.rows || []).map((row) => ({ ...row }));
    } catch {
      dump[t] = [];
    }
  }
  return dump;
}

function dumpToSql(dump) {
  const esc = (v) =>
    v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
  const lines = ['-- Food Rescue AI backup ' + new Date().toISOString()];
  for (const [table, rows] of Object.entries(dump)) {
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    for (const row of rows) {
      lines.push(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => esc(row[c])).join(', ')});`
      );
    }
  }
  return lines.join('\n');
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cloud = Boolean(process.env.TURSO_DATABASE_URL || process.env.LIBSQL_DATABASE_URL);
  const dump = cloud ? await dumpCloud() : await dumpSqliteLocal();
  const base = path.join(OUT_DIR, `food_rescue-${stamp()}`);
  fs.writeFileSync(base + '.json', JSON.stringify(dump, null, 2));
  fs.writeFileSync(base + '.sql', dumpToSql(dump));
  const counts = Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, v.length]));
  console.log('Backup OK:', base + '.json');
  console.log(counts);
  if (cloud) console.log('Sumber: Turso/libSQL (env)');
  else console.log('Sumber: SQLite lokal data/food_rescue.db');
})().catch((e) => {
  console.error('Backup gagal:', e.message);
  process.exit(1);
});
