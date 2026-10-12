# EcoMatch

**AI Routing Sampah Makanan MBG ke TPS Pengolah — Kota Madiun, Jawa Timur**

Platform redistribusi sampah makanan dari dapur MBG (Makan Bergizi Gratis) ke **TPS Pengolah** (kompos, maggot, eco-enzyme) berbasis **AI Routing & GIS** — menghubungkan Donor MBG, TPS Pengolah, Kurir, dan Admin.

Dibangun sesuai dokumen SKPL versi 2.0: **17 FR + 11 NFR**.

## Tautan

| Yang dituju | Tautan |
|---|---|
| Repositori Publik (GitHub) | https://github.com/naylaaurellia18-web/ecomatch |
| Riwayat Pipeline CI/CD (GitHub Actions) | https://github.com/naylaaurellia18-web/ecomatch/actions |
| Aplikasi Live (Vercel) | https://ecomatch-blond.vercel.app |
| Arsip Food Rescue AI (versi asli sebelum rebrand) | https://github.com/naylaaurellia18-web/food-rescue-ai |

> **CI/CD:** setiap push ke `main` → uji e2e + audit tab → auto-deploy backend ke Railway (service `food-rescue-ai`, butuh secret `RAILWAY_TOKEN`). Uptime monitor `GET /api/health` tiap 15 menit (`vars.PRODUCTION_URL`). Panduan lengkap: [`DEPLOY.md`](DEPLOY.md).

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Backend | Node.js 24 + Express |
| Database | **PostgreSQL + PostGIS** (SKPL) via `DATABASE_URL` — fallback libSQL/Turso & SQLite lokal |
| AI Routing | Mesin skoring multi-kriteria in-process (`backend/lib/routing.js`) + layanan **Python FastAPI** (`ai/`, timeout → fallback JS) |
| Klasifikasi | Rule-based transparan + skor keyakinan + verifikasi admin (NFR-10 ≥ 85%) |
| Auth | JWT HS256 + bcrypt (RBAC 4 role: `donor_mbg`, `tps_pengolah`, `kurir`, `admin`) |
| Frontend | SPA HTML/CSS/JS + **PWA** (installable di mobile) |
| GIS | Leaflet + OpenStreetMap, **OSRM** (rute jalan) fallback haversine, jarak PostGIS `ST_Distance`/`ST_DWithin` |
| Upload | Multer (1 MB, magic-bytes) — Cloudinary opsional / base64 demo |
| Notifikasi | In-app + **WhatsApp Gateway** + **Mail Server** (outbox `backend/lib/channels.js`) |

## Cara Menjalankan

```bash
npm install
docker compose up -d                 # PostgreSQL + PostGIS di :5433 (opsional — tanpa ini pakai SQLite lokal)
cp .env.example .env                 # isi DATABASE_URL bila pakai Docker di atas
npm run seed:local -- --force --full # akun demo + data sampah demo Madiun
npm run start:local                  # http://localhost:3000
```

Layanan AI Python (opsional — bila mati, mesin JavaScript otomatis dipakai):

```bash
npm run start:ai                     # FastAPI di http://127.0.0.1:8001
```

Uji end-to-end (server harus sedang jalan):

```bash
npm run test:e2e                     # 45 pemeriksaan alur lengkap
node tab-audit.js                    # audit API tiap tab per peran (23 cek)
```

Verifikasi sehat: `GET /api/health` → `{"status":"ok","service":"EcoMatch","db":{...},"ai_routing":{...}}`

### Akun Demo

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@ecomatch.id | admin123 |
| Donor MBG | donor@ecomatch.id | donor123 |
| TPS Pengolah | tps@ecomatch.id | tps123 |
| Kurir | kurir@ecomatch.id | kurir123 |

