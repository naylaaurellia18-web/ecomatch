const path = require('node:path');
const fs = require('node:fs');

/**
 * Skema database mengikuti SKPL_EcoMatch_v2.0 (PDM Tabel 6.1–6.5) — refactoring
 * FoodRescueAI -> EcoMatch. Nama tabel/kolom/enum inti = nama SKPL; sisanya
 * ekstensi (dokumentasikan di README). Skema final PostgreSQL (deploy baru):
 * db/schema_ecomatch.sql.
 *
 * Dialek:
 *  - PostgreSQL (SKPL: DBMS PostgreSQL + ekstensi PostGIS) — aktif bila DATABASE_URL/PG_DATABASE_URL di-set.
 *  - libSQL/SQLite — fallback lokal/bila TURSO_DATABASE_URL di-set.
 * SQL di routes ditulis gaya SQLite; penerjemahan ke PostgreSQL (? -> $n, datetime('now'),
 * tabel "user", tipe INTEGER/REAL, RETURNING id) dilakukan sekali di lapisan driver ini.
 */
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS user (
    id_user INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'donor' CHECK (role IN ('donor','penerima','kurir','admin')),
    status TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','aktif','ditolak')),
    telepon TEXT,
    alamat TEXT,
    lat REAL,
    lng REAL,
    nama_lembaga TEXT,
    kapasitas INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS surplus_makanan (
    id_makanan INTEGER PRIMARY KEY AUTOINCREMENT,
    id_donor INTEGER NOT NULL REFERENCES user(id_user),
    nama_makanan TEXT NOT NULL,
    deskripsi TEXT,
    jenis_makanan TEXT NOT NULL DEFAULT 'basah' CHECK (jenis_makanan IN ('basah','kering')),
    jumlah_porsi INTEGER NOT NULL CHECK (jumlah_porsi > 0),
    expiry_time TEXT NOT NULL,
    foto_kondisi TEXT NOT NULL,
    lat REAL,
    lng REAL,
    status TEXT NOT NULL DEFAULT 'tersedia'
      CHECK (status IN ('tersedia','dialokasikan','dijemput','terkirim','terverifikasi','dibatalkan','gagal')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS kebutuhan_pangan (
    id_kebutuhan INTEGER PRIMARY KEY AUTOINCREMENT,
    id_penerima INTEGER NOT NULL REFERENCES user(id_user),
    judul TEXT NOT NULL,
    porsi_dibutuhkan INTEGER NOT NULL CHECK (porsi_dibutuhkan > 0),
    urgensi TEXT NOT NULL DEFAULT 'sedang' CHECK (urgensi IN ('rendah','sedang','tinggi','kritis')),
    catatan TEXT,
    status TEXT NOT NULL DEFAULT 'terbuka' CHECK (status IN ('terbuka','dipenuhi','kedaluwarsa')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS alokasi (
    id_alokasi INTEGER PRIMARY KEY AUTOINCREMENT,
    id_makanan INTEGER NOT NULL REFERENCES surplus_makanan(id_makanan),
    id_kebutuhan INTEGER NOT NULL REFERENCES kebutuhan_pangan(id_kebutuhan),
    id_penerima INTEGER NOT NULL REFERENCES user(id_user),
    id_kurir INTEGER NOT NULL REFERENCES user(id_user),
    skor_matching REAL NOT NULL,
    skor_masa_simpan REAL NOT NULL,
    skor_jarak REAL NOT NULL,
    skor_urgensi REAL NOT NULL,
    skor_kapasitas REAL NOT NULL,
    jarak_km REAL NOT NULL,
    rute_json TEXT,
    status TEXT NOT NULL DEFAULT 'diajukan'
      CHECK (status IN ('diajukan','diterima','dijemput','terkirim','terverifikasi','dibatalkan')),
    foto_jemput TEXT,
    foto_antar TEXT,
    waktu_alokasi TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_alokasi_aktif
    ON alokasi(id_makanan) WHERE status != 'dibatalkan'`,
  `CREATE TABLE IF NOT EXISTS kode_otp (
    id_kode_otp INTEGER PRIMARY KEY AUTOINCREMENT,
    id_alokasi INTEGER NOT NULL REFERENCES alokasi(id_alokasi),
    kode TEXT NOT NULL,
    kedaluwarsa_pada TEXT NOT NULL,
    digunakan_pada TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS notifikasi (
    id_notifikasi INTEGER PRIMARY KEY AUTOINCREMENT,
    id_user INTEGER NOT NULL REFERENCES user(id_user),
    id_alokasi INTEGER REFERENCES alokasi(id_alokasi),
    judul TEXT NOT NULL,
    pesan TEXT NOT NULL,
    dibaca_pada TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS log_audit (
    id_log INTEGER PRIMARY KEY AUTOINCREMENT,
    id_user INTEGER,
    aksi TEXT NOT NULL,
    entitas TEXT NOT NULL,
    id_entitas TEXT,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS outbox_pesan (
    id_pesan INTEGER PRIMARY KEY AUTOINCREMENT,
    kanal TEXT NOT NULL CHECK (kanal IN ('whatsapp','email')),
    id_user INTEGER,
    tujuan TEXT,
    subjek TEXT,
    isi TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'antre' CHECK (status IN ('antre','terkirim','simulasi','gagal')),
    error TEXT,
    referensi_penerus TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS reset_sandi (
    id_reset INTEGER PRIMARY KEY AUTOINCREMENT,
    id_user INTEGER NOT NULL REFERENCES user(id_user),
    kode TEXT NOT NULL,
    kedaluwarsa_pada TEXT NOT NULL,
    digunakan_pada TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  // --- EcoMatch (tabel baru sesuai ERD_EcoMatch.png / SKPL PDM 6.5) ---
  `CREATE TABLE IF NOT EXISTS profil_mbg (
    id_user INTEGER PRIMARY KEY REFERENCES user(id_user),
    nama_sppg TEXT NOT NULL,
    alamat TEXT,
    lat REAL,
    lng REAL,
    kapasitas_porsi_harian INTEGER,
    penanggung_jawab TEXT,
    kontak TEXT,
    npwp TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS tps_pengolah (
    id_user INTEGER PRIMARY KEY REFERENCES user(id_user),
    nama_tps TEXT NOT NULL,
    jenis_tps TEXT NOT NULL DEFAULT 'tps_3r'
      CHECK (jenis_tps IN ('tps_3r','tps_komposter','tps_maggot','tps_eco_enzyme','bank_sampah','lainnya')),
    jenis_pengolahan TEXT NOT NULL DEFAULT 'komposter'
      CHECK (jenis_pengolahan IN ('komposter','maggot_bsf','eco_enzyme','bank_sampah','lainnya')),
    kapasitas_kg_hari REAL NOT NULL DEFAULT 0 CHECK (kapasitas_kg_hari >= 0),
    jenis_diterima TEXT NOT NULL DEFAULT '["lainnya"]',
    radius_layanan_km REAL NOT NULL DEFAULT 15,
    izin_operasional TEXT,
    aktif INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS sampah_makanan (
    id_sampah INTEGER PRIMARY KEY AUTOINCREMENT,
    id_donor INTEGER NOT NULL REFERENCES user(id_user),
    nama_sampah TEXT,
    jenis_makanan TEXT NOT NULL DEFAULT 'campuran'
      CHECK (jenis_makanan IN ('nasi','sayur','lauk','buah','campuran','lainnya')),
    berat_kg REAL NOT NULL CHECK (berat_kg > 0),
    waktu_produksi TEXT NOT NULL,
    foto_url TEXT,
    status TEXT NOT NULL DEFAULT 'tersedia'
      CHECK (status IN ('tersedia','dialokasikan','dijemput','terkirim','terverifikasi','dibatalkan')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS klasifikasi_sampah (
    id_klasifikasi INTEGER PRIMARY KEY AUTOINCREMENT,
    id_sampah INTEGER NOT NULL REFERENCES sampah_makanan(id_sampah),
    kategori TEXT NOT NULL
      CHECK (kategori IN ('sisa_nasi','sayur','lauk','kulit_buah','campuran','lainnya')),
    tingkat_pembusukan TEXT NOT NULL DEFAULT 'segar'
      CHECK (tingkat_pembusukan IN ('segar','sedang','busuk')),
    skor_keyakinan REAL NOT NULL DEFAULT 0,
    metode TEXT NOT NULL DEFAULT 'rule_based'
      CHECK (metode IN ('rule_based','ai_vision','manual_admin','hybrid')),
    alasan TEXT,
    diverifikasi_oleh INTEGER REFERENCES user(id_user),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS pengolahan_log (
    id_pengolahan INTEGER PRIMARY KEY AUTOINCREMENT,
    id_alokasi INTEGER NOT NULL REFERENCES alokasi(id_alokasi),
    input_kg REAL NOT NULL CHECK (input_kg >= 0),
    output_kg REAL CHECK (output_kg >= 0),
    output_jenis TEXT
      CHECK (output_jenis IS NULL OR output_jenis IN ('kompos','pupuk_cair','pakan_ternak','eco_enzyme','lainnya')),
    foto_bukti TEXT,
    tanggal TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS motivasi_donor_mbg (
    id_motivasi INTEGER PRIMARY KEY AUTOINCREMENT,
    id_user INTEGER NOT NULL REFERENCES user(id_user),
    jenis_insentif TEXT NOT NULL
      CHECK (jenis_insentif IN ('sertifikat','poin','laporan_kepatuhan','laporan_csr','badge')),
    nilai REAL,
    sertifikat_url TEXT,
    periode TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS konfigurasi_regulasi (
    id_konfigurasi INTEGER PRIMARY KEY AUTOINCREMENT,
    kode_daerah TEXT NOT NULL DEFAULT 'KOTA_MADIUN',
    nama_regulasi TEXT NOT NULL,
    jenis_regulasi TEXT NOT NULL DEFAULT 'lainnya'
      CHECK (jenis_regulasi IN ('perda','pergub','surat_edaran','lainnya')),
    aturan TEXT NOT NULL DEFAULT '{}',
    aktif INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sampah_status ON sampah_makanan(status)`,
  `CREATE INDEX IF NOT EXISTS idx_sampah_donor ON sampah_makanan(id_donor)`,
  `CREATE INDEX IF NOT EXISTS idx_klasifikasi_sampah ON klasifikasi_sampah(id_sampah)`,
  `CREATE INDEX IF NOT EXISTS idx_tps_aktif ON tps_pengolah(aktif)`,
];

const PK_BY_TABLE = {
  user: 'id_user',
  surplus_makanan: 'id_makanan',
  kebutuhan_pangan: 'id_kebutuhan',
  alokasi: 'id_alokasi',
  kode_otp: 'id_kode_otp',
  notifikasi: 'id_notifikasi',
  log_audit: 'id_log',
  outbox_pesan: 'id_pesan',
  reset_sandi: 'id_reset',
  profil_mbg: 'id_user',
  tps_pengolah: 'id_user',
  sampah_makanan: 'id_sampah',
  klasifikasi_sampah: 'id_klasifikasi',
  pengolahan_log: 'id_pengolahan',
  motivasi_donor_mbg: 'id_motivasi',
  konfigurasi_regulasi: 'id_konfigurasi',
};

// Trigger immutability log_audit (NFR-08) — dua dialek.
const SQLITE_TRIGGER_DROP = `
  DROP TRIGGER IF EXISTS log_audit_no_update;
  DROP TRIGGER IF EXISTS log_audit_no_delete;
`;
const SQLITE_TRIGGER_CREATE = `
  CREATE TRIGGER IF NOT EXISTS log_audit_no_update
  BEFORE UPDATE ON log_audit
  BEGIN
    SELECT RAISE(ABORT, 'log_audit is immutable');
  END;
  CREATE TRIGGER IF NOT EXISTS log_audit_no_delete
  BEFORE DELETE ON log_audit
  BEGIN
    SELECT RAISE(ABORT, 'log_audit is immutable');
  END;
`;
const PG_TRIGGER_DROP = `
  DROP TRIGGER IF EXISTS log_audit_no_update ON log_audit;
  DROP TRIGGER IF EXISTS log_audit_no_delete ON log_audit;
`;
const PG_TRIGGER_CREATE = `
  CREATE OR REPLACE FUNCTION log_audit_immutable() RETURNS trigger AS $fn$
  BEGIN RAISE EXCEPTION 'log_audit is immutable'; END;
  $fn$ LANGUAGE plpgsql;
  DO $do$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'log_audit_no_update' AND tgrelid = 'log_audit'::regclass) THEN
      EXECUTE 'CREATE TRIGGER log_audit_no_update BEFORE UPDATE ON log_audit FOR EACH ROW EXECUTE FUNCTION log_audit_immutable()';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'log_audit_no_delete' AND tgrelid = 'log_audit'::regclass) THEN
      EXECUTE 'CREATE TRIGGER log_audit_no_delete BEFORE DELETE ON log_audit FOR EACH ROW EXECUTE FUNCTION log_audit_immutable()';
    END IF;
  END
  $do$;
`;

// Lapisan spasial PostGIS (SKPL: spatial data store) — VIEW selalu sinkron dengan tabel sumber.
const POSTGIS_VIEW = `
  CREATE OR REPLACE VIEW v_lokasi_geospasial AS
  SELECT 'user'::text AS sumber, u.id_user::bigint AS id, u.nama, u.lat, u.lng,
         CASE WHEN u.lat IS NOT NULL AND u.lng IS NOT NULL
              THEN ST_SetSRID(ST_MakePoint(u.lng, u.lat), 4326)::geography END AS posisi
  FROM "user" u WHERE u.lat IS NOT NULL AND u.lng IS NOT NULL
  UNION ALL
  SELECT 'surplus_makanan', s.id_makanan, s.nama_makanan, s.lat, s.lng,
         CASE WHEN s.lat IS NOT NULL AND s.lng IS NOT NULL
              THEN ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography END
  FROM surplus_makanan s
  WHERE s.lat IS NOT NULL AND s.lng IS NOT NULL AND s.status IN ('tersedia','dialokasikan');
`;

/**
 * Migrasi dari skema lama (English: users, food_listings, food_needs, matches, ...)
 * ke skema SKPL di atas. Idempoten: hanya jalan bila tabel lama masih ada.
 * (jalur libSQL/SQLite saja — database PostgreSQL dibuat dari nol dengan skema SKPL)
 */
const FOTO_PLACEHOLDER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';

const MIGRATION_STATEMENTS = [
  `DROP TABLE IF EXISTS kode_otp`,
  `DROP TABLE IF EXISTS notifikasi`,
  `DROP TABLE IF EXISTS reset_sandi`,
  `DROP TABLE IF EXISTS alokasi`,
  `DROP TABLE IF EXISTS outbox_pesan`,
  `DROP TABLE IF EXISTS log_audit`,
  `DROP TABLE IF EXISTS surplus_makanan`,
  `DROP TABLE IF EXISTS kebutuhan_pangan`,
  `DROP TABLE IF EXISTS user`,
  ...SCHEMA_STATEMENTS,
  `INSERT INTO user (id_user, nama, email, password, role, status, telepon, alamat, lat, lng, nama_lembaga, kapasitas, created_at)
   SELECT id, name, email, password_hash,
     CASE role WHEN 'recipient' THEN 'penerima' WHEN 'courier' THEN 'kurir' WHEN 'admin' THEN 'admin' ELSE 'donor' END,
     CASE status WHEN 'active' THEN 'aktif' WHEN 'rejected' THEN 'ditolak' WHEN 'pending' THEN 'menunggu' ELSE 'menunggu' END,
     phone, address, lat, lng, org_name, capacity, created_at
   FROM users`,
  `INSERT INTO surplus_makanan (id_makanan, id_donor, nama_makanan, deskripsi, jenis_makanan, jumlah_porsi, expiry_time, foto_kondisi, lat, lng, status, created_at)
   SELECT id, donor_id, name, description,
     CASE food_type WHEN 'dry' THEN 'kering' ELSE 'basah' END,
     portions, expiry_at, COALESCE(photo_path, '${FOTO_PLACEHOLDER}'), lat, lng,
     CASE status
       WHEN 'available' THEN 'tersedia' WHEN 'matched' THEN 'dialokasikan'
       WHEN 'picked_up' THEN 'dijemput' WHEN 'delivered' THEN 'terkirim'
       WHEN 'verified' THEN 'terverifikasi' WHEN 'expired' THEN 'gagal'
       WHEN 'cancelled' THEN 'dibatalkan' ELSE 'tersedia' END,
     created_at
   FROM food_listings`,
  `INSERT INTO kebutuhan_pangan (id_kebutuhan, id_penerima, judul, porsi_dibutuhkan, urgensi, catatan, status, created_at, updated_at)
   SELECT id, recipient_id, title, portions_needed,
     CASE urgency WHEN 'low' THEN 'rendah' WHEN 'high' THEN 'tinggi' WHEN 'critical' THEN 'kritis' WHEN 'medium' THEN 'sedang' ELSE 'sedang' END,
     note,
     CASE status WHEN 'open' THEN 'terbuka' WHEN 'fulfilled' THEN 'dipenuhi' WHEN 'expired' THEN 'kedaluwarsa' ELSE 'terbuka' END,
     created_at, updated_at
   FROM food_needs`,
  `INSERT INTO alokasi (id_alokasi, id_makanan, id_kebutuhan, id_penerima, id_kurir, skor_matching, skor_masa_simpan, skor_jarak, skor_urgensi, skor_kapasitas, jarak_km, rute_json, status, foto_jemput, foto_antar, waktu_alokasi, updated_at)
   SELECT m.id, m.listing_id, m.need_id, n.recipient_id, m.courier_id,
     m.score, m.score_expiry, m.score_distance, m.score_urgency, m.score_capacity,
     m.distance_km, m.route_json,
     CASE m.status
       WHEN 'proposed' THEN 'diajukan' WHEN 'accepted' THEN 'diterima'
       WHEN 'picked_up' THEN 'dijemput' WHEN 'delivered' THEN 'terkirim'
       WHEN 'verified' THEN 'terverifikasi' WHEN 'cancelled' THEN 'dibatalkan'
       ELSE 'diajukan' END,
     m.photo_path, NULL, m.created_at, m.updated_at
   FROM matches m JOIN food_needs n ON n.id = m.need_id`,
  `INSERT INTO kode_otp (id_kode_otp, id_alokasi, kode, kedaluwarsa_pada, digunakan_pada, created_at)
   SELECT id, match_id, code, expires_at, used_at, created_at FROM otp_codes`,
  `INSERT INTO notifikasi (id_notifikasi, id_user, id_alokasi, judul, pesan, dibaca_pada, created_at)
   SELECT id, user_id, match_id, title, message, read_at, created_at FROM notifications`,
  `INSERT INTO log_audit (id_log, id_user, aksi, entitas, id_entitas, detail, created_at)
   SELECT id, user_id, action, entity, entity_id, detail, created_at FROM audit_logs`,
  `INSERT INTO outbox_pesan (id_pesan, kanal, id_user, tujuan, subjek, isi, status, error, referensi_penerus, created_at)
   SELECT id, channel, user_id, to_address, subject, body,
     CASE status WHEN 'queued' THEN 'antre' WHEN 'sent' THEN 'terkirim' WHEN 'simulated' THEN 'simulasi' WHEN 'failed' THEN 'gagal' ELSE 'antre' END,
     error, provider_ref, created_at
   FROM message_outbox`,
  `INSERT INTO reset_sandi (id_reset, id_user, kode, kedaluwarsa_pada, digunakan_pada, created_at)
   SELECT id, user_id, code, expires_at, used_at, created_at FROM password_resets`,
  `DROP TABLE IF EXISTS otp_codes`,
  `DROP TABLE IF EXISTS notifications`,
  `DROP TABLE IF EXISTS password_resets`,
  `DROP TABLE IF EXISTS matches`,
  `DROP TABLE IF EXISTS food_listings`,
  `DROP TABLE IF EXISTS food_needs`,
  `DROP TABLE IF EXISTS users`,
  `DROP TABLE IF EXISTS audit_logs`,
  `DROP TABLE IF EXISTS message_outbox`,
];

// ---------------------------------------------------------------------------
// Penerjemah SQL -> PostgreSQL
// ---------------------------------------------------------------------------
const NOW_PG = `to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

function toPg(sql, { ddl = false } = {}) {
  // datetime('now') -> to_char(now() UTC, ISO8601) supaya format identik dengan Date#toISOString
  let src = sql.replace(/datetime\(\s*'now'\s*\)/gi, '\u0001NOW\u0001');

  let out = '';
  let inStr = false;
  let ph = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (c === "'") {
        if (src[i + 1] === "'") {
          out += src[++i];
        } else {
          inStr = false;
        }
      }
      continue;
    }
    if (c === "'") {
      inStr = true;
      out += c;
      continue;
    }
    if (c === '"') {
      const end = src.indexOf('"', i + 1);
      const stop = end === -1 ? src.length : end + 1;
      out += src.slice(i, stop);
      i = stop - 1;
      continue;
    }
    if (c === '?') {
      ph += 1;
      out += `$${ph}`;
      continue;
    }
    if (c === '\u0001' && src.startsWith('\u0001NOW\u0001', i)) {
      out += NOW_PG;
      i += 4; // loop for menambah 1 lagi -> tepat di akhir penanda (5 karakter)
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j);
      out += word.toLowerCase() === 'user' ? '"user"' : word;
      i = j - 1;
      continue;
    }
    out += c;
  }

  if (ddl) {
    out = out.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'BIGSERIAL PRIMARY KEY');
    out = out.replace(/\bINTEGER\b/gi, 'BIGINT');
    out = out.replace(/\bREAL\b/gi, 'DOUBLE PRECISION');
  }
  return out;
}

function auditTriggerDDL() {
  return isPg() ? PG_TRIGGER_CREATE : SQLITE_TRIGGER_CREATE;
}
function auditTriggerDrop() {
  return isPg() ? PG_TRIGGER_DROP : SQLITE_TRIGGER_DROP;
}

// ---------------------------------------------------------------------------
// Koneksi
// ---------------------------------------------------------------------------
const pgUrl = process.env.DATABASE_URL || process.env.PG_DATABASE_URL || null;
const cloudUrl = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_DATABASE_URL || null;
const cloudToken = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || null;

let pgPool = null;
let localDb = null;
let cloudClient = null;
let readyPromise = null;

function isPg() {
  return !!pgUrl;
}
function dialect() {
  return isPg() ? 'postgresql' : cloudUrl ? 'libsql' : 'sqlite';
}

function cleanParams(params) {
  return (params || []).map((v) => (v === undefined ? null : v));
}

function normalizeResult(result) {
  return {
    rows: (result.rows || []).map((r) => ({ ...r })),
    lastInsertRowid: result.lastInsertRowid != null ? Number(result.lastInsertRowid) : null,
    changes: result.rowsAffected != null ? Number(result.rowsAffected) : 0,
  };
}

async function hasLegacySchema(runOne) {
  const r = await runOne(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'`);
  return (r.rows || []).length > 0;
}

async function initPg() {
  const { Pool } = require('pg');
  pgPool = new Pool({ connectionString: pgUrl, max: 10, idleTimeoutMillis: 30000 });
  await pgPool.query('SELECT 1');
  await pgPool.query('CREATE EXTENSION IF NOT EXISTS postgis');
  for (const sql of SCHEMA_STATEMENTS) {
    await pgPool.query(toPg(sql, { ddl: true }));
  }
  await pgPool.query(PG_TRIGGER_CREATE);
  await pgPool.query(POSTGIS_VIEW);
}

async function init() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    if (isPg()) {
      await initPg();
      return;
    }
    if (cloudUrl) {
      const { createClient } = require('@libsql/client');
      cloudClient = createClient({ url: cloudUrl, authToken: cloudToken || undefined });
      const runOne = async (sql) => cloudClient.execute(sql);
      if (await hasLegacySchema(runOne)) {
        await runOne(`PRAGMA foreign_keys = OFF`).catch(() => {});
        for (const sql of MIGRATION_STATEMENTS) await runOne(sql);
        await runOne(`PRAGMA foreign_keys = ON`).catch(() => {});
        console.log('DB: skema lama dimigrasikan ke nama SKPL (user/surplus_makanan/alokasi).');
      }
      for (const sql of SCHEMA_STATEMENTS) {
        await runOne(sql);
      }
      await runOne(SQLITE_TRIGGER_CREATE).catch(() => {});
      return;
    }

    const { DatabaseSync } = require('node:sqlite');
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    localDb = new DatabaseSync(path.join(dataDir, 'food_rescue.db'));
    localDb.exec('PRAGMA foreign_keys = ON;');
    localDb.exec('PRAGMA journal_mode = WAL;');
    const runOne = async (sql) => ({ rows: localDb.prepare(sql).all(), rowsAffected: 0 });
    if (await hasLegacySchema(runOne)) {
      localDb.exec('PRAGMA foreign_keys = OFF;');
      localDb.exec('BEGIN');
      try {
        for (const sql of MIGRATION_STATEMENTS) localDb.exec(sql);
        localDb.exec('COMMIT');
        console.log('DB: skema lama dimigrasikan ke nama SKPL (user/surplus_makanan/alokasi).');
      } catch (e) {
        localDb.exec('ROLLBACK');
        throw new Error(`Migrasi skema DB gagal (dibatalkan): ${e.message}`);
      } finally {
        localDb.exec('PRAGMA foreign_keys = ON;');
      }
    }
    for (const sql of SCHEMA_STATEMENTS) {
      localDb.exec(sql);
    }
    localDb.exec(SQLITE_TRIGGER_CREATE);
  })().catch((e) => {
    readyPromise = null;
    throw e;
  });
  return readyPromise;
}

async function all(sql, params = []) {
  await init();
  if (pgPool) {
    const r = await pgPool.query(toPg(sql), cleanParams(params));
    return r.rows.map((row) => ({ ...row }));
  }
  if (cloudClient) {
    const r = await cloudClient.execute({ sql, args: params });
    return normalizeResult(r).rows;
  }
  return localDb.prepare(sql).all(...params).map((r) => ({ ...r }));
}

async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0] ?? null;
}

async function run(sql, params = []) {
  await init();
  if (pgPool) {
    let q = toPg(sql);
    let pk = null;
    if (/^\s*INSERT\s+INTO/i.test(sql) && !/\bRETURNING\b/i.test(q)) {
      const m = sql.match(/^\s*INSERT\s+INTO\s+"?([A-Za-z0-9_]+)"?/i);
      const table = m && m[1].toLowerCase();
      pk = PK_BY_TABLE[table] || null;
      if (pk) q = `${q} RETURNING "${pk}"`;
    }
    const r = await pgPool.query(q, cleanParams(params));
    return {
      rows: [],
      lastInsertRowid: pk ? Number(r.rows[0][pk]) : null,
      changes: r.rowCount,
    };
  }
  if (cloudClient) {
    const r = await cloudClient.execute({ sql, args: params });
    return normalizeResult(r);
  }
  const r = localDb.prepare(sql).run(...params);
  return { rows: [], lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
}

async function exec(sql) {
  await init();
  if (pgPool) {
    await pgPool.query(toPg(sql));
    return;
  }
  if (cloudClient) {
    if (typeof cloudClient.executeMultiple === 'function') {
      await cloudClient.executeMultiple(sql);
    } else {
      await cloudClient.execute(sql);
    }
    return;
  }
  localDb.exec(sql);
}

/** TRUE bila memakai PostgreSQL + PostGIS (SKPL). */
async function isPgReady() {
  await init();
  return !!pgPool;
}

/** Info mesin untuk /api/health. */
async function engineInfo() {
  await init();
  if (pgPool) {
    const r = await pgPool.query(
      `SELECT current_database() AS db, version() AS versi,
              (SELECT count(*) FROM pg_extension WHERE extname = 'postgis') AS postgis`
    );
    const row = r.rows[0] || {};
    return {
      dialek: 'postgresql',
      versi: (row.versi || '').split(' ').slice(0, 2).join(' '),
      postgis: Number(row.postgis) > 0,
    };
  }
  if (cloudClient) return { dialek: 'libsql', versi: 'turso/libsql', postgis: false };
  return { dialek: 'sqlite', versi: 'node:sqlite', postgis: false };
}

async function close() {
  if (pgPool) await pgPool.end();
  pgPool = null;
}

module.exports = {
  all,
  get,
  run,
  exec,
  init,
  isPg,
  isPgReady,
  engineInfo,
  close,
  auditTriggerDDL,
  auditTriggerDrop,
  toPg,
  dialect,
  SCHEMA_STATEMENTS,
};
