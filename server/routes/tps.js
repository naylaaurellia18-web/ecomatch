const express = require('express');
const db = require('../db');
const { audit } = require('../lib/audit');
const { authenticate, requireRole, requireActive } = require('../middleware');
const { clampStr } = require('../lib/validate');
const { terpakaiHariIniMap } = require('../lib/capacity');
const { parseJenisDiterima } = require('../lib/routing');

const router = express.Router();

const JENIS_TPS = ['tps_3r', 'tps_komposter', 'tps_maggot', 'tps_eco_enzyme', 'bank_sampah', 'lainnya'];
const JENIS_PENGOLAHAN = ['komposter', 'maggot_bsf', 'eco_enzyme', 'bank_sampah', 'lainnya'];
const OUTPUT_JENIS = ['kompos', 'pupuk_cair', 'pakan_ternak', 'eco_enzyme', 'lainnya'];
const JENIS_DITERIMA_DEFAULT = ['sisa_nasi', 'sayur', 'lauk', 'kulit_buah', 'campuran', 'lainnya'];

router.use(authenticate, requireActive);

function numOrNull(v, { min = null, max = null } = {}) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (min != null && n < min) return null;
  if (max != null && n > max) return null;
  return n;
}

function serializeTps(row, terpakai) {
  const kapasitas = Number(row.kapasitas_kg_hari || 0);
  return {
    ...row,
    aktif: !(row.aktif === false || row.aktif === 0 || row.aktif === '0'),
    jenis_diterima: parseJenisDiterima(row.jenis_diterima),
    kapasitas_kg_hari: kapasitas,
    terpakai_kg_hari_ini: terpakai,
    sisa_kapasitas_kg: Math.max(0, kapasitas - terpakai),
  };
}

async function loadTps(idTps) {
  return db.get(
    `SELECT t.*, u.nama, u.telepon, u.alamat, u.lat, u.lng, u.email, u.status
       FROM tps_pengolah t JOIN user u ON u.id_user = t.id_user
      WHERE t.id_user = ?`,
    [idTps]
  );
}

// FR-03: profil TPS sendiri
router.get('/me', requireRole('tps_pengolah', 'admin'), async (req, res, next) => {
  try {
    const row = await loadTps(req.user.id);
    if (!row) return res.status(404).json({ error: 'Profil TPS belum terdaftar. Daftarkan lewat POST /api/tps/register' });
    const terpakai = (await terpakaiHariIniMap()).get(Number(req.user.id)) || 0;
    res.json(serializeTps(row, terpakai));
  } catch (e) {
    next(e);
  }
});

