# EcoMatch — Panduan Deploy

## Opsi Deploy

| Opsi | Cocok untuk | Konfigurasi |
|------|-------------|-------------|
| **Lokal (dev/demo)** | pengembangan & demo TA | `docker-compose.yml` (PostGIS :5433) + `npm run start:local` |
| **Vercel (produksi)** | fullstack serverless — live sekarang | `vercel.json` + `api/index.js` + `api/ai.py` + database PostgreSQL + PostGIS (Neon) |
| **PostgreSQL + PostGIS** | sesuai SKPL (standalone/managed) | `DATABASE_URL` (Docker lokal atau Postgres terkelola) |

**Prioritas database:** `DATABASE_URL` (PostgreSQL + PostGIS) → `TURSO_DATABASE_URL` (libSQL) → SQLite lokal `data/ecomatch.db`.

---

## 1. Jalankan Lokal

```powershell
npm install
docker compose up -d                 # PostgreSQL + PostGIS di :5433
copy .env.example .env               # DATABASE_URL menunjuk ke Docker di atas
npm run seed:local -- --force --full # akun demo + data sampah Madiun
npm run start:local                  # http://localhost:3000
```

Tanpa Docker, app otomatis memakai SQLite lokal (cukup `npm run seed -- --force --full` + `npm start`).

Layanan AI Python (opsional — bila tidak jalan, mesin JavaScript dipakai otomatis):

```powershell
npm run start:ai                     # FastAPI :8001
```

Verifikasi:

```
GET /api/health
→ {"status":"ok","service":"EcoMatch","db":{"dialek":"postgresql",...},
   "ai_routing":{...},"routing":{"provider":"osrm","fallback":"haversine"},...}
```

Uji end-to-end (server sedang jalan): `npm run test:e2e` · `node tab-audit.js`

---

## 2. Environment Variables

### Wajib di produksi (`NODE_ENV=production`)

| Key | Nilai |
|-----|--------|
| `JWT_SECRET` | ≥32 karakter acak — generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` — app **gagal start** tanpa ini |
| `ADMIN_EMAIL` | email admin asli (dipakai saat DB kosong) |
| `ADMIN_PASSWORD` | sandi kuat ≥12 karakter (hanya saat DB kosong) |
| `DATABASE_URL` / `TURSO_*` | koneksi database (lihat tabel prioritas di atas) |

### Database & AI Routing

| Key | Fungsi |
|-----|--------|
| `DATABASE_URL` | PostgreSQL + PostGIS (contoh Docker: `postgresql://postgres:ecomatch@127.0.0.1:5433/ecomatch`) |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | libSQL cloud (opsional) |
| `AI_MATCHING_URL` | layanan Python (`http://127.0.0.1:8001`) — kosong/gagal → mesin JS |
| `ROUTE_PROVIDER` | `osrm` (default) atau `haversine` |
| `OSRM_BASE_URL` / `OSRM_TIMEOUT_MS` | OSRM publik default / timeout (fallback haversine) |

### Opsional

| Key | Fungsi |
|-----|--------|
| `ALLOW_DEMO_ACCOUNTS` | izinkan akun demo di produksi (TIDAK disarankan) |
| `ALLOWED_ORIGINS` | CORS allowlist (pisah koma); kosong = same-origin only |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | email lupa sandi & notifikasi (tanpa env → mode simulasi/outbox) |
| `MAIL_FROM` / `NOTIFY_EMAIL` | alamat pengirim / tujuan notifikasi |
| `CLOUDINARY_URL` | foto ke Cloudinary (tanpa env → base64 di DB, demo) |
| `CALLMEBOT_APIKEY` | WhatsApp via CallMeBot (demo) |
| `WHATSAPP_API_URL` / `WHATSAPP_API_TOKEN` | gateway WhatsApp lain (produksi: provider resmi) |

---

## 3. Deploy ke Vercel (produksi) — PostgreSQL + PostGIS (Neon)

