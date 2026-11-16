const express = require('express');
const multer = require('multer');
const db = require('../db');
const { generateOtp } = require('../lib/auth');
const { audit, notify } = require('../lib/audit');
const { saveImage } = require('../lib/storage');
const { authenticate, requireRole, requireActive } = require('../middleware');
const { safeEqual, imageUploadFilter, assertImageBuffer } = require('../lib/validate');
const { hit, clientIp } = require('../lib/ratelimit');

const router = express.Router();

const OTP_LIMIT = { limit: 5, windowMs: 15 * 60000 };
const RESEND_LIMIT = { limit: 3, windowMs: 15 * 60000 };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: imageUploadFilter,
});

router.use(authenticate, requireActive);

async function getAlokasi(id) {
  return db.get(
    `SELECT a.*, s.nama_sampah, s.jenis_makanan, s.berat_kg, s.status AS status_sampah, s.id_donor,
            t.nama_penerima, tp.telepon AS telepon_penerima, tp.alamat AS alamat_penerima, tp.lat AS lat_penerima, tp.lng AS lng_penerima,
            dn.nama AS nama_donor, dn.telepon AS telepon_donor, dn.alamat AS alamat_donor,
            dn.lat AS lat_donor, dn.lng AS lng_donor
       FROM alokasi a
       JOIN sampah_makanan s ON s.id_sampah = a.id_sampah
       JOIN penerima t ON t.id_user = a.id_penerima
       JOIN user tp ON tp.id_user = a.id_penerima
       JOIN user dn ON dn.id_user = s.id_donor
      WHERE a.id_alokasi = ?`,
    [id]
  );
}

function assertCourier(req, alo) {
  if (req.user.role !== 'admin' && alo.id_kurir !== req.user.id) {
    const err = new Error('Hanya kurir yang ditugaskan');
    err.status = 403;
    throw err;
  }
}

function assertPenerima(req, alo) {
  if (req.user.role !== 'admin' && alo.id_penerima !== req.user.id) {
    const err = new Error('Hanya penerima yang boleh');
    err.status = 403;
    throw err;
  }
}

// FR-07: kurir menjemput sampah (foto wajib) + OTP ke penerima
router.post('/:id/pickup', upload.single('foto_jemput'), requireRole('kurir', 'admin'), async (req, res, next) => {
  try {
    const alo = await getAlokasi(req.params.id);
    if (!alo) return res.status(404).json({ error: 'Alokasi tidak ditemukan' });
    assertCourier(req, alo);
    if (alo.status !== 'dialokasikan') {
      return res.status(400).json({ error: `Status ${alo.status} tidak bisa dijemput` });
    }
    if (!req.file) return res.status(400).json({ error: 'Foto kondisi sisa makanan saat dijemput wajib diunggah' });
    assertImageBuffer(req.file.buffer);

    const photoUri = await saveImage(req.file);
    await db.run(
      `UPDATE alokasi SET status = 'dijemput', foto_jemput = ?, updated_at = datetime('now') WHERE id_alokasi = ?`,
      [photoUri, alo.id_alokasi]
    );
    await db.run(`UPDATE sampah_makanan SET status = 'dijemput' WHERE id_sampah = ?`, [alo.id_sampah]);

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
    await db.run(`INSERT INTO kode_otp (id_alokasi, kode, kedaluwarsa_pada) VALUES (?, ?, ?)`, [
      alo.id_alokasi,
      code,
      expiresAt,
    ]);

    await notify(
      alo.id_penerima,
      'Kurir Menuju ke Penerima',
      `Kurir menjemput "${alo.nama_sampah}" (${alo.berat_kg} kg) untuk ${alo.nama_penerima}. OTP konfirmasi: ${code} (berlaku 30 menit).`,
      alo.id_alokasi
    );
    await notify(
      alo.id_donor,
      'Sisa Makanan Dijemput Kurir',
      `"${alo.nama_sampah}" sedang dalam perjalanan ke ${alo.nama_penerima}.`,
      alo.id_alokasi
    );
    await audit(req.user.id, 'PICKUP', 'alokasi', alo.id_alokasi, { id_sampah: alo.id_sampah, id_penerima: alo.id_penerima });

    res.json({ message: 'Penjemputan tercatat, OTP dikirim ke penerima', otp_hint: 'OTP tampil di notifikasi penerima (demo)' });
  } catch (e) {
    next(e);
  }
});

