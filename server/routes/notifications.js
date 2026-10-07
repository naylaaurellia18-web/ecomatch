const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware');

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const rows = await db.all(
      `SELECT * FROM notifikasi WHERE id_user = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// FR-06: PATCH adalah metode baku; POST dipertahankan agar klien lama tetap jalan
router.patch('/:id/read', async (req, res, next) => {
  try {
    await db.run(`UPDATE notifikasi SET dibaca_pada = datetime('now') WHERE id_notifikasi = ? AND id_user = ?`, [
      req.params.id,
      req.user.id,
    ]);
    res.json({ message: 'Berhasil' });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    await db.run(`UPDATE notifikasi SET dibaca_pada = datetime('now') WHERE id_notifikasi = ? AND id_user = ?`, [
      req.params.id,
      req.user.id,
    ]);
    res.json({ message: 'Berhasil' });
  } catch (e) {
    next(e);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await db.run(`UPDATE notifikasi SET dibaca_pada = datetime('now') WHERE id_user = ? AND dibaca_pada IS NULL`, [
      req.user.id,
    ]);
    res.json({ message: 'Berhasil' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
