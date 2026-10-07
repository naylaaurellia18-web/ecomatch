/**
 * Penyimpanan hasil klasifikasi ke klasifikasi_sampah (FR-11, K-12).
 * Dipakai routes/waste.js (klasifikasi otomatis saat unggah) dan
 * routes/classify.js (endpoint eksplisit + verifikasi admin).
 */
const db = require('../db');
const { clampStr } = require('./validate');
const { classifyWaste } = require('./routing');

const METODE_VALID = ['rule_based', 'ai_vision', 'manual_admin', 'hybrid'];

async function simpanKlasifikasi(idSampah, payload, nowMs = Date.now()) {
  const hasil = await classifyWaste(payload, nowMs);
  const ins = await db.run(
    `INSERT INTO klasifikasi_sampah (id_sampah, kategori, tingkat_pembusukan, skor_keyakinan, metode, alasan)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      idSampah,
      hasil.kategori || 'lainnya',
      hasil.tingkat_pembusukan || 'segar',
      Number(hasil.skor_keyakinan || 0),
      METODE_VALID.includes(hasil.metode) ? hasil.metode : 'rule_based',
      clampStr(hasil.alasan, 500),
    ]
  );
  return { id_klasifikasi: ins.lastInsertRowid, ...hasil };
}

async function klasifikasiTerakhir(idSampah) {
  return db.get(
    `SELECT * FROM klasifikasi_sampah WHERE id_sampah = ? ORDER BY id_klasifikasi DESC LIMIT 1`,
    [idSampah]
  );
}

async function semuaKlasifikasi(idSampah) {
  return db.all(
    `SELECT * FROM klasifikasi_sampah WHERE id_sampah = ? ORDER BY id_klasifikasi DESC`,
    [idSampah]
  );
}

module.exports = { simpanKlasifikasi, klasifikasiTerakhir, semuaKlasifikasi };
