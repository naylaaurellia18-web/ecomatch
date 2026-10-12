const express = require('express');
const multer = require('multer');
const db = require('../db');
const { audit } = require('../lib/audit');
const { saveImage } = require('../lib/storage');
const { authenticate, requireRole, requireActive } = require('../middleware');
const { clampStr, imageUploadFilter, assertImageBuffer } = require('../lib/validate');
const { simpanKlasifikasi } = require('../lib/klasifikasiStore');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: imageUploadFilter,
});

const JENIS_VALID = ['nasi', 'sayur', 'lauk', 'buah', 'campuran', 'lainnya'];
const STATUS_BATAL = 'dibatalkan';

const SELECT_LIST = `
  SELECT s.*, u.nama AS nama_donor, u.lat AS donor_lat, u.lng AS donor_lng,
    (SELECT k.kategori FROM klasifikasi_sampah k WHERE k.id_sampah = s.id_sampah ORDER BY k.id_klasifikasi DESC LIMIT 1) AS kategori,
    (SELECT k.tingkat_pembusukan FROM klasifikasi_sampah k WHERE k.id_sampah = s.id_sampah ORDER BY k.id_klasifikasi DESC LIMIT 1) AS tingkat_pembusukan,
    (SELECT k.skor_keyakinan FROM klasifikasi_sampah k WHERE k.id_sampah = s.id_sampah ORDER BY k.id_klasifikasi DESC LIMIT 1) AS skor_keyakinan
  FROM sampah_makanan s
  JOIN user u ON u.id_user = s.id_donor`;

router.use(authenticate, requireActive);