// FR-07: kurir mengantar sampai ke penerima (foto wajib)
router.post('/:id/deliver', upload.single('foto_antar'), requireRole('kurir', 'admin'), async (req, res, next) => {
  try {
    const alo = await getAlokasi(req.params.id);
    if (!alo) return res.status(404).json({ error: 'Alokasi tidak ditemukan' });
    assertCourier(req, alo);
    if (alo.status !== 'dijemput') {
      return res.status(400).json({ error: 'Alokasi harus berstatus dijemput' });
    }
    if (!req.file) return res.status(400).json({ error: 'Foto bukti pengantaran wajib diunggah' });
    assertImageBuffer(req.file.buffer);
    const photoUri = await saveImage(req.file);

    await db.run(
      `UPDATE alokasi SET status = 'terkirim', foto_antar = ?, updated_at = datetime('now') WHERE id_alokasi = ?`,
      [photoUri, alo.id_alokasi]
    );
    await db.run(`UPDATE sampah_makanan SET status = 'terkirim' WHERE id_sampah = ?`, [alo.id_sampah]);
    await notify(
      alo.id_penerima,
      'Sisa Makanan Sampai di Penerima',
      `"${alo.nama_sampah}" (${alo.berat_kg} kg) telah tiba. Konfirmasi serah terima dengan OTP.`,
      alo.id_alokasi
    );
    await audit(req.user.id, 'DELIVER', 'alokasi', alo.id_alokasi, { id_sampah: alo.id_sampah });
    res.json({ message: 'Status diperbarui: sampai di penerima, menunggu konfirmasi OTP' });
  } catch (e) {
    next(e);
  }
});

// FR-08: penerima mengonfirmasi serah terima via OTP
router.post('/:id/verify-otp', requireRole('penerima', 'admin'), async (req, res, next) => {
  try {
    const alo = await getAlokasi(req.params.id);
    if (!alo) return res.status(404).json({ error: 'Alokasi tidak ditemukan' });
    assertPenerima(req, alo);
    if (!['dijemput', 'terkirim'].includes(alo.status)) {
      return res.status(400).json({ error: 'Alokasi belum siap dikonfirmasi' });
    }

    const { otp } = req.body || {};
    if (!otp) return res.status(400).json({ error: 'OTP wajib diisi' });

    const otpKey = `otp:${clientIp(req)}:${alo.id_alokasi}:${req.user.id}`;
    if (!hit(otpKey, OTP_LIMIT)) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan OTP. Coba lagi dalam 15 menit.' });
    }

    const row = await db.get(
      `SELECT * FROM kode_otp
        WHERE id_alokasi = ? AND digunakan_pada IS NULL
        ORDER BY created_at DESC, id_kode_otp DESC LIMIT 1`,
      [alo.id_alokasi]
    );
    if (!row) return res.status(400).json({ error: 'OTP tidak ditemukan' });
    if (new Date(row.kedaluwarsa_pada).getTime() < Date.now()) {
      return res.status(400).json({ error: 'OTP kedaluwarsa' });
    }
    if (!safeEqual(row.kode, String(otp).trim())) {
      await audit(req.user.id, 'OTP_FAIL', 'alokasi', alo.id_alokasi);
      return res.status(400).json({ error: 'OTP salah' });
    }

    await db.run(`UPDATE kode_otp SET digunakan_pada = datetime('now') WHERE id_kode_otp = ?`, [row.id_kode_otp]);
    await db.run(`UPDATE alokasi SET status = 'terverifikasi', updated_at = datetime('now') WHERE id_alokasi = ?`, [
      alo.id_alokasi,
    ]);
    await db.run(`UPDATE sampah_makanan SET status = 'terverifikasi' WHERE id_sampah = ?`, [alo.id_sampah]);

    await notify(
      alo.id_kurir,
      'Serah Terima Terverifikasi',
      `Alokasi #${alo.id_alokasi} selesai via OTP.`,
      alo.id_alokasi
    );
    await notify(
      alo.id_donor,
      'Pengalihan Sisa Makanan Selesai',
      `"${alo.nama_sampah}" telah diterima ${alo.nama_penerima}.`,
      alo.id_alokasi
    );
    await audit(req.user.id, 'VERIFY_OTP', 'alokasi', alo.id_alokasi, { id_sampah: alo.id_sampah });

    res.json({ message: 'Serah terima terverifikasi. Terima kasih!' });
  } catch (e) {
    next(e);
  }
});

