const express = require('express');
const db = require('../db');
const { audit, notify } = require('../lib/audit');
const { authenticate, requireRole, requireActive } = require('../middleware');
const { runRouting, parseJenisDiterima } = require('../lib/routing');
const { terpakaiHariIniMap } = require('../lib/capacity');
const { loadConfig } = require('../lib/klasifikasi');

const router = express.Router();

router.use(authenticate, requireActive);

const SELECT_LIST = `
  SELECT a.*, s.nama_sampah, s.jenis_makanan, s.berat_kg, s.waktu_produksi, s.foto_url,
         s.status AS status_sampah, s.id_donor,
         t.nama_tps, t.jenis_pengolahan, t.radius_layanan_km,
         dn.nama AS nama_donor, dn.lat AS lat_donor, dn.lng AS lng_donor,
         c.nama AS nama_kurir, c.lat AS lat_kurir, c.lng AS lng_kurir,
         tp.lat AS lat_tps, tp.lng AS lng_tps,
         (SELECT k.kategori FROM klasifikasi_sampah k WHERE k.id_sampah = s.id_sampah ORDER BY k.id_klasifikasi DESC LIMIT 1) AS kategori,
         (SELECT k.tingkat_pembusukan FROM klasifikasi_sampah k WHERE k.id_sampah = s.id_sampah ORDER BY k.id_klasifikasi DESC LIMIT 1) AS tingkat_pembusukan
    FROM alokasi a
    JOIN sampah_makanan s ON s.id_sampah = a.id_sampah
    JOIN tps_pengolah t ON t.id_user = a.id_tps
    JOIN user tp ON tp.id_user = a.id_tps
    JOIN user dn ON dn.id_user = s.id_donor
    JOIN user c ON c.id_user = a.id_kurir`;

function serializeAlokasi(r) {
  return {
    ...r,
    rute: r.rute_json ? JSON.parse(r.rute_json) : null,
    skor_persen: Number((Number(r.skor_matching) * 100).toFixed(1)),
  };
}

/** Siapkan kandidat sampah / TPS / kurir untuk mesin routing (FR-04). */
async function dataRouting() {
  const sampahRows = await db.all(
    `SELECT s.id_sampah, s.nama_sampah, s.jenis_makanan, s.berat_kg, s.waktu_produksi, s.status,
            s.id_donor, u.nama AS nama_donor, u.lat AS lat_donor, u.lng AS lng_donor,
            (SELECT k.kategori FROM klasifikasi_sampah k WHERE k.id_sampah = s.id_sampah ORDER BY k.id_klasifikasi DESC LIMIT 1) AS kategori,
            (SELECT k.tingkat_pembusukan FROM klasifikasi_sampah k WHERE k.id_sampah = s.id_sampah ORDER BY k.id_klasifikasi DESC LIMIT 1) AS tingkat_pembusukan
       FROM sampah_makanan s JOIN user u ON u.id_user = s.id_donor
      WHERE s.status = 'tersedia'
        AND s.id_sampah NOT IN (SELECT id_sampah FROM alokasi WHERE status != 'dibatalkan')`
  );

  const tpsRows = await db.all(
    `SELECT t.id_user AS id_tps, t.nama_tps, t.kapasitas_kg_hari, t.jenis_diterima, t.aktif, t.radius_layanan_km,
            u.nama AS nama_pengguna, u.lat, u.lng, u.status
       FROM tps_pengolah t JOIN user u ON u.id_user = t.id_user
      WHERE u.status = 'aktif'`
  );
  const terpakai = await terpakaiHariIniMap();

  const tps = [];
  for (const t of tpsRows) {
    if (t.lat == null || t.lng == null) continue;
    const terpakaiTps = terpakai.get(Number(t.id_tps)) || 0;
    const sisa = Math.max(0, Number(t.kapasitas_kg_hari || 0) - terpakaiTps);
    if (sisa <= 0) continue;
    tps.push({
      id_tps: Number(t.id_tps),
      nama_tps: t.nama_tps,
      lat: Number(t.lat),
      lng: Number(t.lng),
      jenis_diterima: parseJenisDiterima(t.jenis_diterima),
      kapasitas_kg_hari: Number(t.kapasitas_kg_hari || 0),
      sisa_kapasitas_kg: sisa,
      radius_layanan_km: Number(t.radius_layanan_km || 15),
      aktif: t.aktif,
    });
  }

  const kurirRows = await db.all(
    `SELECT id_user AS id_kurir, nama, lat, lng, kapasitas
       FROM user
      WHERE role = 'kurir' AND status = 'aktif'
        AND lat IS NOT NULL AND lng IS NOT NULL
        AND id_user NOT IN (SELECT id_kurir FROM alokasi WHERE status IN ('dialokasikan','dijemput','terkirim'))`
  );
  const kurir = kurirRows
    .map((k) => ({ ...k, lat: Number(k.lat), lng: Number(k.lng), kapasitas: Number(k.kapasitas || 0) }))
    .filter((k) => k.kapasitas > 0);

  const sampah = sampahRows
    .map((s) => ({ ...s, lat: s.lat_donor, lng: s.lng_donor }))
    .filter((s) => s.lat != null && s.lng != null);

  return { sampah, tps, kurir };
}

