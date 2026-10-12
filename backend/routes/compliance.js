const express = require('express');
const db = require('../db');
const { authenticate, requireActive } = require('../middleware');
const { loadConfig } = require('../lib/klasifikasi');

const router = express.Router();

router.use(authenticate, requireActive);

async function ambangKeyakinan() {
  const cfg = loadConfig();
  return Number(cfg.klasifikasi?.ambang_keyakinan ?? 0.6);
}

async function regulasiAktif() {
  const row = await db.get(
    `SELECT * FROM konfigurasi_regulasi WHERE aktif ORDER BY id_konfigurasi LIMIT 1`
  );
  if (!row) return null;
  let aturan = row.aturan;
  try {
    aturan = JSON.parse(row.aturan);
  } catch {
    /* aturan bukan JSON valid — biarkan string */
  }
  return { ...row, aturan };
}

// FR-14: ringkasan kepatuhan
router.get('/summary', async (_req, res, next) => {
  try {
    const count = async (sql, params = []) => Number((await db.get(sql, params))?.c ?? 0);
    const sum = async (sql, params = []) => Number((await db.get(sql, params))?.v ?? 0);

    const aktif = `('dialokasikan','dijemput','terkirim','terverifikasi')`;
    const [kgDialihkan, kgTerverifikasi, alokasiTotal, alokasiAktif, alokasiTerverifikasi, alokasiDibatalkan,
      jumlahSampah, jumlahKlasifikasi, klasifikasiTerverifikasi, klasifikasiPerluVerifikasi, tpsTotal,
      kgDiolah] = await Promise.all([
      sum(`SELECT COALESCE(SUM(s.berat_kg), 0) AS v FROM alokasi a JOIN sampah_makanan s ON s.id_sampah = a.id_sampah WHERE a.status IN ${aktif}`),
      sum(`SELECT COALESCE(SUM(s.berat_kg), 0) AS v FROM alokasi a JOIN sampah_makanan s ON s.id_sampah = a.id_sampah WHERE a.status = 'terverifikasi'`),
      count('SELECT COUNT(*) AS c FROM alokasi'),
      count(`SELECT COUNT(*) AS c FROM alokasi WHERE status IN ${aktif}`),
      count(`SELECT COUNT(*) AS c FROM alokasi WHERE status = 'terverifikasi'`),
      count(`SELECT COUNT(*) AS c FROM alokasi WHERE status = 'dibatalkan'`),
      count('SELECT COUNT(*) AS c FROM sampah_makanan'),
      count('SELECT COUNT(*) AS c FROM klasifikasi_sampah'),
      count('SELECT COUNT(*) AS c FROM klasifikasi_sampah WHERE diverifikasi_oleh IS NOT NULL'),
      count(
        `SELECT COUNT(*) AS c FROM klasifikasi_sampah k
          WHERE k.id_klasifikasi = (SELECT MAX(k2.id_klasifikasi) FROM klasifikasi_sampah k2 WHERE k2.id_sampah = k.id_sampah)
            AND k.diverifikasi_oleh IS NULL AND k.skor_keyakinan < ?`,
        [await ambangKeyakinan()]
      ),
      count('SELECT COUNT(*) AS c FROM tps_pengolah'),
      sum('SELECT COALESCE(SUM(p.input_kg), 0) AS v FROM pengolahan_log p'),
    ]);

    const tpsRows = await db.all('SELECT aktif FROM tps_pengolah');
    const tpsAktif = tpsRows.filter((r) => !(r.aktif === false || r.aktif === 0 || r.aktif === '0')).length;
    const outputRows = await db.all(
      `SELECT p.output_jenis, COUNT(*) AS jumlah, COALESCE(SUM(p.output_kg), 0) AS total_kg
         FROM pengolahan_log p WHERE p.output_jenis IS NOT NULL GROUP BY p.output_jenis`
    );
    const reg = await regulasiAktif();
    const aturan = reg?.aturan || {};
    const persenAlokasi = alokasiTotal > 0 ? Number(((alokasiAktif / alokasiTotal) * 100).toFixed(1)) : 0;
    const persenVerifikasi = jumlahKlasifikasi > 0 ? Number(((klasifikasiTerverifikasi / jumlahKlasifikasi) * 100).toFixed(1)) : 0;

    res.json({
      ringkasan: {
        kg_dialihkan: kgDialihkan,
        kg_terverifikasi: kgTerverifikasi,
        kg_diolah: kgDiolah,
        jumlah_sampah: jumlahSampah,
      },
      alokasi: {
        total: alokasiTotal,
        aktif: alokasiAktif,
        terverifikasi: alokasiTerverifikasi,
        dibatalkan: alokasiDibatalkan,
        persen_aktif: persenAlokasi,
      },
      tps: { total: tpsTotal, aktif: tpsAktif, radius_layanan_km: aturan.radius_layanan_km ?? 15 },
      klasifikasi: {
        total: jumlahKlasifikasi,
        terverifikasi_admin: klasifikasiTerverifikasi,
        perlu_verifikasi: klasifikasiPerluVerifikasi,
        persen_terverifikasi: persenVerifikasi,
        target_akurasi_persen: aturan.target_klasifikasi_akurasi_persen ?? 85,
      },
      pengolahan: outputRows.map((r) => ({
        output_jenis: r.output_jenis,
        jumlah: Number(r.jumlah || 0),
        total_kg: Number(r.total_kg || 0),
      })),
      target: {
        persen_alokasi: aturan.target_alokasi_persen ?? 85,
        realisasi_persen: persenAlokasi,
      },
      regulasi: reg ? { id_konfigurasi: reg.id_konfigurasi, nama_regulasi: reg.nama_regulasi, kode_daerah: reg.kode_daerah } : null,
      dihasilkan_pada: new Date().toISOString(),
    });
  } catch (e) {
    next(e);
  }
});

