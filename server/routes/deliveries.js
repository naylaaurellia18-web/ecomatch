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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: imageUploadFilter,
});

router.use(authenticate, requireActive);

async function getMatch(id) {
  return db.get(
    `SELECT m.*, l.id_donor, l.nama_makanan, l.jenis_makanan, n.judul AS judul_kebutuhan
     FROM alokasi m
     JOIN surplus_makanan l ON l.id_makanan = m.id_makanan
     JOIN kebutuhan_pangan n ON n.id_kebutuhan = m.id_kebutuhan
     WHERE m.id_alokasi = ?`,
    [id]
  );
}

function assertCourier(req, match) {
  if (req.user.role !== 'admin' && match.id_kurir !== req.user.id) {
    const err = new Error('Hanya kurir yang ditugaskan');
    err.status = 403;
    throw err;
  }
}

router.post('/:id/pickup', upload.single('foto_jemput'), requireRole('kurir', 'admin'), async (req, res, next) => {
  try {
    const match = await getMatch(req.params.id);
    if (!match) return res.status(404).json({ error: 'Pencocokan tidak ditemukan' });
    assertCourier(req, match);
    if (!['diajukan', 'diterima'].includes(match.status)) {
      return res.status(400).json({ error: `Status ${match.status} tidak bisa dijemput` });
    }
    // FR-07: foto kondisi makanan SEBELUM pengantaran
    if (!req.file) return res.status(400).json({ error: 'Foto kondisi makanan wajib diunggah' });
    assertImageBuffer(req.file.buffer);

    const photoUri = await saveImage(req.file);

    await db.run(
      `UPDATE alokasi SET status = 'dijemput', foto_jemput = ?, updated_at = datetime('now') WHERE id_alokasi = ?`,
      [photoUri, match.id_alokasi]
    );
    await db.run(`UPDATE surplus_makanan SET status = 'dijemput' WHERE id_makanan = ?`, [match.id_makanan]);

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
    await db.run(`INSERT INTO kode_otp (id_alokasi, kode, kedaluwarsa_pada) VALUES (?, ?, ?)`, [
      match.id_alokasi,
      code,
      expiresAt,
    ]);

    await notify(
      match.id_penerima,
      'Kurir Menuju Lokasi Anda',
      `Kurir telah menjemput "${match.nama_makanan}". OTP konfirmasi: ${code} (berlaku 30 menit).`,
      match.id_alokasi
    );
    await notify(
      match.id_donor,
      'Surplus Dijemput Kurir',
      `"${match.nama_makanan}" sedang dalam perjalanan.`,
      match.id_alokasi
    );
    await audit(req.user.id, 'PICKUP', 'alokasi', match.id_alokasi, { foto: 'base64' });

    res.json({ message: 'Penjemputan tercatat, OTP dikirim ke penerima', otp_hint: 'OTP tampil di notifikasi penerima (demo)' });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/deliver', upload.single('foto_antar'), requireRole('kurir', 'admin'), async (req, res, next) => {
  try {
    const match = await getMatch(req.params.id);
    if (!match) return res.status(404).json({ error: 'Pencocokan tidak ditemukan' });
    assertCourier(req, match);
    if (match.status !== 'dijemput') {
      return res.status(400).json({ error: 'Pencocokan harus berstatus dijemput' });
    }
    // FR-07: foto kondisi makanan SESUDAH pengantaran
    if (!req.file) return res.status(400).json({ error: 'Foto bukti pengantaran wajib diunggah' });
    assertImageBuffer(req.file.buffer);
    const photoUri = await saveImage(req.file);

    await db.run(
      `UPDATE alokasi SET status = 'terkirim', foto_antar = ?, updated_at = datetime('now') WHERE id_alokasi = ?`,
      [photoUri, match.id_alokasi]
    );
    await db.run(`UPDATE surplus_makanan SET status = 'terkirim' WHERE id_makanan = ?`, [match.id_makanan]);
    await audit(req.user.id, 'DELIVER', 'alokasi', match.id_alokasi, { foto: 'base64' });
    res.json({ message: 'Status diperbarui: sampai di lokasi, menunggu konfirmasi OTP penerima' });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/verify-otp', requireRole('penerima', 'admin'), async (req, res, next) => {
  try {
    const match = await getMatch(req.params.id);
    if (!match) return res.status(404).json({ error: 'Pencocokan tidak ditemukan' });
    if (req.user.role !== 'admin' && match.id_penerima !== req.user.id) {
      return res.status(403).json({ error: 'Hanya penerima yang bisa konfirmasi' });
    }
    if (!['dijemput', 'terkirim'].includes(match.status)) {
      return res.status(400).json({ error: 'Pencocokan belum siap dikonfirmasi' });
    }

    const { otp } = req.body || {};
    if (!otp) return res.status(400).json({ error: 'OTP wajib diisi' });

    const otpKey = `otp:${clientIp(req)}:${match.id_alokasi}:${req.user.id}`;
    if (!hit(otpKey, OTP_LIMIT)) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan OTP. Coba lagi dalam 15 menit.' });
    }

    const row = await db.get(
      `SELECT * FROM kode_otp
       WHERE id_alokasi = ? AND digunakan_pada IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [match.id_alokasi]
    );
    if (!row) return res.status(400).json({ error: 'OTP tidak ditemukan' });
    if (new Date(row.kedaluwarsa_pada).getTime() < Date.now()) {
      return res.status(400).json({ error: 'OTP kedaluwarsa' });
    }
    if (!safeEqual(row.kode, String(otp).trim())) {
      await audit(req.user.id, 'OTP_FAIL', 'alokasi', match.id_alokasi);
      return res.status(400).json({ error: 'OTP salah' });
    }

    await db.run(`UPDATE kode_otp SET digunakan_pada = datetime('now') WHERE id_kode_otp = ?`, [row.id_kode_otp]);
    await db.run(
      `UPDATE alokasi SET status = 'terverifikasi', updated_at = datetime('now') WHERE id_alokasi = ?`,
      [match.id_alokasi]
    );
    await db.run(`UPDATE surplus_makanan SET status = 'terverifikasi' WHERE id_makanan = ?`, [match.id_makanan]);
    await db.run(`UPDATE kebutuhan_pangan SET status = 'dipenuhi', updated_at = datetime('now') WHERE id_kebutuhan = ?`, [
      match.id_kebutuhan,
    ]);

    await notify(
      match.id_kurir,
      'Serah Terima Terverifikasi',
      `Pencocokan #${match.id_alokasi} selesai via OTP.`,
      match.id_alokasi
    );
    await notify(
      match.id_donor,
      'Redistribusi Selesai',
      `"${match.nama_makanan}" telah diterima penerima.`,
      match.id_alokasi
    );
    await audit(req.user.id, 'VERIFY_OTP', 'alokasi', match.id_alokasi, { id_kebutuhan: match.id_kebutuhan });

    res.json({ message: 'Serah terima terverifikasi. Terima kasih!' });
  } catch (e) {
    next(e);
  }
});

router.get('/:id/otp-status', requireRole('penerima', 'admin'), async (req, res, next) => {
  try {
    const match = await getMatch(req.params.id);
    if (!match) return res.status(404).json({ error: 'Pencocokan tidak ditemukan' });
    if (req.user.role !== 'admin' && match.id_penerima !== req.user.id) {
      return res.status(403).json({ error: 'Bukan penerima pencocokan ini' });
    }
    const row = await db.get(
      `SELECT kode, kedaluwarsa_pada, digunakan_pada FROM kode_otp WHERE id_alokasi = ? ORDER BY created_at DESC LIMIT 1`,
      [match.id_alokasi]
    );
    res.json(row || { kode: null });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
