const express = require('express');
const db = require('../db');
const { audit, notify } = require('../lib/audit');
const { channelStatus } = require('../lib/channels');
const { wipeTransactional } = require('../seed');
const { authenticate, requireRole, requireActive } = require('../middleware');
const { clampStr } = require('../lib/validate');
const { loadConfig } = require('../lib/klasifikasi');

const router = express.Router();

const STATUS_AKTIF = `('dialokasikan','dijemput','terkirim','terverifikasi')`;
const JENIS_REGULASI = ['perda', 'pergub', 'surat_edaran', 'lainnya'];

router.use(authenticate, requireRole('admin'), requireActive);

function parseAturan(value) {
  if (value == null || value === '') return JSON.stringify({});
  if (typeof value === 'object') return JSON.stringify(value);
  const s = String(value).trim();
  try {
    JSON.parse(s);
    return s;
  } catch {
    return null;
  }
}

// FR-09: statistik dampak
router.get('/stats', async (req, res, next) => {
  try {
    const count = async (sql, params = []) => Number((await db.get(sql, params))?.c ?? 0);
    const sum = async (sql, params = []) => Number((await db.get(sql, params))?.v ?? 0);
    const cfg = loadConfig();
    const ambang = Number(cfg.klasifikasi?.ambang_keyakinan ?? 0.6);

    const kgDialihkan = await sum(
      `SELECT COALESCE(SUM(s.berat_kg), 0) AS v FROM alokasi a JOIN sampah_makanan s ON s.id_sampah = a.id_sampah WHERE a.status IN ${STATUS_AKTIF}`
    );
    const kgTerverifikasi = await sum(
      `SELECT COALESCE(SUM(s.berat_kg), 0) AS v FROM alokasi a JOIN sampah_makanan s ON s.id_sampah = a.id_sampah WHERE a.status = 'terverifikasi'`
    );
    const kgDiolah = await sum('SELECT COALESCE(SUM(input_kg), 0) AS v FROM pengolahan_log');
    const avgScore = await sum('SELECT COALESCE(AVG(skor_matching), 0) AS v FROM alokasi');
    const avgDistance = await sum('SELECT COALESCE(AVG(jarak_km), 0) AS v FROM alokasi');

    const perfRows = await db.all(
      `SELECT detail FROM log_audit WHERE aksi = 'RUN_ROUTING' ORDER BY id_log DESC LIMIT 10`
    );
    const routingPerf = perfRows
      .map((r) => {
        try {
          return JSON.parse(r.detail || '{}');
        } catch {
          return {};
        }
      })
      .filter((r) => r.durasi_ms != null);

    const tpsRows = await db.all('SELECT aktif FROM tps_pengolah');
    const tpsAktif = tpsRows.filter((r) => !(r.aktif === false || r.aktif === 0 || r.aktif === '0')).length;

    res.json({
      users: {
        total: await count('SELECT COUNT(*) AS c FROM user'),
        menunggu: await count(`SELECT COUNT(*) AS c FROM user WHERE status = 'menunggu'`),
        aktif: await count(`SELECT COUNT(*) AS c FROM user WHERE status = 'aktif'`),
        donor_mbg: await count(`SELECT COUNT(*) AS c FROM user WHERE role = 'donor_mbg'`),
        tps_pengolah: await count(`SELECT COUNT(*) AS c FROM user WHERE role = 'tps_pengolah'`),
        kurir: await count(`SELECT COUNT(*) AS c FROM user WHERE role = 'kurir'`),
        admin: await count(`SELECT COUNT(*) AS c FROM user WHERE role = 'admin'`),
      },
      sampah: {
        total: await count('SELECT COUNT(*) AS c FROM sampah_makanan'),
        tersedia: await count(`SELECT COUNT(*) AS c FROM sampah_makanan WHERE status = 'tersedia'`),
        berjalan: await count(`SELECT COUNT(*) AS c FROM sampah_makanan WHERE status IN ('dialokasikan','dijemput','terkirim')`),
        terverifikasi: await count(`SELECT COUNT(*) AS c FROM sampah_makanan WHERE status = 'terverifikasi'`),
        dibatalkan: await count(`SELECT COUNT(*) AS c FROM sampah_makanan WHERE status = 'dibatalkan'`),
      },
      tps: {
        total: tpsRows.length,
        aktif: tpsAktif,
        radius_layanan_km: cfg.radius_layanan_km,
      },
      alokasi: {
        total: await count('SELECT COUNT(*) AS c FROM alokasi'),
        dialokasikan: await count(`SELECT COUNT(*) AS c FROM alokasi WHERE status = 'dialokasikan'`),
        berjalan: await count(`SELECT COUNT(*) AS c FROM alokasi WHERE status IN ('dijemput','terkirim')`),
        terverifikasi: await count(`SELECT COUNT(*) AS c FROM alokasi WHERE status = 'terverifikasi'`),
        dibatalkan: await count(`SELECT COUNT(*) AS c FROM alokasi WHERE status = 'dibatalkan'`),
      },
      klasifikasi: {
        total: await count('SELECT COUNT(*) AS c FROM klasifikasi_sampah'),
        terverifikasi_admin: await count('SELECT COUNT(*) AS c FROM klasifikasi_sampah WHERE diverifikasi_oleh IS NOT NULL'),
        perlu_verifikasi: await count(
          `SELECT COUNT(*) AS c FROM klasifikasi_sampah k
            WHERE k.id_klasifikasi = (SELECT MAX(k2.id_klasifikasi) FROM klasifikasi_sampah k2 WHERE k2.id_sampah = k.id_sampah)
              AND k.diverifikasi_oleh IS NULL AND k.skor_keyakinan < ?`,
          [ambang]
        ),
        target_akurasi_persen: Number(cfg.target?.klasifikasi_akurasi_persen ?? 85),
      },
      dampak: {
        kg_dialihkan: kgDialihkan,
        kg_terverifikasi: kgTerverifikasi,
        kg_diolah: kgDiolah,
        rata_rata_skor_persen: Number((avgScore * 100).toFixed(1)),
        rata_rata_jarak_km: Number(avgDistance.toFixed(2)),
        log_audit: await count('SELECT COUNT(*) AS c FROM log_audit'),
        pesan_outbox: await count('SELECT COUNT(*) AS c FROM outbox_pesan'),
      },
      kanal: channelStatus(),
      kinerja: {
        riwayat_routing: routingPerf,
        target_routing_ms: Number((cfg.sla?.routing_detik ?? 3) * 1000),
        semua_di_bawah_target: routingPerf.every((r) => r.durasi_ms < Number((cfg.sla?.routing_detik ?? 3) * 1000)),
      },
    });
  } catch (e) {
    next(e);
  }
});