// FR-14: laporan ketertelusuran (maks 500 baris terbaru)
router.get('/report', async (_req, res, next) => {
  try {
    const rows = await db.all(
      `SELECT a.id_alokasi, a.waktu_alokasi, a.status, a.skor_matching, a.jarak_km,
              s.id_sampah, s.nama_sampah, s.berat_kg, s.jenis_makanan, s.status AS status_sampah,
              k.kategori, k.tingkat_pembusukan, k.skor_keyakinan, k.diverifikasi_oleh,
              t.nama_tps, dn.nama AS nama_donor, c.nama AS nama_kurir,
              p.input_kg, p.output_kg, p.output_jenis, p.tanggal AS tanggal_pengolahan
         FROM alokasi a
         JOIN sampah_makanan s ON s.id_sampah = a.id_sampah
         JOIN tps_pengolah t ON t.id_user = a.id_tps
         LEFT JOIN user dn ON dn.id_user = s.id_donor
         LEFT JOIN user c ON c.id_user = a.id_kurir
         LEFT JOIN klasifikasi_sampah k
                ON k.id_klasifikasi = (SELECT MAX(k2.id_klasifikasi) FROM klasifikasi_sampah k2 WHERE k2.id_sampah = s.id_sampah)
         LEFT JOIN pengolahan_log p
                ON p.id_pengolahan = (SELECT MAX(p2.id_pengolahan) FROM pengolahan_log p2 WHERE p2.id_alokasi = a.id_alokasi)
        ORDER BY a.waktu_alokasi DESC
        LIMIT 500`
    );
    const reg = await regulasiAktif();
    res.json({
      jumlah: rows.length,
      batas: 500,
      regulasi: reg ? { nama_regulasi: reg.nama_regulasi, aturan: reg.aturan } : null,
      dihasilkan_pada: new Date().toISOString(),
      baris: rows,
    });
  } catch (e) {
    next(e);
  }
});

