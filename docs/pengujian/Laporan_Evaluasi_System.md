# Laporan Evaluasi Sistem EcoMatch

**Naskah uji 30 skenario — AI Routing Sampah Makanan MBG ke TPS Pengolah (Kota Madiun)**

Berkas ini adalah deliverable Fase 6 (Dokumen Arsitektur EcoMatch v2.0, §8 dan §9B).
Seluruh angka di bawah dihasilkan langsung oleh berkas sumber
`docs/pengujian/evaluasi-30-skenario.json`; angka yang sama dipakai pada
`docs/Laporan_Project_EcoMatch_v1.0.docx` (Bagian 3).

---

## 1. Tujuan dan ruang lingkup

Menguji apakah AI Routing (skor multi-kriteria berbobot + greedy assignment) lebih baik
dari baseline **Greedy Jarak-Saja** pada metrik yang mewakili tujuan sistem:

| Metrik | Alasan |
|--------|--------|
| % sampah teralokasi | Cakupan layanan (dibatasi jumlah kurir). |
| Total jarak tempuh (km) | Proxy biaya logistik. |
| Rata-rata skor kualitas | Kualitas kombinasi sampah-TPS yang dipilih. |
| % sampah busuk (urgensi tinggi) teralokasi | Prioritas utama: sampah > 24 jam. |
| % sampah sedang (hampir busuk) tersalur | Pendukung: sampah 12-24 jam. |
| % sampah tidak segar (sedang + busuk) teralokasi | Metrik gabungan kedua tingkat di atas. |

Uji pendukung: sensitivitas ambang `BATAS_SKOR` dan uji kecepatan (NFR-02: < 3 detik).

## 2. Konfigurasi yang diuji

| Komponen | Nilai |
|----------|-------|
| Konfigurasi final | `config/routing.json` — bobot jenis_cocok 0,35; kapasitas 0,25; jarak 0,25; urgensi 0,15 |
| Radius layanan | 15 km (jarak sampah -> TPS, haversine) |
| Ambang skor (`BATAS_SKOR`) | 0,3 |
| Mesin evaluasi | `backend/lib/routing.js` — `hitungRouting()` + `hitungSkor()` (kode produksi) |
| Baseline pembanding | Greedy Jarak-Saja: filter aturan sama, kandidat diurut trip terpendek (kurir -> sampah -> TPS), **tanpa** `BATAS_SKOR` |
| Skenario | 30 skenario (seed 0-29), masing-masing 6 sampah, 6 TPS Pengolah, 3 kurir |
| Generator | mulberry32 deterministik; umur sampah {1,4,8,14,18,26,40} jam; berat 5-60 kg; kapasitas TPS 50-300 kg/hari; kapasitas kurir {30,50,70,100} kg; bbox Kota Madiun |
| Titik waktu tetap | `nowMs = 1770000000000` (umur/tingkat stabil antar-skenario) |

## 3. Cara menjalankan

```bash
# dari root repository (Node.js >= 20, tanpa dependensi tambahan)
node scripts/evaluasi-30-skenario.js
```

Keluaran: ringkasan ke stdout + berkas `docs/pengujian/evaluasi-30-skenario.json`
berisi `meta`, `per_skenario` (30 entri lengkap: metrik, alokasi, detail), `ringkasan`,
`banding`, `sensitivitas`, dan `kecepatan`. Hasil selalu sama pada mesin mana pun
(generator deterministik + titik waktu tetap).

## 4. Hasil ringkasan (30 skenario, rata-rata ± simpangan baku)

| Metrik | AI Routing | Greedy Jarak-Saja (baseline) |
|--------|-----------:|-----------------------------:|
| % sampah teralokasi | 50,00 ± 0,00 | 50,00 ± 0,00 |
| Total jarak per skenario (km) | 30,18 ± 6,74 | 20,68 ± 4,22 |
| Rata-rata skor kualitas | 0,91 ± 0,02 | 0,83 ± 0,06 |
| % sampah busuk teralokasi | 87,68 ± 26,69 | 56,88 ± 42,84 |
| % sampah sedang tersalur | 58,00 ± 39,12 | 62,00 ± 36,81 |
| % sampah tidak segar teralokasi | 73,78 ± 24,76 (n=30) | 56,33 ± 30,99 (n=30) |

