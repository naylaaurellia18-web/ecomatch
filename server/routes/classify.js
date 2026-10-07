const express = require('express');
const db = require('../db');
const { audit } = require('../lib/audit');
const { authenticate, requireRole, requireActive } = require('../middleware');
const { clampStr } = require('../lib/validate');
const { classifyWaste } = require('../lib/routing');
const { simpanKlasifikasi, semuaKlasifikasi } = require('../lib/klasifikasiStore');

const router = express.Router();

const KATEGORI_VALID = ['sisa_nasi', 'sayur', 'lauk', 'kulit_buah', 'campuran', 'lainnya'];
const TINGKAT_VALID = ['segar', 'sedang', 'busuk'];

router.use(authenticate, requireActive);

async function aksesSampah(req, idSampah) {
  if (req.user.role === 'admin') return true;
  const s = await db.get('SELECT id_donor FROM sampah_makanan WHERE id_sampah = ?', [idSampah]);
  if (!s) return false;
  if (s.id_donor === req.user.id) return true;
  const alokasi = await db.get(
    `SELECT id_alokasi FROM alokasi
      WHERE id_sampah = ? AND status != 'dibatalkan' AND (id_kurir = ? OR id_tps = ?)
      LIMIT 1`,
    [idSampah, req.user.id, req.user.id]
  );
  return !!alokasi;
}

// FR-11: klasifikasi — berdasarkan id_sampah (tersimpan) atau teks bebas (tanpa simpan)
router.post('/', async (req, res, next) => {
  try {
    const { id_sampah, teks, nama_sampah, jenis_makanan, waktu_produksi, deskripsi } = req.body || {};

    if (id_sampah != null && id_sampah !== '') {
      if (!(await aksesSampah(req, id_sampah))) {
        return res.status(403).json({ error: 'Bukan akses Anda atas sampah ini' });
      }
      const s = await db.get('SELECT * FROM sampah_makanan WHERE id_sampah = ?', [id_sampah]);
      if (!s) return res.status(404).json({ error: 'Sampah tidak ditemukan' });

      const hasil = await simpanKlasifikasi(s.id_sampah, {
        nama_sampah: s.nama_sampah,
        jenis_makanan: s.jenis_makanan,
        waktu_produksi: s.waktu_produksi,
        teks,
        deskripsi,
      });
      await audit(req.user.id, 'CLASSIFY', 'sampah_makanan', s.id_sampah, {
        kategori: hasil.kategori,
        tingkat_pembusukan: hasil.tingkat_pembusukan,
        skor_keyakinan: hasil.skor_keyakinan,
        metode: hasil.metode,
        mesin: hasil.mesin,
      });
      return res.status(201).json({ id_sampah: s.id_sampah, ...hasil });
    }

    if (!teks && !nama_sampah && !jenis_makanan) {
      return res.status(400).json({ error: 'Isi teks/keterangan sampah atau id_sampah' });
    }
    const hasil = await classifyWaste({ teks, nama_sampah, jenis_makanan, waktu_produksi, deskripsi });
    res.json(hasil);
  } catch (e) {
    next(e);
  }
});

// FR-11: riwayat klasifikasi satu sampah (id = id_sampah)
router.get('/sampah/:id', async (req, res, next) => {
  try {
    if (!(await aksesSampah(req, req.params.id))) {
      return res.status(403).json({ error: 'Bukan akses Anda atas sampah ini' });
    }
    const rows = await semuaKlasifikasi(req.params.id);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// FR-11: detail satu klasifikasi (id = id_klasifikasi)
router.get('/:id', async (req, res, next) => {
  try {
    const row = await db.get(
      `SELECT k.*, s.nama_sampah, s.jenis_makanan, s.berat_kg, s.waktu_produksi, s.id_donor, s.status AS status_sampah
       FROM klasifikasi_sampah k
       JOIN sampah_makanan s ON s.id_sampah = k.id_sampah
       WHERE k.id_klasifikasi = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Klasifikasi tidak ditemukan' });
    if (!(await aksesSampah(req, row.id_sampah))) {
      return res.status(403).json({ error: 'Bukan akses Anda atas sampah ini' });
    }
    res.json(row);
  } catch (e) {
    next(e);
  }
});

// FR-11: verifikasi manual admin (K-12)
router.patch('/:id/verify', requireRole('admin'), async (req, res, next) => {
  try {
    const row = await db.get('SELECT * FROM klasifikasi_sampah WHERE id_klasifikasi = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Klasifikasi tidak ditemukan' });

    const { kategori, tingkat_pembusukan, alasan } = req.body || {};
    if (kategori != null && !KATEGORI_VALID.includes(kategori)) {
      return res.status(400).json({ error: `Kategori harus salah satu dari: ${KATEGORI_VALID.join(', ')}` });
    }
    if (tingkat_pembusukan != null && !TINGKAT_VALID.includes(tingkat_pembusukan)) {
      return res.status(400).json({ error: `Tingkat pembusukan harus salah satu dari: ${TINGKAT_VALID.join(', ')}` });
    }

    const kategoriBaru = kategori ?? row.kategori;
    const tingkatBaru = tingkat_pembusukan ?? row.tingkat_pembusukan;
    const diubah = kategoriBaru !== row.kategori || tingkatBaru !== row.tingkat_pembusukan;
    const alasanBaru = alasan != null ? clampStr(alasan, 500) : row.alasan;

    await db.run(
      `UPDATE klasifikasi_sampah
          SET kategori = ?, tingkat_pembusukan = ?, alasan = ?,
              metode = ?, diverifikasi_oleh = ?
        WHERE id_klasifikasi = ?`,
      [kategoriBaru, tingkatBaru, alasanBaru, diubah ? 'manual_admin' : row.metode, req.user.id, row.id_klasifikasi]
    );
    await audit(req.user.id, 'VERIFY_CLASSIFICATION', 'klasifikasi_sampah', row.id_klasifikasi, {
      id_sampah: row.id_sampah,
      kategori: kategoriBaru,
      tingkat_pembusukan: tingkatBaru,
      diubah,
    });
    const updated = await db.get('SELECT * FROM klasifikasi_sampah WHERE id_klasifikasi = ?', [row.id_klasifikasi]);
    res.json({ message: 'Klasifikasi diverifikasi', klasifikasi: updated });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