// FR-03: perbarui profil TPS sendiri
router.patch('/me', requireRole('tps_pengolah', 'admin'), async (req, res, next) => {
  try {
    const row = await loadTps(req.user.id);
    if (!row) return res.status(404).json({ error: 'Profil TPS belum terdaftar' });

    const {
      nama_tps,
      jenis_tps,
      jenis_pengolahan,
      kapasitas_kg_hari,
      jenis_diterima,
      radius_layanan_km,
      izin_operasional,
      aktif,
      lat,
      lng,
      alamat,
      telepon,
    } = req.body || {};

    const fields = [];
    const params = [];
    if (nama_tps != null) {
      const v = clampStr(nama_tps, 120);
      if (!v) return res.status(400).json({ error: 'Nama TPS tidak boleh kosong' });
      fields.push('nama_tps = ?');
      params.push(v);
    }
    if (jenis_tps != null) {
      if (!JENIS_TPS.includes(jenis_tps)) return res.status(400).json({ error: 'Jenis TPS tidak valid' });
      fields.push('jenis_tps = ?');
      params.push(jenis_tps);
    }
    if (jenis_pengolahan != null) {
      if (!JENIS_PENGOLAHAN.includes(jenis_pengolahan)) return res.status(400).json({ error: 'Jenis pengolahan tidak valid' });
      fields.push('jenis_pengolahan = ?');
      params.push(jenis_pengolahan);
    }
    if (kapasitas_kg_hari != null && kapasitas_kg_hari !== '') {
      const v = numOrNull(kapasitas_kg_hari, { min: 0, max: 100000 });
      if (v == null) return res.status(400).json({ error: 'Kapasitas (kg/hari) tidak valid' });
      fields.push('kapasitas_kg_hari = ?');
      params.push(v);
    }
    if (jenis_diterima != null) {
      const list = Array.isArray(jenis_diterima)
        ? jenis_diterima.map(String)
        : parseJenisDiterima(jenis_diterima);
      if (!list.length) return res.status(400).json({ error: 'jenis_diterima harus berupa daftar kategori' });
      fields.push('jenis_diterima = ?');
      params.push(JSON.stringify(list));
    }
    if (radius_layanan_km != null && radius_layanan_km !== '') {
      const v = numOrNull(radius_layanan_km, { min: 0, max: 100 });
      if (v == null) return res.status(400).json({ error: 'Radius layanan (km) tidak valid' });
      fields.push('radius_layanan_km = ?');
      params.push(v);
    }
    if (izin_operasional != null) {
      fields.push('izin_operasional = ?');
      params.push(clampStr(izin_operasional, 200));
    }
    if (aktif != null) {
      fields.push('aktif = ?');
      params.push(aktif === true || aktif === 1 || aktif === '1' ? 1 : 0);
    }
    if (fields.length) {
      params.push(req.user.id);
      await db.run(`UPDATE tps_pengolah SET ${fields.join(', ')} WHERE id_user = ?`, params);
    }

    // Koordinat/alamat ada di tabel user
    const userFields = [];
    const userParams = [];
    const latBaru = numOrNull(lat);
    const lngBaru = numOrNull(lng);
    if (latBaru != null && lngBaru != null) {
      userFields.push('lat = ?', 'lng = ?');
      userParams.push(latBaru, lngBaru);
    }
    if (alamat != null) {
      userFields.push('alamat = ?');
      userParams.push(clampStr(alamat, 300));
    }
    if (telepon != null) {
      userFields.push('telepon = ?');
      userParams.push(clampStr(telepon, 30));
    }
    if (userFields.length) {
      userParams.push(req.user.id);
      await db.run(`UPDATE user SET ${userFields.join(', ')} WHERE id_user = ?`, userParams);
    }
    if (!fields.length && !userFields.length) {
      return res.status(400).json({ error: 'Tidak ada perubahan yang dikirim' });
    }

    await audit(req.user.id, 'UPDATE_TPS_PROFILE', 'tps_pengolah', req.user.id, {
      diubah: fields.map((f) => f.split(' =')[0]),
      user: userFields.map((f) => f.split(' =')[0]),
    });
    const updated = await loadTps(req.user.id);
    const terpakai = (await terpakaiHariIniMap()).get(Number(req.user.id)) || 0;
    res.json({ message: 'Profil TPS diperbarui', tps: serializeTps(updated, terpakai) });
  } catch (e) {
    next(e);
  }
});

