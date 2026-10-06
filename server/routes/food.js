const express = require('express');
const multer = require('multer');
const db = require('../db');
const { audit } = require('../lib/audit');
const { saveImage } = require('../lib/storage');
const { authenticate, requireRole, requireActive } = require('../middleware');
const { clampStr, imageUploadFilter, assertImageBuffer } = require('../lib/validate');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: imageUploadFilter,
});

router.use(authenticate, requireRole('donor', 'admin'), requireActive);

router.post('/', upload.single('foto_kondisi'), async (req, res, next) => {
  try {
    const { nama_makanan, deskripsi, jumlah_porsi, expiry_time, lat, lng, jenis_makanan } = req.body || {};
    if (!nama_makanan || !jumlah_porsi || !expiry_time) {
      return res.status(400).json({ error: 'Nama, porsi, dan masa berlaku wajib diisi' });
    }
    const portionCount = Math.floor(Number(jumlah_porsi));
    if (!Number.isFinite(portionCount) || portionCount <= 0 || portionCount > 100000) {
      return res.status(400).json({ error: 'Jumlah porsi harus lebih dari 0' });
    }
    if (Number.isNaN(new Date(expiry_time).getTime()) || new Date(expiry_time).getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Masa berlaku harus di masa depan' });
    }
    const cleanName = clampStr(nama_makanan, 200);
    if (!cleanName) return res.status(400).json({ error: 'Nama wajib diisi' });
    const ftype = jenis_makanan === 'kering' ? 'kering' : jenis_makanan === 'basah' ? 'basah' : 'basah';
    // FR-02: foto kondisi wajib diunggah (SKPL: kolom foto_kondisi NOT NULL)
    if (!req.file) {
      return res.status(400).json({ error: 'Foto kondisi makanan wajib diunggah' });
    }
    assertImageBuffer(req.file.buffer);

    const donor = await db.get('SELECT lat, lng FROM user WHERE id_user = ?', [req.user.id]);
    const result = await db.run(
      `INSERT INTO surplus_makanan (id_donor, nama_makanan, deskripsi, jenis_makanan, jumlah_porsi, expiry_time, foto_kondisi, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        cleanName,
        clampStr(deskripsi, 2000),
        ftype,
        portionCount,
        expiry_time,
        await saveImage(req.file),
        lat != null && lat !== '' && !Number.isNaN(Number(lat)) ? Number(lat) : donor?.lat ?? null,
        lng != null && lng !== '' && !Number.isNaN(Number(lng)) ? Number(lng) : donor?.lng ?? null,
      ]
    );

    await audit(req.user.id, 'CREATE_LISTING', 'surplus_makanan', result.lastInsertRowid, {
      nama_makanan: cleanName,
      jumlah_porsi: portionCount,
      jenis_makanan: ftype,
    });
    res.status(201).json({ id_makanan: result.lastInsertRowid, message: 'Surplus makanan dicatat' });
  } catch (e) {
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const rows =
      req.user.role === 'admin'
        ? await db.all('SELECT * FROM surplus_makanan ORDER BY created_at DESC')
        : await db.all('SELECT * FROM surplus_makanan WHERE id_donor = ? ORDER BY created_at DESC', [req.user.id]);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const listing = await db.get('SELECT * FROM surplus_makanan WHERE id_makanan = ?', [req.params.id]);
    if (!listing) return res.status(404).json({ error: 'Data surplus tidak ditemukan' });
    if (req.user.role !== 'admin' && listing.id_donor !== req.user.id) {
      return res.status(403).json({ error: 'Bukan milik Anda' });
    }
    if (!['tersedia', 'dialokasikan'].includes(listing.status)) {
      return res.status(400).json({ error: `Tidak bisa membatalkan status ${listing.status}` });
    }
    await db.run(`UPDATE surplus_makanan SET status = 'dibatalkan' WHERE id_makanan = ?`, [listing.id_makanan]);
    const m = await db.get(
      `SELECT * FROM alokasi WHERE id_makanan = ? AND status NOT IN ('dibatalkan','terverifikasi','terkirim')`,
      [listing.id_makanan]
    );
    if (m) {
      await db.run(`UPDATE alokasi SET status = 'dibatalkan', updated_at = datetime('now') WHERE id_alokasi = ?`, [
        m.id_alokasi,
      ]);
    }
    await audit(req.user.id, 'CANCEL_LISTING', 'surplus_makanan', listing.id_makanan);
    res.json({ message: 'Surplus dibatalkan' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
