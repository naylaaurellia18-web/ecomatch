const EARTH_RADIUS_KM = 6371;

const OSRM_BASE = (process.env.OSRM_BASE_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const OSRM_TIMEOUT_MS = Number(process.env.OSRM_TIMEOUT_MS || 2500);
const ROUTE_PROVIDER = process.env.ROUTE_PROVIDER || 'osrm'; // 'osrm' | 'haversine'

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v == null || Number.isNaN(v))) return null;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function estimateDurationMin(distanceKm, speedKmh = 25) {
  if (distanceKm == null) return null;
  return Math.max(5, Math.round((distanceKm / speedKmh) * 60));
}

/**
 * Jarak rute di jalan raya (NFR-06: akurasi kalkulasi jarak/rute) via OSRM.
 * Mengembalikan { jarak_km, durasi_menit, sumber } — fallback haversine bila OSRM
 * gagal/offline/ROUTE_PROVIDER=haversine.
 */
async function roadLegKm(lat1, lng1, lat2, lng2) {
  const direct = haversineKm(lat1, lng1, lat2, lng2);
  if (ROUTE_PROVIDER !== 'osrm' || direct == null) {
    return { jarak_km: direct, durasi_menit: estimateDurationMin(direct), sumber: 'haversine' };
  }
  try {
    const url = `${OSRM_BASE}/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false&alternatives=false&steps=false`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OSRM_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data = await res.json();
    const route = data.routes && data.routes[0];
    if (!route) throw new Error('OSRM tanpa rute');
    return {
      jarak_km: Number((route.distance / 1000).toFixed(2)),
      durasi_menit: Math.max(1, Math.round(route.duration / 60)),
      sumber: 'osrm',
    };
  } catch {
    return {
      jarak_km: direct != null ? Number(direct.toFixed(2)) : null,
      durasi_menit: estimateDurationMin(direct),
      sumber: 'haversine',
    };
  }
}

async function buildRoute({ donor, penerima, kurir }) {
  const [leg1, leg2] = await Promise.all([
    roadLegKm(kurir.lat, kurir.lng, donor.lat, donor.lng),
    roadLegKm(donor.lat, donor.lng, penerima.lat, penerima.lng),
  ]);
  const sumber = leg1.sumber === 'osrm' && leg2.sumber === 'osrm' ? 'osrm' : 'haversine';
  const total =
    leg1.jarak_km != null && leg2.jarak_km != null
      ? Number((leg1.jarak_km + leg2.jarak_km).toFixed(2))
      : null;
  return {
    penyedia: sumber,
    titik: [
      { nama: 'Kurir (posisi awal)', lat: kurir.lat, lng: kurir.lng },
      { nama: `Penjemputan: ${donor.nama}`, lat: donor.lat, lng: donor.lng },
      { nama: `Pengantaran: ${penerima.nama}`, lat: penerima.lat, lng: penerima.lng },
    ],
    segmen: [
      { dari: 'Kurir', ke: 'Donor', jarak_km: leg1.jarak_km ?? 0, durasi_menit: leg1.durasi_menit, sumber: leg1.sumber },
      { dari: 'Donor', ke: 'Penerima', jarak_km: leg2.jarak_km ?? 0, durasi_menit: leg2.durasi_menit, sumber: leg2.sumber },
    ],
    total_jarak_km: total ?? 0,
    total_durasi_menit: estimateDurationMin(total),
  };
}

/**
 * Jarak titik terdekat lewat PostGIS (ST_DWithin + ST_Distance) — hanya PostgreSQL.
 * Kembalikan null bila bukan PostgreSQL agar pemanggil memakai fallback JS.
 */
async function nearbyPostgis(db, { lat, lng, radius_km = 5, limit = 20 }) {
  if (!(await db.isPgReady())) return null;
  const rows = await db.all(
    `SELECT sumber, id, nama, lat, lng,
            ROUND((ST_Distance(posisi, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography) / 1000.0)::numeric, 3) AS jarak_km
     FROM v_lokasi_geospasial
     WHERE posisi IS NOT NULL
       AND ST_DWithin(posisi, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ? * 1000.0)
     ORDER BY jarak_km
     LIMIT ?`,
    [lng, lat, lng, lat, radius_km, limit]
  );
  return rows;
}

module.exports = { haversineKm, buildRoute, estimateDurationMin, roadLegKm, nearbyPostgis };
