const path = require('node:path');
const fs = require('node:fs');

/**
 * Skema database mengikuti SKPL_EcoMatch_v2.0 (PDM Tabel 6.1–6.5) — refactoring
 * versi lama -> EcoMatch. Nama tabel/kolom/enum inti = nama SKPL; sisanya
 * ekstensi (dokumentasikan di README). Skema final PostgreSQL (deploy baru):
 * db/schema_ecomatch.sql.
 *
 * Dialek:
 *  - PostgreSQL (SKPL: DBMS PostgreSQL + ekstensi PostGIS) — aktif bila DATABASE_URL/PG_DATABASE_URL di-set.
 *  - libSQL/SQLite — fallback lokal/bila TURSO_DATABASE_URL di-set.
 * SQL di routes ditulis gaya SQLite; penerjemahan ke PostgreSQL (? -> $n, datetime('now'),
 * tabel "user", tipe INTEGER/REAL, RETURNING id) dilakukan sekali di lapisan driver ini.
 *
 * Migrasi cutover (Fase 4): cutoverEcoMatch() mengubah skema versi lama
 * (role donor/penerima, tabel surplus_makanan/kebutuhan_pangan, alokasi lama)
 * menjadi skema EcoMatch (role donor_mbg/tps_pengolah, sampah_makanan,
 * tps_pengolah, alokasi final). Idempoten — dilewati bila sudah skema final.
 */