function parseKoordinat(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function aksesSampah(req, sampah) {
  if (req.user.role === 'admin') return true;
  if (sampah.id_donor === req.user.id) return true;
  const alokasi = await db.get(
    `SELECT id_alokasi FROM alokasi
      WHERE id_sampah = ? AND status != 'dibatalkan'
        AND (id_kurir = ? OR id_tps = ?)
      LIMIT 1`,
    [sampah.id_sampah, req.user.id, req.user.id]
  );
  return !!alokasi;
}

async function batalkanSampah(sampah) {
  await db.run(`UPDATE sampah_makanan SET status = ? WHERE id_sampah = ?`, [STATUS_BATAL, sampah.id_sampah]);
  await db.run(
    `UPDATE alokasi SET status = ?, updated_at = datetime('now')
      WHERE id_sampah = ? AND status IN ('dialokasikan','dijemput')`,
    [STATUS_BATAL, sampah.id_sampah]
  );
}

// FR-02: unggah sampah makanan (foto wajib) + klasifikasi otomatis
router.post('/', requireRole('donor_mbg', 'admin'), upload.single('foto'), async (req, res, next) => {
  try {
    const { nama_sampah, jenis_makanan, berat_kg, waktu_produksi, lat, lng } = req.body || {};
    const cleanName = clampStr(nama_sampah, 200);
    if (!cleanName) return res.status(400).json({ error: 'Nama sampah wajib diisi' });

    const berat = Number(berat_kg);
    if (!Number.isFinite(berat) || berat <= 0 || berat > 10000) {
      return res.status(400).json({ error: 'Berat (kg) harus di antara 0 dan 10000' });
    }
    if (!waktu_produksi || Number.isNaN(new Date(waktu_produksi).getTime())) {
      return res.status(400).json({ error: 'Waktu produksi wajib diisi dengan format tanggal valid' });
    }
    const waktuMs = new Date(waktu_produksi).getTime();
    if (waktuMs > Date.now() + 5 * 60000) {
      return res.status(400).json({ error: 'Waktu produksi tidak boleh di masa depan' });
    }
    if (jenis_makanan != null && jenis_makanan !== '' && !JENIS_VALID.includes(jenis_makanan)) {
      return res.status(400).json({ error: `Jenis makanan harus salah satu dari: ${JENIS_VALID.join(', ')}` });
    }
    const jenis = JENIS_VALID.includes(jenis_makanan) ? jenis_makanan : 'campuran';

    // FR-02 (K-11): foto kondisi sampah wajib — cek magic bytes PNG/JPEG/GIF/WebP
    if (!req.file) return res.status(400).json({ error: 'Foto kondisi sampah wajib diunggah' });
    assertImageBuffer(req.file.buffer);

    const donor = await db.get('SELECT lat, lng FROM user WHERE id_user = ?', [req.user.id]);
    const latBaru = parseKoordinat(lat) ?? donor?.lat ?? null;
    const lngBaru = parseKoordinat(lng) ?? donor?.lng ?? null;
    if (latBaru != null && lngBaru != null && (latBaru !== donor?.lat || lngBaru !== donor?.lng)) {
      await db.run('UPDATE user SET lat = ?, lng = ? WHERE id_user = ?', [latBaru, lngBaru, req.user.id]);
    }

    const result = await db.run(
      `INSERT INTO sampah_makanan (id_donor, nama_sampah, jenis_makanan, berat_kg, waktu_produksi, foto_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, cleanName, jenis, berat, new Date(waktuMs).toISOString(), await saveImage(req.file)]
    );
    const idSampah = result.lastInsertRowid;

    // FR-11: klasifikasi otomatis saat unggah (rule-based / AI)
    const klasifikasi = await simpanKlasifikasi(idSampah, {
      nama_sampah: cleanName,
      jenis_makanan: jenis,
      waktu_produksi: new Date(waktuMs).toISOString(),
    });

    await audit(req.user.id, 'CREATE_WASTE', 'sampah_makanan', idSampah, {
      berat_kg: berat,
      jenis_makanan: jenis,
      kategori: klasifikasi.kategori,
      tingkat_pembusukan: klasifikasi.tingkat_pembusukan,
    });
    res.status(201).json({ id_sampah: idSampah, message: 'Sampah makanan dicatat', klasifikasi });
  } catch (e) {
    next(e);
  }
});

// Daftar milik sendiri (FR-02 GET /mine)
router.get('/mine', requireRole('donor_mbg', 'admin'), async (req, res, next) => {
  try {
    const rows = await db.all(`${SELECT_LIST} WHERE s.id_donor = ? ORDER BY s.created_at DESC`, [req.user.id]);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Daftar sesuai peran: admin semua, donor miliknya, tps/kurir yang terkait alokasi
router.get('/', async (req, res, next) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      rows = await db.all(`${SELECT_LIST} ORDER BY s.created_at DESC`);
    } else if (req.user.role === 'donor_mbg') {
      rows = await db.all(`${SELECT_LIST} WHERE s.id_donor = ? ORDER BY s.created_at DESC`, [req.user.id]);
    } else {
      rows = await db.all(
        `${SELECT_LIST}
         WHERE s.id_donor = ? OR s.id_sampah IN (
           SELECT a.id_sampah FROM alokasi a
            WHERE a.status != 'dibatalkan' AND (a.id_kurir = ? OR a.id_tps = ?)
         )
         ORDER BY s.created_at DESC`,
        [req.user.id, req.user.id, req.user.id]
      );
    }
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const sampah = await db.get(`${SELECT_LIST} WHERE s.id_sampah = ?`, [req.params.id]);
    if (!sampah) return res.status(404).json({ error: 'Sampah tidak ditemukan' });
    if (!(await aksesSampah(req, sampah))) {
      return res.status(403).json({ error: 'Bukan akses Anda atas sampah ini' });
    }
    res.json(sampah);
  } catch (e) {
    next(e);
  }
});

// Edit (saat masih tersedia) / batalkan
router.patch('/:id', async (req, res, next) => {
  try {
    const sampah = await db.get('SELECT * FROM sampah_makanan WHERE id_sampah = ?', [req.params.id]);
    if (!sampah) return res.status(404).json({ error: 'Sampah tidak ditemukan' });
    if (req.user.role !== 'admin' && sampah.id_donor !== req.user.id) {
      return res.status(403).json({ error: 'Bukan milik Anda' });
    }

    const { nama_sampah, jenis_makanan, berat_kg, waktu_produksi, status } = req.body || {};
    if (status != null) {
      if (status !== STATUS_BATAL) return res.status(400).json({ error: 'Hanya status dibatalkan yang bisa diubah' });
      if (!['tersedia', 'dialokasikan'].includes(sampah.status)) {
        return res.status(400).json({ error: `Tidak bisa membatalkan status ${sampah.status}` });
      }
      await batalkanSampah(sampah);
      await audit(req.user.id, 'CANCEL_WASTE', 'sampah_makanan', sampah.id_sampah, { dari: sampah.status });
      return res.json({ message: 'Sampah dibatalkan' });
    }

    if (sampah.status !== 'tersedia') {
      return res.status(400).json({ error: `Sampah berstatus ${sampah.status} dan tidak bisa diedit` });
    }

    const fields = [];
    const params = [];
    if (nama_sampah != null) {
      const clean = clampStr(nama_sampah, 200);
      if (!clean) return res.status(400).json({ error: 'Nama sampah tidak boleh kosong' });
      fields.push('nama_sampah = ?');
      params.push(clean);
    }
    if (jenis_makanan != null && jenis_makanan !== '') {
      if (!JENIS_VALID.includes(jenis_makanan)) {
        return res.status(400).json({ error: `Jenis makanan harus salah satu dari: ${JENIS_VALID.join(', ')}` });
      }
      fields.push('jenis_makanan = ?');
      params.push(jenis_makanan);
    }
    if (berat_kg != null && berat_kg !== '') {
      const berat = Number(berat_kg);
      if (!Number.isFinite(berat) || berat <= 0 || berat > 10000) {
        return res.status(400).json({ error: 'Berat (kg) harus di antara 0 dan 10000' });
      }
      fields.push('berat_kg = ?');
      params.push(berat);
    }
    if (waktu_produksi != null && waktu_produksi !== '') {
      const t = new Date(waktu_produksi);
      if (Number.isNaN(t.getTime())) return res.status(400).json({ error: 'Waktu produksi tidak valid' });
      if (t.getTime() > Date.now() + 5 * 60000) {
        return res.status(400).json({ error: 'Waktu produksi tidak boleh di masa depan' });
      }
      fields.push('waktu_produksi = ?');
      params.push(t.toISOString());
    }
    if (!fields.length) return res.status(400).json({ error: 'Tidak ada perubahan yang dikirim' });

    params.push(sampah.id_sampah);
    await db.run(`UPDATE sampah_makanan SET ${fields.join(', ')} WHERE id_sampah = ?`, params);

    // Klasifikasi ulang bila isi klasifikasi berubah
    const isiBerubah =
      nama_sampah != null || jenis_makanan != null || waktu_produksi != null || berat_kg != null;
    let klasifikasi = null;
    if (isiBerubah) {
      const baru = await db.get('SELECT * FROM sampah_makanan WHERE id_sampah = ?', [sampah.id_sampah]);
      klasifikasi = await simpanKlasifikasi(baru.id_sampah, {
        nama_sampah: baru.nama_sampah,
        jenis_makanan: baru.jenis_makanan,
        waktu_produksi: baru.waktu_produksi,
      });
    }

    await audit(req.user.id, 'UPDATE_WASTE', 'sampah_makanan', sampah.id_sampah, {
      diubah: fields.map((f) => f.split(' =')[0]),
    });
    const updated = await db.get(`${SELECT_LIST} WHERE s.id_sampah = ?`, [sampah.id_sampah]);
    res.json({ message: 'Sampah diperbarui', sampah: updated, klasifikasi });
  } catch (e) {
    next(e);
  }
});

// Hapus lembut (K-15: soft delete -> status dibatalkan)
router.delete('/:id', async (req, res, next) => {
  try {
    const sampah = await db.get('SELECT * FROM sampah_makanan WHERE id_sampah = ?', [req.params.id]);
    if (!sampah) return res.status(404).json({ error: 'Sampah tidak ditemukan' });
    if (req.user.role !== 'admin' && sampah.id_donor !== req.user.id) {
      return res.status(403).json({ error: 'Bukan milik Anda' });
    }
    if (!['tersedia', 'dialokasikan'].includes(sampah.status)) {
      return res.status(400).json({ error: `Tidak bisa menghapus sampah berstatus ${sampah.status}` });
    }
    await batalkanSampah(sampah);
    await audit(req.user.id, 'DELETE_WASTE', 'sampah_makanan', sampah.id_sampah, { soft_delete: true });
    res.json({ message: 'Sampah dihapus (dibatalkan)' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
