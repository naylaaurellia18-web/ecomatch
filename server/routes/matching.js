const express = require('express');
const db = require('../db');
const { computeMatches } = require('../lib/matching');
const { audit, notify } = require('../lib/audit');
const { authenticate, requireRole, requireActive } = require('../middleware');

const router = express.Router();

async function runMatching(actorId) {
  const startedAt = process.hrtime.bigint();

  const listings = await db.all(
    `SELECT l.*, u.nama AS nama_donor, u.lat AS lat_donor, u.lng AS lng_donor
     FROM surplus_makanan l JOIN user u ON u.id_user = l.id_donor
     WHERE l.status = 'tersedia' AND l.expiry_time > datetime('now')`
  );

  const needs = await db.all(
    `SELECT n.*, u.nama AS nama_penerima, u.lat AS lat_penerima, u.lng AS lng_penerima
     FROM kebutuhan_pangan n JOIN user u ON u.id_user = n.id_penerima
     WHERE n.status = 'terbuka'`
  );

  const couriers = await db.all(
    `SELECT u.* FROM user u
     WHERE u.role = 'kurir' AND u.status = 'aktif'
       AND u.id_user NOT IN (
         SELECT id_kurir FROM alokasi
         WHERE status IN ('diajukan','diterima','dijemput')
       )`
  );

  const matchedRows = await db.all(`SELECT id_makanan, id_kebutuhan FROM alokasi WHERE status != 'dibatalkan'`);
  const alreadyMatched = new Set(matchedRows.map((r) => r.id_makanan));
  const openNeeds = new Set(matchedRows.map((r) => r.id_kebutuhan));

  const filteredListings = listings.filter((l) => !alreadyMatched.has(l.id_makanan));
  const filteredNeeds = needs.filter((n) => !openNeeds.has(n.id_kebutuhan));

  const selected = await computeMatches({ listings: filteredListings, needs: filteredNeeds, couriers });

  const created = [];
  for (const m of selected) {
    const ins = await db.run(
      `INSERT INTO alokasi
        (id_makanan, id_kebutuhan, id_penerima, id_kurir, skor_matching, skor_masa_simpan, skor_jarak,
         skor_urgensi, skor_kapasitas, jarak_km, rute_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'diajukan')`,
      [
        m.id_makanan,
        m.id_kebutuhan,
        m.id_penerima,
        m.id_kurir,
        m.skor_matching,
        m.skor_masa_simpan,
        m.skor_jarak,
        m.skor_urgensi,
        m.skor_kapasitas,
        m.jarak_km,
        m.rute_json,
      ]
    );
    const alokasiId = ins.lastInsertRowid;

    await db.run(`UPDATE surplus_makanan SET status = 'dialokasikan' WHERE id_makanan = ?`, [m.id_makanan]);

    const listing = await db.get('SELECT * FROM surplus_makanan WHERE id_makanan = ?', [m.id_makanan]);
    const need = await db.get('SELECT * FROM kebutuhan_pangan WHERE id_kebutuhan = ?', [m.id_kebutuhan]);

    await notify(
      m.id_kurir,
      'Tugas Baru: Penjemputan Surplus',
      `Surplus "${listing.nama_makanan}" (${listing.jumlah_porsi} porsi) untuk "${need.judul}". Skor pencocokan ${(m.skor_matching * 100).toFixed(0)}%, jarak ${m.jarak_km} km.`,
      alokasiId
    );
    await notify(
      listing.id_donor,
      'Surplus Anda Sudah Dipasangkan',
      `"${listing.nama_makanan}" dialokasikan untuk ${need.judul}. Skor pencocokan ${(m.skor_matching * 100).toFixed(0)}%.`,
      alokasiId
    );
    await notify(
      need.id_penerima,
      'Bantuan Dialokasikan',
      `Kebutuhan "${need.judul}" dipenuhi dari donor. Menunggu pengantaran kurir.`,
      alokasiId
    );

    await audit(actorId, 'AUTO_MATCH', 'alokasi', alokasiId, {
      skor_matching: m.skor_matching,
      jarak_km: m.jarak_km,
      id_makanan: m.id_makanan,
      id_kebutuhan: m.id_kebutuhan,
      id_kurir: m.id_kurir,
    });
    created.push(alokasiId);
  }

  // TC-05: AI Matching tidak menemukan kandidat → notifikasi donor + log audit
  // (status surplus tetap 'tersedia' — tidak ada transisi ke 'gagal')
  if (created.length === 0 && filteredListings.length > 0) {
    const donorIds = [...new Set(filteredListings.map((l) => l.id_donor))];
    for (const donorId of donorIds) {
      const count = filteredListings.filter((l) => l.id_donor === donorId).length;
      await notify(
        donorId,
        'Belum Ada Kandidat Penerima',
        `${count} surplus Anda belum bisa dialokasikan (tidak ada penerima/kurir yang cocok dalam radius). Sistem akan mencoba lagi pada pencocokan berikutnya.`
      );
    }
    await audit(actorId, 'MATCH_NOT_FOUND', 'sistem', null, {
      kandidat_makanan: filteredListings.length,
      kandidat_kebutuhan: filteredNeeds.length,
      kandidat_kurir: couriers.length,
      donor_diberitahu: donorIds.length,
    });
  }

  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  await audit(actorId, 'RUN_MATCHING', 'sistem', null, {
    kandidat_makanan: filteredListings.length,
    kandidat_kebutuhan: filteredNeeds.length,
    kandidat_kurir: couriers.length,
    dibuat: created.length,
    durasi_ms: Number(durationMs.toFixed(2)),
    tanpa_kandidat: created.length === 0,
  });

  return {
    dibuat: created.length,
    durasi_ms: Number(durationMs.toFixed(2)),
    id_alokasi: created,
  };
}