// FR-17: ketertelusuran satu entitas (id_alokasi atau id_sampah)
router.get('/trace/:id', async (req, res, next) => {
  try {
    let alo = await db.get('SELECT * FROM alokasi WHERE id_alokasi = ?', [req.params.id]);
    if (!alo) {
      alo = await db.get('SELECT * FROM alokasi WHERE id_sampah = ? ORDER BY id_alokasi DESC', [req.params.id]);
    }
    if (!alo) {
      const s = await db.get('SELECT id_sampah FROM sampah_makanan WHERE id_sampah = ?', [req.params.id]);
      if (!s) return res.status(404).json({ error: 'Entitas tidak ditemukan' });
      const [sampah, klasifikasi] = await Promise.all([
        db.get(
          `SELECT s.*, u.nama AS nama_donor FROM sampah_makanan s JOIN user u ON u.id_user = s.id_donor WHERE s.id_sampah = ?`,
          [s.id_sampah]
        ),
        db.all('SELECT * FROM klasifikasi_sampah WHERE id_sampah = ? ORDER BY id_klasifikasi DESC', [s.id_sampah]),
      ]);
      return res.json({ jenis: 'sampah', sampah, klasifikasi, alokasi: null, riwayat: [] });
    }

    const sampah = await db.get(
      `SELECT s.*, u.nama AS nama_donor FROM sampah_makanan s JOIN user u ON u.id_user = s.id_donor WHERE s.id_sampah = ?`,
      [alo.id_sampah]
    );
    const [klasifikasi, tps, kurir, donor, pengolahan, riwayat] = await Promise.all([
      db.all('SELECT * FROM klasifikasi_sampah WHERE id_sampah = ? ORDER BY id_klasifikasi DESC', [alo.id_sampah]),
      db.get(
        `SELECT t.*, u.nama, u.telepon, u.alamat, u.lat, u.lng FROM tps_pengolah t JOIN user u ON u.id_user = t.id_user WHERE t.id_user = ?`,
        [alo.id_tps]
      ),
      db.get('SELECT id_user, nama, telepon, lat, lng FROM user WHERE id_user = ?', [alo.id_kurir]),
      db.get('SELECT id_user, nama, telepon, alamat, lat, lng FROM user WHERE id_user = ?', [sampah?.id_donor]),
      db.all('SELECT * FROM pengolahan_log WHERE id_alokasi = ? ORDER BY tanggal DESC', [alo.id_alokasi]),
      db.all(
        `SELECT a.*, u.nama AS nama_pengguna FROM log_audit a LEFT JOIN user u ON u.id_user = a.id_user
          WHERE (a.entitas = 'alokasi' AND a.id_entitas = ?) OR (a.entitas = 'sampah_makanan' AND a.id_entitas = ?)
          ORDER BY a.id_log DESC`,
        [String(alo.id_alokasi), String(alo.id_sampah)]
      ),
    ]);

    res.json({
      jenis: 'alokasi',
      alokasi: { ...alo, rute: alo.rute_json ? JSON.parse(alo.rute_json) : null },
      sampah,
      klasifikasi,
      tps,
      kurir,
      donor,
      pengolahan,
      riwayat: riwayat.map((r) => ({ ...r, detail_obj: r.detail ? JSON.parse(r.detail) : null })),
    });
  } catch (e) {
    next(e);
  }
});

// FR-17: daftar regulasi aktif
router.get('/regulations', async (_req, res, next) => {
  try {
    const rows = await db.all('SELECT * FROM konfigurasi_regulasi ORDER BY id_konfigurasi');
    res.json(
      rows.map((r) => {
        let aturan = r.aturan;
        try {
          aturan = JSON.parse(r.aturan);
        } catch {
          /* biarkan string */
        }
        return { ...r, aturan };
      })
    );
  } catch (e) {
    next(e);
  }
});

module.exports = router;
