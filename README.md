# Food Rescue AI

Platform redistribusi surplus makanan berbasis **AI Matching & GIS** — menghubungkan Donor, Penerima Manfaat, Kurir/Relawan, dan Admin.

Dibangun untuk tugas kuliah sesuai dokumen SKPL (10 FR + 8 NFR).

## Tautan Produksi

| Yang dituju | Tautan |
|---|---|
| Repositori Publik (GitHub) | https://github.com/naylaaurellia18-web/food-rescue-ai |
| Frontend Produksi (Vercel) | https://food-rescue-ai-blond.vercel.app |
| Backend REST / API (health) | https://food-rescue-ai-blond.vercel.app/api/health |
| Riwayat Pipeline CI/CD (GitHub Actions) | https://github.com/naylaaurellia18-web/food-rescue-ai/actions |

> **Railway (backend terpisah):** impor repo di [railway.app](https://railway.app) → service `food-rescue-ai` memakai `railway.json` (start `node server/index.js`, health `/api/health`). Setelah deploy, URL-nya `https://<project>.up.railway.app`. Agar auto-deploy dari Actions: tambah secret `RAILWAY_TOKEN` di repo → Settings → Secrets and variables → Actions.

## Hardening Produksi (P0)

Sebelum dipakai masyarakat (bukan cuma demo TA):

| P0 | Status di kode |
|----|----------------|
| JWT_SECRET wajib kuat di produksi | `server/lib/auth.js` — app **gagal start** bila `NODE_ENV=production` tanpa secret ≥32 char |
| Tanpa akun demo di produksi | `server/seed.js` — admin dari `ADMIN_EMAIL` / `ADMIN_PASSWORD`; akun `*@foodrescue.id` **tidak** dibuat di produksi |
| Foto tidak membesar DB | `server/lib/storage.js` — isi `CLOUDINARY_URL` → upload eksternal; tanpa env → base64 (demo) |
| Backup DB | `node scripts/backup-db.js` + Actions harian (butuh secret `TURSO_*`) |
| Uptime monitor | Actions tiap 15 menit → `GET /api/health` di Vercel |
| Error log terstruktur | middleware error JSON (method/path/status/message) |

## Hardening Produksi (P1)

| P1 | Status di kode |
|----|----------------|
| Lupa sandi | `POST /api/auth/forgot-password` + `/reset-password` — kode 6 digit, 15 menit, sekali pakai; email via SMTP (simulasi → outbox) |
| Rate limit login | 5 gagal / 15 menit per IP+email → **429** (`server/lib/ratelimit.js`) |
| Rate limit reset | 5 permintaan / jam per IP+email |
| Halaman legal (UU PDP) | `/privacy.html` + `/syarat.html`, tautan di layar auth |
| Kredensial demo disembunyikan | catatan `admin@…` hanya di `localhost` |
| File legacy root dihapus | `index.html`/`login.html`/`js/` dll tidak lagi dipakai — SPA di `public/` |

## Hardening Produksi (P2)

| P2 | Status di kode |
|----|----------------|
| Security headers | `server/app.js` — `nosniff`, `X-Frame-Options: DENY`, referrer/permissions policy; `Cache-Control: no-store` untuk `/api/*` |
| Auto-expire listing | boot: `available` lewat `expiry_at` → `expired`; kode reset kadaluarsa ditandai terpakai |
| Panduan deploy aman | `DEPLOY.md` — `JWT_SECRET` kuat, `ADMIN_*`, SMTP untuk lupa sandi |
| Kapasitas free tier | bagian di bawah — kapan perlu upgrade |

## Hardening Produksi (P3)

| P3 | Status di kode |
|----|----------------|
| Content-Security-Policy | `server/app.js` — `default-src 'self'`, tanpa `unsafe-inline` untuk script; ekstrak inline theme → `public/theme.js` |
| HSTS | header otomatis bila request HTTPS (`x-forwarded-proto`) |
| CORS allowlist | env `ALLOWED_ORIGINS` (pisah koma); tanpa env → same-origin only |
| Rate limit OTP | 5 percobaan / 15 menit per IP+match+penerima → **429** |
| Rate limit register | 10 registrasi / jam per IP |
| Perbandingan kode timing-safe | OTP & kode reset via `crypto.timingSafeEqual` (`server/lib/validate.js`) |
| Validasi input | format email, batas panjang field, whitelist status/urgensi need, bound porsi |
| Upload gambar magic-bytes | tolak file yang bukan PNG/JPEG/GIF/WebP sungguhan (bukan cuma MIME) |
| Error 500 tidak bocor detail | pesan internal hanya di log server; klien dapat pesan generik |
| Limit ukuran field | nama/deskripsi/alamat/dicatat maksimal agar aman dari abuse |

**Env wajib di Vercel/Railway (`NODE_ENV=production` otomatis):**

| Key | Nilai |
|-----|--------|
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ADMIN_EMAIL` | email admin asli |
| `ADMIN_PASSWORD` | sandi kuat ≥12 karakter (hanya dipakai saat DB masih kosong) |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | dari app.turso.tech |

**Jangan di produksi:** CallMeBot & Gmail App Password hanya untuk demo — ganti ke WhatsApp Business API / provider email resmi saat trafik nyata.

## Kapasitas & Skala (free tier)

| Layanan | Free tier (perkiraan) | Tanda perlu upgrade |
|---------|----------------------|---------------------|
| **Vercel** | Serverless, sleep dingin di Hobby-less; bandwidth & fungsi terbatas bulanan | Situs sering cold start lama / lewat kuota bulanan → Hobby/Pro |
| **Railway** | Kuota jam-bulan kecil; service bisa stop saat habis | Build/deploy gagal “out of credits” → bayar plan kecil |
| **Turso** | Database kecil (beberapa GB), kueri terbatas | DB > free quota / butuh replika → plan berbayar |
| **SQLite lokal** | Hanya demo dev | Jangan dipakai di produksi multi-instance |

**Saat mulai ramai (ratusan pengguna/hari):**

1. Isi `CLOUDINARY_URL` — jangan simpan foto base64 di DB  
2. Aktifkan `SMTP_*` resmi (bukan hanya simulasi outbox)  
3. Ganti CallMeBot → **WhatsApp Business Cloud API** (`WHATSAPP_API_URL` + token resmi)  
4. Backup Turso otomatis via Actions (`TURSO_*` secret)  
5. Bila Vercel/Railway mulai limit → naikkan plan kecil, arsitektur kode tidak perlu diubah (stateless JWT)

Rate limit in-memory per instance (`server/lib/ratelimit.js`) cukup untuk demo/trafik kecil; untuk multi-instance produksi pindahkan ke store terpusat (mis. Redis) bila diperlukan.

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Backend | Node.js 24 + Express |
| Database | SQLite (`node:sqlite` built-in) lokal / Turso di Vercel |
| Auth | JWT + bcrypt (RBAC 4 role) |
| Frontend | SPA HTML/CSS/JS + **PWA** (installable di mobile) |
| GIS | Haversine distance + estimasi durasi rute |
| Upload | Multer (foto surplus & foto serah terima) |
| Notifikasi | In-app + **WhatsApp Gateway** + **Mail Server** (outbox) |

## Cara Menjalankan

```bash
npm install
npm run seed:accounts   # akun login saja (tanpa listing)
npm run clean           # hapus data transaksi, akun tetap
npm start               # http://localhost:3000
```

Uji end-to-end otomatis:

```bash
node e2e-test.js
```

## Akun Demo

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@foodrescue.id | admin123 |
| Donor | donor@foodrescue.id | donor123 |
| Penerima | penerima@foodrescue.id | penerima123 |
| Kurir | kurir@foodrescue.id | kurir123 |

## Alur End-to-End

1. **Donor** login → Input surplus makanan (FR-02, foto + expiry + porsi)
2. **Penerima** login → Update kebutuhan + urgensi (FR-03)
3. **Admin** klik **Jalankan AI Matching** (FR-04) → skor multi-kriteria, < 3 detik
4. **Kurir** menerima notifikasi (FR-06) → lihat rute GIS (FR-05) → upload foto kondisi makanan (FR-07) → pickup → deliver
5. **Penerima** konfirmasi serah terima via **OTP 6 digit** (FR-08)
6. **Admin** pantau dashboard analitik (FR-09), kelola pengguna (FR-10), audit log immutable

## Skema Database (ERD)

```
users 1────∞ food_listings 1────1 matches ∞────1 food_needs ∞────1 users (recipient)
                  │                  │
                  │                  ∞
                  │             otp_codes
                  │             notifications
                  ∞
             (photo_path)

users 1────∞ matches (courier_id)
audit_logs (immutable — trigger BLOCK UPDATE & DELETE)
```

### Tabel

| Tabel | Fungsi |
|-------|--------|
| `users` | 4 role (donor/recipient/courier/admin), status pending→active, lat/lng, kapasitas kurir |
| `food_listings` | FR-02 surplus makanan: nama, porsi, expiry, foto, status |
| `food_needs` | FR-03 kebutuhan pangan + urgensi (low→critical) |
| `matches` | Hasil FR-04: skor total + 4 sub-skor, jarak, rute JSON, status alur |
| `otp_codes` | FR-08 OTP 6 digit, expiry 30 menit, sekali pakai |
| `notifications` | FR-06 notifikasi per user |
| `message_outbox` | Outbox WhatsApp & email (sent/simulated/failed) |
| `audit_logs` | Log immutable (trigger SQLite cegah UPDATE/DELETE) |

## Algoritma AI Matching (FR-04)

**Bobot multi-kriteria:**

| Kriteria | Bobot | Skor |
|----------|-------|------|
| Expiry time makanan | 0.35 | ≤2 jam = 1.0 … >24 jam = 0.3 (makin mendesak, makin diprioritaskan) |
| Jarak GIS | 0.30 | ≤1 km = 1.0 … ≥30 km = 0 (jarak total: kurir→donor→penerima) |
| Urgensi penerima | 0.20 | critical=1.0, high=0.75, medium=0.5, low=0.25 |
| Kapasitas kurir | 0.15 | porsi ≤ kapasitas = 1.0 … >1.5× kapasitas = 0.2 |

```
score = 0.35·expiry + 0.30·distance + 0.20·urgency + 0.15·capacity
```

**Algoritma:** generate semua triplet (listing × need × courier) yang valid → filter jarak ≤30 km & score ≥0.3 → **greedy assignment** urut skor tertinggi (satu listing / need / courier hanya sekali) → simpan match + rute + notifikasi.

**Performa:** diukur per run, target **< 3.000 ms** (hasil demo ~1–25 ms).

## Peta FR → Implementasi

| FR | Endpoint / Lokasi |
|----|-------------------|
| FR-01 | `POST /api/auth/register`, `POST /api/auth/login`, middleware RBAC `server/middleware.js` |
| FR-02 | `POST /api/food` (multipart, foto) |
| FR-03 | `POST /api/needs`, `PATCH /api/needs/:id` |
| FR-04 | `POST /api/matches/run` → `server/lib/matching.js` |
| FR-05 | `server/lib/gis.js` (haversine + waypoint legs) |
| FR-06 | `GET /api/notifications` + fanout WA/email `server/lib/channels.js` |
| FR-07 | `POST /api/deliveries/:id/pickup` (foto wajib) |
| FR-08 | `POST /api/deliveries/:id/verify-otp` |
| FR-09 | `GET /api/admin/stats` + halaman Dashboard |
| FR-10 | `GET/PATCH/DELETE /api/admin/users` |
| Outbox | `GET /api/admin/outbox` — riwayat pesan WhatsApp & email |

## NFR yang Dipenuhi

- **Keamanan** — bcrypt (10 rounds), JWT 12h, RBAC, akun aktif setelah verifikasi admin
- **Performa** — matching < 3 detik (di-log di audit)
- **Auditabilitas** — `audit_logs` dengan trigger immutable SQLite
- **Portabilitas** — web SPA responsif + **PWA** (Donor/Penerima/Kurir bisa install dari browser mobile)
- **Skalabilitas** — stateless JWT; SQLite WAL untuk demo; siap migrasi PostgreSQL

## Notifikasi Eksternal (WhatsApp & Email)

Setiap `notify()` in-app otomatis di-fanout ke:

| Kanal | Env | Tanpa env |
|-------|-----|-----------|
| WhatsApp (CallMeBot, gratis) | `CALLMEBOT_APIKEY` | mode **simulasi** (tersimpan di outbox) |
| WhatsApp (gateway lain) | `WHATSAPP_API_URL`, `WHATSAPP_API_TOKEN` | mode **simulasi** |
| Mail Server (Gmail SMTP) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `NOTIFY_EMAIL` | mode **simulasi** |

Admin memantau lewat menu **Pesan Terkirim** (`GET /api/admin/outbox`).

Format body POST WhatsApp (kompatibel gateways umum): `{ phone, to, target, message, text, body }` + header `Authorization: Bearer <token>`.

## PWA (Mobile App)

- `public/manifest.webmanifest` + `public/sw.js` + ikon di `public/icons/`
- Tampilan standalone, bisa di-install dari Chrome/Safari mobile
- Shortcut: Catat Surplus · Konfirmasi OTP · Tugas Kurir
- API selalu network-first; aset di-cache untuk offline shell

## Struktur Proyek

```
food-rescue-ai/
├── package.json
├── server/
│   ├── index.js          # entry Express
│   ├── db.js             # skema SQLite + trigger immutable
│   ├── seed.js           # data demo
│   ├── middleware.js      # auth + RBAC
│   ├── lib/
│   │   ├── auth.js       # bcrypt + JWT + OTP
│   │   ├── gis.js        # haversine + rute
│   │   ├── matching.js   # algoritma multi-kriteria
│   │   ├── messenger.js  # kirim WhatsApp & email
│   │   ├── channels.js   # fanout notify → outbox
│   │   └── audit.js      # audit + notifikasi
│   └── routes/
│       ├── auth.js  food.js  needs.js
│       ├── matching.js  deliveries.js
│       ├── notifications.js  admin.js
├── public/               # SPA + PWA (manifest, sw, icons)
├── uploads/              # foto
├── data/                 # food_rescue.db
└── e2e-test.js           # uji alur lengkap
```
