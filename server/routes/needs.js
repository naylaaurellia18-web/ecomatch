const express = require('express');
const db = require('../db');
const { audit } = require('../lib/audit');
const { authenticate, requireRole, requireActive } = require('../middleware');
const { clampStr } = require('../lib/validate');

const router = express.Router();

const URGENCIES = ['rendah', 'sedang', 'tinggi', 'kritis'];
const NEED_STATUSES = ['terbuka', 'dipenuhi', 'kedaluwarsa'];

router.use(authenticate, requireRole('penerima', 'admin'), requireActive);

router.post('/', async (req, res, next) => {
  try {
    const { judul, porsi_dibutuhkan, urgensi, catatan, lat, lng } = req.body || {};
    if (!judul || !porsi_dibutuhkan) {
      return res.status(400).json({ error: 'Judul dan kebutuhan porsi wajib diisi' });
    }
    if (!URGENCIES.includes(urgensi || 'sedang')) {
      return res.status(400).json({ error: 'Tingkat urgensi tidak valid' });
    }
    const portions = Math.floor(Number(porsi_dibutuhkan));
    if (!Number.isFinite(portions) || portions <= 0 || portions > 100000) {
      return res.status(400).json({ error: 'Jumlah porsi tidak valid' });
    }
    const cleanTitle = clampStr(judul, 200);
    if (!cleanTitle) return res.status(400).json({ error: 'Judul wajib diisi' });

    const recipient = await db.get('SELECT lat, lng FROM user WHERE id_user = ?', [req.user.id]);
    const result = await db.run(
      `INSERT INTO kebutuhan_pangan (id_penerima, judul, porsi_dibutuhkan, urgensi, catatan, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [req.user.id, cleanTitle, portions, urgensi || 'sedang', clampStr(catatan, 1000)]
    );

    if (lat != null && lat !== '' && lng != null && lng !== '' && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))) {
      await db.run('UPDATE user SET lat = ?, lng = ? WHERE id_user = ?', [Number(lat), Number(lng), req.user.id]);
    }

    await audit(req.user.id, 'CREATE_NEED', 'kebutuhan_pangan', result.lastInsertRowid, {
      urgensi,
      porsi_dibutuhkan,
    });
    res.status(201).json({
      id_kebutuhan: result.lastInsertRowid,
      message: 'Kebutuhan pangan dicatat',
      user_lat: recipient?.lat,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const rows =
      req.user.role === 'admin'
        ? await db.all('SELECT * FROM kebutuhan_pangan ORDER BY created_at DESC')
        : await db.all('SELECT * FROM kebutuhan_pangan WHERE id_penerima = ? ORDER BY created_at DESC', [
            req.user.id,
          ]);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const need = await db.get('SELECT * FROM kebutuhan_pangan WHERE id_kebutuhan = ?', [req.params.id]);
    if (!need) return res.status(404).json({ error: 'Kebutuhan tidak ditemukan' });
    if (req.user.role !== 'admin' && need.id_penerima !== req.user.id) {
      return res.status(403).json({ error: 'Bukan milik Anda' });
    }

    const { judul, porsi_dibutuhkan, urgensi, catatan, status } = req.body || {};
    if (urgensi != null && !URGENCIES.includes(urgensi)) {
      return res.status(400).json({ error: 'Tingkat urgensi tidak valid' });
    }
    if (status != null && !NEED_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Status tidak valid' });
    }
    if (porsi_dibutuhkan != null) {
      const p = Math.floor(Number(porsi_dibutuhkan));
      if (!Number.isFinite(p) || p <= 0 || p > 100000) {
        return res.status(400).json({ error: 'Jumlah porsi tidak valid' });
      }
    }
    const nextVals = {
      judul: judul != null ? clampStr(judul, 200) ?? need.judul : need.judul,
      porsi_dibutuhkan: porsi_dibutuhkan != null ? Math.floor(Number(porsi_dibutuhkan)) : need.porsi_dibutuhkan,
      urgensi: urgensi ?? need.urgensi,
      catatan: catatan != null ? clampStr(catatan, 1000) : need.catatan,
      status: status ?? need.status,
    };
    if (!nextVals.judul) return res.status(400).json({ error: 'Judul tidak boleh kosong' });

    await db.run(
      `UPDATE kebutuhan_pangan SET judul = ?, porsi_dibutuhkan = ?, urgensi = ?, catatan = ?, status = ?, updated_at = datetime('now') WHERE id_kebutuhan = ?`,
      [nextVals.judul, nextVals.porsi_dibutuhkan, nextVals.urgensi, nextVals.catatan, nextVals.status, need.id_kebutuhan]
    );

    await audit(req.user.id, 'UPDATE_NEED', 'kebutuhan_pangan', need.id_kebutuhan, nextVals);
    res.json({ message: 'Kebutuhan diperbarui' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