> Mode: `--force --full` (akun + data demo) · `--force --accounts` (hanya akun login) · `--clean` (hapus data transaksi, akun tetap). Di **produksi** akun demo tidak dibuat — admin datang dari `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

## Alur End-to-End

1. **Donor MBG** login → unggah sampah makanan: jenis, berat, foto, waktu produksi (FR-02)
2. **Klasifikasi AI** menyarankan kategori + tingkat pembusukan + skor keyakinan (FR-11); admin verifikasi bila keyakinan rendah
3. **AI Routing** menjalankan alokasi → TPS Pengolah terbaik: filter aturan + skor multi-kriteria, < 3 detik (FR-04/13) + penjelasan skor (`/explain`)
4. **Kurir** foto jemput (FR-07) → lihat rute GIS MBG → TPS (FR-05, OSRM) → foto antar
5. **TPS** konfirmasi serah terima via **OTP 6 digit** (FR-08) → catat hasil pengolahan input/output kg (FR-12)
6. **Admin** pantau dashboard (FR-09), kepatuhan regulasi & traceability end-to-end (FR-14/17), kelola pengguna + audit immutable (FR-10), konfigurasi regulasi daerah (FR-16)
7. **Donor MBG** kumpulkan poin & sertifikat kepatuhan (FR-15); notifikasi in-app/WA/email ke semua pihak (FR-06); profil & registrasi TPS (FR-03)

## Peta FR → Implementasi

| FR | Endpoint / Lokasi |
|----|-------------------|
| FR-01 | `POST /api/auth/register` · `POST /api/auth/login` · lupa/reset sandi — RBAC `backend/middleware.js` |
| FR-02 | `POST /api/waste` (multipart, foto) · `GET /api/waste/mine` · `PATCH|DELETE /api/waste/:id` |
| FR-03 | `GET|PATCH /api/tps/me` — profil TPS Pengolah |
| FR-04 | `POST /api/routing/run` · `GET /api/routing` · `GET /api/routing/:id/explain` → `backend/lib/routing.js` |
| FR-05 | `GET /api/geo` · `GET /api/geo/nearby` → `backend/lib/gis.js` (OSRM + haversine) |
| FR-06 | `GET /api/notifications` + fanout WA/email `backend/lib/channels.js` |
| FR-07 | `POST /api/deliveries/:id/pickup` · `POST /api/deliveries/:id/deliver` (foto wajib) |
| FR-08 | `POST /api/deliveries/:id/verify-otp` · `POST /api/deliveries/:id/resend-otp` |
| FR-09 | `GET /api/admin/stats` — kg dialihkan, TPS aktif, cakupan |
| FR-10 | `GET /api/admin/users` · `PATCH /api/admin/users/:id/status` · `GET /api/admin/audit` (log immutable) |
| FR-11 | `POST /api/classify` · `GET /api/classify/:id` · `PATCH /api/classify/:id/verify` |
| FR-12 | `POST /api/tps/register` · `GET /api/tps/list` · `POST /api/tps/:id/log` · `GET /api/tps/:id/dashboard` |
| FR-13 | Bobot routing di `config/routing.json` (bagian FR-04) |
| FR-14 | `GET /api/compliance/summary` · `/report` · `/trace/:id` · `/regulations` |
| FR-15 | `GET /api/mbg/motivation` · `POST /api/mbg/motivation/claim` · `GET /api/admin/mbg/report` |
| FR-16 | `POST|PATCH|GET /api/admin/regulations` — aturan JSON per daerah (default `KOTA_MADIUN`) |
| FR-17 | `GET /api/compliance/trace/:id` — MBG → klasifikasi → alokasi → pengolahan |

Detail lengkap (tabel DB, logic, tech): [`docs/arsitektur/Dokumen_Arsitektur_Sistem_EcoMatch_v2.0.md`](docs/arsitektur/Dokumen_Arsitektur_Sistem_EcoMatch_v2.0.md) §2–§3.

## NFR yang Dipenuhi

- **Keamanan (NFR-01)** — bcrypt 10 rounds, JWT 12 jam, RBAC per-route, rate-limit login/OTP/register
- **Performa (NFR-02)** — AI Routing < 3 detik (in-process + timeout fallback); hasil evaluasi ~0,3 ms/run
- **Ketersediaan (NFR-03)** — healthcheck `/api/health`, auto-restart, uptime monitor 15 menit
- **Skalabilitas (NFR-04)** — JWT stateless (tanpa sesi) → horizontal scale; PostgreSQL + PostGIS
- **Usability (NFR-05)** — API tunggal per aksi, PWA offline-first, form lokasi terpandu
- **Akurasi jarak (NFR-06)** — OSRM rute jalan, fallback haversine; adapter GIS bisa ditukar
- **Portabilitas (NFR-07)** — PWA installable Android/iOS, CSP ketat, browser evergreen
- **Auditabilitas (NFR-08)** — `log_audit` immutable via trigger DB + bukti foto + OTP sekali pakai
- **Kepatuhan (NFR-09)** — traceability tiap kg: MBG → TPS → output olahan (`pengolahan_log`)
- **Klasifikasi (NFR-10)** — rule-based + skor keyakinan + jalur verifikasi admin
- **Fleksibilitas daerah (NFR-11)** — regulasi sebagai data JSON per `kode_daerah`

## Algoritma AI Routing (FR-04/13)

**Bobot multi-kriteria** (`config/routing.json`):

| Kriteria | Bobot | Skor |
|----------|-------|------|
| Kesesuaian jenis | 0.35 | `jenis_diterima` TPS memuat kategori sampah = 1.0 |
| Kapasitas | 0.25 | min(sisa kapasitas TPS, kapasitas kurir) ÷ berat sampah |
| Jarak | 0.25 | haversine sampah → TPS; skor penuh di ≤ 1 km, linear → 0 di radius 15 km |
| Urgensi pembusukan | 0.15 | busuk (>24 jam) = 1,0 · sedang (≤24 jam) = 0,6 · segar (≤12 jam) = 0,3 — yang paling mendesak diprioritaskan |

```
skor = 0.35·jenis_cocok + 0.25·kapasitas + 0.25·jarak + 0.15·urgensi
```

**Filter aturan:** TPS `aktif` saja · kategori harus diterima · radius 15 km · skor ≥ **0,30** (`BATAS_SKOR`) — TPS yang gugur diberi alasan. Setelah lulus filter: **greedy assignment** urut trip terdekat → simpan `alokasi` + 4 sub-skor + `jarak_km` + `rute_json` + penjelasan.

**Mesin:** layanan Python `ai/routing.py` (timeout 1,8 dtk) → bila gagal, `backend/lib/routing.js` in-process. Provider rute: OSRM (`ROUTE_PROVIDER=osrm`) / haversine.

**Hasil evaluasi 30 skenario** (banding vs baseline jarak-saja, [`docs/pengujian/`](docs/pengujian/)):

| Metrik | EcoMatch AI | Baseline |
|--------|-------------|----------|
| Alokasi sah | 50,00% | 50,00% |
| Jarak rata-rata | 30,18 km | 20,68 km |
| Skor rata-rata | 0,91 | 0,83 |
| % sampah busuk yang tetap dialihkan | **87,68%** | 56,88% |
| % sampah tidak segar dialihkan (gabungan) | **73,78%** | 56,33% |

> AI Routing rela menempuh jarak lebih jauh agar sampah busuk/tidak segar tetap sampai ke TPS — dampak utama kepatuhan (lihat `Laporan_Evaluasi_System.md`).

## Struktur Proyek

```
ecomatch/
├── package.json            # nama: ecomatch
├── backend/
│   ├── index.js            # entry Express
│   ├── app.js              # middleware + /api/health
│   ├── db.js               # PostgreSQL / libSQL / SQLite + trigger immutable
│   ├── middleware.js       # auth + RBAC
│   ├── seed.js             # data demo (--force --full | --accounts | --clean)
│   ├── lib/                # routing, gis, klasifikasi, auth, audit, channels, ...
│   └── routes/             # auth, waste, classify, tps, routing, geo,
│                           # deliveries, compliance, mbg, notifications, admin
├── ai/                    # layanan Python FastAPI (routing + klasifikasi)
├── config/routing.json     # bobot, radius, BATAS_SKOR
├── frontend/              # SPA + PWA (manifest, sw, icons)
├── docs/                   # SKPL, arsitektur (+ UML), laporan, pengujian
├── scripts/                # evaluasi-30-skenario.js, gen_uml_drawio.py, backup-db.js
├── e2e-test.js             # uji alur lengkap (45 pemeriksaan)
├── tab-audit.js            # audit API tiap tab per peran
└── docker-compose.yml      # PostgreSQL + PostGIS lokal
```

## Pengujian & CI

| Uji | Perintah | Cakupan |
|-----|----------|---------|
| E2E | `npm run test:e2e` | 45 pemeriksaan: auth→waste→routing→deliveries→OTP→pengolahan→compliance |
| Audit tab | `node tab-audit.js` | 23 pemeriksaan API per tab & peran |
| Evaluasi | `node scripts/evaluasi-30-skenario.js` | 30 skenario vs baseline + sensitivitas + kecepatan |
| CI | `.github/workflows/ci.yml` | seed → server → e2e + audit → auto-deploy Railway |
| Uptime | `.github/workflows/uptime.yml` | `GET /api/health` tiap 15 menit |

## Keamanan (Ringkas)

- `JWT_SECRET` wajib ≥ 32 char di produksi — app **gagal start** tanpa itu
- Rate limit: login 5 gagal/15 mnt, OTP 5/15 mnt, register 10/jam → **429**
- OTP & kode reset dibanding `crypto.timingSafeEqual`
- Security headers: CSP tanpa `unsafe-inline` script, HSTS (HTTPS), `nosniff`, `X-Frame-Options: DENY`, CORS allowlist `ALLOWED_ORIGINS`
- Upload gambar magic-bytes (tolak file palsu), limit ukuran field
- `log_audit` immutable: trigger DB menolak UPDATE & DELETE
- Error 500 tidak bocor detail internal; pesan generik ke klien

## PWA (Mobile App)

- `frontend/manifest.webmanifest` + `frontend/sw.js` + ikon di `frontend/icons/`
- Standalone, install dari Chrome/Safari mobile; API network-first, shell di-cache untuk offline
- Shortcut: unggah sampah · tugas kurir · konfirmasi OTP

## Dokumen Proyek

| Dokumen | Isi |
|---------|-----|
| [`docs/SKPL_EcoMatch_v2.0.docx`](docs/SKPL_EcoMatch_v2.0.docx) | SKPL EcoMatch v2.0 — 17 FR + 11 NFR |
| [`docs/arsitektur/Dokumen_Arsitektur_Sistem_EcoMatch_v2.0.md`](docs/arsitektur/Dokumen_Arsitektur_Sistem_EcoMatch_v2.0.md) | Arsitektur lengkap: FR/NFR → backend, keputusan desain |
| [`docs/arsitektur/UML_EcoMatch.drawio`](docs/arsitektur/UML_EcoMatch.drawio) | 12 diagram (activity, sequence, class, ERD, arsitektur) — buka di draw.io |
| [`docs/Laporan_Project_EcoMatch_v1.0.docx`](docs/Laporan_Project_EcoMatch_v1.0.docx) | Laporan project (docx) — Bab 1–4, evaluasi 30 skenario |
| [`docs/pengujian/Laporan_Evaluasi_System.md`](docs/pengujian/Laporan_Evaluasi_System.md) | Naskah uji sistem + hasil 30 skenario |
| [`DEPLOY.md`](DEPLOY.md) | Panduan deploy (lokal/Railway/Render/Vercel) |
