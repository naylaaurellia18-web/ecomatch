const express = require('express');
const db = require('../db');
const { audit, notify } = require('../lib/audit');
const { authenticate, requireRole, requireActive } = require('../middleware');
const { clampStr } = require('../lib/validate');
const { hit, clientIp } = require('../lib/ratelimit');

const router = express.Router();

const JENIS_INSENTIF = ['sertifikat', 'poin', 'laporan_kepatuhan', 'laporan_csr', 'badge'];
const CLAIM_LIMIT = { limit: 5, windowMs: 60 * 60000 };
const PON_PER_KG_DEFAULT = 10;

router.use(authenticate, requireActive, requireRole('donor_mbg', 'admin'));

async function poinPerKg() {
  const row = await db.get(`SELECT aturan FROM konfigurasi_regulasi WHERE aktif ORDER BY id_konfigurasi LIMIT 1`);
  try {
    const aturan = JSON.parse(row?.aturan || '{}');
    return Number(aturan.poin_per_kg || PON_PER_KG_DEFAULT);
  } catch {
    return PON_PER_KG_DEFAULT;
  }
}

async function statistikDonor(idUser) {
  const [dialihkan, terverifikasi] = await Promise.all([
    db.get(
      `SELECT COALESCE(SUM(s.berat_kg), 0) AS v FROM alokasi a
         JOIN sampah_makanan s ON s.id_sampah = a.id_sampah
        WHERE s.id_donor = ? AND a.status IN ('dialokasikan','dijemput','terkirim','terverifikasi')`,
      [idUser]
    ),
    db.get(
      `SELECT COALESCE(SUM(s.berat_kg), 0) AS v FROM alokasi a
         JOIN sampah_makanan s ON s.id_sampah = a.id_sampah
        WHERE s.id_donor = ? AND a.status = 'terverifikasi'`,
      [idUser]
    ),
  ]);
  return {
    kg_dialihkan: Number(dialihkan?.v || 0),
    kg_terverifikasi: Number(terverifikasi?.v || 0),
  };
}