const TABLE_USER = `CREATE TABLE IF NOT EXISTS user (
    id_user INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'donor_mbg' CHECK (role IN ('donor_mbg','tps_pengolah','kurir','admin')),
    status TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','aktif','ditolak')),
    telepon TEXT,
    alamat TEXT,
    lat REAL,
    lng REAL,
    nama_lembaga TEXT,
    kapasitas INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

const TABLE_PROFIL_MBG = `CREATE TABLE IF NOT EXISTS profil_mbg (
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
  )`;

const TABLE_TPS = `CREATE TABLE IF NOT EXISTS tps_pengolah (
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
    aktif BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

const TABLE_SAMPAH = `CREATE TABLE IF NOT EXISTS sampah_makanan (
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
  )`;

const TABLE_KLASIFIKASI = `CREATE TABLE IF NOT EXISTS klasifikasi_sampah (
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
  )`;

const TABLE_ALOKASI = `CREATE TABLE IF NOT EXISTS alokasi (
    id_alokasi INTEGER PRIMARY KEY AUTOINCREMENT,
    id_sampah INTEGER NOT NULL REFERENCES sampah_makanan(id_sampah),
    id_tps INTEGER NOT NULL REFERENCES tps_pengolah(id_user),
    id_kurir INTEGER NOT NULL REFERENCES user(id_user),
    skor_matching REAL NOT NULL,
    skor_jenis_cocok REAL NOT NULL,
    skor_kapasitas REAL NOT NULL,
    skor_jarak REAL NOT NULL,
    skor_urgensi REAL NOT NULL,
    jarak_km REAL NOT NULL,
    rute_json TEXT,
    status TEXT NOT NULL DEFAULT 'dialokasikan'
      CHECK (status IN ('dialokasikan','dijemput','terkirim','terverifikasi','dibatalkan')),
    foto_jemput TEXT,
    foto_antar TEXT,
    waktu_alokasi TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

const TABLE_KODE_OTP = `CREATE TABLE IF NOT EXISTS kode_otp (
    id_kode_otp INTEGER PRIMARY KEY AUTOINCREMENT,
    id_alokasi INTEGER NOT NULL REFERENCES alokasi(id_alokasi),
    kode TEXT NOT NULL,
    kedaluwarsa_pada TEXT NOT NULL,
    digunakan_pada TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

const TABLE_NOTIFIKASI = `CREATE TABLE IF NOT EXISTS notifikasi (
    id_notifikasi INTEGER PRIMARY KEY AUTOINCREMENT,
    id_user INTEGER NOT NULL REFERENCES user(id_user),
    id_alokasi INTEGER REFERENCES alokasi(id_alokasi),
    judul TEXT NOT NULL,
    pesan TEXT NOT NULL,
    dibaca_pada TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

const TABLE_LOG_AUDIT = `CREATE TABLE IF NOT EXISTS log_audit (
    id_log INTEGER PRIMARY KEY AUTOINCREMENT,
    id_user INTEGER,
    aksi TEXT NOT NULL,
    entitas TEXT NOT NULL,
    id_entitas TEXT,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

const TABLE_OUTBOX = `CREATE TABLE IF NOT EXISTS outbox_pesan (
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
  )`;

const TABLE_RESET = `CREATE TABLE IF NOT EXISTS reset_sandi (
    id_reset INTEGER PRIMARY KEY AUTOINCREMENT,
    id_user INTEGER NOT NULL REFERENCES user(id_user),
    kode TEXT NOT NULL,
    kedaluwarsa_pada TEXT NOT NULL,
    digunakan_pada TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

const TABLE_PENGOLAHAN = `CREATE TABLE IF NOT EXISTS pengolahan_log (
    id_pengolahan INTEGER PRIMARY KEY AUTOINCREMENT,
    id_alokasi INTEGER NOT NULL REFERENCES alokasi(id_alokasi),
    input_kg REAL NOT NULL CHECK (input_kg >= 0),
    output_kg REAL CHECK (output_kg >= 0),
    output_jenis TEXT
      CHECK (output_jenis IS NULL OR output_jenis IN ('kompos','pupuk_cair','pakan_ternak','eco_enzyme','lainnya')),
    foto_bukti TEXT,
    tanggal TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

const TABLE_MOTIVASI = `CREATE TABLE IF NOT EXISTS motivasi_donor_mbg (
    id_motivasi INTEGER PRIMARY KEY AUTOINCREMENT,
    id_user INTEGER NOT NULL REFERENCES user(id_user),
    jenis_insentif TEXT NOT NULL
      CHECK (jenis_insentif IN ('sertifikat','poin','laporan_kepatuhan','laporan_csr','badge')),
    nilai REAL,
    sertifikat_url TEXT,
    periode TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

const TABLE_REGULASI = `CREATE TABLE IF NOT EXISTS konfigurasi_regulasi (
    id_konfigurasi INTEGER PRIMARY KEY AUTOINCREMENT,
    kode_daerah TEXT NOT NULL DEFAULT 'KOTA_MADIUN',
    nama_regulasi TEXT NOT NULL,
    jenis_regulasi TEXT NOT NULL DEFAULT 'lainnya'
      CHECK (jenis_regulasi IN ('perda','pergub','surat_edaran','lainnya')),
    aturan TEXT NOT NULL DEFAULT '{}',
    aktif BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

// Tabel bersama lama/EcoMatch — dibuat saat migrasi skema Inggris juga.
const SHARED_TABLES = [TABLE_KODE_OTP, TABLE_NOTIFIKASI, TABLE_LOG_AUDIT, TABLE_OUTBOX, TABLE_RESET];

const SCHEMA_TABLES = [
  TABLE_USER,
  TABLE_PROFIL_MBG,
  TABLE_TPS,
  TABLE_SAMPAH,
  TABLE_KLASIFIKASI,
  TABLE_ALOKASI,
  ...SHARED_TABLES,
  TABLE_PENGOLAHAN,
  TABLE_MOTIVASI,
  TABLE_REGULASI,
];

const SCHEMA_INDEX_STATEMENTS = [
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_alokasi_aktif
    ON alokasi(id_sampah) WHERE status != 'dibatalkan'`,
  `CREATE INDEX IF NOT EXISTS idx_sampah_status ON sampah_makanan(status)`,
  `CREATE INDEX IF NOT EXISTS idx_sampah_donor ON sampah_makanan(id_donor)`,
  `CREATE INDEX IF NOT EXISTS idx_klasifikasi_sampah ON klasifikasi_sampah(id_sampah)`,
  `CREATE INDEX IF NOT EXISTS idx_tps_aktif ON tps_pengolah(aktif)`,
  `CREATE INDEX IF NOT EXISTS idx_alokasi_tps ON alokasi(id_tps, status)`,
  `CREATE INDEX IF NOT EXISTS idx_alokasi_kurir ON alokasi(id_kurir, status)`,
  `CREATE INDEX IF NOT EXISTS idx_notifikasi_user ON notifikasi(id_user, dibaca_pada)`,
];

const PK_BY_TABLE = {
  user: 'id_user',
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
  SELECT 'tps_pengolah', t.id_user, t.nama_tps, u.lat, u.lng,
         CASE WHEN u.lat IS NOT NULL AND u.lng IS NOT NULL
              THEN ST_SetSRID(ST_MakePoint(u.lng, u.lat), 4326)::geography END
  FROM tps_pengolah t JOIN "user" u ON u.id_user = t.id_user
  WHERE u.lat IS NOT NULL AND u.lng IS NOT NULL AND t.aktif;
`;

// ---------------------------------------------------------------------------
// Migrasi skema Inggris lama (users/food_listings/...) -> skema SKPL lama
// (user/surplus_makanan/kebutuhan_pangan/alokasi). Langkah berikutnya:
// cutoverEcoMatch() mengubah skema SKPL lama menjadi skema EcoMatch final.
// ---------------------------------------------------------------------------
const FOTO_PLACEHOLDER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';

// Skema SKPL "lama" (role donor/penerima + surplus/kebutuhan + alokasi lama) —
// hanya dipakai sebagai perantara saat migrasi dari skema Inggris.
const LEGACY_USER = `CREATE TABLE IF NOT EXISTS user (
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
  )`;

const LEGACY_SURPLUS = `CREATE TABLE IF NOT EXISTS surplus_makanan (
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
  )`;

const LEGACY_KEBUTUHAN = `CREATE TABLE IF NOT EXISTS kebutuhan_pangan (
    id_kebutuhan INTEGER PRIMARY KEY AUTOINCREMENT,
    id_penerima INTEGER NOT NULL REFERENCES user(id_user),
    judul TEXT NOT NULL,
    porsi_dibutuhkan INTEGER NOT NULL CHECK (porsi_dibutuhkan > 0),
    urgensi TEXT NOT NULL DEFAULT 'sedang' CHECK (urgensi IN ('rendah','sedang','tinggi','kritis')),
    catatan TEXT,
    status TEXT NOT NULL DEFAULT 'terbuka' CHECK (status IN ('terbuka','dipenuhi','kedaluwarsa')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

const LEGACY_ALOKASI = `CREATE TABLE IF NOT EXISTS alokasi (
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
  )`;

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
  LEGACY_USER,
  LEGACY_SURPLUS,
  LEGACY_KEBUTUHAN,
  LEGACY_ALOKASI,
  ...SHARED_TABLES,
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

const REGULASI_ATURAN =
  '{"bobot_routing":{"jenis_cocok":0.35,"kapasitas":0.25,"jarak":0.25,"urgensi":0.15},' +
  '"radius_layanan_km":15,"batas_skor":0.3,"target_alokasi_persen":85,' +
  '"sla_routing_detik":3,"poin_per_kg":10,"larangan":["buang sampah makanan ke TPS biasa"]}';

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

// ---------------------------------------------------------------------------
// Eksekutor mentah (tanpa toPg) — hanya untuk SQL yang sudah per-dialek
// ---------------------------------------------------------------------------
async function rawAll(sql, params = []) {
  if (pgPool) return (await pgPool.query(sql, cleanParams(params))).rows.map((r) => ({ ...r }));
  if (cloudClient) {
    const r = await cloudClient.execute({ sql, args: params });
    return (r.rows || []).map((row) => ({ ...row }));
  }
  return localDb.prepare(sql).all(...params).map((r) => ({ ...r }));
}

async function rawRun(sql, params = []) {
  if (pgPool) return pgPool.query(sql, cleanParams(params));
  if (cloudClient) return cloudClient.execute({ sql, args: params });
  return localDb.prepare(sql).run(...params);
}

async function rawExec(sql) {
  if (pgPool) return pgPool.query(sql);
  if (cloudClient) {
    if (typeof cloudClient.executeMultiple === 'function') return cloudClient.executeMultiple(sql);
    return cloudClient.execute(sql);
  }
  return localDb.exec(sql);
}

async function tableExistsRaw(name) {
  if (pgPool) {
    const r = await pgPool.query(`SELECT to_regclass($1) AS t`, [name]);
    return !!r.rows[0].t;
  }
  const rows = await rawAll(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [name]);
  return rows.length > 0;
}

async function sqlTableDdl(name) {
  const rows = await rawAll(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`, [name]);
  return rows[0] ? String(rows[0].sql || '') : '';
}

// ---------------------------------------------------------------------------
// Migrasi cutover skema lama -> EcoMatch (Fase 4) — idempoten per tahap
// ---------------------------------------------------------------------------
async function cutoverPg() {
  const client = await pgPool.connect();
  const q = (sql, params) => client.query(sql, params);
  let adaPerubahan = false;
  await q('BEGIN');
  try {

  // (0) tipe kolom aktif -> boolean (skema EcoMatch final)
  for (const tabel of ['tps_pengolah', 'konfigurasi_regulasi']) {
    const info = await q(
      `SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'aktif'`,
      [tabel]
    );
    if (info.rows[0] && info.rows[0].data_type !== 'boolean') {
      await q(`ALTER TABLE ${tabel} ALTER COLUMN aktif DROP DEFAULT`);
      await q(`ALTER TABLE ${tabel} ALTER COLUMN aktif TYPE BOOLEAN USING aktif <> 0`);
      await q(`ALTER TABLE ${tabel} ALTER COLUMN aktif SET DEFAULT TRUE`);
      adaPerubahan = true;
    }
  }

  // (a) role user: donor -> donor_mbg, penerima -> tps_pengolah
  const roleCons = (
    await q(
      `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
       WHERE conrelid = '"user"'::regclass AND contype = 'c'
         AND pg_get_constraintdef(oid) LIKE '%role%'`
    )
  ).rows;
  const sudahEco = roleCons.some((c) => c.def.includes('donor_mbg'));
  const roleLama = (
    await q(`SELECT COUNT(*)::int AS c FROM "user" WHERE role IN ('donor','penerima')`)
  ).rows[0].c;
  if (!sudahEco || roleLama > 0) {
    for (const c of roleCons) await q(`ALTER TABLE "user" DROP CONSTRAINT "${c.conname}"`);
    await q(
      `UPDATE "user" SET role = CASE role WHEN 'donor' THEN 'donor_mbg' WHEN 'penerima' THEN 'tps_pengolah' ELSE role END
       WHERE role IN ('donor','penerima')`
    );
    await q(
      `ALTER TABLE "user" ADD CONSTRAINT user_role_check CHECK (role IN ('donor_mbg','tps_pengolah','kurir','admin'))`
    );
    await q(`ALTER TABLE "user" ALTER COLUMN role SET DEFAULT 'donor_mbg'`);
    adaPerubahan = true;
  }

  // (b) surplus_makanan -> sampah_makanan (1 porsi ~= 0,4 kg; id dipertahankan)
  if (await tableExistsRaw('surplus_makanan')) {
    await q(`
      INSERT INTO sampah_makanan (id_sampah, id_donor, nama_sampah, jenis_makanan, berat_kg, waktu_produksi, foto_url, status, created_at)
      SELECT s.id_makanan, s.id_donor, s.nama_makanan,
             CASE s.jenis_makanan WHEN 'basah' THEN 'campuran' ELSE 'lainnya' END,
             s.jumlah_porsi * 0.4, s.expiry_time, s.foto_kondisi,
             CASE s.status WHEN 'gagal' THEN 'dibatalkan' ELSE s.status END,
             s.created_at
      FROM surplus_makanan s
      WHERE NOT EXISTS (SELECT 1 FROM sampah_makanan t WHERE t.id_sampah = s.id_makanan)
    `);
    adaPerubahan = true;
  }

  // (c) akun penerima -> profil TPS Pengolah (nama_lembaga -> nama_tps)
  await q(`
    INSERT INTO tps_pengolah (id_user, nama_tps, kapasitas_kg_hari, jenis_diterima, radius_layanan_km, aktif, created_at)
    SELECT u.id_user, COALESCE(NULLIF(u.nama_lembaga, ''), u.nama), COALESCE(u.kapasitas, 100),
           '["sisa_nasi","sayur","lauk","kulit_buah","campuran","lainnya"]', 15, TRUE, u.created_at
    FROM "user" u
    WHERE u.role = 'tps_pengolah'
      AND NOT EXISTS (SELECT 1 FROM tps_pengolah t WHERE t.id_user = u.id_user)
  `);

  // (d) alokasi lama -> alokasi final (id_makanan/id_penerima -> id_sampah/id_tps)
  const kolomLama = (
    await q(
      `SELECT COUNT(*)::int AS c FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'alokasi' AND column_name = 'id_makanan'`
    )
  ).rows[0].c;
  if (kolomLama > 0) {
    const fks = (
      await q(
        `SELECT c.conrelid::regclass::text AS tbl, c.conname, pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c WHERE c.confrelid = 'alokasi'::regclass AND c.contype = 'f'`
      )
    ).rows;
    for (const fk of fks) await q(`ALTER TABLE ${fk.tbl} DROP CONSTRAINT "${fk.conname}"`);
    await q(`ALTER TABLE alokasi RENAME TO alokasi_lama`);
    await q(toPg(TABLE_ALOKASI, { ddl: true }));
    await q(`
      INSERT INTO alokasi (id_alokasi, id_sampah, id_tps, id_kurir, skor_matching, skor_jenis_cocok,
                           skor_kapasitas, skor_jarak, skor_urgensi, jarak_km, rute_json, status,
                           foto_jemput, foto_antar, waktu_alokasi, updated_at)
      SELECT a.id_alokasi, a.id_makanan, a.id_penerima, a.id_kurir, a.skor_matching,
             COALESCE(a.skor_masa_simpan, 1.0), a.skor_kapasitas, a.skor_jarak, a.skor_urgensi,
             a.jarak_km, a.rute_json,
             CASE a.status
               WHEN 'dibatalkan' THEN 'dibatalkan'
               WHEN 'diajukan' THEN 'dialokasikan'
               WHEN 'diterima' THEN 'dialokasikan'
               ELSE a.status END,
             a.foto_jemput, a.foto_antar, a.waktu_alokasi, a.updated_at
      FROM alokasi_lama a
    `);
    await q(`DROP TABLE alokasi_lama`);
    for (const fk of fks) await q(`ALTER TABLE ${fk.tbl} ADD CONSTRAINT "${fk.conname}" ${fk.def}`);
    adaPerubahan = true;
  }

  // (e) lepas tabel lama (view geospasial lama menunjuk tabel lama -> dibuat ulang setelah cutover)
  await q(`DROP VIEW IF EXISTS v_lokasi_geospasial`);
  if (await tableExistsRaw('surplus_makanan')) {
    await q(`DROP TABLE surplus_makanan`);
    adaPerubahan = true;
  }
  if (await tableExistsRaw('kebutuhan_pangan')) {
    await q(`DROP TABLE kebutuhan_pangan`);
    adaPerubahan = true;
  }
    await q('COMMIT');
  } catch (e) {
    await q('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return adaPerubahan;
}

async function cutoverSqlite() {
  const pakaiCloud = !!cloudClient;
  const setFk = async (on) => {
    if (pakaiCloud) {
      await cloudClient.execute(`PRAGMA foreign_keys = ${on ? 'ON' : 'OFF'}`).catch(() => {});
    } else {
      localDb.exec(`PRAGMA foreign_keys = ${on ? 'ON' : 'OFF'};`);
    }
  };
  let adaPerubahan = false;
  await setFk(false);
  const transaksi = !pakaiCloud;
  if (transaksi) localDb.exec('BEGIN');
  try {
    // (a) role user — SQLite tidak bisa DROP CONSTRAINT -> rebuild tabel user
    const ddlUser = await sqlTableDdl('user');
    if (ddlUser && !ddlUser.includes('donor_mbg')) {
      await rawRun(`DROP TABLE IF EXISTS user_ecomatch`);
      await rawRun(
        `CREATE TABLE user_ecomatch (
          id_user INTEGER PRIMARY KEY AUTOINCREMENT,
          nama TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'donor_mbg' CHECK (role IN ('donor_mbg','tps_pengolah','kurir','admin')),
          status TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','aktif','ditolak')),
          telepon TEXT,
          alamat TEXT,
          lat REAL,
          lng REAL,
          nama_lembaga TEXT,
          kapasitas INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      );
      await rawRun(
        `INSERT INTO user_ecomatch (id_user, nama, email, password, role, status, telepon, alamat, lat, lng, nama_lembaga, kapasitas, created_at)
         SELECT id_user, nama, email, password,
                CASE role WHEN 'donor' THEN 'donor_mbg' WHEN 'penerima' THEN 'tps_pengolah' ELSE role END,
                status, telepon, alamat, lat, lng, nama_lembaga, kapasitas, created_at
         FROM user`
      );
      await rawRun(`DROP TABLE user`);
      await rawRun(`ALTER TABLE user_ecomatch RENAME TO user`);
      adaPerubahan = true;
    }

    // (b) surplus_makanan -> sampah_makanan (id dipertahankan)
    if (await tableExistsRaw('surplus_makanan')) {
      await rawRun(
        `INSERT INTO sampah_makanan (id_sampah, id_donor, nama_sampah, jenis_makanan, berat_kg, waktu_produksi, foto_url, status, created_at)
         SELECT s.id_makanan, s.id_donor, s.nama_makanan,
                CASE s.jenis_makanan WHEN 'basah' THEN 'campuran' ELSE 'lainnya' END,
                s.jumlah_porsi * 0.4, s.expiry_time, s.foto_kondisi,
                CASE s.status WHEN 'gagal' THEN 'dibatalkan' ELSE s.status END,
                s.created_at
         FROM surplus_makanan s
         WHERE NOT EXISTS (SELECT 1 FROM sampah_makanan t WHERE t.id_sampah = s.id_makanan)`
      );
      adaPerubahan = true;
    }

    // (c) akun penerima -> profil TPS Pengolah
    await rawRun(
      `INSERT INTO tps_pengolah (id_user, nama_tps, kapasitas_kg_hari, jenis_diterima, radius_layanan_km, aktif, created_at)
       SELECT u.id_user, COALESCE(NULLIF(u.nama_lembaga, ''), u.nama), COALESCE(u.kapasitas, 100),
              '["sisa_nasi","sayur","lauk","kulit_buah","campuran","lainnya"]', 15, 1, u.created_at
       FROM user u
       WHERE u.role = 'tps_pengolah'
         AND NOT EXISTS (SELECT 1 FROM tps_pengolah t WHERE t.id_user = u.id_user)`
    );

    // (d) alokasi lama -> alokasi final
    const ddlAlokasi = await sqlTableDdl('alokasi');
    if (ddlAlokasi && ddlAlokasi.includes('id_makanan')) {
      await rawRun(`DROP TABLE IF EXISTS alokasi_ecomatch`);
      await rawRun(
        `CREATE TABLE alokasi_ecomatch (
          id_alokasi INTEGER PRIMARY KEY AUTOINCREMENT,
          id_sampah INTEGER NOT NULL REFERENCES sampah_makanan(id_sampah),
          id_tps INTEGER NOT NULL REFERENCES tps_pengolah(id_user),
          id_kurir INTEGER NOT NULL REFERENCES user(id_user),
          skor_matching REAL NOT NULL,
          skor_jenis_cocok REAL NOT NULL,
          skor_kapasitas REAL NOT NULL,
          skor_jarak REAL NOT NULL,
          skor_urgensi REAL NOT NULL,
          jarak_km REAL NOT NULL,
          rute_json TEXT,
          status TEXT NOT NULL DEFAULT 'dialokasikan'
            CHECK (status IN ('dialokasikan','dijemput','terkirim','terverifikasi','dibatalkan')),
          foto_jemput TEXT,
          foto_antar TEXT,
          waktu_alokasi TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      );
      await rawRun(
        `INSERT INTO alokasi_ecomatch (id_alokasi, id_sampah, id_tps, id_kurir, skor_matching, skor_jenis_cocok,
                                       skor_kapasitas, skor_jarak, skor_urgensi, jarak_km, rute_json, status,
                                       foto_jemput, foto_antar, waktu_alokasi, updated_at)
         SELECT a.id_alokasi, a.id_makanan, a.id_penerima, a.id_kurir, a.skor_matching,
                COALESCE(a.skor_masa_simpan, 1.0), a.skor_kapasitas, a.skor_jarak, a.skor_urgensi,
                a.jarak_km, a.rute_json,
                CASE a.status
                  WHEN 'dibatalkan' THEN 'dibatalkan'
                  WHEN 'diajukan' THEN 'dialokasikan'
                  WHEN 'diterima' THEN 'dialokasikan'
                  ELSE a.status END,
                a.foto_jemput, a.foto_antar, a.waktu_alokasi, a.updated_at
         FROM alokasi a`
      );
      await rawRun(`DROP TABLE alokasi`);
      await rawRun(`ALTER TABLE alokasi_ecomatch RENAME TO alokasi`);
      adaPerubahan = true;
    }

    // (e) lepas tabel lama
    if (await tableExistsRaw('surplus_makanan')) {
      await rawRun(`DROP TABLE surplus_makanan`);
      adaPerubahan = true;
    }
    if (await tableExistsRaw('kebutuhan_pangan')) {
      await rawRun(`DROP TABLE kebutuhan_pangan`);
      adaPerubahan = true;
    }
    if (transaksi) localDb.exec('COMMIT');
  } catch (e) {
    if (transaksi) {
      try {
        localDb.exec('ROLLBACK');
      } catch {
        /* rollback gagal — biarkan */
      }
    }
    throw e;
  } finally {
    await setFk(true);
  }
  return adaPerubahan;
}

async function cutoverEcoMatch() {
  const berubah = isPg() ? await cutoverPg() : await cutoverSqlite();
  if (berubah) {
    console.log('DB: cutover EcoMatch dijalankan (role donor_mbg/tps_pengolah, sampah_makanan, alokasi final).');
  }
}

/** Parameter default routing/kepatuhan (FR-16) — idempoten. */
async function seedRegulasi() {
  try {
    const rows = await rawAll(`SELECT COUNT(*) AS c FROM konfigurasi_regulasi`);
    if (Number(rows[0] && rows[0].c) > 0) return;
    await rawRun(
      `INSERT INTO konfigurasi_regulasi (kode_daerah, nama_regulasi, jenis_regulasi, aturan, aktif)
       VALUES ('KOTA_MADIUN', 'Kebijakan Pengelolaan Sampah Makanan MBG Kota Madiun', 'lainnya',
               '${REGULASI_ATURAN}', ${isPg() ? 'TRUE' : '1'})`
    );
  } catch (e) {
    console.error('DB: seed konfigurasi_regulasi gagal:', e.message);
  }
}

async function initPg() {
  const { Pool } = require('pg');
  pgPool = new Pool({ connectionString: pgUrl, max: 10, idleTimeoutMillis: 30000 });
  await pgPool.query('SELECT 1');
  await pgPool.query('CREATE EXTENSION IF NOT EXISTS postgis');
  for (const sql of SCHEMA_TABLES) {
    await pgPool.query(toPg(sql, { ddl: true }));
  }
  await cutoverEcoMatch();
  for (const sql of SCHEMA_INDEX_STATEMENTS) {
    await pgPool.query(toPg(sql));
  }
  await pgPool.query(PG_TRIGGER_CREATE);
  await pgPool.query(POSTGIS_VIEW);
  await seedRegulasi();
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
      for (const sql of SCHEMA_TABLES) {
        await runOne(sql);
      }
      await cutoverEcoMatch();
      for (const sql of SCHEMA_INDEX_STATEMENTS) {
        await runOne(sql);
      }
      await runOne(SQLITE_TRIGGER_CREATE).catch(() => {});
      await seedRegulasi();
      return;
    }

    const { DatabaseSync } = require('node:sqlite');
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    localDb = new DatabaseSync(path.join(dataDir, 'ecomatch.db'));
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
    for (const sql of SCHEMA_TABLES) {
      localDb.exec(sql);
    }
    await cutoverEcoMatch();
    for (const sql of SCHEMA_INDEX_STATEMENTS) {
      localDb.exec(sql);
    }
    localDb.exec(SQLITE_TRIGGER_CREATE);
    await seedRegulasi();
    try {
      const rusak = localDb.prepare('PRAGMA foreign_key_check').all();
      if (rusak.length) {
        console.warn(`DB: peringatan — ${rusak.length} baris melanggar foreign key (data lama?).`);
      }
    } catch {
      /* tidak semua dialek mendukung foreign_key_check */
    }
  })().catch((e) => {
    readyPromise = null;
    throw e;
  });
  return readyPromise;
}

function normalizeRow(row) {
  const out = { ...row };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (typeof v === 'string' && /^(id_[a-z0-9_]+|.*_id)$/.test(k) && /^\d+$/.test(v)) {
      const n = Number(v);
      if (Number.isSafeInteger(n)) out[k] = n;
    }
  }
  return out;
}

async function all(sql, params = []) {
  await init();
  if (pgPool) {
    const r = await pgPool.query(toPg(sql), cleanParams(params));
    return r.rows.map((row) => normalizeRow(row));
  }
  if (cloudClient) {
    const r = await cloudClient.execute({ sql, args: params });
    return normalizeResult(r).rows.map((row) => normalizeRow(row));
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
  SCHEMA_TABLES,
  SCHEMA_INDEX_STATEMENTS,
};