1. Buat database **PostgreSQL + PostGIS** gratis di **Neon** (https://neon.tech): **Create project** → catat **pooled connection string** (host berisi `-pooler`, akhiri `?sslmode=require`)
2. Buka **https://vercel.com** → Add New → Project → import repo (deteksi `vercel.json`)
3. Isi environment variables:

   | Key | Nilai |
   |-----|--------|
   | `DATABASE_URL` | pooled connection string Neon (`?sslmode=require`) |
   | `JWT_SECRET` | **wajib ≥32 karakter acak** |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | admin pertama (saat DB kosong) |

4. **Build & Deploy** → URL `https://<nama>-xxx.vercel.app`; saat boot pertama `db.js` otomatis menjalankan `CREATE EXTENSION IF NOT EXISTS postgis`
5. Verifikasi: `GET /api/health` → `db.dialek = "postgresql"`, `db.postgis = true`
6. **Auto-deploy:** setiap push ke `main` (setelah uji e2e lulus di `ci.yml`) memicu Vercel Deploy Hook (secret `VERCEL_DEPLOY_HOOK`).

> Fallback: bila `DATABASE_URL` kosong, app memakai Turso/libSQL (`TURSO_*`) atau SQLite lokal — namun PostGIS & query spasial hanya aktif di mode PostgreSQL.

---

## 4. Reset & Backup Data

| Aksi | Perintah |
|------|----------|
| Bersihkan data transaksi, akun tetap | `npm run clean` |
| Reset total + akun demo | `npm run seed:local -- --force --full` |
| Reset total + akun login saja | `npm run seed:local -- --force --accounts` |
| Backup SQLite lokal / Turso / PostgreSQL | `node scripts/backup-db.js` |
| Backup PostgreSQL | `pg_dump "$DATABASE_URL" > backup.sql` |
| Reset Turso via SQL | [`backend/reset-turso.sql`](backend/reset-turso.sql) → SQL console Turso → Run → redeploy |

> `--force` menghapus semua user lalu seed ulang — jangan jalankan di produksi tanpa `ALLOW_FORCE_SEED_PRODUCTION=1`.

---

## 5. Notifikasi Nyata (WhatsApp & Email)

### WhatsApp — CallMeBot (demo, gratis)

1. Buka **https://www.callmebot.com** → catat nomor bot
2. Simpan nomor itu di kontak HP → kirim dari WhatsApp: `I allow callmebot to send me messages`
3. Balasan berisi `APIKEY` → isi env `CALLMEBOT_APIKEY=123456` → restart/redeploy

### Email — Gmail App Password

1. **https://myaccount.google.com** → Keamanan → aktifkan Verifikasi 2 Langkah
2. **App passwords** → buat baru (nama bebas, mis. `EcoMatch`) → dapat password 16 digit
3. Isi env: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=<email>`, `SMTP_PASS=<app password>`, `MAIL_FROM="EcoMatch <email>"`, `NOTIFY_EMAIL=<email>`
4. Restart lokal / Redeploy

### Cek status

Dashboard admin → menu **Pesan Terkirim**: `sent` = nyata, `simulated` = demo (outbox), `failed` = gagal + alasan. Tanpa SMTP, kode lupa sandi tetap muncul di outbox admin.

---

## 6. Troubleshooting

| Masalah | Solusi |
|---------|--------|
| App crash start di produksi | `JWT_SECRET` belum di-set / <32 char — isi lalu redeploy |
| Gagal koneksi PostgreSQL | Cek `DATABASE_URL`, container `docker compose up -d` (lokal), port 5433 |
| Login admin tidak bisa | DB sudah terisi — pakai admin seed / reset (bagian 4) lalu set `ADMIN_*` |
| Lupa sandi tidak masuk email | Set `SMTP_*` — tanpa itu kode hanya muncul di **Pesan Terkirim** (butuh login admin) |
| AI Routing lambat / gagal | Cek `npm run start:ai` & `AI_MATCHING_URL` — otomatis fallback ke mesin JS in-process |
| Rute OSRM timeout | Normal saat luring → otomatis fallback haversine (`routing.fallback` di `/api/health`) |
| Tabel tidak ada | Biarkan — app auto-create saat boot |
| Foto terlalu besar | Limit upload 1 MB; opsional `CLOUDINARY_URL` |
| Database lokal korup | Hapus `data/ecomatch.db*` lalu seed ulang |

---

## 7. Struktur Deploy

```
ecomatch/
├── api/index.js          ← entry Vercel (export Express app)
├── api/ai.py             ← Vercel Python Function (AI matching)
├── vercel.json           ← config build + route Vercel
├── docker-compose.yml    ← PostgreSQL + PostGIS (lokal)
├── .github/workflows/    ← ci.yml (e2e + auto-deploy Vercel), uptime.yml (15 menit)
├── backend/index.js       ← entry Express (lokal/standalone)
├── backend/app.js         ← Express app (shared semua platform)
├── backend/db.js          ← auto: PostgreSQL → libSQL/Turso → SQLite
├── frontend/               ← SPA + PWA
└── data/                 ← SQLite lokal (tidak di-deploy)
```