// FR-12: pendaftaran TPS baru
router.post('/register', requireRole('tps_pengolah', 'admin'), async (req, res, next) => {
  try {
    const { id_user, nama_tps, jenis_tps, jenis_pengolahan, kapasitas_kg_hari, jenis_diterima, radius_layanan_km, izin_operasional, lat, lng } =
      req.body || {};
    const targetId = req.user.role === 'admin' && id_user != null && id_user !== '' ? Number(id_user) : req.user.id;

    const existing = await db.get('SELECT id_user FROM tps_pengolah WHERE id_user = ?', [targetId]);
    if (existing) return res.status(409).json({ error: 'TPS sudah terdaftar' });
    const user = await db.get('SELECT id_user, nama, role, lat, lng FROM user WHERE id_user = ?', [targetId]);
    if (!user) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    if (req.user.role !== 'admin' && user.role !== 'tps_pengolah') {
      return res.status(403).json({ error: 'Hanya akun berperan tps_pengolah' });
    }

    const nama = clampStr(nama_tps, 120) || `${user.nama} TPS`;
    const kapasitas = numOrNull(kapasitas_kg_hari, { min: 0, max: 100000 }) ?? 100;
    const list = Array.isArray(jenis_diterima) && jenis_diterima.length ? jenis_diterima.map(String) : JENIS_DITERIMA_DEFAULT;
    const radius = numOrNull(radius_layanan_km, { min: 0, max: 100 }) ?? 15;

    await db.run(
      `INSERT INTO tps_pengolah (id_user, nama_tps, jenis_tps, jenis_pengolahan, kapasitas_kg_hari, jenis_diterima, radius_layanan_km, izin_operasional)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        targetId,
        nama,
        JENIS_TPS.includes(jenis_tps) ? jenis_tps : 'tps_3r',
        JENIS_PENGOLAHAN.includes(jenis_pengolahan) ? jenis_pengolahan : 'komposter',
        kapasitas,
        JSON.stringify(list),
        radius,
        clampStr(izin_operasional, 200),
      ]
    );

    const latBaru = numOrNull(lat);
    const lngBaru = numOrNull(lng);
    if (latBaru != null && lngBaru != null) {
      await db.run('UPDATE user SET lat = ?, lng = ? WHERE id_user = ?', [latBaru, lngBaru, targetId]);
    }

    await audit(req.user.id, 'REGISTER_TPS', 'tps_pengolah', targetId, { nama_tps: nama, kapasitas_kg_hari: kapasitas });
    res.status(201).json({ message: 'TPS terdaftar', id_user: targetId, nama_tps: nama });
  } catch (e) {
    next(e);
  }
});

// FR-12: daftar TPS (untuk routing/UI)
router.get('/list', async (_req, res, next) => {
  try {
    const rows = await db.all(
      `SELECT t.*, u.nama, u.alamat, u.telepon, u.lat, u.lng, u.status
         FROM tps_pengolah t JOIN user u ON u.id_user = t.id_user
        ORDER BY t.nama_tps`
    );
    const map = await terpakaiHariIniMap();
    res.json(rows.map((r) => serializeTps(r, map.get(Number(r.id_user)) || 0)));
  } catch (e) {
    next(e);
  }
});

// FR-12: log pengolahan satu alokasi (oleh TPS penerima)
router.post('/:id/log', requireRole('tps_pengolah', 'admin'), async (req, res, next) => {
  try {
    const tpsId = Number(req.params.id);
    const { id_alokasi, input_kg, output_kg, output_jenis, foto_bukti } = req.body || {};
    if (id_alokasi == null || id_alokasi === '') {
      return res.status(400).json({ error: 'id_alokasi wajib diisi' });
    }
    if (req.user.role !== 'admin' && tpsId !== req.user.id) {
      return res.status(403).json({ error: 'Hanya TPS terkait yang boleh mencatat' });
    }

    const alokasi = await db.get('SELECT * FROM alokasi WHERE id_alokasi = ?', [id_alokasi]);
    if (!alokasi) return res.status(404).json({ error: 'Alokasi tidak ditemukan' });
    if (alokasi.id_tps !== tpsId) {
      return res.status(403).json({ error: 'Alokasi bukan untuk TPS ini' });
    }
    if (!['terkirim', 'terverifikasi'].includes(alokasi.status)) {
      return res.status(400).json({ error: `Alokasi berstatus ${alokasi.status} — belum bisa dicatat (harus terkirim/terverifikasi)` });
    }

    const input = Number(input_kg);
    if (!Number.isFinite(input) || input < 0) {
      return res.status(400).json({ error: 'input_kg wajib angka >= 0' });
    }
    const output = output_kg != null && output_kg !== '' ? Number(output_kg) : null;
    if (output != null && (!Number.isFinite(output) || output < 0)) {
      return res.status(400).json({ error: 'output_kg harus angka >= 0' });
    }
    if (output_jenis != null && output_jenis !== '' && !OUTPUT_JENIS.includes(output_jenis)) {
      return res.status(400).json({ error: `output_jenis harus salah satu dari: ${OUTPUT_JENIS.join(', ')}` });
    }

    const result = await db.run(
      `INSERT INTO pengolahan_log (id_alokasi, input_kg, output_kg, output_jenis, foto_bukti)
       VALUES (?, ?, ?, ?, ?)`,
      [alokasi.id_alokasi, input, output, output_jenis || null, clampStr(foto_bukti, 500)]
    );
    await audit(req.user.id, 'LOG_PENGOLAHAN', 'pengolahan_log', result.lastInsertRowid, {
      id_alokasi: alokasi.id_alokasi,
      id_tps: tpsId,
      input_kg: input,
      output_kg: output,
      output_jenis: output_jenis || null,
    });
    res.status(201).json({ id_pengolahan: result.lastInsertRowid, message: 'Log pengolahan dicatat' });
  } catch (e) {
    next(e);
  }
});

// FR-12: dashboard TPS
router.get('/:id/dashboard', requireRole('tps_pengolah', 'admin'), async (req, res, next) => {
  try {
    const tpsId = Number(req.params.id);
    if (req.user.role !== 'admin' && tpsId !== req.user.id) {
      return res.status(403).json({ error: 'Bukan dashboard Anda' });
    }
    const tps = await loadTps(tpsId);
    if (!tps) return res.status(404).json({ error: 'TPS tidak ditemukan' });

    const [dialokasikan, dijemput, terkirim, terverifikasi, dibatalkan, kgMasuk, kgDiolah, outputRows, riwayat] =
      await Promise.all([
        db.get(`SELECT COUNT(*) AS c FROM alokasi WHERE id_tps = ? AND status = 'dialokasikan'`, [tpsId]),
        db.get(`SELECT COUNT(*) AS c FROM alokasi WHERE id_tps = ? AND status = 'dijemput'`, [tpsId]),
        db.get(`SELECT COUNT(*) AS c FROM alokasi WHERE id_tps = ? AND status = 'terkirim'`, [tpsId]),
        db.get(`SELECT COUNT(*) AS c FROM alokasi WHERE id_tps = ? AND status = 'terverifikasi'`, [tpsId]),
        db.get(`SELECT COUNT(*) AS c FROM alokasi WHERE id_tps = ? AND status = 'dibatalkan'`, [tpsId]),
        db.get(
          `SELECT COALESCE(SUM(s.berat_kg), 0) AS c FROM alokasi a
             JOIN sampah_makanan s ON s.id_sampah = a.id_sampah
            WHERE a.id_tps = ? AND a.status != 'dibatalkan'`,
          [tpsId]
        ),
        db.get(
          `SELECT COALESCE(SUM(p.input_kg), 0) AS c FROM pengolahan_log p
             JOIN alokasi a ON a.id_alokasi = p.id_alokasi
            WHERE a.id_tps = ?`,
          [tpsId]
        ),
        db.all(
          `SELECT p.output_jenis, COUNT(*) AS jumlah, COALESCE(SUM(p.output_kg), 0) AS total_kg
             FROM pengolahan_log p JOIN alokasi a ON a.id_alokasi = p.id_alokasi
            WHERE a.id_tps = ? AND p.output_jenis IS NOT NULL
            GROUP BY p.output_jenis`,
          [tpsId]
        ),
        db.all(
          `SELECT p.*, a.status AS status_alokasi, s.nama_sampah, s.berat_kg
             FROM pengolahan_log p
             JOIN alokasi a ON a.id_alokasi = p.id_alokasi
             JOIN sampah_makanan s ON s.id_sampah = a.id_sampah
            WHERE a.id_tps = ?
            ORDER BY p.tanggal DESC LIMIT 10`,
          [tpsId]
        ),
      ]);

    const terpakai = (await terpakaiHariIniMap()).get(tpsId) || 0;
    res.json({
      tps: serializeTps(tps, terpakai),
      alokasi: {
        dialokasikan: Number(dialokasikan.c || 0),
        dijemput: Number(dijemput.c || 0),
        terkirim: Number(terkirim.c || 0),
        terverifikasi: Number(terverifikasi.c || 0),
        dibatalkan: Number(dibatalkan.c || 0),
      },
      kg_masuk: Number(kgMasuk.c || 0),
      kg_diolah: Number(kgDiolah.c || 0),
      output: outputRows.map((r) => ({
        output_jenis: r.output_jenis,
        jumlah: Number(r.jumlah || 0),
        total_kg: Number(r.total_kg || 0),
      })),
      riwayat_pengolahan: riwayat,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
