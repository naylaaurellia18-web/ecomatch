-- ==========================================================================
-- EcoMatch — SKEMA DATABASE FINAL (PostgreSQL + PostGIS)
-- Sumber: SKPL_EcoMatch_v2.0 (PDM 6.1–6.5) + Dokumen_Arsitektur_Sistem
--         EcoMatch_v2.0 §4 (pemetaan FR-01..17 -> tabel) + ERD_EcoMatch.png
-- Dipakai untuk deploy baru. Migrasi dari skema FoodRescueAI lama ada di
-- bagian §MIGRAASI di bawah (dijalankan backend/db.js saat init).
-- Dialek pengembangan lokal (SQLite/libSQL) memakai padanan di
-- backend/db.js -> SCHEMA_ECOMATCH_STATEMENTS.
-- ==========================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. user — akun semua aktor (SKPL Tabel 6.1; role sesuai spek EcoMatch)
CREATE TABLE IF NOT EXISTS "user" (
  id_user        BIGSERIAL PRIMARY KEY,
  nama           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password       TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'donor_mbg'
                 CHECK (role IN ('donor_mbg','tps_pengolah','kurir','admin')),
  status         TEXT NOT NULL DEFAULT 'menunggu'
                 CHECK (status IN ('menunggu','aktif','ditolak')),
  telepon        TEXT,
  alamat         TEXT,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  nama_lembaga   TEXT,
  kapasitas      BIGINT,
  created_at     TEXT NOT NULL
                 DEFAULT to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- 2. profil_mbg — profil tambahan Donor MBG / SPPG (FR-01)
CREATE TABLE IF NOT EXISTS profil_mbg (
  id_user               BIGINT PRIMARY KEY REFERENCES "user"(id_user),
  nama_sppg             TEXT NOT NULL,
  alamat                TEXT,
  lat                   DOUBLE PRECISION,
  lng                   DOUBLE PRECISION,
  kapasitas_porsi_harian BIGINT,
  penanggung_jawab      TEXT,
  kontak                TEXT,
  npwp                  TEXT,
  created_at            TEXT NOT NULL
                        DEFAULT to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- 3. tps_pengolah — profil TPS (FR-05, FR-14); id_user = PK karena 1 akun 1 TPS
CREATE TABLE IF NOT EXISTS tps_pengolah (
  id_user           BIGINT PRIMARY KEY REFERENCES "user"(id_user),
  nama_tps          TEXT NOT NULL,
  jenis_tps         TEXT NOT NULL DEFAULT 'tps_3r'
                    CHECK (jenis_tps IN ('tps_3r','tps_komposter','tps_maggot','tps_eco_enzyme','bank_sampah','lainnya')),
  jenis_pengolahan  TEXT NOT NULL DEFAULT 'komposter'
                    CHECK (jenis_pengolahan IN ('komposter','maggot_bsf','eco_enzyme','bank_sampah','lainnya')),
  kapasitas_kg_hari DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (kapasitas_kg_hari >= 0),
  jenis_diterima    TEXT NOT NULL DEFAULT '["lainnya"]',   -- JSON array kategori sampah
  radius_layanan_km DOUBLE PRECISION NOT NULL DEFAULT 15,
  izin_operasional  TEXT,
  aktif             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TEXT NOT NULL
                    DEFAULT to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- 4. sampah_makanan — unggahan sampah dari dapur MBG (FR-03; menggantikan surplus_makanan)
CREATE TABLE IF NOT EXISTS sampah_makanan (
  id_sampah        BIGSERIAL PRIMARY KEY,
  id_donor         BIGINT NOT NULL REFERENCES "user"(id_user),
  nama_sampah      TEXT,
  jenis_makanan    TEXT NOT NULL DEFAULT 'campuran'
                   CHECK (jenis_makanan IN ('nasi','sayur','lauk','buah','campuran','lainnya')),
  berat_kg         DOUBLE PRECISION NOT NULL CHECK (berat_kg > 0),
  waktu_produksi   TEXT NOT NULL,
  foto_url         TEXT,
  status           TEXT NOT NULL DEFAULT 'tersedia'
                   CHECK (status IN ('tersedia','dialokasikan','dijemput','terkirim','terverifikasi','dibatalkan')),
  created_at       TEXT NOT NULL
                   DEFAULT to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- 5. klasifikasi_sampah — hasil klasifikasi rule-based / verifikasi admin (FR-06, FR-07)
CREATE TABLE IF NOT EXISTS klasifikasi_sampah (
  id_klasifikasi      BIGSERIAL PRIMARY KEY,
  id_sampah           BIGINT NOT NULL REFERENCES sampah_makanan(id_sampah),
  kategori            TEXT NOT NULL
                      CHECK (kategori IN ('sisa_nasi','sayur','lauk','kulit_buah','campuran','lainnya')),
  tingkat_pembusukan  TEXT NOT NULL DEFAULT 'segar'
                      CHECK (tingkat_pembusukan IN ('segar','sedang','busuk')),
  skor_keyakinan      DOUBLE PRECISION NOT NULL DEFAULT 0,
  metode              TEXT NOT NULL DEFAULT 'rule_based'
                      CHECK (metode IN ('rule_based','ai_vision','manual_admin','hybrid')),
  alasan              TEXT,
  diverifikasi_oleh   BIGINT REFERENCES "user"(id_user),
  created_at          TEXT NOT NULL
                      DEFAULT to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- 6. alokasi — pasangan sampah -> TPS -> kurir + sub-skor routing (FR-08, FR-15)
CREATE TABLE IF NOT EXISTS alokasi (
  id_alokasi       BIGSERIAL PRIMARY KEY,
  id_sampah        BIGINT NOT NULL REFERENCES sampah_makanan(id_sampah),
  id_tps           BIGINT NOT NULL REFERENCES tps_pengolah(id_user),
  id_kurir         BIGINT NOT NULL REFERENCES "user"(id_user),
  skor_matching    DOUBLE PRECISION NOT NULL,
  skor_jenis_cocok DOUBLE PRECISION NOT NULL,
  skor_kapasitas   DOUBLE PRECISION NOT NULL,
  skor_jarak       DOUBLE PRECISION NOT NULL,
  skor_urgensi     DOUBLE PRECISION NOT NULL,
  jarak_km         DOUBLE PRECISION NOT NULL,
  rute_json        TEXT,
  status           TEXT NOT NULL DEFAULT 'dialokasikan'
                   CHECK (status IN ('dialokasikan','dijemput','terkirim','terverifikasi','dibatalkan')),
  foto_jemput      TEXT,
  foto_antar       TEXT,
  waktu_alokasi    TEXT NOT NULL
                   DEFAULT to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at       TEXT NOT NULL
                   DEFAULT to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alokasi_aktif
  ON alokasi(id_sampah) WHERE status != 'dibatalkan';

-- 7. kode_otp — verifikasi serah terima kurir<->TPS (FR-10)
CREATE TABLE IF NOT EXISTS kode_otp (
  id_kode_otp     BIGSERIAL PRIMARY KEY,
  id_alokasi      BIGINT NOT NULL REFERENCES alokasi(id_alokasi),
  kode            TEXT NOT NULL,
  kedaluwarsa_pada TEXT NOT NULL,
  digunakan_pada  TEXT,
  created_at      TEXT NOT NULL
                  DEFAULT to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- 8. pengolahan_log — bukti TPS mengolah sampah (FR-11, traceability)
CREATE TABLE IF NOT EXISTS pengolahan_log (
  id_pengolahan BIGSERIAL PRIMARY KEY,
  id_alokasi    BIGINT NOT NULL REFERENCES alokasi(id_alokasi),
  input_kg      DOUBLE PRECISION NOT NULL CHECK (input_kg >= 0),
  output_kg     DOUBLE PRECISION CHECK (output_kg >= 0),
  output_jenis  TEXT CHECK (output_jenis IN ('kompos','pupuk_cair','pakan_ternak','eco_enzyme','lainnya')),
  foto_bukti    TEXT,
  tanggal       TEXT NOT NULL
                DEFAULT to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- 9. motivasi_donor_mbg — insentif/laporan untuk Donor MBG (FR-16)
CREATE TABLE IF NOT EXISTS motivasi_donor_mbg (
  id_motivasi    BIGSERIAL PRIMARY KEY,
  id_user        BIGINT NOT NULL REFERENCES "user"(id_user),
  jenis_insentif TEXT NOT NULL
                 CHECK (jenis_insentif IN ('sertifikat','poin','laporan_kepatuhan','laporan_csr','badge')),
  nilai          DOUBLE PRECISION,
  sertifikat_url TEXT,
  periode        TEXT,
  created_at     TEXT NOT NULL
                 DEFAULT to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- 10. konfigurasi_regulasi — aturan daerah & parameter kepatuhan (FR-14, NFR-11)
CREATE TABLE IF NOT EXISTS konfigurasi_regulasi (
  id_konfigurasi BIGSERIAL PRIMARY KEY,
  kode_daerah    TEXT NOT NULL DEFAULT 'KOTA_MADIUN',
  nama_regulasi  TEXT NOT NULL,
  jenis_regulasi TEXT NOT NULL DEFAULT 'lainnya'
                 CHECK (jenis_regulasi IN ('perda','pergub','surat_edaran','lainnya')),
  aturan         TEXT NOT NULL DEFAULT '{}',  -- JSON: larangan, kewajiban, sanksi, insentif
  aktif          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TEXT NOT NULL
                 DEFAULT to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- 11. notifikasi — pemberitahuan ke pengguna (FR-09)
CREATE TABLE IF NOT EXISTS notifikasi (
  id_notifikasi BIGSERIAL PRIMARY KEY,
  id_user       BIGINT NOT NULL REFERENCES "user"(id_user),
  id_alokasi    BIGINT REFERENCES alokasi(id_alokasi),
  judul         TEXT NOT NULL,
  pesan         TEXT NOT NULL,
  dibaca_pada   TEXT,
  created_at    TEXT NOT NULL
                DEFAULT to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- 12. log_audit — jejak audit immutable (NFR-08)
CREATE TABLE IF NOT EXISTS log_audit (
  id_log     BIGSERIAL PRIMARY KEY,
  id_user    BIGINT,
  aksi       TEXT NOT NULL,
  entitas    TEXT NOT NULL,
  id_entitas TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL
             DEFAULT to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- 13. outbox_pesan — antrean WhatsApp/email (FR-12)
CREATE TABLE IF NOT EXISTS outbox_pesan (
  id_pesan           BIGSERIAL PRIMARY KEY,
  kanal              TEXT NOT NULL CHECK (kanal IN ('whatsapp','email')),
  id_user            BIGINT,
  tujuan             TEXT,
  subjek             TEXT,
  isi                TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'antre'
                     CHECK (status IN ('antre','terkirim','simulasi','gagal')),
  error              TEXT,
  referensi_penerus  TEXT,
  created_at         TEXT NOT NULL
                     DEFAULT to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- 14. reset_sandi — pemulihan akun
CREATE TABLE IF NOT EXISTS reset_sandi (
  id_reset        BIGSERIAL PRIMARY KEY,
  id_user         BIGINT NOT NULL REFERENCES "user"(id_user),
  kode            TEXT NOT NULL,
  kedaluwarsa_pada TEXT NOT NULL,
  digunakan_pada  TEXT,
  created_at      TEXT NOT NULL
                  DEFAULT to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- Indeks yang dipakai routing & daftar (Fase 3/4)
CREATE INDEX IF NOT EXISTS idx_sampah_status    ON sampah_makanan(status);
CREATE INDEX IF NOT EXISTS idx_sampah_donor     ON sampah_makanan(id_donor);
CREATE INDEX IF NOT EXISTS idx_klasifikasi_sampah ON klasifikasi_sampah(id_sampah);
CREATE INDEX IF NOT EXISTS idx_tps_aktif        ON tps_pengolah(aktif);
CREATE INDEX IF NOT EXISTS idx_alokasi_tps      ON alokasi(id_tps, status);
CREATE INDEX IF NOT EXISTS idx_alokasi_kurir    ON alokasi(id_kurir, status);
CREATE INDEX IF NOT EXISTS idx_notifikasi_user  ON notifikasi(id_user, dibaca_pada);

-- Trigger immutable log_audit (NFR-08)
CREATE OR REPLACE FUNCTION log_audit_immutable() RETURNS trigger AS $fn$
BEGIN RAISE EXCEPTION 'log_audit is immutable'; END;
$fn$ LANGUAGE plpgsql;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'log_audit_no_update'
                 AND tgrelid = 'log_audit'::regclass) THEN
    EXECUTE 'CREATE TRIGGER log_audit_no_update BEFORE UPDATE ON log_audit FOR EACH ROW EXECUTE FUNCTION log_audit_immutable()';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'log_audit_no_delete'
                 AND tgrelid = 'log_audit'::regclass) THEN
    EXECUTE 'CREATE TRIGGER log_audit_no_delete BEFORE DELETE ON log_audit FOR EACH ROW EXECUTE FUNCTION log_audit_immutable()';
  END IF;
END
$do$;

-- Lapisan spasial PostGIS — VIEW selalu sinkron dengan tabel sumber
CREATE OR REPLACE VIEW v_lokasi_geospasial AS
SELECT 'user'::text AS sumber, u.id_user::bigint AS id, u.nama, u.lat, u.lng,
       CASE WHEN u.lat IS NOT NULL AND u.lng IS NOT NULL
            THEN ST_SetSRID(ST_MakePoint(u.lng, u.lat), 4326)::geography END AS posisi
FROM "user" u
WHERE u.lat IS NOT NULL AND u.lng IS NOT NULL
UNION ALL
SELECT 'tps_pengolah', t.id_user, t.nama_tps, u.lat, u.lng,
       CASE WHEN u.lat IS NOT NULL AND u.lng IS NOT NULL
            THEN ST_SetSRID(ST_MakePoint(u.lng, u.lat), 4326)::geography END
FROM tps_pengolah t JOIN "user" u ON u.id_user = t.id_user
WHERE u.lat IS NOT NULL AND u.lng IS NOT NULL AND t.aktif;

-- Parameter default routing/kepatuhan (dipakai ai + /api/compliance)
INSERT INTO konfigurasi_regulasi (kode_daerah, nama_regulasi, jenis_regulasi, aturan, aktif)
VALUES ('KOTA_MADIUN', 'Kebijakan Pengelolaan Sampah Makanan MBG Kota Madiun', 'lainnya',
        '{"bobot_routing":{"jenis_cocok":0.35,"kapasitas":0.25,"jarak":0.25,"urgensi":0.15},' ||
        '"radius_layanan_km":15,"batas_skor":0.3,"target_alokasi_persen":85,' ||
        '"sla_routing_detik":3,"larangan":["buang sampah makanan ke TPS biasa"]}', TRUE)
ON CONFLICT DO NOTHING;

-- ==========================================================================
-- §MIGRAASI — FoodRescueAI lama -> EcoMatch (dijalankan backend/db.js init)
-- ==========================================================================
-- (a) Role user:
--     UPDATE "user" SET role = CASE role
--       WHEN 'donor'   THEN 'donor_mbg'
--       WHEN 'penerima' THEN 'tps_pengolah'
--       ELSE role END
--     WHERE role IN ('donor','penerima');
--
-- (b) surplus_makanan -> sampah_makanan (1 porsi ≈ 0,4 kg untuk data lama):
--     INSERT INTO sampah_makanan (id_donor, nama_sampah, jenis_makanan, berat_kg,
--                                 waktu_produksi, foto_url, status, created_at)
--     SELECT id_donor, nama_makanan,
--            CASE jenis_makanan WHEN 'basah' THEN 'campuran' ELSE 'lainnya' END,
--            jumlah_porsi * 0.4, expiry_time, foto_kondisi, status, created_at
--     FROM surplus_makanan;
--
-- (c) kebutuhan_pangan dilebur: akun penerima menjadi profil TPS Pengolah
--     (nama_lembaga -> nama_tps, kapasitas -> kapasitas_kg_hari):
--     INSERT INTO tps_pengolah (id_user, nama_tps, kapasitas_kg_hari, aktif)
--     SELECT id_user, COALESCE(nama_lembaga, nama), COALESCE(kapasitas, 0), TRUE
--     FROM "user" WHERE role = 'tps_pengolah';
--
-- (d) alokasi lama (id_makanan/id_kebutuhan/id_penerima) di-rebuild ke
--     alokasi baru (id_sampah/id_tps/id_kurir) — lihat backend/db.js.
--
-- (e) Setelah migrasi: DROP TABLE surplus_makanan, kebutuhan_pangan.
-- ==========================================================================