router.use(authenticate);

router.post('/run', requireRole('admin'), requireActive, async (req, res, next) => {
  try {
    const result = await runMatching(req.user.id);
    res.json({ message: `Pencocokan selesai: ${result.dibuat} pencocokan dibuat`, ...result });
  } catch (e) {
    next(e);
  }
});

router.get('/', requireRole('admin', 'kurir', 'donor', 'penerima'), async (req, res, next) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      rows = await db.all(
        `SELECT m.*,
           l.nama_makanan, l.jenis_makanan, l.jumlah_porsi, l.expiry_time,
           dn.nama AS nama_donor, rn.nama AS nama_penerima, c.nama AS nama_kurir,
           n.judul AS judul_kebutuhan, n.urgensi
         FROM alokasi m
         JOIN surplus_makanan l ON l.id_makanan = m.id_makanan
         JOIN kebutuhan_pangan n ON n.id_kebutuhan = m.id_kebutuhan
         JOIN user dn ON dn.id_user = l.id_donor
         JOIN user rn ON rn.id_user = m.id_penerima
         JOIN user c ON c.id_user = m.id_kurir
         ORDER BY m.waktu_alokasi DESC`
      );
    } else if (req.user.role === 'kurir') {
      rows = await db.all(
        `SELECT m.*, l.nama_makanan, l.jenis_makanan, l.jumlah_porsi, l.expiry_time, l.foto_kondisi,
           dn.nama AS nama_donor, dn.telepon AS telepon_donor, dn.alamat AS alamat_donor, dn.lat AS lat_donor, dn.lng AS lng_donor,
           rn.nama AS nama_penerima, rn.telepon AS telepon_penerima, rn.alamat AS alamat_penerima,
           rn.lat AS lat_penerima, rn.lng AS lng_penerima,
           n.judul AS judul_kebutuhan, n.urgensi
         FROM alokasi m
         JOIN surplus_makanan l ON l.id_makanan = m.id_makanan
         JOIN kebutuhan_pangan n ON n.id_kebutuhan = m.id_kebutuhan
         JOIN user dn ON dn.id_user = l.id_donor
         JOIN user rn ON rn.id_user = m.id_penerima
         WHERE m.id_kurir = ?
         ORDER BY m.waktu_alokasi DESC`,
        [req.user.id]
      );
    } else if (req.user.role === 'donor') {
      rows = await db.all(
        `SELECT m.*, l.nama_makanan, l.jenis_makanan, l.jumlah_porsi, n.judul AS judul_kebutuhan,
           rn.nama AS nama_penerima, c.nama AS nama_kurir, n.urgensi
         FROM alokasi m
         JOIN surplus_makanan l ON l.id_makanan = m.id_makanan
         JOIN kebutuhan_pangan n ON n.id_kebutuhan = m.id_kebutuhan
         JOIN user rn ON rn.id_user = m.id_penerima
         JOIN user c ON c.id_user = m.id_kurir
         WHERE l.id_donor = ?
         ORDER BY m.waktu_alokasi DESC`,
        [req.user.id]
      );
    } else {
      rows = await db.all(
        `SELECT m.*, l.nama_makanan, l.jenis_makanan, l.jumlah_porsi, n.judul AS judul_kebutuhan,
           dn.nama AS nama_donor, c.nama AS nama_kurir, n.urgensi
         FROM alokasi m
         JOIN surplus_makanan l ON l.id_makanan = m.id_makanan
         JOIN kebutuhan_pangan n ON n.id_kebutuhan = m.id_kebutuhan
         JOIN user dn ON dn.id_user = l.id_donor
         JOIN user c ON c.id_user = m.id_kurir
         WHERE m.id_penerima = ?
         ORDER BY m.waktu_alokasi DESC`,
        [req.user.id]
      );
    }

    res.json(
      rows.map((r) => ({
        ...r,
        rute: r.rute_json ? JSON.parse(r.rute_json) : null,
        skor_persen: Number((r.skor_matching * 100).toFixed(1)),
      }))
    );
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const m = await db.get(
      `SELECT m.*, l.nama_makanan, l.jenis_makanan, l.jumlah_porsi, l.expiry_time, l.id_donor,
         n.judul AS judul_kebutuhan, n.urgensi
       FROM alokasi m
       JOIN surplus_makanan l ON l.id_makanan = m.id_makanan
       JOIN kebutuhan_pangan n ON n.id_kebutuhan = m.id_kebutuhan
       WHERE m.id_alokasi = ?`,
      [req.params.id]
    );
    if (!m) return res.status(404).json({ error: 'Pencocokan tidak ditemukan' });

    const isParticipant =
      req.user.role === 'admin' ||
      m.id_kurir === req.user.id ||
      m.id_donor === req.user.id ||
      m.id_penerima === req.user.id;
    if (!isParticipant) return res.status(403).json({ error: 'Bukan peserta pencocokan ini' });

    res.json({ ...m, rute: m.rute_json ? JSON.parse(m.rute_json) : null });
  } catch (e) {
    next(e);
  }
});

module.exports = { router, runMatching };
