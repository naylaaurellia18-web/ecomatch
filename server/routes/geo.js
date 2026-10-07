const express = require('express');
const db = require('../db');
const { authenticate, requireActive } = require('../middleware');
const { nearbyPostgis, haversineKm } = require('../lib/gis');

const router = express.Router();

router.use(authenticate, requireActive);

const ROLES_LOKASI = `('donor_mbg','tps_pengolah','kurir')`;

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
         AND role IN ${ROLES_LOKASI}`
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
       WHERE role IN ${ROLES_LOKASI}
         AND lat IS NOT NULL AND lng IS NOT NULL
       ORDER BY id_user`
    );
    const tps = await db.all(
      `SELECT t.id_user, t.nama_tps, t.jenis_pengolahan, t.kapasitas_kg_hari, t.radius_layanan_km, t.aktif,
              u.lat, u.lng, u.alamat
         FROM tps_pengolah t JOIN user u ON u.id_user = t.id_user
        WHERE u.lat IS NOT NULL AND u.lng IS NOT NULL
        ORDER BY t.id_user`
    );
    const listings = await db.all(
      `SELECT s.id_sampah, s.nama_sampah, s.berat_kg, s.jenis_makanan, s.status, s.waktu_produksi,
              s.id_donor, u.lat, u.lng
         FROM sampah_makanan s JOIN user u ON u.id_user = s.id_donor
        WHERE u.lat IS NOT NULL AND u.lng IS NOT NULL
          AND s.status IN ('tersedia', 'dialokasikan')
        ORDER BY s.id_sampah`
    );
    res.json({ users, tps, listings });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
