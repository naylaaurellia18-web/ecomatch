const db = require('./db');
const { hashPassword, isProduction } = require('./lib/auth');
const { audit } = require('./lib/audit');
const klasifikasiLib = require('./lib/klasifikasi');

const REAL_PHONE = '083847721511';

// Placeholder 1x1 PNG (data URI) untuk foto seed
const FOTO_PLACEHOLDER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';

const JENIS_DITERIMA_PENUH = ['sisa_nasi', 'sayur', 'lauk', 'kulit_buah', 'campuran', 'lainnya'];

/**
 * Akun demo (lokal saja): role EcoMatch + koordinat Kota Madiun.
 * [nama, email, sandi, role, status, telepon, alamat, lat, lng, nama_lembaga, kapasitas]
 */
const DEMO_USERS = [
  ['SPPG Hotel Merdeka', 'donor@ecomatch.id', 'donor123', 'donor_mbg', 'aktif', REAL_PHONE, 'Kota Madiun', -7.6245, 111.525, 'Hotel Merdeka Madiun', null],
  ['SPPG RM Nusantara', 'donor2@ecomatch.id', 'donor123', 'donor_mbg', 'aktif', REAL_PHONE, 'Kartoharjo', -7.6014, 111.4844, 'RM Nusantara Madiun', null],
  ['TPS Kompos Kawatan', 'tps@ecomatch.id', 'tps123', 'tps_pengolah', 'aktif', REAL_PHONE, 'Kawatan', -7.6386, 111.5206, null, 150],
  ['TPS Maggot Ngetan', 'tps2@ecomatch.id', 'tps123', 'tps_pengolah', 'aktif', REAL_PHONE, 'Ngetan', -7.5754, 111.4789, null, 100],
  ['Kurir Budi', 'kurir@ecomatch.id', 'kurir123', 'kurir', 'aktif', REAL_PHONE, 'Balerejo', -7.5483, 111.5597, null, 60],
  ['Kurir Siti', 'kurir2@ecomatch.id', 'kurir123', 'kurir', 'aktif', REAL_PHONE, 'Mejayan', -7.5519, 111.4536, null, 40],
  ['Menunggu Verifikasi', 'pending@ecomatch.id', 'pending123', 'donor_mbg', 'menunggu', REAL_PHONE, 'Kota Madiun', null, null, 'Kafe Uji Coba Madiun', null],
];

function productionAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = process.env.ADMIN_NAME || 'Admin EcoMatch';
  if (!email || !password) {
    throw new Error(
      'Database kosong di produksi. Set ADMIN_EMAIL dan ADMIN_PASSWORD di Environment Variables ' +
        '(wajib, password minimal 12 karakter) lalu deploy ulang.'
    );
  }
  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD di produksi minimal 12 karakter.');
  }
  return { name, email, password };
}

async function wipeTransactional({ keepUsers = false } = {}) {
  await db.exec(`
    ${db.auditTriggerDrop()}
    DELETE FROM kode_otp;
    DELETE FROM pengolahan_log;
    DELETE FROM notifikasi;
    DELETE FROM reset_sandi;
    DELETE FROM outbox_pesan;
    DELETE FROM log_audit;
    DELETE FROM alokasi;
    DELETE FROM klasifikasi_sampah;
    DELETE FROM sampah_makanan;
    DELETE FROM motivasi_donor_mbg;
    DELETE FROM profil_mbg;
    DELETE FROM tps_pengolah;
    ${keepUsers ? '' : 'DELETE FROM "user";'}
    ${db.auditTriggerDDL()}
  `);
  if (!db.isPg()) {
    try {
      const seq = keepUsers
        ? ['sampah_makanan', 'klasifikasi_sampah', 'alokasi', 'pengolahan_log', 'motivasi_donor_mbg', 'kode_otp', 'notifikasi', 'outbox_pesan', 'log_audit', 'reset_sandi']
        : ['user', 'profil_mbg', 'tps_pengolah', 'sampah_makanan', 'klasifikasi_sampah', 'alokasi', 'pengolahan_log', 'motivasi_donor_mbg', 'kode_otp', 'notifikasi', 'outbox_pesan', 'log_audit', 'reset_sandi'];
      await db.exec(`DELETE FROM sqlite_sequence WHERE name IN (${seq.map((t) => `'${t}'`).join(',')})`);
    } catch {
      /* cloud tanpa sqlite_sequence */
    }
  }
}

