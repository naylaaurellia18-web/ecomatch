/**
 * Perhitungan sisa kapasitas Penerima hari ini (FR-04/FR-12).
 * kapasitas_kg_hari dikurangi total berat alokasi yang masih berjalan
 * (dialokasikan/dijemput/terkirim/terverifikasi) dan dialokasikan hari ini.
 */
const db = require('../db');

function awalHariIso() {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
}

/** Map {id_penerima: terpakai_kg_hari_ini} untuk semua penerima. */
async function terpakaiHariIniMap() {
  const rows = await db.all(
    `SELECT a.id_penerima, COALESCE(SUM(s.berat_kg), 0) AS terpakai
     FROM alokasi a JOIN sampah_makanan s ON s.id_sampah = a.id_sampah
     WHERE a.status IN ('dialokasikan','dijemput','terkirim','terverifikasi')
       AND a.waktu_alokasi >= ?
     GROUP BY a.id_penerima`,
    [awalHariIso()]
  );
  const map = new Map();
  for (const r of rows) map.set(Number(r.id_penerima), Number(r.terpakai || 0));
  return map;
}

/** Sisa kapasitas satu penerima (kg) hari ini; default -1 bila penerima tidak ditemukan. */
async function sisaKapasitasHariIni(idPenerima, kapasitasKgHari) {
  let kapasitas = kapasitasKgHari;
  if (kapasitas == null) {
    const t = await db.get('SELECT kapasitas_kg_hari FROM penerima WHERE id_user = ?', [idPenerima]);
    kapasitas = t ? Number(t.kapasitas_kg_hari) : 0;
  }
  const map = await terpakaiHariIniMap();
  return Math.max(0, Number(kapasitas) - (map.get(Number(idPenerima)) || 0));
}

module.exports = { awalHariIso, terpakaiHariIniMap, sisaKapasitasHariIni };