Catatan: cakupan keduanya sama (50%) karena dibatasi 3 kurir untuk 6 sampah per
skenario; metrik pembanding yang bermakna adalah urgensi pembusukan dan skor kualitas.
Pada sampah sedang hasil praktis setara (baseline tetap mengalokasikan sampah sedang
yang kebetulan dekat), tetapi pada gabungan tidak segar AI Routing unggul jelas.

## 5. Hasil per skenario (seed 0-29)

Nilai "-" = skenario tidak memiliki sampah pada tingkat tersebut.

| Seed | Strategi | Jarak (km) | Skor | Busuk (%) | Sedang (%) | Tidak segar (%) |
|-----:|----------|-----------:|-----:|----------:|-----------:|----------------:|
| 0 | AI Routing | 31,32 | 0,94 | 100,00 | 50,00 | 75,00 |
| 0 | Jarak-Saja | 26,72 | 0,85 | 50,00 | 50,00 | 50,00 |
| 1 | AI Routing | 19,15 | 0,92 | - | 100,00 | 100,00 |
| 1 | Jarak-Saja | 11,43 | 0,81 | - | 33,33 | 33,33 |
| 2 | AI Routing | 39,03 | 0,89 | - | 66,67 | 66,67 |
| 2 | Jarak-Saja | 20,43 | 0,78 | - | 33,33 | 33,33 |
| 3 | AI Routing | 29,18 | 0,90 | 100,00 | 100,00 | 100,00 |
| 3 | Jarak-Saja | 23,64 | 0,78 | 0,00 | 100,00 | 33,33 |
| 4 | AI Routing | 26,99 | 0,89 | - | 100,00 | 100,00 |
| 4 | Jarak-Saja | 20,66 | 0,79 | - | 100,00 | 100,00 |
| 5 | AI Routing | 41,60 | 0,91 | 50,00 | 100,00 | 60,00 |
| 5 | Jarak-Saja | 20,67 | 0,82 | 25,00 | 100,00 | 40,00 |
| 6 | AI Routing | 31,70 | 0,86 | 0,00 | 50,00 | 33,33 |
| 6 | Jarak-Saja | 21,46 | 0,76 | 0,00 | 50,00 | 33,33 |
| 7 | AI Routing | 31,64 | 0,91 | 100,00 | 50,00 | 66,67 |
| 7 | Jarak-Saja | 25,29 | 0,91 | 100,00 | 50,00 | 66,67 |
| 8 | AI Routing | 39,62 | 0,89 | 100,00 | 66,67 | 75,00 |
| 8 | Jarak-Saja | 26,89 | 0,82 | 0,00 | 66,67 | 50,00 |
| 9 | AI Routing | 22,45 | 0,95 | 100,00 | 66,67 | 75,00 |
| 9 | Jarak-Saja | 22,45 | 0,95 | 100,00 | 66,67 | 75,00 |
| 10 | AI Routing | 22,70 | 0,93 | 100,00 | 100,00 | 100,00 |
| 10 | Jarak-Saja | 20,37 | 0,93 | 100,00 | 100,00 | 100,00 |
| 11 | AI Routing | 19,98 | 0,92 | 100,00 | 0,00 | 66,67 |
| 11 | Jarak-Saja | 17,16 | 0,88 | 100,00 | 0,00 | 66,67 |
| 12 | AI Routing | 35,96 | 0,93 | 100,00 | 0,00 | 50,00 |
| 12 | Jarak-Saja | 26,37 | 0,82 | 100,00 | 0,00 | 50,00 |
| 13 | AI Routing | 27,16 | 0,89 | 100,00 | 50,00 | 66,67 |
| 13 | Jarak-Saja | 19,99 | 0,81 | 100,00 | 50,00 | 66,67 |
| 14 | AI Routing | 37,95 | 0,91 | 100,00 | 0,00 | 50,00 |
| 14 | Jarak-Saja | 25,29 | 0,81 | 100,00 | 100,00 | 100,00 |
| 15 | AI Routing | 19,12 | 0,93 | 100,00 | - | 100,00 |
| 15 | Jarak-Saja | 15,28 | 0,90 | 50,00 | - | 50,00 |
| 16 | AI Routing | 39,47 | 0,92 | 100,00 | - | 100,00 |
| 16 | Jarak-Saja | 22,91 | 0,78 | 0,00 | - | 0,00 |
| 17 | AI Routing | 28,55 | 0,87 | 100,00 | 0,00 | 50,00 |
| 17 | Jarak-Saja | 22,71 | 0,83 | 100,00 | 0,00 | 50,00 |
| 18 | AI Routing | 37,83 | 0,91 | 66,67 | 50,00 | 60,00 |
| 18 | Jarak-Saja | 21,09 | 0,81 | 66,67 | 50,00 | 60,00 |
| 19 | AI Routing | 23,38 | 0,90 | - | 100,00 | 100,00 |
| 19 | Jarak-Saja | 21,96 | 0,83 | - | 100,00 | 100,00 |
| 20 | AI Routing | 31,01 | 0,93 | 66,67 | - | 66,67 |
| 20 | Jarak-Saja | 11,91 | 0,85 | 33,33 | - | 33,33 |
| 21 | AI Routing | 33,89 | 0,93 | 100,00 | 0,00 | 66,67 |
| 21 | Jarak-Saja | 17,31 | 0,86 | 0,00 | 100,00 | 33,33 |
| 22 | AI Routing | 25,91 | 0,90 | - | 100,00 | 100,00 |
| 22 | Jarak-Saja | 17,88 | 0,77 | - | 50,00 | 50,00 |
| 23 | AI Routing | 37,52 | 0,90 | 100,00 | 100,00 | 100,00 |
| 23 | Jarak-Saja | 20,68 | 0,90 | 100,00 | 100,00 | 100,00 |
| 24 | AI Routing | 24,41 | 0,94 | 100,00 | - | 100,00 |
| 24 | Jarak-Saja | 25,03 | 0,94 | 100,00 | - | 100,00 |
| 25 | AI Routing | 30,30 | 0,93 | 100,00 | - | 100,00 |
| 25 | Jarak-Saja | 17,37 | 0,71 | 0,00 | - | 0,00 |
| 26 | AI Routing | 33,24 | 0,92 | 100,00 | 50,00 | 75,00 |
| 26 | Jarak-Saja | 16,29 | 0,86 | 50,00 | 100,00 | 75,00 |
| 27 | AI Routing | 31,09 | 0,84 | - | 50,00 | 50,00 |
| 27 | Jarak-Saja | 19,71 | 0,77 | - | 100,00 | 100,00 |
| 28 | AI Routing | 20,02 | 0,94 | 33,33 | 100,00 | 60,00 |
| 28 | Jarak-Saja | 14,74 | 0,87 | 33,33 | 50,00 | 40,00 |
| 29 | AI Routing | 33,13 | 0,89 | - | 0,00 | 0,00 |
| 29 | Jarak-Saja | 26,60 | 0,84 | - | 0,00 | 0,00 |

