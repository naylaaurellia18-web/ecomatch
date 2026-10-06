-- ============================================
-- RESET DATA Food Rescue AI di Turso
-- Jalankan di: app.turso.tech → database → SQL / Console
--
-- OPSI A — Bersihkan data, AKUN LOGIN TETAP (disarankan):
--   Hapus baris DELETE FROM user; di bawah
--
-- OPSI B — Reset total (akun ikut hilang, auto-seed ulang admin):
--   Biarkan semua baris seperti adanya
-- ============================================

DROP TRIGGER IF EXISTS log_audit_no_update;
DROP TRIGGER IF EXISTS log_audit_no_delete;

DELETE FROM kode_otp;
DELETE FROM reset_sandi;
DELETE FROM notifikasi;
DELETE FROM outbox_pesan;
DELETE FROM log_audit;
DELETE FROM alokasi;
DELETE FROM surplus_makanan;
DELETE FROM kebutuhan_pangan;
-- OPSI A: komentar baris berikut agar akun login dipertahankan
DELETE FROM user;

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

-- Verifikasi: surplus/kebutuhan/alokasi/logs harus 0; pengguna = akun tersisa
SELECT
  (SELECT COUNT(*) FROM user) AS pengguna,
  (SELECT COUNT(*) FROM surplus_makanan) AS surplus,
  (SELECT COUNT(*) FROM kebutuhan_pangan) AS kebutuhan,
  (SELECT COUNT(*) FROM alokasi) AS alokasi,
  (SELECT COUNT(*) FROM outbox_pesan) AS outbox,
  (SELECT COUNT(*) FROM log_audit) AS logs;