// FR-15: motivasi donor MBG
router.get('/motivation', async (req, res, next) => {
  try {
    const { kg_dialihkan, kg_terverifikasi } = await statistikDonor(req.user.id);
    const perKg = await poinPerKg();
    const poin = Math.round(kg_terverifikasi * perKg);
    const klaim = await db.all(
      `SELECT * FROM motivasi_donor_mbg WHERE id_user = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    const sisaKeTarget = Math.max(0, 5 - kg_terverifikasi);
    res.json({
      kg_dialihkan,
      kg_terverifikasi,
      poin,
      poin_per_kg: perKg,
      klaim,
      motivasi:
        kg_terverifikasi <= 0
          ? 'Mulai catat sampah makanan MBG — setiap kg yang terverifikasi memberi Anda 10 poin kepatuhan.'
          : sisaKeTarget > 0
            ? `Kerja bagus! ${kg_terverifikasi.toFixed(1)} kg terverifikasi — lagi ${sisaKeTarget.toFixed(1)} kg menuju target 5 kg klaim pertama.`
            : `Hebat! ${kg_terverifikasi.toFixed(1)} kg terverifikasi (${poin} poin). Klaim sertifikat/badge Anda sekarang.`,
      target_kg_klaim_pertama: 5,
    });
  } catch (e) {
    next(e);
  }
});

// FR-15: klaim insentif
router.post('/motivation/claim', async (req, res, next) => {
  try {
    if (!hit(`mbg-claim:${clientIp(req)}:${req.user.id}`, CLAIM_LIMIT)) {
      return res.status(429).json({ error: 'Terlalu banyak permintaan klaim. Coba lagi dalam 1 jam.' });
    }
    const { jenis_insentif, periode } = req.body || {};
    if (!JENIS_INSENTIF.includes(jenis_insentif)) {
      return res.status(400).json({ error: `Jenis insentif harus salah satu dari: ${JENIS_INSENTIF.join(', ')}` });
    }
    if (jenis_insentif === 'poin') {
      return res.status(400).json({ error: 'Poin dihitung otomatis dari kg terverifikasi — tidak perlu diklaim' });
    }

    const { kg_terverifikasi } = await statistikDonor(req.user.id);
    if (kg_terverifikasi < 5) {
      return res.status(400).json({ error: 'Minimal 5 kg sampah terverifikasi untuk klaim insentif' });
    }
    const perKg = await poinPerKg();
    const nilai = Math.round(kg_terverifikasi * perKg);
    const periodeBersih = clampStr(periode, 20) || new Date().toISOString().slice(0, 7);

    const duplikat = await db.get(
      `SELECT id_motivasi FROM motivasi_donor_mbg WHERE id_user = ? AND jenis_insentif = ? AND periode = ?`,
      [req.user.id, jenis_insentif, periodeBersih]
    );
    if (duplikat) return res.status(409).json({ error: `Klaim ${jenis_insentif} periode ${periodeBersih} sudah ada` });

    const ins = await db.run(
      `INSERT INTO motivasi_donor_mbg (id_user, jenis_insentif, nilai, periode) VALUES (?, ?, ?, ?)`,
      [req.user.id, jenis_insentif, nilai, periodeBersih]
    );
    await audit(req.user.id, 'CLAIM_INSENTIF', 'motivasi_donor_mbg', ins.lastInsertRowid, {
      jenis_insentif,
      nilai,
      kg_terverifikasi,
      periode: periodeBersih,
    });
    await notify(
      req.user.id,
      'Klaim Insentif Diterima',
      `Klaim ${jenis_insentif} (periode ${periodeBersih}, nilai ${nilai}) sedang diproses.`
    );
    res.status(201).json({
      id_motivasi: ins.lastInsertRowid,
      message: 'Klaim insentif diterima',
      jenis_insentif,
      nilai,
      periode: periodeBersih,
    });
  } catch (e) {
    next(e);
  }
});

// Profil MBG (SPPG) donor
router.get('/profile', async (req, res, next) => {
  try {
    const row = await db.get('SELECT * FROM profil_mbg WHERE id_user = ?', [req.user.id]);
    if (!row) return res.status(404).json({ error: 'Profil MBG belum diisi' });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

router.post('/profile', async (req, res, next) => {
  try {
    const { nama_sppg, alamat, lat, lng, kapasitas_porsi_harian, penanggung_jawab, kontak, npwp } = req.body || {};
    const nama = clampStr(nama_sppg, 120);
    if (!nama) return res.status(400).json({ error: 'Nama SPPG wajib diisi' });

    const existing = await db.get('SELECT id_user FROM profil_mbg WHERE id_user = ?', [req.user.id]);
    const kapasitas =
      kapasitas_porsi_harian != null && kapasitas_porsi_harian !== ''
        ? Math.max(0, Math.floor(Number(kapasitas_porsi_harian)) || 0)
        : null;

    if (existing) {
      await db.run(
        `UPDATE profil_mbg SET nama_sppg = ?, alamat = ?, lat = ?, lng = ?, kapasitas_porsi_harian = ?,
                penanggung_jawab = ?, kontak = ?, npwp = ? WHERE id_user = ?`,
        [
          nama,
          clampStr(alamat, 300),
          lat != null && lat !== '' && Number.isFinite(Number(lat)) ? Number(lat) : null,
          lng != null && lng !== '' && Number.isFinite(Number(lng)) ? Number(lng) : null,
          kapasitas,
          clampStr(penanggung_jawab, 120),
          clampStr(kontak, 60),
          clampStr(npwp, 60),
          req.user.id,
        ]
      );
    } else {
      await db.run(
        `INSERT INTO profil_mbg (id_user, nama_sppg, alamat, lat, lng, kapasitas_porsi_harian, penanggung_jawab, kontak, npwp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          nama,
          clampStr(alamat, 300),
          lat != null && lat !== '' && Number.isFinite(Number(lat)) ? Number(lat) : null,
          lng != null && lng !== '' && Number.isFinite(Number(lng)) ? Number(lng) : null,
          kapasitas,
          clampStr(penanggung_jawab, 120),
          clampStr(kontak, 60),
          clampStr(npwp, 60),
        ]
      );
    }
    await audit(req.user.id, existing ? 'UPDATE_MBG_PROFILE' : 'CREATE_MBG_PROFILE', 'profil_mbg', req.user.id, {
      nama_sppg: nama,
    });
    const row = await db.get('SELECT * FROM profil_mbg WHERE id_user = ?', [req.user.id]);
    res.status(201).json({ message: 'Profil MBG tersimpan', profil: row });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