## 6. Banding skenario demi skenario

| Metrik | Skenario ada | AI lebih baik | Sama | AI lebih buruk |
|--------|-------------:|--------------:|-----:|---------------:|
| % sampah busuk teralokasi | 23 | 10 | 13 | 0 |
| % sampah sedang tersalur | 25 | 4 | 17 | 4 |
| % sampah tidak segar (gabungan) | 30 | 13 | 15 | 2 |
| Rata-rata skor kualitas | 30 | 26 | 4 | 0 |
| Total jarak | 30 | 1 (AI lebih pendek) | 1 | 28 (baseline lebih pendek) |

Jarak per pasangan: AI Routing 10,1 km berbanding baseline 6,9 km; pasangan terjauh AI Routing 18,0 km, baseline 13,7 km.

## 7. Uji sensitivitas ambang skor

| BATAS_SKOR | Rata-rata jumlah alokasi | Rata-rata skor kualitas |
|-----------:|------------------------:|------------------------:|
| 0,10 | 3,00 | 0,910 |
| 0,30 (dipakai) | 3,00 | 0,910 |
| 0,50 | 3,00 | 0,910 |
| 0,60 | 3,00 | 0,910 |
| 0,70 | 3,00 | 0,910 |
| 0,75 | 3,00 | 0,910 |
| 0,80 | 2,90 | 0,915 |
| 0,85 | 2,70 | 0,922 |
| 0,90 | 1,57 | 0,856 |