async function insertUser(u) {
  const result = await db.run(
    `INSERT INTO user (nama, email, password, role, status, telepon, alamat, lat, lng, nama_lembaga, kapasitas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [u[0], u[1], hashPassword(u[2]), u[3], u[4], u[5], u[6], u[7], u[8], u[9], u[10]]
  );
  const id = result.lastInsertRowid;
  // Profil pendukung peran (konsisten dengan POST /api/auth/register)
  if (u[3] === 'donor_mbg') {
    await db.run(`INSERT INTO profil_mbg (id_user, nama_sppg, alamat, kontak) VALUES (?, ?, ?, ?)`, [
      id,
      u[9] || u[0],
      u[6],
      u[5],
    ]);
  } else if (u[3] === 'tps_pengolah') {
    await db.run(
      `INSERT INTO tps_pengolah (id_user, nama_tps, jenis_tps, jenis_pengolahan, kapasitas_kg_hari, jenis_diterima, radius_layanan_km, izin_operasional)
       VALUES (?, ?, 'tps_komposter', 'komposter', ?, ?, 15, ?)`,
      [id, u[0], u[10] ?? 100, JSON.stringify(JENIS_DITERIMA_PENUH), `IZIN-${id}-MADIUN`]
    );
  }
  return id;
}

/**
 * Seed default: HANYA admin (web fresh).
 *
 * Produksi: admin dari ADMIN_EMAIL/ADMIN_PASSWORD — akun demo TIDAK dibuat.
 * Lokal: admin demo + opsional akun demo (--accounts / --full).
 *
 * --force --full      : reset total + akun demo + sampah demo (lokal)
 * --force --accounts  : reset total + akun login (lokal)
 * --clean             : hapus data transaksi, akun tetap
 */
async function seed({ force = false, full = false, clean = false, accounts = false } = {}) {
  await db.init();

  if (clean) {
    await wipeTransactional({ keepUsers: true });
    const users = Number((await db.get('SELECT COUNT(*) AS c FROM user'))?.c ?? 0);
    console.log(`Bersih: sampah/alokasi/notifikasi/audit dihapus. Akun login tersisa: ${users}.`);
    return { ok: true, cleaned: true, users };
  }

  const existing = Number((await db.get('SELECT COUNT(*) AS c FROM user'))?.c ?? 0);
  const wantAccountsOnly = accounts || (!full && force);
  const prod = isProduction();

  if (existing > 0) {
    if (!force) {
      console.log('Database sudah berisi data. Pakai --force --accounts (akun saja) atau --clean (hapus data, akun tetap).');
      return { skipped: true };
    }
    if (prod && !process.env.ALLOW_FORCE_SEED_PRODUCTION) {
      throw new Error(
        'Seed --force di produksi diblokir. Set ALLOW_FORCE_SEED_PRODUCTION=1 hanya bila yakin (akan hapus semua user).'
      );
    }
    await wipeTransactional({ keepUsers: false });
  }

  const allowDemo = !prod || process.env.ALLOW_DEMO_ACCOUNTS === '1';

  if (prod) {
    const admin = productionAdmin();
    await db.run(
      `INSERT INTO user (nama, email, password, role, status, telepon, alamat, lat, lng, nama_lembaga, kapasitas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [admin.name, admin.email, hashPassword(admin.password), 'admin', 'aktif', null, null, null, null, 'EcoMatch', null]
    );
    console.log(`Seed produksi: admin ${admin.email} (dari env ADMIN_EMAIL).`);
    console.log('Akun demo TIDAK dibuat di produksi.');
  } else {
    await db.run(
      `INSERT INTO user (nama, email, password, role, status, telepon, alamat, lat, lng, nama_lembaga, kapasitas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Admin Sistem', 'admin@ecomatch.id', hashPassword('admin123'), 'admin', 'aktif', REAL_PHONE, 'Kota Madiun', -7.6245, 111.525, 'EcoMatch', null]
    );
    console.log('Seed lokal: admin@ecomatch.id / admin123');
  }

  const seedAccounts = allowDemo && (full || wantAccountsOnly);
  const userIdByEmail = {};
  if (seedAccounts) {
    for (const u of DEMO_USERS) {
      const id = await insertUser(u);
      userIdByEmail[u[1]] = id;
    }
  }

  if (full && allowDemo) {
    const jamLalu = (j) => new Date(Date.now() - j * 3600000).toISOString();
    const donor1 = userIdByEmail['donor@ecomatch.id'];
    const donor2 = userIdByEmail['donor2@ecomatch.id'];
    const listings = [
      [donor1, 'Nasi kotak sisa rapat', 'nasi', 18.5, jamLalu(2)],
      [donor1, 'Sayur bayam & tumis', 'sayur', 7.2, jamLalu(5)],
      [donor2, 'Ayam goreng sisa prasmanan', 'lauk', 12.4, jamLalu(3)],
      [donor2, 'Kulit buah & ampas jeruk', 'buah', 5.6, jamLalu(20)],
      [donor1, 'Sisa campuran nasi & lauk', 'campuran', 22.0, jamLalu(30)],
    ];
    for (const l of listings) {
      const ins = await db.run(
        `INSERT INTO sampah_makanan (id_donor, nama_sampah, jenis_makanan, berat_kg, waktu_produksi, foto_url, status)
         VALUES (?, ?, ?, ?, ?, ?, 'tersedia')`,
        [l[0], l[1], l[2], l[3], l[4], FOTO_PLACEHOLDER]
      );
      const hasil = klasifikasiLib.klasifikasi({
        nama_sampah: l[1],
        jenis_makanan: l[2],
        waktu_produksi: l[4],
      });
      await db.run(
        `INSERT INTO klasifikasi_sampah (id_sampah, kategori, tingkat_pembusukan, skor_keyakinan, metode, alasan)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [ins.lastInsertRowid, hasil.kategori, hasil.tingkat_pembusukan || 'segar', Number(hasil.skor_keyakinan || 0), hasil.metode || 'rule_based', hasil.alasan || null]
      );
    }
  }

  await audit(null, 'SEED_DATABASE', 'sistem', null, {
    mode: prod ? 'production-admin' : full ? 'full-demo' : wantAccountsOnly ? 'accounts-only' : 'fresh-admin-only',
  });

  if (prod) {
    console.log('Seed produksi selesai.');
  } else if (full) {
    console.log('Seed demo lengkap selesai (akun + sampah makanan).');
  } else if (wantAccountsOnly) {
    console.log('Seed akun login saja — sampah/alokasi kosong (siap diisi dari nol).');
    console.log('  admin@ecomatch.id / admin123');
    console.log('  donor@ecomatch.id / donor123');
    console.log('  tps@ecomatch.id / tps123');
    console.log('  kurir@ecomatch.id / kurir123');
  } else {
    console.log('Seed fresh: hanya admin, data transaksi kosong.');
  }
  return { ok: true };
}

module.exports = { seed, wipeTransactional };

if (require.main === module) {
  const force = process.argv.includes('--force');
  const full = process.argv.includes('--full');
  const clean = process.argv.includes('--clean');
  const accounts = process.argv.includes('--accounts');
  seed({ force, full, clean, accounts })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e.message || e);
      process.exit(1);
    });
}