// FR-04: jalankan routing (admin) -> alokasi + notifikasi + log audit
router.post('/run', requireRole('admin'), async (req, res, next) => {
  try {
    const startedAt = process.hrtime.bigint();
    const { sampah, tps, kurir } = await dataRouting();
    const hasil = await runRouting({ sampah, tps, kurir });

    const created = [];
    for (const a of hasil.alokasi) {
      try {
        const ins = await db.run(
          `INSERT INTO alokasi
             (id_sampah, id_tps, id_kurir, skor_matching, skor_jenis_cocok, skor_kapasitas, skor_jarak,
              skor_urgensi, jarak_km, rute_json, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dialokasikan')`,
          [
            a.id_sampah,
            a.id_tps,
            a.id_kurir,
            a.skor_matching,
            a.skor_jenis_cocok,
            a.skor_kapasitas,
            a.skor_jarak,
            a.skor_urgensi,
            a.jarak_km,
            a.rute_json || null,
          ]
        );
        const idAlokasi = ins.lastInsertRowid;
        await db.run(`UPDATE sampah_makanan SET status = 'dialokasikan' WHERE id_sampah = ?`, [a.id_sampah]);
        created.push(idAlokasi);

        const s = sampah.find((x) => x.id_sampah === a.id_sampah);
        const t = tps.find((x) => x.id_tps === a.id_tps);
        const skorPersen = (Number(a.skor_matching) * 100).toFixed(0);
        await notify(
          s?.id_donor,
          'Sampah Dialokasikan ke TPS Pengolah',
          `"${s?.nama_sampah}" (${s?.berat_kg} kg) dialokasikan ke ${t?.nama_tps}. Skor routing ${skorPersen}%, jarak ${a.jarak_km} km.`,
          idAlokasi
        );
        await notify(
          a.id_tps,
          'Alokasi Sampah Masuk',
          `TPS menerima alokasi "${s?.nama_sampah}" (${s?.berat_kg} kg) dari dapur MBG. Menunggu penjemputan kurir.`,
          idAlokasi
        );
        await notify(
          a.id_kurir,
          'Tugas Baru: Penjemputan Sampah',
          `Jemput "${s?.nama_sampah}" (${s?.berat_kg} kg), antar ke ${t?.nama_tps}. Jarak ${a.jarak_km} km.`,
          idAlokasi
        );
        await audit(req.user.id, 'ROUTE_WASTE', 'alokasi', idAlokasi, {
          id_sampah: a.id_sampah,
          id_tps: a.id_tps,
          id_kurir: a.id_kurir,
          skor_matching: a.skor_matching,
          jarak_km: a.jarak_km,
          mesin: hasil.mesin,
        });
      } catch (e) {
        console.error(`routing: alokasi sampah ${a.id_sampah} gagal disimpan:`, e.message);
      }
    }

    // Tidak ada alokasi terbentuk -> beri tahu donor + catat audit (TC-05)
    if (created.length === 0 && sampah.length > 0) {
      const donorIds = [...new Set(sampah.map((s) => s.id_donor))];
      for (const donorId of donorIds) {
        const jumlah = sampah.filter((s) => s.id_donor === donorId).length;
        await notify(
          donorId,
          'Belum Ada TPS yang Cocok',
          `${jumlah} sampah Anda belum bisa dialokasikan (di luar radius, kapasitas penuh, atau tidak ada kurir). Sistem mencoba lagi pada routing berikutnya.`
        );
      }
      await audit(req.user.id, 'ROUTE_NOT_FOUND', 'sistem', null, {
        kandidat_sampah: sampah.length,
        kandidat_tps: tps.length,
        kandidat_kurir: kurir.length,
        donor_diberitahu: donorIds.length,
      });
    }

    const durasiMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    await audit(req.user.id, 'RUN_ROUTING', 'sistem', null, {
      kandidat_sampah: sampah.length,
      kandidat_tps: tps.length,
      kandidat_kurir: kurir.length,
      dibuat: created.length,
      durasi_ms: Number(durasiMs.toFixed(2)),
      mesin: hasil.mesin,
      tanpa_kandidat: created.length === 0,
    });

    res.json({
      message: `Routing selesai: ${created.length} alokasi dibuat`,
      dibuat: created.length,
      durasi_ms: Number(durasiMs.toFixed(2)),
      mesin: hasil.mesin,
      id_alokasi: created,
      rata_rata_skor: hasil.rata_rata_skor,
      kandidat: hasil.kandidat,
      kandidat_gugur: hasil.kandidat_gugur,
      kandidat_input: hasil.kandidat_input,
    });
  } catch (e) {
    next(e);
  }
});

