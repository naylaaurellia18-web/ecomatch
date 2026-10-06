const express = require('express');
const db = require('../db');
const { authenticate, requireActive } = require('../middleware');
const { nearbyPostgis, haversineKm } = require('../lib/gis');

const router = express.Router();

router.use(authenticate, requireActive);

/**
 * Titik terdekat di sekitar posisi (SKPL: GIS Service / spatial data store).
 * Utamakan PostGIS (ST_DWithin + ST_Distance pada view v_lokasi_geospasial);
 * fallback haversine di aplikasi bila basis data bukan PostgreSQL.
 * GET /api/geo/nearby?lat=..&lng=..&radius_km=5&limit=20
 */
router.get('/nearby', async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radius_km || 5);
    const limit = Math.min(Number(req.query.limit || 20), 100);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat & lng wajib angka' });
    }

    const viaPostgis = await nearbyPostgis(db, { lat, lng, radius_km: radiusKm, limit });
    if (viaPostgis) {
      return res.json({ mesin: 'postgis', radius_km: radiusKm, jumlah: viaPostgis.length, hasil: viaPostgis });
    }

    const rows = await db.all(
      `SELECT id_user, nama, role, lat, lng FROM user
       WHERE lat IS NOT NULL AND lng IS NOT NULL
         AND role IN ('donor','penerima','kurir')`
    );
    const hasil = rows
      .map((r) => ({ ...r, jarak_km: Number((haversineKm(lat, lng, r.lat, r.lng) ?? Infinity).toFixed(3)) }))
      .filter((r) => r.jarak_km <= radiusKm)
      .sort((a, b) => a.jarak_km - b.jarak_km)
      .slice(0, limit);
    res.json({ mesin: 'haversine-fallback', radius_km: radiusKm, jumlah: hasil.length, hasil });
  } catch (e) {
    next(e);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const users = await db.all(
      `SELECT id_user, nama, role, status, alamat, lat, lng, kapasitas
       FROM user
       WHERE role IN ('donor', 'penerima', 'kurir')
         AND lat IS NOT NULL AND lng IS NOT NULL
       ORDER BY id_user`
    );
    const listings = await db.all(
      `SELECT id_makanan, nama_makanan, jumlah_porsi, jenis_makanan, status, expiry_time, lat, lng, id_donor
       FROM surplus_makanan
       WHERE lat IS NOT NULL AND lng IS NOT NULL
         AND status IN ('tersedia', 'dialokasikan')
       ORDER BY id_makanan`
    );
    res.json({ users, listings });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