// FR-08: kirim ulang OTP (rate-limited)
router.post('/:id/resend-otp', requireRole('penerima', 'admin'), async (req, res, next) => {
  try {
    const alo = await getAlokasi(req.params.id);
    if (!alo) return res.status(404).json({ error: 'Alokasi tidak ditemukan' });
    assertPenerima(req, alo);
    if (!['dijemput', 'terkirim'].includes(alo.status)) {
      return res.status(400).json({ error: 'Alokasi belum siap dikonfirmasi' });
    }

    const key = `otp-resend:${clientIp(req)}:${alo.id_alokasi}`;
    if (!hit(key, RESEND_LIMIT)) {
      return res.status(429).json({ error: 'Terlalu banyak permintaan OTP ulang. Coba lagi dalam 15 menit.' });
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
    await db.run(`INSERT INTO kode_otp (id_alokasi, kode, kedaluwarsa_pada) VALUES (?, ?, ?)`, [
      alo.id_alokasi,
      code,
      expiresAt,
    ]);
    await notify(
      alo.id_penerima,
      'OTP Baru Dikirim',
      `OTP konfirmasi alokasi #${alo.id_alokasi}: ${code} (berlaku 30 menit).`,
      alo.id_alokasi
    );
    await audit(req.user.id, 'OTP_RESEND', 'alokasi', alo.id_alokasi);
    res.json({ message: 'OTP baru dikirim ke notifikasi penerima' });
  } catch (e) {
    next(e);
  }
});

router.get('/:id/otp-status', requireRole('penerima', 'admin'), async (req, res, next) => {
  try {
    const alo = await getAlokasi(req.params.id);
    if (!alo) return res.status(404).json({ error: 'Alokasi tidak ditemukan' });
    assertPenerima(req, alo);
    const row = await db.get(
      `SELECT kode, kedaluwarsa_pada, digunakan_pada FROM kode_otp
        WHERE id_alokasi = ? ORDER BY created_at DESC, id_kode_otp DESC LIMIT 1`,
      [alo.id_alokasi]
    );
    res.json(row || { kode: null });
  } catch (e) {
    next(e);
  }
});

// Daftar pengantaran sesuai peran
router.get('/', requireRole('admin', 'kurir', 'donor_mbg', 'penerima'), async (req, res, next) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      rows = await db.all(
        `SELECT a.id_alokasi, a.status, a.waktu_alokasi, a.updated_at, a.foto_jemput, a.foto_antar,
                s.id_sampah, s.nama_sampah, s.berat_kg, s.jenis_makanan,
                t.nama_penerima, dn.nama AS nama_donor, c.nama AS nama_kurir, a.id_kurir, a.id_penerima, s.id_donor
           FROM alokasi a
           JOIN sampah_makanan s ON s.id_sampah = a.id_sampah
           JOIN penerima t ON t.id_user = a.id_penerima
           JOIN user dn ON dn.id_user = s.id_donor
           JOIN user c ON c.id_user = a.id_kurir
          ORDER BY a.updated_at DESC LIMIT 200`
      );
    } else if (req.user.role === 'kurir') {
      rows = await db.all(
        `SELECT a.id_alokasi, a.status, a.waktu_alokasi, a.updated_at, a.foto_jemput, a.foto_antar,
                s.id_sampah, s.nama_sampah, s.berat_kg, s.jenis_makanan,
                t.nama_penerima, dn.nama AS nama_donor, c.nama AS nama_kurir, a.id_kurir, a.id_penerima, s.id_donor,
                dn.lat AS lat_donor, dn.lng AS lng_donor, tp.lat AS lat_penerima, tp.lng AS lng_penerima
           FROM alokasi a
           JOIN sampah_makanan s ON s.id_sampah = a.id_sampah
           JOIN penerima t ON t.id_user = a.id_penerima
           JOIN user tp ON tp.id_user = a.id_penerima
           JOIN user dn ON dn.id_user = s.id_donor
           JOIN user c ON c.id_user = a.id_kurir
          WHERE a.id_kurir = ?
          ORDER BY a.updated_at DESC LIMIT 200`,
        [req.user.id]
      );
    } else if (req.user.role === 'donor_mbg') {
      rows = await db.all(
        `SELECT a.id_alokasi, a.status, a.waktu_alokasi, a.updated_at, a.foto_jemput, a.foto_antar,
                s.id_sampah, s.nama_sampah, s.berat_kg, s.jenis_makanan,
                t.nama_penerima, dn.nama AS nama_donor, c.nama AS nama_kurir, a.id_kurir, a.id_penerima, s.id_donor
           FROM alokasi a
           JOIN sampah_makanan s ON s.id_sampah = a.id_sampah
           JOIN penerima t ON t.id_user = a.id_penerima
           JOIN user dn ON dn.id_user = s.id_donor
           JOIN user c ON c.id_user = a.id_kurir
          WHERE s.id_donor = ?
          ORDER BY a.updated_at DESC LIMIT 200`,
        [req.user.id]
      );
    } else {
      rows = await db.all(
        `SELECT a.id_alokasi, a.status, a.waktu_alokasi, a.updated_at, a.foto_jemput, a.foto_antar,
                s.id_sampah, s.nama_sampah, s.berat_kg, s.jenis_makanan,
                t.nama_penerima, dn.nama AS nama_donor, c.nama AS nama_kurir, a.id_kurir, a.id_penerima, s.id_donor
           FROM alokasi a
           JOIN sampah_makanan s ON s.id_sampah = a.id_sampah
           JOIN penerima t ON t.id_user = a.id_penerima
           JOIN user dn ON dn.id_user = s.id_donor
           JOIN user c ON c.id_user = a.id_kurir
          WHERE a.id_penerima = ?
          ORDER BY a.updated_at DESC LIMIT 200`,
        [req.user.id]
      );
    }
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
