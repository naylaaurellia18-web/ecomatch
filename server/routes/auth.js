const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, signToken, generateOtp } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { sendEmail } = require('../lib/messenger');
const { record } = require('../lib/channels');
const { hit, reset, clientIp } = require('../lib/ratelimit');
const { isEmail, clampStr, safeEqual } = require('../lib/validate');

const router = express.Router();
const { authenticate } = require('../middleware');

const LOGIN_LIMIT = { limit: 5, windowMs: 15 * 60000 };
const FORGOT_LIMIT = { limit: 5, windowMs: 60 * 60000 };
const REGISTER_LIMIT = { limit: 10, windowMs: 60 * 60000 };

router.post('/register', async (req, res, next) => {
  try {
    if (!hit(`register:${clientIp(req)}`, REGISTER_LIMIT)) {
      return res.status(429).json({ error: 'Terlalu banyak permintaan daftar. Coba lagi nanti.' });
    }
    const { nama, email, password, role, telepon, alamat, lat, lng, nama_lembaga, kapasitas } = req.body || {};
    if (!nama || !email || !password || !role) {
      return res.status(400).json({ error: 'Nama, email, kata sandi, dan peran wajib diisi' });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ error: 'Format email tidak valid' });
    }
    if (!['donor', 'penerima', 'kurir'].includes(role)) {
      return res.status(400).json({ error: 'Peran harus donor, penerima, atau kurir' });
    }
    if (password.length < 6 || password.length > 128) {
      return res.status(400).json({ error: 'Kata sandi minimal 6, maksimal 128 karakter' });
    }
    const cleanName = clampStr(nama, 120);
    if (!cleanName) return res.status(400).json({ error: 'Nama wajib diisi' });

    const exists = await db.get('SELECT id_user FROM user WHERE email = ?', [email.toLowerCase()]);
    if (exists) return res.status(409).json({ error: 'Email sudah terdaftar' });

    const result = await db.run(
      `INSERT INTO user (nama, email, password, role, status, telepon, alamat, lat, lng, nama_lembaga, kapasitas)
       VALUES (?, ?, ?, ?, 'menunggu', ?, ?, ?, ?, ?, ?)`,
      [
        cleanName,
        email.toLowerCase(),
        hashPassword(password),
        role,
        clampStr(telepon, 30),
        clampStr(alamat, 300),
        lat != null && lat !== '' && !Number.isNaN(Number(lat)) ? Number(lat) : null,
        lng != null && lng !== '' && !Number.isNaN(Number(lng)) ? Number(lng) : null,
        clampStr(nama_lembaga, 120),
        kapasitas != null && !Number.isNaN(Number(kapasitas)) ? Math.max(0, Math.floor(Number(kapasitas))) : null,
      ]
    );

    await audit(result.lastInsertRowid, 'USER_REGISTER', 'user', result.lastInsertRowid, { role });
    res.status(201).json({
      message: 'Registrasi berhasil. Menunggu verifikasi admin.',
      status: 'menunggu',
    });
  } catch (e) {
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email dan kata sandi wajib diisi' });
    if (!isEmail(email)) return res.status(400).json({ error: 'Format email tidak valid' });

    const ip = clientIp(req);
    const emailKey = String(email).toLowerCase();
    const key = `login:${ip}:${emailKey}`;
    if (!hit(key, LOGIN_LIMIT)) {
      return res.status(429).json({
        error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.',
      });
    }

    const user = await db.get('SELECT * FROM user WHERE email = ?', [emailKey]);
    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({ error: 'Email atau kata sandi salah' });
    }
    if (user.status === 'ditolak') {
      return res.status(403).json({ error: 'Akun ditolak oleh admin' });
    }

    reset(key);
    await audit(user.id_user, 'USER_LOGIN', 'user', user.id_user);
    res.json({
      token: signToken(user),
      user: {
        id_user: user.id_user,
        nama: user.nama,
        email: user.email,
        role: user.role,
        status: user.status,
        nama_lembaga: user.nama_lembaga,
        kapasitas: user.kapasitas,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!email || !isEmail(email)) return res.status(400).json({ error: 'Email wajib diisi dengan format valid' });

    const ip = clientIp(req);
    if (!hit(`forgot:${ip}:${email}`, FORGOT_LIMIT)) {
      return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' });
    }

    const user = await db.get('SELECT id_user, nama, email FROM user WHERE email = ?', [email]);
    const generic = {
      message: 'Jika email terdaftar, kode reset sudah dikirim (berlaku 15 menit).',
    };
    if (!user) {
      return res.json(generic);
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 15 * 60000).toISOString();
    await db.run(
      `UPDATE reset_sandi SET digunakan_pada = datetime('now') WHERE id_user = ? AND digunakan_pada IS NULL`,
      [user.id_user]
    );
    await db.run(`INSERT INTO reset_sandi (id_user, kode, kedaluwarsa_pada) VALUES (?, ?, ?)`, [
      user.id_user,
      code,
      expiresAt,
    ]);

    const subject = 'Reset kata sandi Food Rescue AI';
    const body = `Halo ${user.nama},\n\nKode reset kata sandi Anda: ${code}\nBerlaku 15 menit. Abaikan bila tidak meminta.`;
    const mail = await sendEmail(user.email, subject, body);
    if (!mail.skipped) {
      await record({
        channel: 'email',
        userId: user.id_user,
        to: mail.to || user.email,
        subject,
        body,
        status: mail.ok ? (mail.simulated ? 'simulated' : 'sent') : 'failed',
        error: mail.error || null,
        providerRef: mail.response || null,
      });
    }
    await audit(user.id_user, 'PASSWORD_RESET_REQUEST', 'user', user.id_user);
    res.json(generic);
  } catch (e) {
    next(e);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    const { kode, password } = req.body || {};
    if (!email || !kode || !password) {
      return res.status(400).json({ error: 'Email, kode, dan sandi baru wajib diisi' });
    }
    if (!isEmail(email)) return res.status(400).json({ error: 'Format email tidak valid' });
    if (String(password).length < 6 || String(password).length > 128) {
      return res.status(400).json({ error: 'Kata sandi baru minimal 6, maksimal 128 karakter' });
    }

    const ip = clientIp(req);
    if (!hit(`reset:${ip}:${email}`, FORGOT_LIMIT)) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' });
    }

    const user = await db.get('SELECT id_user FROM user WHERE email = ?', [email]);
    if (!user) return res.status(400).json({ error: 'Kode tidak valid atau kedaluwarsa' });

    const row = await db.get(
      `SELECT * FROM reset_sandi
       WHERE id_user = ? AND digunakan_pada IS NULL
       ORDER BY id_reset DESC LIMIT 1`,
      [user.id_user]
    );
    if (!row || !safeEqual(row.kode, String(kode).trim())) {
      return res.status(400).json({ error: 'Kode tidak valid atau kedaluwarsa' });
    }
    if (new Date(row.kedaluwarsa_pada).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Kode kedaluwarsa' });
    }

    await db.run(`UPDATE reset_sandi SET digunakan_pada = datetime('now') WHERE id_reset = ?`, [row.id_reset]);
    await db.run(`UPDATE user SET password = ? WHERE id_user = ?`, [hashPassword(password), user.id_user]);
    await audit(user.id_user, 'PASSWORD_RESET', 'user', user.id_user);
    res.json({ message: 'Kata sandi berhasil diubah. Silakan masuk.' });
  } catch (e) {
    next(e);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await db.get(
      'SELECT id_user, nama, email, role, status, telepon, alamat, lat, lng, nama_lembaga, kapasitas, created_at FROM user WHERE id_user = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    res.json(user);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