Interpretasi: alokasi tetap penuh (3,00) pada ambang 0,10-0,75 karena hambatan
sebenarnya adalah jumlah kurir; ambang 0,85 mulai memangkas (2,70) dan 0,90 anjlok
(1,57) dengan skor rata-rata ikut turun (0,856) karena skenario tanpa alokasi ikut
dihitung nol. Nilai 0,3 berada di zona aman.

## 8. Uji kecepatan (NFR-02: < 3 detik)

| Skenario | Dimensi | Waktu rata-rata | SLA |
|----------|---------|----------------:|----:|
| Kecil | 6 sampah, 6 TPS, 3 kurir | 0,288 ms | 3 detik |
| Besar | 50 sampah, 50 TPS, 20 kurir | 0,207 detik | 3 detik |

Waktu di atas adalah komputasi algoritma murni (`hitungRouting()`); latensi jaringan
dan database sistem sesungguhnya belum diperhitungkan tetapi tetap jauh di bawah SLA.

## 9. Temuan dan keterbatasan

1. **Busuk didahulukan.** Pada 23 skenario yang memiliki sampah busuk, AI Routing
   tidak pernah lebih buruk dari baseline (10 menang, 13 seri, 0 kalah) dan
   mengalokasikan 100% sampah busuk pada 18 di antaranya; rata-rata 87,68% berbanding
   56,88%.
2. **Sedang praktis setara** (58,00% berbanding 62,00%) — konsekuensi langsung dari
   prioritas busuk; pada gabungan tidak segar AI Routing tetap unggul (73,78% vs 56,33%;
   13 menang, 15 seri, 2 kalah).
3. **Jarak lebih jauh** (30,18 km vs 20,68 km per skenario) — baseline memang hanya
   mengejar jarak. Trade-off dianggap sepadan karena jarak bukan tujuan utama sistem.
4. **Cakupan 50%** di semua skenario — murni bottleneck armada (3 kurir untuk 6 sampah),
   bukan kegagalan rumus; sisa sampah dilayani pada putaran berikutnya.
5. **Leg penjemputan kurir tidak masuk skor/radius** — skor jarak hanya mengukur
   sampah->TPS, sehingga trip total bisa melebihi 15 km (contoh: seed 23, trip 18,0 km).
6. **Data sintetis** — belum ada log produksi; validasi ulang dengan data pilot MBG dan
   TPS Pengolah Kota Madiun (NFR-09) belum dilakukan.

## 10. Rujukan silang

| Dokumen | Bagian terkait |
|---------|----------------|
| `docs/Laporan_Project_EcoMatch_v1.0.docx` | Bagian 3 (Hasil dan Pembahasan) |
| `SKPL_EcoMatch_v2.0.docx` | NFR-02 (kecepatan), NFR-09 (target 85%) |
| `docs/arsitektur/Dokumen_Arsitektur_Sistem_EcoMatch_v2.0.md` | §2 (FR routing), §7 (stack), §9B (deliverable Fase 6) |
| `config/routing.json` | Parameter final yang diuji |
| `backend/lib/routing.js`, `ai/routing.py` | Kode produksi yang diuji |

---

*Laporan Evaluasi Sistem EcoMatch — dihasilkan dari `evaluasi-30-skenario.json`*
