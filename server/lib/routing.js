/**
 * Routing Engine EcoMatch (FR-04, FR-13, NFR-02) — memilih kombinasi
 * sampah makanan MBG -> TPS Pengolah -> kurir.
 *
 * Konfigurasi bobot/radius/batas skor dibaca dari config/routing.json
 * (jenis_cocok 0,35; kapasitas 0,25; jarak 0,25; urgensi 0,15; radius 15 km;
 * batas_skor 0,3). Padanan JS dari ai_matching/routing.py — dipakai sebagai
 * fallback bila layanan Python (/v1/routing) tidak terjangkau (NFR-02).
 *
 * Bentuk input (disiapkan routes/routing.js):
 *   sampah: { id_sampah, lat, lng, berat_kg, waktu_produksi, status, kategori?, tingkat_pembusukan? }
 *   tps:    { id_tps, lat, lng, jenis_diterima[], kapasitas_kg_hari, sisa_kapasitas_kg?, aktif }
 *   kurir:  { id_kurir, lat, lng, kapasitas }
 */
const { buildRoute, haversineKm } = require('./gis');
const { hitRouting, hitClassify, engineStatus: aiEngineStatus } = require('./aiService');
const klasifikasiLib = require('./klasifikasi');

function cfg() {
  return klasifikasiLib.loadConfig();
}

