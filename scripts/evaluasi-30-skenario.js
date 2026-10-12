/**
 * Harness evaluasi 30 skenario sintetis (seed 0–29) untuk AI Routing EcoMatch
 * (Laporan bagian 3, NFR-02, FR-04/FR-13).
 *
 * Konfigurasi FINAL EcoMatch (config/routing.json): bobot jenis_cocok 0,35;
 * kapasitas 0,25; jarak 0,25; urgensi 0,15; radius 15 km; BATAS_SKOR 0,3.
 * Memakai kode produksi backend/lib/routing.js (hitungRouting + hitungSkor),
 * sehingga angka laporan = perilaku sistem berjalan.
 *
 * Baseline pembanding: Greedy Jarak-Saja — filter aturan yang sama (status,
 * jarak radius, jenis diterima, kapasitas), tapi kandidat diurutkan dari trip
 * terpendek (kurir -> sampah -> TPS) tanpa penerapan BATAS_SKOR.
 *
 * Definisi metrik:
 *   - % sampah teralokasi      : alokasi / 6 sampah x 100 (dibatasi 3 kurir)
 *   - Total jarak (km)         : sum haversine(kurir,sampah) + haversine(sampah,TPS)
 *   - Skor kualitas            : rata-rata skor_matching alokasi (rumus sama utk 2 strategi)
 *   - Urgensi tinggi teralokasi: % sampah tingkat 'busuk' (skor urgensi 1,0) yg teralokasi
 *   - Hampir busuk tersalurkan : % sampah tingkat 'sedang' (umur 12–24 jam) yg teralokasi
 *
 * Output: docs/pengujian/evaluasi-30-skenario.json (+ ringkasan di stdout).
 * Jalankan: node scripts/evaluasi-30-skenario.js
 */
const fs = require('fs');
const path = require('path');
const { hitungRouting, hitungSkor } = require('../backend/lib/routing');
const { haversineKm } = require('../backend/lib/gis');
const klasifikasiLib = require('../backend/lib/klasifikasi');

const CONFIG = klasifikasiLib.loadConfig();
const OUT_DIR = path.join(__dirname, '..', 'docs', 'pengujian');
const OUT_PATH = path.join(OUT_DIR, 'evaluasi-30-skenario.json');

const KATEGORI = ['sisa_nasi', 'sayur', 'lauk', 'kulit_buah', 'campuran', 'lainnya'];
const UMOUR_JAM = [1, 4, 8, 14, 18, 26, 40]; // <=12 segar; 12–24 sedang; >24 busuk
// Bbox Kota Madiun sekitar TPS Pengolah pada seed.js (TPS Kompos Kawatan
// -7.6386/111.5206, TPS Maggot Ngetan -7.5754/111.4789).
const BBOX = { latMin: -7.68, latMax: -7.55, lngMin: 111.43, lngMax: 111.56 };

