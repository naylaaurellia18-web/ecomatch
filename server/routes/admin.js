const express = require('express');
const db = require('../db');
const { audit, notify } = require('../lib/audit');
const { channelStatus } = require('../lib/channels');
const { wipeTransactional } = require('../seed');
const { authenticate, requireRole, requireActive } = require('../middleware');

const router = express.Router();

router.use(authenticate, requireRole('admin'), requireActive);

router.get('/stats', async (req, res, next) => {
  try {
    const count = async (sql, params = []) => (await db.get(sql, params))?.c ?? 0;

    const totalPortionsDelivered = await count(
      `SELECT COALESCE(SUM(l.jumlah_porsi), 0) AS c FROM alokasi a
       JOIN surplus_makanan l ON l.id_makanan = a.id_makanan
       WHERE a.status IN ('dijemput','terkirim','terverifikasi')`
    );

    // FR-09: statistik pengurangan food waste (porsi gagal terdistribusi)
    const totalPortionsGagal = await count(
      `SELECT COALESCE(SUM(jumlah_porsi), 0) AS c FROM surplus_makanan WHERE status = 'gagal'`
    );
    const totalProcessed = totalPortionsDelivered + totalPortionsGagal;
    const wasteReductionPercent = totalProcessed > 0
      ? Number(((totalPortionsDelivered / totalProcessed) * 100).toFixed(1))
      : 0;

    const avgScore = await count(`SELECT COALESCE(AVG(skor_matching), 0) AS c FROM alokasi`);
    const avgDistance = await count(`SELECT COALESCE(AVG(jarak_km), 0) AS c FROM alokasi`);

    const perfRows = await db.all(
      `SELECT detail FROM log_audit WHERE aksi = 'RUN_MATCHING' ORDER BY id_log DESC LIMIT 10`
    );
    const matchingPerf = perfRows.map((r) => JSON.parse(r.detail || '{}'));

    res.json({
      users: {
        total: await count('SELECT COUNT(*) AS c FROM user'),
        menunggu: await count(`SELECT COUNT(*) AS c FROM user WHERE status = 'menunggu'`),
        aktif: await count(`SELECT COUNT(*) AS c FROM user WHERE status = 'aktif'`),
        donor: await count(`SELECT COUNT(*) AS c FROM user WHERE role = 'donor'`),
        penerima: await count(`SELECT COUNT(*) AS c FROM user WHERE role = 'penerima'`),
        kurir: await count(`SELECT COUNT(*) AS c FROM user WHERE role = 'kurir'`),
      },
      surplus: {
        total: await count('SELECT COUNT(*) AS c FROM surplus_makanan'),
        tersedia: await count(`SELECT COUNT(*) AS c FROM surplus_makanan WHERE status = 'tersedia'`),
        terverifikasi: await count(`SELECT COUNT(*) AS c FROM surplus_makanan WHERE status = 'terverifikasi'`),
      },
      kebutuhan: {
        total: await count('SELECT COUNT(*) AS c FROM kebutuhan_pangan'),
        terbuka: await count(`SELECT COUNT(*) AS c FROM kebutuhan_pangan WHERE status = 'terbuka'`),
        dipenuhi: await count(`SELECT COUNT(*) AS c FROM kebutuhan_pangan WHERE status = 'dipenuhi'`),
      },
      alokasi: {
        total: await count('SELECT COUNT(*) AS c FROM alokasi'),
        diajukan: await count(`SELECT COUNT(*) AS c FROM alokasi WHERE status = 'diajukan'`),
        berjalan: await count(`SELECT COUNT(*) AS c FROM alokasi WHERE status IN ('diterima','dijemput','terkirim')`),
        terverifikasi: await count(`SELECT COUNT(*) AS c FROM alokasi WHERE status = 'terverifikasi'`),
        dibatalkan: await count(`SELECT COUNT(*) AS c FROM alokasi WHERE status = 'dibatalkan'`),
      },
      dampak: {
        porsi_tersalurkan: totalPortionsDelivered,
        porsi_gagal: totalPortionsGagal,
        pengurangan_food_waste_persen: wasteReductionPercent,
        rata_rata_skor_persen: Number((avgScore * 100).toFixed(1)),
        rata_rata_jarak_km: Number(avgDistance.toFixed(2)),
        log_audit: await count('SELECT COUNT(*) AS c FROM log_audit'),
        pesan_outbox: await count('SELECT COUNT(*) AS c FROM outbox_pesan'),
      },
      kanal: channelStatus(),
      kinerja: {
        riwayat_pencocokan: matchingPerf,
        target_pencocokan_ms: 3000,
        semua_di_bawah_target: matchingPerf.every((r) => !r.durasi_ms || r.durasi_ms < 3000),
      },
    });
  } catch (e) {
    next(e);
  }
});

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

    const activeMatch = await db.get(
      `SELECT COUNT(*) AS c FROM alokasi
        WHERE (id_kurir = ? OR id_makanan IN (SELECT id_makanan FROM surplus_makanan WHERE id_donor = ?)
               OR id_kebutuhan IN (SELECT id_kebutuhan FROM kebutuhan_pangan WHERE id_penerima = ?))
          AND status IN ('diajukan','diterima','dijemput')`,
      [user.id_user, user.id_user, user.id_user]
    );
    if (activeMatch.c > 0) {
      return res.status(400).json({ error: 'Pengguna masih memiliki pencocokan aktif' });
    }

    await audit(req.user.id, 'DELETE_USER', 'user', user.id_user, { email: user.email, role: user.role });
    await db.run('DELETE FROM user WHERE id_user = ?', [user.id_user]);
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

router.get('/logs', async (_req, res, next) => {
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
});

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

router.get('/matches', async (_req, res, next) => {
  try {
    const rows = await db.all(
      `SELECT m.*, l.nama_makanan, l.jenis_makanan, l.jumlah_porsi, n.judul AS judul_kebutuhan, n.urgensi,
         dn.nama AS nama_donor, rn.nama AS nama_penerima, c.nama AS nama_kurir
       FROM alokasi m
       JOIN surplus_makanan l ON l.id_makanan = m.id_makanan
       JOIN kebutuhan_pangan n ON n.id_kebutuhan = m.id_kebutuhan
       JOIN user dn ON dn.id_user = l.id_donor
       JOIN user rn ON rn.id_user = m.id_penerima
       JOIN user c ON c.id_user = m.id_kurir
       ORDER BY m.waktu_alokasi DESC`
    );
    res.json(rows.map((r) => ({ ...r, skor_persen: Number((r.skor_matching * 100).toFixed(1)) })));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