function parseJenisDiterima(value) {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v));
    } catch {
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function skorJenisCocok(kategori, diterima) {
  if (!diterima.length) return null;
  if (diterima.includes(kategori)) return Number(cfg().skor_jenis_cocok.cocok);
  if (diterima.includes('lainnya')) return Number(cfg().skor_jenis_cocok.sebagian);
  return null;
}

function skorJarak(km) {
  if (km == null) return 0;
  const c = cfg();
  const penuh = Number(c.jarak_skor_penuh_km);
  const radius = Number(c.radius_layanan_km);
  if (km <= penuh) return 1;
  if (km >= radius) return 0;
  return 1 - (km - penuh) / (radius - penuh);
}

function skorKapasitas(rasio) {
  if (rasio <= 0) return 0;
  for (const band of cfg().skor_kapasitas) {
    if (rasio >= Number(band.min_rasio)) return Number(band.skor);
  }
  return 0;
}

function skorUrgensi(tingkat) {
  return Number(cfg().skor_urgensi[tingkat] ?? 0.5);
}

function kategoriSampah(s) {
  if (s.kategori) return String(s.kategori);
  const teks = ['nama_sampah', 'jenis_makanan', 'deskripsi'].map((k) => s[k] || '').join(' ');
  return klasifikasiLib.kategoriDariTeks(teks).kategori;
}

function tingkatSampah(s, nowMs) {
  if (s.tingkat_pembusukan) return String(s.tingkat_pembusukan);
  try {
    return klasifikasiLib.tingkatPembusukan(s.waktu_produksi, nowMs);
  } catch {
    return 'segar';
  }
}

function isAktifNilai(v) {
  return v == null ? true : !(v === false || v === 0 || v === '0' || v === 'f' || v === false);
}

/** Skor satu kombinasi (sampah, TPS, kurir); {gugur: alasan} bila tersaring aturan. */
function hitungSkor(s, t, k, nowMs, config = cfg()) {
  const berat = Number(s.berat_kg || 0);
  if (berat <= 0) return { gugur: 'berat' };
  if ((s.status || 'tersedia') !== 'tersedia') return { gugur: 'status' };
  if (!isAktifNilai(t.aktif)) return { gugur: 'tps_nonaktif' };

  const km = haversineKm(s.lat, s.lng, t.lat, t.lng);
  if (km == null || km > Number(config.radius_layanan_km)) return { gugur: 'jarak' };

  const kategori = kategoriSampah(s);
  const sJenis = skorJenisCocok(kategori, parseJenisDiterima(t.jenis_diterima));
  if (sJenis == null) return { gugur: 'jenis' };

  let sisaTps = t.sisa_kapasitas_kg;
  if (sisaTps == null) sisaTps = t.kapasitas_kg_hari || 0;
  sisaTps = Number(sisaTps);
  const kapKurir = Number(k.kapasitas || 0);
  if (sisaTps <= 0 || kapKurir <= 0 || berat > sisaTps) return { gugur: 'kapasitas' };

  const rasio = Math.min(sisaTps / berat, kapKurir / berat);
  const sKap = skorKapasitas(rasio);
  const sJar = skorJarak(km);
  const tingkat = tingkatSampah(s, nowMs);
  const sUrg = skorUrgensi(tingkat);
  const total =
    Number(config.bobot.jenis_cocok) * sJenis +
    Number(config.bobot.kapasitas) * sKap +
    Number(config.bobot.jarak) * sJar +
    Number(config.bobot.urgensi) * sUrg;
  return {
    kategori,
    tingkat_pembusukan: tingkat,
    skor_jenis_cocok: Number(sJenis.toFixed(4)),
    skor_kapasitas: Number(sKap.toFixed(4)),
    skor_jarak: Number(sJar.toFixed(4)),
    skor_urgensi: Number(sUrg.toFixed(4)),
    skor_matching: Number(total.toFixed(4)),
    jarak_km: Number(km.toFixed(2)),
    rasio_kapasitas: Number(rasio.toFixed(3)),
  };
}

/** Greedy assignment: kandidat diurutkan skor tertinggi; 1 sampah - 1 TPS - 1 kurir. */
function hitungRouting(sampahList, tpsList, kurirList, nowMs = Date.now(), config = cfg()) {
  const batas = Number(config.batas_skor);

  const sisaTpsMap = new Map();
  for (const t of tpsList) {
    let sisa = t.sisa_kapasitas_kg;
    if (sisa == null) sisa = t.kapasitas_kg_hari || 0;
    sisaTpsMap.set(t.id_tps ?? t.id_user, Number(sisa));
  }

  const kandidat = [];
  const gugur = { status: 0, jarak: 0, jenis: 0, kapasitas: 0, skor: 0 };

  for (const s of sampahList) {
    for (const t of tpsList) {
      const tid = t.id_tps ?? t.id_user;
      const t2 = { ...t, sisa_kapasitas_kg: sisaTpsMap.get(tid) ?? 0 };
      for (const k of kurirList) {
        const hasil = hitungSkor(s, t2, k, nowMs, config);
        if (hasil.gugur) {
          gugur[hasil.gugur] = (gugur[hasil.gugur] || 0) + 1;
          continue;
        }
        if (hasil.skor_matching < batas) {
          gugur.skor += 1;
          continue;
        }
        kandidat.push({
          id_sampah: s.id_sampah,
          id_tps: tid,
          id_kurir: k.id_kurir ?? k.id_user,
          skor_matching: hasil.skor_matching,
          skor_jenis_cocok: hasil.skor_jenis_cocok,
          skor_kapasitas: hasil.skor_kapasitas,
          skor_jarak: hasil.skor_jarak,
          skor_urgensi: hasil.skor_urgensi,
          jarak_km: hasil.jarak_km,
          kategori: hasil.kategori,
          tingkat_pembusukan: hasil.tingkat_pembusukan,
        });
      }
    }
  }

  kandidat.sort((a, b) => b.skor_matching - a.skor_matching || a.jarak_km - b.jarak_km);

  const dipakaiSampah = new Set();
  const dipakaiKurir = new Set();
  const alokasi = [];
  for (const c of kandidat) {
    if (dipakaiSampah.has(c.id_sampah)) continue;
    if (dipakaiKurir.has(c.id_kurir)) continue;
    const sisa = sisaTpsMap.get(c.id_tps) ?? 0;
    if (sisa <= 0) continue;
    const s = sampahList.find((x) => x.id_sampah === c.id_sampah);
    const berat = Number(s?.berat_kg || 0);
    if (berat > sisa) continue;
    sisaTpsMap.set(c.id_tps, sisa - berat);
    dipakaiSampah.add(c.id_sampah);
    dipakaiKurir.add(c.id_kurir);
    alokasi.push(c);
  }

  const rata2 = alokasi.length
    ? Number((alokasi.reduce((sum, a) => sum + a.skor_matching, 0) / alokasi.length).toFixed(4))
    : 0;
  return {
    alokasi,
    jumlah: alokasi.length,
    rata_rata_skor: rata2,
    kandidat: kandidat.length,
    kandidat_gugur: gugur,
    sisa_kapasitas_tps: Object.fromEntries([...sisaTpsMap].map(([k, v]) => [String(k), Number(v.toFixed(2))])),
  };
}

/** Sisipkan rute (OSRM/haversine) kurir -> dapur MBG -> TPS Pengolah. */
async function lampirkanRute(alokasiList, { sampah, tps, kurir }) {
  const sampahMap = new Map(sampah.map((s) => [s.id_sampah, s]));
  const tpsMap = new Map(tps.map((t) => [t.id_tps ?? t.id_user, t]));
  const kurirMap = new Map(kurir.map((k) => [k.id_kurir ?? k.id_user, k]));
  await Promise.all(
    alokasiList.map(async (a) => {
      const s = sampahMap.get(a.id_sampah);
      const t = tpsMap.get(a.id_tps);
      const k = kurirMap.get(a.id_kurir);
      if (!s || !t || !k) return;
      const rute = await buildRoute({
        donor: { nama: s.nama_sampah || s.nama_donor || 'Dapur MBG', lat: s.lat, lng: s.lng },
        penerima: { nama: t.nama_tps || 'TPS Pengolah', lat: t.lat, lng: t.lng },
        kurir: { nama: k.nama || 'Kurir', lat: k.lat, lng: k.lng },
      });
      a.rute_json = JSON.stringify(rute);
    })
  );
  return alokasiList;
}

/**
 * Jalankan routing hibrida: utamakan layanan Python (/v1/routing), fallback
 * ke mesin JavaScript lokal; lampirkan rute_json untuk tiap alokasi.
 */
async function runRouting({ sampah = [], tps = [], kurir = [], nowMs = Date.now() }) {
  const started = process.hrtime.bigint();
  const payload = { sampah, tps, kurir, now: nowMs };
  const hasilPy = await hitRouting(payload);
  const hasil = hasilPy || hitungRouting(sampah, tps, kurir, nowMs);
  await lampirkanRute(hasil.alokasi, { sampah, tps, kurir });
  const durasiMs = Number(process.hrtime.bigint() - started) / 1e6;
  return {
    mesin: hasilPy ? 'python-fastapi' : 'javascript-fallback',
    jumlah: hasil.jumlah,
    durasi_ms: Number(durasiMs.toFixed(2)),
    rata_rata_skor: hasil.rata_rata_skor,
    kandidat: hasil.kandidat,
    kandidat_gugur: hasil.kandidat_gugur,
    kandidat_input: { sampah: sampah.length, tps: tps.length, kurir: kurir.length },
    sisa_kapasitas_tps: hasil.sisa_kapasitas_tps,
    alokasi: hasil.alokasi,
  };
}

/**
 * Klasifikasi hibrida (FR-11): Python dulu (/v1/classify), fallback JS lokal.
 */
async function classifyWaste(payload, nowMs = Date.now()) {
  const hasilPy = await hitClassify({ ...payload, now: nowMs });
  if (hasilPy) return { ...hasilPy, mesin: 'python-fastapi' };
  return { ...klasifikasiLib.klasifikasi(payload, nowMs), mesin: 'javascript-fallback' };
}

function engineStatus() {
  const c = cfg();
  return {
    ...aiEngineStatus(),
    konfigurasi: 'config/routing.json',
    bobot: c.bobot,
    radius_layanan_km: c.radius_layanan_km,
    batas_skor: c.batas_skor,
    sla_routing_detik: c.sla && c.sla.routing_detik,
  };
}

module.exports = {
  runRouting,
  hitungRouting,
  hitungSkor,
  classifyWaste,
  engineStatus,
  parseJenisDiterima,
  skorJenisCocok,
  skorJarak,
  skorKapasitas,
  skorUrgensi,
};
