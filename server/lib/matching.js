const { haversineKm, buildRoute } = require('./gis');
const { computeWithPython, engineStatus } = require('./aiService');
const config = require('../config/matching.json');

const BOBOT = config.bobot;
const BATAS_JARAK_KM = config.batas_jarak_km;
const SKOR_MINIMUM = config.skor_minimum;
const SKOR_URGENSI = config.skor_urgensi;

function expiryScore(listing, now = Date.now()) {
  const expiry = new Date(listing.expiry_time).getTime();
  const hoursLeft = (expiry - now) / 3600000;
  if (hoursLeft <= 0) return 0;
  for (const b of config.skor_masa_simpan) {
    if (b.maks_jam == null || hoursLeft <= b.maks_jam) return b.skor;
  }
  return 0;
}

function distanceScore(km) {
  if (km == null) return 0;
  const penuh = config.jarak_skor_penuh_km;
  if (km <= penuh) return 1;
  if (km >= BATAS_JARAK_KM) return 0;
  return 1 - (km - penuh) / (BATAS_JARAK_KM - penuh);
}

function capacityScore(courier, portions) {
  if (!courier.kapasitas || courier.kapasitas <= 0) return 0;
  const ratio = portions / courier.kapasitas;
  for (const b of config.skor_kapasitas) {
    if (b.maks_rasio == null || ratio <= b.maks_rasio) return b.skor;
  }
  return 0;
}

function scoreTriplet(listing, need, courier) {
  const d = donorLatLng(listing);
  const r = needLatLng(need);
  const c = courierLatLng(courier);
  const leg1 = haversineKm(c.lat, c.lng, d.lat, d.lng);
  const leg2 = haversineKm(d.lat, d.lng, r.lat, r.lng);
  const km = leg1 != null && leg2 != null ? leg1 + leg2 : null;
  const sExpiry = expiryScore(listing);
  const sDist = distanceScore(km);
  const sUrgency = SKOR_URGENSI[need.urgensi] ?? 0.5;
  const sCap = capacityScore(courier, listing.jumlah_porsi);
  const total =
    BOBOT.masa_simpan * sExpiry +
    BOBOT.jarak * sDist +
    BOBOT.urgensi * sUrgency +
    BOBOT.kapasitas * sCap;
  return {
    km,
    sExpiry,
    sDist,
    sUrgency,
    sCap,
    total: Number(total.toFixed(4)),
  };
}

function donorLatLng(l) {
  return { lat: l.lat ?? l.lat_donor, lng: l.lng ?? l.lng_donor };
}
function needLatLng(n) {
  return { lat: n.lat ?? n.lat_penerima, lng: n.lng ?? n.lng_penerima };
}
function courierLatLng(c) {
  return { lat: c.lat, lng: c.lng };
}

async function computeMatchesLocal({ listings, needs, couriers, now = Date.now() }) {
  const candidates = [];

  for (const listing of listings) {
    if (listing.status !== 'tersedia') continue;
    if (new Date(listing.expiry_time).getTime() <= now) continue;

    for (const need of needs) {
      if (need.status !== 'terbuka') continue;
      if (need.porsi_dibutuhkan > listing.jumlah_porsi * config.rasio_porsi_maks) continue;
      if (need.id_penerima === listing.id_donor) continue;

      for (const courier of couriers) {
        const s = scoreTriplet(listing, need, courier);
        if (s.km == null || s.km > BATAS_JARAK_KM) continue;
        if (s.total < SKOR_MINIMUM) continue;
        candidates.push({
          id_makanan: listing.id_makanan,
          id_kebutuhan: need.id_kebutuhan,
          id_penerima: need.id_penerima,
          id_kurir: courier.id_user,
          skor_matching: s.total,
          skor_masa_simpan: s.sExpiry,
          skor_jarak: s.sDist,
          skor_urgensi: s.sUrgency,
          skor_kapasitas: s.sCap,
          jarak_km: Number(s.km.toFixed(2)),
          _listing: listing,
          _need: need,
          _courier: courier,
        });
      }
    }
  }

  candidates.sort((a, b) => b.skor_matching - a.skor_matching);

  const usedListings = new Set();
  const usedNeeds = new Set();
  const usedCouriers = new Set();
  const selected = [];

  for (const c of candidates) {
    if (usedListings.has(c.id_makanan)) continue;
    if (usedNeeds.has(c.id_kebutuhan)) continue;
    if (usedCouriers.has(c.id_kurir)) continue;
    usedListings.add(c.id_makanan);
    usedNeeds.add(c.id_kebutuhan);
    usedCouriers.add(c.id_kurir);
    delete c._listing;
    delete c._need;
    delete c._courier;
    selected.push(c);
  }

  return selected;
}

function entityMaps({ listings, needs, couriers }) {
  return {
    listing: new Map((listings || []).map((l) => [l.id_makanan, l])),
    need: new Map((needs || []).map((n) => [n.id_kebutuhan, n])),
    courier: new Map((couriers || []).map((c) => [c.id_user, c])),
  };
}

/** Sisipkan rute (OSRM/haversine) untuk tiap hasil seleksi — dipakai mesin JS & Python. */
async function attachRoutes(selected, opts) {
  const maps = entityMaps(opts);
  await Promise.all(
    selected.map(async (m) => {
      const l = maps.listing.get(m.id_makanan);
      const n = maps.need.get(m.id_kebutuhan);
      const c = maps.courier.get(m.id_kurir);
      if (!l || !n || !c) return;
      const donor = {
        nama: l.nama_donor ?? l.nama ?? 'Donor',
        lat: l.lat ?? l.lat_donor,
        lng: l.lng ?? l.lng_donor,
      };
      const penerima = {
        nama: n.nama_penerima ?? n.nama ?? 'Penerima',
        lat: n.lat ?? n.lat_penerima,
        lng: n.lng ?? n.lng_penerima,
      };
      const kurir = { nama: c.nama, lat: c.lat, lng: c.lng };
      m.rute_json = JSON.stringify(await buildRoute({ donor, penerima, kurir }));
    })
  );
  return selected;
}

/**
 * Mesin hibrida (SKPL): utamakan modul AI Matching Python (FastAPI),
 * fallback ke mesin JavaScript lokal bila layanan Python tidak tersedia.
 */
async function computeMatches(opts) {
  const py = await computeWithPython(opts);
  if (py) {
    return attachRoutes(py.matches, opts);
  }
  const selected = await computeMatchesLocal(opts);
  return attachRoutes(selected, opts);
}

module.exports = {
  computeMatches,
  computeMatchesLocal,
  engineStatus,
  BOBOT,
  scoreTriplet,
  BATAS_JARAK_KM,
  SKOR_MINIMUM,
};