// Daftar alokasi sesuai peran
router.get('/', requireRole('admin', 'kurir', 'donor_mbg', 'tps_pengolah'), async (req, res, next) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      rows = await db.all(`${SELECT_LIST} ORDER BY a.waktu_alokasi DESC`);
    } else if (req.user.role === 'kurir') {
      rows = await db.all(`${SELECT_LIST} WHERE a.id_kurir = ? ORDER BY a.waktu_alokasi DESC`, [req.user.id]);
    } else if (req.user.role === 'donor_mbg') {
      rows = await db.all(`${SELECT_LIST} WHERE s.id_donor = ? ORDER BY a.waktu_alokasi DESC`, [req.user.id]);
    } else {
      rows = await db.all(`${SELECT_LIST} WHERE a.id_tps = ? ORDER BY a.waktu_alokasi DESC`, [req.user.id]);
    }
    res.json(rows.map(serializeAlokasi));
  } catch (e) {
    next(e);
  }
});

// FR-04: penjelasan keputusan routing
router.get('/:id/explain', async (req, res, next) => {
  try {
    const row = await db.get(`${SELECT_LIST} WHERE a.id_alokasi = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Alokasi tidak ditemukan' });

    const isParticipant =
      req.user.role === 'admin' ||
      row.id_kurir === req.user.id ||
      row.id_donor === req.user.id ||
      row.id_tps === req.user.id;
    if (!isParticipant) return res.status(403).json({ error: 'Bukan peserta alokasi ini' });

    const config = loadConfig();
    const bobot = config.bobot || {};
    const kontribusi = {
      jenis_cocok: Number((Number(bobot.jenis_cocok) * Number(row.skor_jenis_cocok)).toFixed(4)),
      kapasitas: Number((Number(bobot.kapasitas) * Number(row.skor_kapasitas)).toFixed(4)),
      jarak: Number((Number(bobot.jarak) * Number(row.skor_jarak)).toFixed(4)),
      urgensi: Number((Number(bobot.urgensi) * Number(row.skor_urgensi)).toFixed(4)),
    };
    const klasifikasi = await db.get(
      `SELECT * FROM klasifikasi_sampah WHERE id_sampah = ? ORDER BY id_klasifikasi DESC LIMIT 1`,
      [row.id_sampah]
    );
    const terpakai = (await terpakaiHariIniMap()).get(Number(row.id_tps)) || 0;

    res.json({
      alokasi: serializeAlokasi(row),
      bobot,
      radius_layanan_km: config.radius_layanan_km,
      batas_skor: config.batas_skor,
      sla_routing_detik: config.sla?.routing_detik,
      rumus: 'skor = 0,35×jenis_cocok + 0,25×kapasitas + 0,25×jarak + 0,15×urgensi',
      kontribusi,
      sub_skor: {
        jenis_cocok: row.skor_jenis_cocok,
        kapasitas: row.skor_kapasitas,
        jarak: row.skor_jarak,
        urgensi: row.skor_urgensi,
        total: row.skor_matching,
      },
      klasifikasi,
      tps: {
        id_tps: row.id_tps,
        nama_tps: row.nama_tps,
        jenis_pengolahan: row.jenis_pengolahan,
        radius_layanan_km: row.radius_layanan_km,
        lat: row.lat_tps,
        lng: row.lng_tps,
        terpakai_kg_hari_ini: terpakai,
      },
      kurir: { id_kurir: row.id_kurir, nama: row.nama_kurir, lat: row.lat_kurir, lng: row.lng_kurir },
      sumber: { mesin: null, keterangan: 'Sub-skor tersimpan saat routing dijalankan' },
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
