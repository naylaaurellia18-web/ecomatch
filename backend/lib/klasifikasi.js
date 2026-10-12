/**
 * Klasifikasi rule-based sampah makanan EcoMatch (FR-11, NFR-10) — padanan JS
 * dari ai/klasifikasi.py. Kata kunci & ambang diambil dari
 * config/routing.json (bukan hard-coded).
 *
 * keyakinan = n/(n+1) dengan n = jumlah kata kunci yang cocok; bila di bawah
 * ambang_keyakinan hasil ditandai perlu_verifikasi (admin memverifikasi, K-12).
 */
const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'routing.json');
let cachedConfig = null;

function loadConfig() {
  if (!cachedConfig) {
    cachedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }
  return cachedConfig;
}

function normalisasi(teks) {
  return String(teks || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function kategoriDariTeks(teks, cfg = loadConfig()) {
  const conf = cfg.klasifikasi;
  const teksN = normalisasi(teks);
  if (!teksN) {
    return {
      kategori: 'lainnya',
      skor_keyakinan: 0,
      metode: 'rule_based',
      alasan: 'teks kosong',
      perlu_verifikasi: true,
    };
  }

  let terbaik = { kategori: 'lainnya', keyakinan: 0, kata: [] };
  for (const [kategori, daftar] of Object.entries(conf.kategori)) {
    const cocok = (daftar || []).filter((k) => k && teksN.includes(normalisasi(k)));
    if (cocok.length === 0) continue;
    const keyakinan = cocok.length / (cocok.length + 1);
    if (keyakinan > terbaik.keyakinan) {
      terbaik = { kategori, keyakinan, kata: cocok };
    }
  }

  if (terbaik.keyakinan === 0) {
    return {
      kategori: 'lainnya',
      skor_keyakinan: 0,
      metode: 'rule_based',
      alasan: 'tidak ada kata kunci yang cocok',
      perlu_verifikasi: true,
    };
  }
  return {
    kategori: terbaik.kategori,
    skor_keyakinan: Number(terbaik.keyakinan.toFixed(3)),
    metode: 'rule_based',
    alasan: 'kata kunci cocok: ' + terbaik.kata.join(', '),
    perlu_verifikasi: terbaik.keyakinan < Number(conf.ambang_keyakinan),
  };
}

function parseWaktuMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  const s = String(value || '');
  if (!s) throw new Error('waktu kosong');
  const t = Date.parse(s);
  if (Number.isNaN(t)) throw new Error('waktu tidak valid');
  return t;
}

/** Umur (jam sejak waktu_produksi) -> segar | sedang | busuk (config.pembusukan). */
function tingkatPembusukan(waktuProduksi, nowMs = Date.now(), cfg = loadConfig()) {
  const conf = cfg.pembusukan;
  const umurJam = (nowMs - parseWaktuMs(waktuProduksi)) / 3600000;
  if (umurJam <= Number(conf.segar_maks_jam)) return 'segar';
  if (umurJam <= Number(conf.sedang_maks_jam)) return 'sedang';
  return 'busuk';
}

/** Gabungan klasifikasi: teks -> kategori; waktu_produksi -> tingkat pembusukan. */
function klasifikasi(payload = {}, nowMs = Date.now(), cfg = loadConfig()) {
  const teks =
    payload.teks ||
    ['nama_sampah', 'nama_makanan', 'deskripsi', 'jenis_makanan']
      .map((k) => payload[k] || '')
      .join(' ')
      .trim();
  const hasil = kategoriDariTeks(teks, cfg);
  try {
    hasil.tingkat_pembusukan = tingkatPembusukan(payload.waktu_produksi, nowMs, cfg);
  } catch {
    hasil.tingkat_pembusukan = null;
    hasil.perlu_verifikasi = true;
  }
  hasil.umur_jam = null;
  if (payload.waktu_produksi) {
    try {
      hasil.umur_jam = Number(((nowMs - parseWaktuMs(payload.waktu_produksi)) / 3600000).toFixed(2));
    } catch {
      /* waktu_produksi tidak valid — biarkan null */
    }
  }
  return hasil;
}

module.exports = {
  loadConfig,
  normalisasi,
  kategoriDariTeks,
  parseWaktuMs,
  tingkatPembusukan,
  klasifikasi,
};