/** RNG deterministik (mulberry32) — seed tetap => hasil reproducible. */
function rngDariSeed(seed) {
  let a = (seed >>> 0) + 0x6d2b79f5;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function acak(rng, min, max) {
  return min + rng() * (max - min);
}
function acakInt(rng, min, max) {
  return Math.floor(acak(rng, min, max + 1));
}
function pilih(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
function campur(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tingkatDariUmur(umurJam) {
  if (umurJam <= Number(CONFIG.pembusukan.segar_maks_jam)) return 'segar';
  if (umurJam <= Number(CONFIG.pembusukan.sedang_maks_jam)) return 'sedang';
  return 'busuk';
}

function buatSkenario(seed, nSampah = 6, nTps = 6, nKurir = 3) {
  const rng = rngDariSeed(seed);
  const nowMs = 1770000000000; // titik waktu tetap agar umur/tingkat stabil
  const sampah = [];
  for (let i = 0; i < nSampah; i++) {
    const umur = pilih(rng, UMOUR_JAM);
    sampah.push({
      id_sampah: `S${i}`,
      lat: acak(rng, BBOX.latMin, BBOX.latMax),
      lng: acak(rng, BBOX.lngMin, BBOX.lngMax),
      berat_kg: acakInt(rng, 5, 60),
      kategori: pilih(rng, KATEGORI),
      waktu_produksi: new Date(nowMs - umur * 3600000).toISOString(),
      status: 'tersedia',
      _umur_jam: umur,
      _tingkat: tingkatDariUmur(umur),
    });
  }
  const tps = [];
  for (let i = 0; i < nTps; i++) {
    const dasar = campur(rng, KATEGORI).slice(0, acakInt(rng, 2, 4));
    const jenis = dasar.includes('lainnya') || rng() < 0.5 ? dasar.concat('lainnya') : dasar;
    tps.push({
      id_tps: `T${i}`,
      lat: acak(rng, BBOX.latMin, BBOX.latMax),
      lng: acak(rng, BBOX.lngMin, BBOX.lngMax),
      jenis_diterima: [...new Set(jenis)],
      kapasitas_kg_hari: acakInt(rng, 5, 30) * 10,
      sisa_kapasitas_kg: acakInt(rng, 5, 30) * 10,
      aktif: true,
    });
  }
  const kurir = [];
  for (let i = 0; i < nKurir; i++) {
    kurir.push({
      id_kurir: `K${i}`,
      lat: acak(rng, BBOX.latMin, BBOX.latMax),
      lng: acak(rng, BBOX.lngMin, BBOX.lngMax),
      kapasitas: pilih(rng, [30, 50, 70, 100]),
    });
  }
  return { sampah, tps, kurir, nowMs };
}

function tripKm(s, t, k) {
  const leg1 = haversineKm(k.lat, k.lng, s.lat, s.lng);
  const leg2 = haversineKm(s.lat, s.lng, t.lat, t.lng);
  return leg1 + leg2;
}

/** Baseline Greedy Jarak-Saja: filter aturan sama, urut trip terpendek, tanpa BATAS_SKOR. */
function baselineJarak(sampahList, tpsList, kurirList, nowMs, config) {
  const sisaTpsMap = new Map();
  for (const t of tpsList) {
    sisaTpsMap.set(t.id_tps, Number(t.sisa_kapasitas_kg ?? t.kapasitas_kg_hari ?? 0));
  }
  const kandidat = [];
  for (const s of sampahList) {
    for (const t of tpsList) {
      const t2 = { ...t, sisa_kapasitas_kg: sisaTpsMap.get(t.id_tps) ?? 0 };
      for (const k of kurirList) {
        const hasil = hitungSkor(s, t2, k, nowMs, config);
        if (hasil.gugur) continue;
        kandidat.push({
          id_sampah: s.id_sampah,
          id_tps: t.id_tps,
          id_kurir: k.id_kurir,
          skor_matching: hasil.skor_matching,
          jarak_km: hasil.jarak_km,
          trip_km: tripKm(s, t, k),
          kategori: hasil.kategori,
          tingkat_pembusukan: hasil.tingkat_pembusukan,
        });
      }
    }
  }
  kandidat.sort((a, b) => a.trip_km - b.trip_km); // stable: skor tidak dipakai
  const dipakaiSampah = new Set();
  const dipakaiKurir = new Set();
  const alokasi = [];
  for (const c of kandidat) {
    if (dipakaiSampah.has(c.id_sampah) || dipakaiKurir.has(c.id_kurir)) continue;
    const sisa = sisaTpsMap.get(c.id_tps) ?? 0;
    if (sisa <= 0) continue;
    const berat = Number(sampahList.find((x) => x.id_sampah === c.id_sampah)?.berat_kg || 0);
    if (berat > sisa) continue;
    sisaTpsMap.set(c.id_tps, sisa - berat);
    dipakaiSampah.add(c.id_sampah);
    dipakaiKurir.add(c.id_kurir);
    alokasi.push(c);
  }
  return { alokasi, jumlah: alokasi.length };
}

function metrik(alokasi, sampahList, tpsList, kurirList) {
  const sMap = new Map(sampahList.map((s) => [s.id_sampah, s]));
  const tMap = new Map(tpsList.map((t) => [t.id_tps, t]));
  const kMap = new Map(kurirList.map((k) => [k.id_kurir, k]));
  const totalJarak = alokasi.reduce((sum, a) => {
    const s = sMap.get(a.id_sampah);
    const t = tMap.get(a.id_tps);
    const k = kMap.get(a.id_kurir);
    return sum + (s && t && k ? tripKm(s, t, k) : 0);
  }, 0);
  const avgSkor = alokasi.length
    ? alokasi.reduce((sum, a) => sum + a.skor_matching, 0) / alokasi.length
    : 0;
  const idAlokasi = new Set(alokasi.map((a) => a.id_sampah));
  const busuk = sampahList.filter((s) => s._tingkat === 'busuk');
  const sedang = sampahList.filter((s) => s._tingkat === 'sedang');
  const pct = (kelompok) =>
    kelompok.length
      ? (kelompok.filter((s) => idAlokasi.has(s.id_sampah)).length / kelompok.length) * 100
      : null;
  return {
    jumlah: alokasi.length,
    pct_alokasi: (alokasi.length / sampahList.length) * 100,
    total_jarak_km: Number(totalJarak.toFixed(2)),
    rata_rata_skor: Number(avgSkor.toFixed(4)),
    pct_busuk: pct(busuk),
    pct_sedang: pct(sedang),
    n_busuk: busuk.length,
    n_sedang: sedang.length,
  };
}

function statistik(values) {
  const v = values.filter((x) => x != null && !Number.isNaN(x));
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const varian = v.length > 1 ? v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1) : 0;
  return { mean: Number(mean.toFixed(2)), std: Number(Math.sqrt(varian).toFixed(2)) };
}

function sensitivitasBatas(nSkenario = 30, daftar = [0.1, 0.3, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9]) {
  const hasil = [];
  for (const th of daftar) {
    const cfg = { ...CONFIG, batas_skor: th };
    let sumJumlah = 0;
    let sumSkor = 0;
    for (let seed = 0; seed < nSkenario; seed++) {
      const { sampah, tps, kurir, nowMs } = buatSkenario(seed);
      const r = hitungRouting(sampah, tps, kurir, nowMs, cfg);
      sumJumlah += r.jumlah;
      sumSkor += r.rata_rata_skor;
    }
    hasil.push({
      batas_skor: th,
      rata_rata_alokasi: Number((sumJumlah / nSkenario).toFixed(2)),
      rata_rata_skor: Number((sumSkor / nSkenario).toFixed(3)),
    });
  }
  return hasil;
}

function ujiKecepatan() {
  const skenarioKecil = [];
  for (let seed = 0; seed < 30; seed++) {
    const { sampah, tps, kurir, nowMs } = buatSkenario(seed);
    skenarioKecil.push({ sampah, tps, kurir, nowMs });
  }
  const ulang = 100;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < ulang; i++) {
    for (const s of skenarioKecil) hitungRouting(s.sampah, s.tps, s.kurir, s.nowMs);
  }
  const msKecil = Number(process.hrtime.bigint() - t0) / 1e6 / (ulang * 30);

  const waktuBesar = [];
  for (let seed = 0; seed < 3; seed++) {
    const { sampah, tps, kurir, nowMs } = buatSkenario(seed + 900, 50, 50, 20);
    const a = process.hrtime.bigint();
    hitungRouting(sampah, tps, kurir, nowMs);
    waktuBesar.push(Number(process.hrtime.bigint() - a) / 1e9);
  }
  const detikBesar = waktuBesar.reduce((a, b) => a + b, 0) / waktuBesar.length;
  return {
    skenario_kecil_ms: Number(msKecil.toFixed(3)),
    skenario_besar_detik: Number(detikBesar.toFixed(3)),
    spesifikasi_kecil: '6 sampah, 6 TPS, 3 kurir',
    spesifikasi_besar: '50 sampah, 50 TPS, 20 kurir',
    sla_detik: CONFIG.sla.routing_detik,
  };
}

function main() {
  const perSkenario = [];
  for (let seed = 0; seed < 30; seed++) {
    const { sampah, tps, kurir, nowMs } = buatSkenario(seed);
    const ai = hitungRouting(sampah, tps, kurir, nowMs);
    const base = baselineJarak(sampah, tps, kurir, nowMs, CONFIG);
    perSkenario.push({
      seed,
      ai: metrik(ai.alokasi, sampah, tps, kurir),
      baseline: metrik(base.alokasi, sampah, tps, kurir),
      alokasi_ai: ai.alokasi,
      alokasi_baseline: base.alokasi,
      detail_skenario: { sampah, tps, kurir },
    });
  }

  const rata = (f, k) => statistik(perSkenario.map((p) => p[f][k]));
  const ringkasan = {
    pct_alokasi: { ai: rata('ai', 'pct_alokasi'), baseline: rata('baseline', 'pct_alokasi') },
    total_jarak_km: { ai: rata('ai', 'total_jarak_km'), baseline: rata('baseline', 'total_jarak_km') },
    rata_rata_skor: { ai: rata('ai', 'rata_rata_skor'), baseline: rata('baseline', 'rata_rata_skor') },
    pct_busuk: { ai: rata('ai', 'pct_busuk'), baseline: rata('baseline', 'pct_busuk') },
    pct_sedang: { ai: rata('ai', 'pct_sedang'), baseline: rata('baseline', 'pct_sedang') },
  };

  const banding = (key) => {
    let lebih = 0;
    let sama = 0;
    let kalah = 0;
    let ada = 0;
    for (const p of perSkenario) {
      const a = p.ai[key];
      const b = p.baseline[key];
      if (a == null || b == null) continue;
      ada++;
      if (a > b) lebih++;
      else if (a === b) sama++;
      else kalah++;
    }
    return { skenario_ada: ada, lebih_baik: lebih, sama, lebih_buruk: kalah };
  };
  const bandingSkor = {
    lebih_tinggi: perSkenario.filter((p) => p.ai.rata_rata_skor > p.baseline.rata_rata_skor).length,
    sama: perSkenario.filter((p) => p.ai.rata_rata_skor === p.baseline.rata_rata_skor).length,
    lebih_rendah: perSkenario.filter((p) => p.ai.rata_rata_skor < p.baseline.rata_rata_skor).length,
  };
  const bandingJarak = {
    baseline_lebih_pendek: perSkenario.filter((p) => p.baseline.total_jarak_km < p.ai.total_jarak_km).length,
    sama: perSkenario.filter((p) => p.baseline.total_jarak_km === p.ai.total_jarak_km).length,
    ai_lebih_pendek: perSkenario.filter((p) => p.ai.total_jarak_km < p.baseline.total_jarak_km).length,
  };
  const sumPairAi = perSkenario.reduce((s, p) => s + p.ai.total_jarak_km, 0);
  const nPairAi = perSkenario.reduce((s, p) => s + p.ai.jumlah, 0);
  const sumPairBase = perSkenario.reduce((s, p) => s + p.baseline.total_jarak_km, 0);
  const nPairBase = perSkenario.reduce((s, p) => s + p.baseline.jumlah, 0);
  const tripMaks = (kunci) =>
    Math.max(
      0,
      ...perSkenario.map((p) => {
        const tMap = new Map(p.detail_skenario.tps.map((t) => [t.id_tps, t]));
        const kMap = new Map(p.detail_skenario.kurir.map((k) => [k.id_kurir, k]));
        return Math.max(
          0,
          ...p[kunci].map((a) => {
            const s = p.detail_skenario.sampah.find((x) => x.id_sampah === a.id_sampah);
            return s ? tripKm(s, tMap.get(a.id_tps), kMap.get(a.id_kurir)) : 0;
          })
        );
      })
    );
  const maxTripAi = tripMaks('alokasi_ai');
  const maxTripBase = tripMaks('alokasi_baseline');

  const hasil = {
    meta: {
      judul: 'Evaluasi 30 skenario sintetis AI Routing EcoMatch (konfigurasi final)',
      seed: '0–29',
      bobot: CONFIG.bobot,
      radius_layanan_km: CONFIG.radius_layanan_km,
      batas_skor: CONFIG.batas_skor,
      generator: 'scripts/evaluasi-30-skenario.js (mulberry32, bbox Kota Madiun)',
      mesin_ai: 'backend/lib/routing.js hitungRouting (kode produksi)',
      baseline: 'Greedy Jarak-Saja (filter aturan sama, urut trip terpendek, tanpa BATAS_SKOR)',
      definisi_metrik: {
        pct_alokasi: 'alokasi / 6 sampah x 100 (dibatasi 3 kurir per skenario)',
        total_jarak_km: 'sum haversine(kurir,sampah) + haversine(sampah,TPS)',
        pct_busuk: '% sampah tingkat busuk (umur > 24 jam, skor urgensi 1,0) teralokasi',
        pct_sedang: '% sampah tingkat sedang (umur 12–24 jam) teralokasi',
      },
    },
    per_skenario: perSkenario,
    ringkasan,
    banding: {
      pct_busuk: banding('pct_busuk'),
      pct_sedang: banding('pct_sedang'),
      skor: bandingSkor,
      jarak: bandingJarak,
      jarak_per_pasangan: {
        ai_km: Number((sumPairAi / nPairAi).toFixed(1)),
        baseline_km: Number((sumPairBase / nPairBase).toFixed(1)),
        max_ai_km: Number(maxTripAi.toFixed(1)),
        max_baseline_km: Number(maxTripBase.toFixed(1)),
      },
    },
    sensitivitas: sensitivitasBatas(),
    kecepatan: ujiKecepatan(),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(hasil, null, 2), 'utf8');

  const fmt = (s) => (s ? `${s.mean} ± ${s.std}` : '-');
  console.log('=== EVALUASI 30 SKENARIO ECOMATCH (konfigurasi final) ===');
  console.log('Metrik                 AI Routing            Greedy Jarak-Saja');
  console.log(`% sampah teralokasi    ${fmt(ringkasan.pct_alokasi.ai).padEnd(21)} ${fmt(ringkasan.pct_alokasi.baseline)}`);
  console.log(`Total jarak (km)       ${fmt(ringkasan.total_jarak_km.ai).padEnd(21)} ${fmt(ringkasan.total_jarak_km.baseline)}`);
  console.log(`Rata-rata skor         ${fmt(ringkasan.rata_rata_skor.ai).padEnd(21)} ${fmt(ringkasan.rata_rata_skor.baseline)}`);
  console.log(`Urgensi tinggi (%)     ${fmt(ringkasan.pct_busuk.ai).padEnd(21)} ${fmt(ringkasan.pct_busuk.baseline)}`);
  console.log(`Hampir busuk (%)       ${fmt(ringkasan.pct_sedang.ai).padEnd(21)} ${fmt(ringkasan.pct_sedang.baseline)}`);
  console.log('Bandings:', JSON.stringify(hasil.banding, null, 2));
  console.log('Sensitivitas:', JSON.stringify(hasil.sensitivitas));
  console.log('Kecepatan:', JSON.stringify(hasil.kecepatan));
  console.log('Output:', OUT_PATH);
}

main();