// FR-10: manajemen pengguna
router.get('/users', async (_req, res, next) => {
  try {
    const rows = await db.all(
      `SELECT id_user, nama, email, role, status, telepon, alamat, lat, lng, nama_lembaga, kapasitas, created_at
       FROM user ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.patch('/users/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!['aktif', 'ditolak', 'menunggu'].includes(status)) {
      return res.status(400).json({ error: 'Status tidak valid' });
    }
    const user = await db.get('SELECT * FROM user WHERE id_user = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    if (user.role === 'admin' && status !== 'aktif') {
      return res.status(400).json({ error: 'Admin tidak bisa diubah statusnya' });
    }

    await db.run('UPDATE user SET status = ? WHERE id_user = ?', [status, user.id_user]);
    await audit(req.user.id, 'UPDATE_USER_STATUS', 'user', user.id_user, { from: user.status, to: status });
    const statusLabel = { aktif: 'aktif', ditolak: 'ditolak', menunggu: 'menunggu verifikasi' }[status] || status;
    await notify(
      user.id_user,
      status === 'aktif' ? 'Akun Diverifikasi' : 'Status Akun Diperbarui',
      status === 'aktif'
        ? 'Akun Anda telah diverifikasi. Anda bisa masuk dan menggunakan aplikasi.'
        : `Status akun Anda: ${statusLabel}. Hubungi admin untuk info lebih lanjut.`
    );
    res.json({ message: `Status pengguna menjadi ${statusLabel}` });
  } catch (e) {
    next(e);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    const user = await db.get('SELECT * FROM user WHERE id_user = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Admin tidak bisa dihapus' });

    const activeAlokasi = await db.get(
      `SELECT COUNT(*) AS c FROM alokasi
        WHERE status IN ('dialokasikan','dijemput','terkirim')
          AND (id_kurir = ? OR id_tps = ?
               OR id_sampah IN (SELECT id_sampah FROM sampah_makanan WHERE id_donor = ?))`,
      [user.id_user, user.id_user, user.id_user]
    );
    if (Number(activeAlokasi.c || 0) > 0) {
      return res.status(400).json({ error: 'Pengguna masih memiliki alokasi aktif' });
    }
    const punyaSampah = await db.get('SELECT COUNT(*) AS c FROM sampah_makanan WHERE id_donor = ?', [user.id_user]);
    if (Number(punyaSampah.c || 0) > 0) {
      return res.status(400).json({ error: 'Pengguna memiliki riwayat sampah — nonaktifkan saja (status ditolak)' });
    }

    // Profil pendampang punya FK ke user — hapus dulu
    await db.run('DELETE FROM profil_mbg WHERE id_user = ?', [user.id_user]);
    await db.run('DELETE FROM notifikasi WHERE id_user = ?', [user.id_user]);
    await db.run('DELETE FROM reset_sandi WHERE id_user = ?', [user.id_user]);
    try {
      await db.run('DELETE FROM tps_pengolah WHERE id_user = ?', [user.id_user]);
    } catch {
      return res.status(400).json({ error: 'TPS masih terkait riwayat alokasi' });
    }

    await audit(req.user.id, 'DELETE_USER', 'user', user.id_user, { email: user.email, role: user.role });
    try {
      await db.run('DELETE FROM user WHERE id_user = ?', [user.id_user]);
    } catch {
      return res.status(400).json({ error: 'Pengguna masih terkait data lain' });
    }
    res.json({ message: 'Pengguna dihapus' });
  } catch (e) {
    next(e);
  }
});

router.post('/clean', async (req, res, next) => {
  try {
    await wipeTransactional({ keepUsers: true });
    await audit(req.user.id, 'CLEAN_DATA', 'sistem', null, { keep_users: true });
    res.json({ message: 'Data transaksi dihapus. Akun login tetap ada.' });
  } catch (e) {
    next(e);
  }
});

// FR-10: log audit (/audit = alias /logs)
const logsHandler = async (_req, res, next) => {
  try {
    const rows = await db.all(
      `SELECT a.*, u.nama AS nama_pengguna, u.role AS user_role
       FROM log_audit a LEFT JOIN user u ON u.id_user = a.id_user
       ORDER BY a.id_log DESC LIMIT 200`
    );
    res.json(rows.map((r) => ({ ...r, detail_obj: r.detail ? JSON.parse(r.detail) : null })));
  } catch (e) {
    next(e);
  }
};
router.get('/logs', logsHandler);
router.get('/audit', logsHandler);

router.get('/outbox', async (_req, res, next) => {
  try {
    const rows = await db.all(
      `SELECT o.*, u.nama AS nama_pengguna, u.role AS user_role
       FROM outbox_pesan o LEFT JOIN user u ON u.id_user = o.id_user
       ORDER BY o.id_pesan DESC LIMIT 200`
    );
    res.json({ kanal: channelStatus(), pesan: rows });
  } catch (e) {
    next(e);
  }
});

router.delete('/outbox/sent', async (req, res, next) => {
  try {
    const result = await db.run(`DELETE FROM outbox_pesan WHERE status IN ('terkirim','simulasi')`);
    await audit(req.user.id, 'CLEAN_OUTBOX', 'outbox_pesan', null, {
      deleted: result?.changes ?? 0,
    });
    res.json({ message: 'Pesan terkirim dihapus' });
  } catch (e) {
    next(e);
  }
});

// Daftar alokasi (untuk UI admin — nama lama /matches dipertahankan)
router.get('/matches', async (_req, res, next) => {
  try {
    const rows = await db.all(
      `SELECT a.*, s.nama_sampah, s.jenis_makanan, s.berat_kg, s.waktu_produksi, s.status AS status_sampah,
              t.nama_tps, t.jenis_pengolahan,
              dn.nama AS nama_donor, c.nama AS nama_kurir,
              (SELECT k.kategori FROM klasifikasi_sampah k WHERE k.id_sampah = s.id_sampah ORDER BY k.id_klasifikasi DESC LIMIT 1) AS kategori
         FROM alokasi a
         JOIN sampah_makanan s ON s.id_sampah = a.id_sampah
         JOIN tps_pengolah t ON t.id_user = a.id_tps
         JOIN user dn ON dn.id_user = s.id_donor
         JOIN user c ON c.id_user = a.id_kurir
        ORDER BY a.waktu_alokasi DESC`
    );
    res.json(rows.map((r) => ({ ...r, skor_persen: Number((Number(r.skor_matching) * 100).toFixed(1)) })));
  } catch (e) {
    next(e);
  }
});

// FR-16: CRUD regulasi
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

router.post('/regulations', async (req, res, next) => {
  try {
    const { nama_regulasi, jenis_regulasi, aturan, aktif } = req.body || {};
    const nama = clampStr(nama_regulasi, 200);
    if (!nama) return res.status(400).json({ error: 'nama_regulasi wajib diisi' });
    if (jenis_regulasi != null && !JENIS_REGULASI.includes(jenis_regulasi)) {
      return res.status(400).json({ error: `jenis_regulasi harus salah satu dari: ${JENIS_REGULASI.join(', ')}` });
    }
    const aturanJson = parseAturan(aturan);
    if (aturanJson == null) return res.status(400).json({ error: 'aturan harus JSON valid' });

    const ins = await db.run(
      `INSERT INTO konfigurasi_regulasi (nama_regulasi, jenis_regulasi, aturan, aktif) VALUES (?, ?, ?, ?)`,
      [nama, jenis_regulasi || 'lainnya', aturanJson, aktif === false || aktif === 0 ? 0 : 1]
    );
    await audit(req.user.id, 'CREATE_REGULATION', 'konfigurasi_regulasi', ins.lastInsertRowid, { nama_regulasi: nama });
    res.status(201).json({ id_konfigurasi: ins.lastInsertRowid, message: 'Regulasi ditambahkan' });
  } catch (e) {
    next(e);
  }
});

router.patch('/regulations/:id', async (req, res, next) => {
  try {
    const row = await db.get('SELECT * FROM konfigurasi_regulasi WHERE id_konfigurasi = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Regulasi tidak ditemukan' });

    const { nama_regulasi, jenis_regulasi, aturan, aktif } = req.body || {};
    const fields = [];
    const params = [];
    if (nama_regulasi != null) {
      const nama = clampStr(nama_regulasi, 200);
      if (!nama) return res.status(400).json({ error: 'nama_regulasi tidak boleh kosong' });
      fields.push('nama_regulasi = ?');
      params.push(nama);
    }
    if (jenis_regulasi != null) {
      if (!JENIS_REGULASI.includes(jenis_regulasi)) {
        return res.status(400).json({ error: `jenis_regulasi harus salah satu dari: ${JENIS_REGULASI.join(', ')}` });
      }
      fields.push('jenis_regulasi = ?');
      params.push(jenis_regulasi);
    }
    if (aturan != null) {
      const aturanJson = parseAturan(aturan);
      if (aturanJson == null) return res.status(400).json({ error: 'aturan harus JSON valid' });
      fields.push('aturan = ?');
      params.push(aturanJson);
    }
    if (aktif != null) {
      fields.push('aktif = ?');
      params.push(aktif === true || aktif === 1 || aktif === '1' ? 1 : 0);
    }
    if (!fields.length) return res.status(400).json({ error: 'Tidak ada perubahan yang dikirim' });

    params.push(row.id_konfigurasi);
    await db.run(`UPDATE konfigurasi_regulasi SET ${fields.join(', ')} WHERE id_konfigurasi = ?`, params);
    await audit(req.user.id, 'UPDATE_REGULATION', 'konfigurasi_regulasi', row.id_konfigurasi, {
      diubah: fields.map((f) => f.split(' =')[0]),
    });
    const updated = await db.get('SELECT * FROM konfigurasi_regulasi WHERE id_konfigurasi = ?', [row.id_konfigurasi]);
    res.json({ message: 'Regulasi diperbarui', regulasi: updated });
  } catch (e) {
    next(e);
  }
});

// FR-15: laporan motivasi donor MBG
router.get('/mbg/report', async (_req, res, next) => {
  try {
    const cfg = loadConfig();
    let poinPerKg = 10;
    try {
      const reg = await db.get(`SELECT aturan FROM konfigurasi_regulasi WHERE aktif ORDER BY id_konfigurasi LIMIT 1`);
      poinPerKg = Number(JSON.parse(reg?.aturan || '{}').poin_per_kg || 10);
    } catch {
      /* fallback 10 */
    }

    const rows = await db.all(
      `SELECT u.id_user, u.nama, u.email, u.status
         FROM user u WHERE u.role = 'donor_mbg' ORDER BY u.nama`
    );
    const laporan = [];
    for (const u of rows) {
      const [dialihkan, terverifikasi, klaim] = await Promise.all([
        db.get(
          `SELECT COALESCE(SUM(s.berat_kg), 0) AS v FROM alokasi a JOIN sampah_makanan s ON s.id_sampah = a.id_sampah
            WHERE s.id_donor = ? AND a.status IN ${STATUS_AKTIF}`,
          [u.id_user]
        ),
        db.get(
          `SELECT COALESCE(SUM(s.berat_kg), 0) AS v FROM alokasi a JOIN sampah_makanan s ON s.id_sampah = a.id_sampah
            WHERE s.id_donor = ? AND a.status = 'terverifikasi'`,
          [u.id_user]
        ),
        db.get('SELECT COUNT(*) AS c FROM motivasi_donor_mbg WHERE id_user = ?', [u.id_user]),
      ]);
      const kgVer = Number(terverifikasi?.v || 0);
      laporan.push({
        id_user: u.id_user,
        nama: u.nama,
        email: u.email,
        status: u.status,
        kg_dialihkan: Number(dialihkan?.v || 0),
        kg_terverifikasi: kgVer,
        poin: Math.round(kgVer * poinPerKg),
        jumlah_klaim: Number(klaim?.c || 0),
      });
    }
    laporan.sort((a, b) => b.kg_terverifikasi - a.kg_terverifikasi);
    res.json({
      poin_per_kg: poinPerKg,
      target_kg_klaim_pertama: 5,
      target_alokasi_persen: Number(cfg.target?.alokasi_persen ?? 85),
      total_donor: laporan.length,
      total_kg_dialihkan: Number(laporan.reduce((s, r) => s + r.kg_dialihkan, 0).toFixed(2)),
      total_kg_terverifikasi: Number(laporan.reduce((s, r) => s + r.kg_terverifikasi, 0).toFixed(2)),
      baris: laporan,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
