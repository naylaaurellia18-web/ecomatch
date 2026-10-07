-- ============================================
-- RESET DATA EcoMatch di Turso
-- Jalankan di: app.turso.tech → database → SQL / Console
--
-- OPSI A — Bersihkan data, AKUN LOGIN TETAP (disarankan):
--   Hapus baris DELETE FROM "user"; di bawah
--
-- OPSI B — Reset total (akun ikut hilang, auto-seed ulang admin):
--   Biarkan semua baris seperti adanya
-- ============================================

DROP TRIGGER IF EXISTS log_audit_no_update;
DROP TRIGGER IF EXISTS log_audit_no_delete;

DELETE FROM kode_otp;
DELETE FROM pengolahan_log;
DELETE FROM notifikasi;
DELETE FROM reset_sandi;
DELETE FROM outbox_pesan;
DELETE FROM log_audit;
DELETE FROM alokasi;
DELETE FROM klasifikasi_sampah;
DELETE FROM sampah_makanan;
DELETE FROM motivasi_donor_mbg;
-- OPSI A: komentar dua baris berikut agar profil TPS/MBG dipertahankan
DELETE FROM profil_mbg;
DELETE FROM tps_pengolah;
-- OPSI A: komentar baris berikut agar akun login dipertahankan
DELETE FROM "user";

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

-- Verifikasi: sampah/alokasi/logs harus 0; pengguna = akun tersisa
SELECT
  (SELECT COUNT(*) FROM "user") AS pengguna,
  (SELECT COUNT(*) FROM sampah_makanan) AS sampah,
  (SELECT COUNT(*) FROM klasifikasi_sampah) AS klasifikasi,
  (SELECT COUNT(*) FROM alokasi) AS alokasi,
  (SELECT COUNT(*) FROM pengolahan_log) AS pengolahan,
  (SELECT COUNT(*) FROM outbox_pesan) AS outbox,
  (SELECT COUNT(*) FROM log_audit) AS logs;
