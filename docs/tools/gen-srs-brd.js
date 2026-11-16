#!/usr/bin/env node
/* Generator docs/srs-brd.html -> dirender ke PDF oleh Chrome headless.
 *
 * Sumber konten:
 *   - FR/NFR, BRD : docs/SKPL_EcoMatch_v2.0.docx (diekstrak manual ke data di bawah)
 *   - 4 flowchart : diagram "flow" dari docs/arsitektur/UML_EcoMatch.drawio (node + edge)
 *   - Use case    : Mermaid baru (usecase-ecomatch)
 *   - PNG         : docs/arsitektur/*.png (ERD, activity, sequence, class, arsitektur)
 *
 * Pemakaian:
 *   node docs/tools/gen-srs-brd.js [halaman.json]
 *   halaman.json opsional: {"<judul-heading>": <nomor-halaman>, ...}
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DOCS = path.resolve(__dirname, '..');
const DRAWIO = path.join(DOCS, 'arsitektur', 'UML_EcoMatch.drawio');
const OUT = path.join(DOCS, 'srs-brd.html');
const PAGE_MAP = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : {};

/* ------------------------------------------------------------------ data */
const COVER = {
  nimNayla: 'V3925012',
  nimFida: 'V3925007',
  kelas: 'TI A',
  prodi: 'D3 Teknik Informatika Kabupaten Madiun',
  sekolah: 'Sekolah Vokasi',
  universitas: 'Universitas Sebelas Maret',
  mk: 'Manajemen Proyek Teknologi',
  dosen: 'Darmawan Lahru Riatma, S.Kom., M.MT',
  nip: '1991091420200801',
  tanggal: 'Madiun, 10 November 2026',
  basis: 'Basis dokumen: SKPL_EcoMatch_v2.0 (24-08-2026)',
  judul: 'EcoMatch',
  subjudul: 'Platform AI Routing Penyaluran Sisa Makanan MBG ke Penerima (Studi Kasus: Kota Madiun)'
};

const FR = [
  ['FR-01', 'Autentikasi & RBAC', "Pengguna mendaftar/masuk dengan peran donor_mbg, penerima, kurir, atau admin; akun baru berstatus menunggu sampai diverifikasi Admin.", 'Semua Aktor'],
  ['FR-02', 'Unggah Sampah Makanan', "Donor MBG mengunggah jenis makanan, berat (kg), waktu produksi, foto, dan kelayakan konsumsi (layak/tidak_layak — boleh dikoreksi atas saran AI); status awal 'tersedia'.", 'Donor MBG'],
  ['FR-03', 'Profil Penerima', 'Penerima mengelola profil: jenis penerima (panti asuhan, yayasan, rumah dhuafa, peternakan, lainnya), kapasitas kg/hari, jenis sampah yang diterima, radius layanan, dan izin.', 'Penerima'],
  ['FR-04', 'AI Routing & Alokasi', 'Sistem memilih penerima + kurir terbaik untuk tiap sampah (filter aktif, kelayakan: layak hanya ke panti/yayasan, tidak_layak hanya ke peternakan; jenis diterima, kapasitas, jarak, skor) dan menyimpan alokasi beserta rute.', 'Sistem, Admin'],
  ['FR-05', 'Rute GIS', 'Sistem menghitung jarak (haversine/PostGIS) dan rute jalan (OSRM) Donor MBG -> Penerima; kurir melihat peta rute di Leaflet.', 'Sistem, Kurir'],
  ['FR-06', 'Notifikasi Multi-kanal', 'Notifikasi in-app, WhatsApp, dan email melalui outbox pesan untuk status sampah, tugas kurir, dan OTP.', 'Sistem'],
  ['FR-07', 'Foto Bukti Pickup & Deliver', 'Kurir wajib mengunggah foto sebelum penjemputan dan setelah pengantaran; file divalidasi magic-bytes.', 'Kurir'],
  ['FR-08', 'Verifikasi OTP Serah Terima', 'Penerima memasukkan OTP 6 digit (TTL 30 menit, sekali pakai, maksimal 5 percobaan/15 menit) untuk menutup transaksi.', 'Penerima'],
  ['FR-09', 'Dashboard Monitoring & Analitik', 'Admin memantau kg dialihkan dari pembuangan di TPS biasa, jumlah penerima aktif, cakupan wilayah, dan grafik harian/bulanan.', 'Admin'],
  ['FR-10', 'Manajemen Pengguna & Audit', 'Admin memverifikasi/menonaktifkan akun dan membaca log audit yang bersifat immutable.', 'Admin'],
  ['FR-11', 'Klasifikasi Jenis Sampah', 'Sistem mengklasifikasi kategori dan tingkat pembusukan dengan skor keyakinan + alasan, dilengkapi saran kelayakan konsumsi (layak/tidak_layak); Admin memverifikasi bila keyakinan rendah.', 'Sistem, Admin'],
  ['FR-12', 'Registrasi & Catatan Penanganan', 'Penerima mendaftar, mengelola profil & daftar penerima, dan mencatat catatan penanganan (input_kg, output_kg, jenis output, foto bukti).', 'Penerima'],
  ['FR-13', 'AI Routing Sisa Makanan ke Penerima', 'Bobot routing: jenis_cocok 0.35, kapasitas 0.25, jarak 0.25, urgensi 0.15; filter kelayakan konsumsi; radius maksimal 15 km; batas skor 0.3.', 'Sistem'],
  ['FR-14', 'Dashboard Kepatuhan Regulasi', 'Laporan kg dialihkan, persentase sampah tidak dibuang ke TPS biasa, dan rekap per penerima/periode siap ekspor PDF.', 'Admin'],
  ['FR-15', 'Modul Motivasi Donor MBG', 'Akumulasi poin per kg dialihkan, klaim sertifikat kepatuhan, dan laporan CSR untuk lembaga MBG.', 'Donor MBG, Admin'],
  ['FR-16', 'Konfigurasi Regulasi Daerah', 'Admin mengelola aturan larangan/kewajiban/sanksi/insentif dalam JSON per daerah (default KOTA_MADIUN).', 'Admin'],
  ['FR-17', 'Traceability End-to-End', 'Jejak lengkap sampah_makanan -> klasifikasi_sampah -> alokasi -> pengolahan_log untuk audit kepatuhan.', 'Admin, Penerima']
];

const NFR = [
  ['NFR-01', 'Keamanan', 'Autentikasi JWT (12 jam) + bcrypt + RBAC donor_mbg/penerima/kurir/admin, query parameterized, security headers (CSP/HSTS), dan rate-limit.'],
  ['NFR-02', 'Performa', 'Waktu respons API dan proses AI Routing (termasuk fallback ke mesin JavaScript) kurang dari 3 detik per permintaan.'],
  ['NFR-03', 'Ketersediaan', 'Sistem tersedia 24/7 dengan target uptime minimal 99%, healthcheck /api/health, auto-restart, monitoring berkala, dan backup basis data.'],
  ['NFR-04', 'Skalabilitas', 'Stateless (tanpa sesi server) sehingga dapat diskalakan horizontal hingga 5.000 pengguna aktif; koneksi pooling PostgreSQL.'],
  ['NFR-05', 'Usability', 'PWA responsif dengan input minimal (maksimal 5 langkah per aksi), pesan error JSON yang konsisten, dan mode luring untuk penampilan data.'],
  ['NFR-06', 'Reliabilitas Data GIS', 'Akurasi kalkulasi jarak dan rute minimal 95% dengan pemisahan perhitungan jarak (haversine/PostGIS) dan visualisasi peta (Leaflet).'],
  ['NFR-07', 'Portabilitas', 'PWA berjalan pada browser modern Android/iOS 3 tahun terakhir dan desktop, tanpa aplikasi native terpisah.'],
  ['NFR-08', 'Auditabilitas', 'Seluruh aksi penting tercatat pada log_audit yang immutable (trigger basis data), dilengkapi foto bukti dan OTP sekali pakai.'],
  ['NFR-09', 'Kepatuhan Regulasi', 'Setiap kg sisa makanan MBG terlacak dari donor hingga penerima dan output penyalurannya; laporan kepatuhan Pemkot Madiun tersedia dan dapat diekspor (traceability).'],
  ['NFR-10', 'Akurasi Klasifikasi', 'Akurasi klasifikasi jenis sampah minimal 85% melalui rule-based transparan dengan skor keyakinan dan verifikasi admin bila keyakinan rendah.'],
  ['NFR-11', 'Fleksibilitas Daerah', 'Aturan regulasi disimpan sebagai data (JSON per kode_daerah, default KOTA_MADIUN) sehingga dapat berubah tanpa perubahan kode.']
];

const AKTOR = [
  ['Donor MBG (SPPG)', 'Pengelola dapur MBG, melek teknologi dasar, membutuhkan bukti kepatuhan laporan ke Pemkot', 'Registrasi & unggah sampah (termasuk kelayakan konsumsi), melihat riwayat dan jejak traceability, mengklaim sertifikat/poin (FR-02, FR-15)'],
  ['Penerima', 'Panti asuhan, yayasan, rumah dhuafa, atau peternakan di Kota Madiun; memantau kapasitas harian', 'Kelola profil & jenis diterima, konfirmasi OTP, catat penanganan (FR-03, FR-08, FR-12)'],
  ['Kurir/Relawan', 'Individu/relawan lapangan, kemampuan teknis dasar, memiliki kendaraan', 'Terima tugas, lihat rute GIS, unggah foto bukti pickup/deliver (FR-05, FR-07)'],
  ['Administrator', 'Tim pengelola platform (Dinas terkait/tim MBG)', 'Verifikasi akun & klasifikasi, jalankan AI Routing, kelola pengguna/penerima/regulasi, laporan kepatuhan (FR-09, FR-10, FR-11, FR-14, FR-16)'],
  ['Sistem', 'Agen otomatis: mesin klasifikasi, AI Routing, scheduler auto-expire, agregasi laporan', 'Menjalankan tugas terjadwal dan menghasilkan keputusan routing/notifikasi (FR-04, FR-11, FR-17)']
];

const GLOSSARY = [
  ['Donor MBG (SPPG)', 'Pengelola dapur Makan Bergizi Gratis yang menghasilkan dan mengunggah sampah makanan; wajib menyalurkan agar patuh regulasi daerah.'],
  ['Penerima', 'Lembaga penerima sisa makanan MBG di Kota Madiun: panti asuhan, yayasan, atau rumah dhuafa (untuk sisa layak konsumsi), dan peternakan (untuk sisa tidak layak).'],
  ['Kelayakan Konsumsi', 'Status sisa makanan: layak dikonsumsi (disalurkan ke panti/yayasan) atau tidak layak (diarahkan ke peternakan). Ditentukan donor saat unggah, dengan saran AI berbasis tingkat pembusukan yang boleh dikoreksi.'],
  ['Kurir / Relawan', 'Penjemput di dapur MBG dan pengantar sampah ke penerima, wajib mengunggah foto bukti dan memverifikasi OTP.'],
  ['Klasifikasi Sampah', 'Penentuan kategori sampah (nasi, sayur, lauk, kulit buah, campuran) dan tingkat pembusukan beserta skor keyakinan oleh sistem.'],
  ['AI Routing', 'Algoritma pemilihan penerima terbaik dengan bobot jenis_cocok, kapasitas, jarak, dan urgensi, ditambah filter kelayakan konsumsi (FR-04/FR-13).'],
  ['GIS (Geographic Information System)', 'Sistem informasi geografis untuk peta, jarak, dan rute (Leaflet, OpenStreetMap, OSRM, PostGIS).'],
  ['Sampah Makanan (Food Waste)', 'Sisa makanan dari dapur MBG: nasi, sayur, lauk, kulit buah, dan campuran — dapat berstatus layak atau tidak layak konsumsi.'],
  ['Traceability', 'Jejak audit end-to-end sampah dari unggahan MBG, klasifikasi, alokasi, serah terima, hingga penanganan di penerima.'],
  ['OTP (One Time Password)', 'Kode verifikasi sekali pakai 6 digit dengan masa berlaku 30 menit untuk konfirmasi serah terima di penerima.'],
  ['Konfigurasi Regulasi', 'Aturan daerah (larangan, kewajiban, sanksi, insentif) disimpan dalam JSON per kode daerah (FR-16/NFR-11).'],
  ['Admin', 'Pengguna dengan hak akses penuh: verifikasi akun/klasifikasi, menjalankan routing, konfigurasi regulasi, dan laporan.']
];

const OBJECTIVES = [
  'Membangun aplikasi PWA (Progressive Web App) untuk Donor MBG, Penerima, dan Kurir serta web dashboard Admin yang beroperasi 100% fungsional untuk penyaluran sisa makanan MBG.',
  'Menjalankan proses AI Routing (klasifikasi + pemilihan penerima) dalam waktu kurang dari 3 detik per permintaan (NFR-02).',
  'Mengalihkan minimal 85% sampah makanan MBG dari pembuangan di TPS biasa ke penerima yang tepat (panti/yayasan bila layak, peternakan bila tidak layak) pada tahap pilot Kota Madiun (sesuai NFR-09/FR-14).',
  'Menyediakan mekanisme klasifikasi dan routing yang objektif serta otomatis berdasarkan kelayakan konsumsi, jenis sampah, kapasitas penerima, jarak/rute GIS, dan urgensi pembusukan.',
  'Menyediakan bukti serah terima digital (foto jemput/antar dan konfirmasi OTP) beserta jejak traceability end-to-end sebagai dasar akuntabilitas dan laporan kepatuhan ke Pemkot Madiun.'
];

const SCOPE_IN = [
  'Fitur registrasi dan verifikasi akun Donor MBG (SPPG), Penerima, dan Kurir dengan RBAC donor_mbg, penerima, kurir, admin.',
  'Modul klasifikasi jenis sampah makanan (rule-based + verifikasi Admin), penilaian tingkat pembusukan, dan saran kelayakan konsumsi.',
  'Mesin AI Routing multi-kriteria untuk memilih penerima: filter kelayakan (layak ke panti/yayasan, tidak_layak ke peternakan), jenis_cocok (0.35), kapasitas (0.25), jarak (0.25), dan urgensi (0.15).',
  'Modul pemetaan wilayah dan kalkulasi rute menggunakan GIS (Leaflet + OpenStreetMap, OSRM, dan query spasial PostGIS).',
  'Fitur bukti serah terima (foto pickup/deliver) dan verifikasi OTP, laporan kepatuhan, modul motivasi donor MBG, serta konfigurasi regulasi daerah.'
];

const SCOPE_OUT = [
  'Penyediaan armada fisik atau kendaraan operasional penjemputan oleh pihak pengembang (disediakan relawan/mitra kurir masing-masing daerah).',
  'Pengolahan atau pemanfaatan fisik sisa makanan (kompos, pakan ternak, eco-enzyme, dll.) yang dilakukan langsung oleh penerima di luar sistem.',
  'Transaksi jual-beli komoditas pangan non-sampah secara komersial (B2C/B2B).'
];

const USECASE_MMD = `flowchart LR
  classDef actor fill:#DAE8FC,stroke:#6C8EBF,color:#0b2545,stroke-width:1.5px
  classDef uc fill:#FFFFFF,stroke:#333333,color:#111111
  DBG["Donor MBG (SPPG)"]:::actor
  PEN["Penerima"]:::actor
  KUR["Kurir / Relawan"]:::actor
  ADM["Administrator"]:::actor
  SYS["Sistem (AI)"]:::actor
  subgraph BOUND["Sistem EcoMatch"]
    direction TB
    UC01["UC-01 Autentikasi dan RBAC"]:::uc
    UC02["UC-02 Unggah Sampah Makanan"]:::uc
    UC03["UC-03 Klasifikasi Jenis Sampah"]:::uc
    UC04["UC-04 AI Routing dan Alokasi"]:::uc
    UC05["UC-05 Rute GIS dan Foto Bukti"]:::uc
    UC06["UC-06 Verifikasi OTP Serah Terima"]:::uc
    UC07["UC-07 Catat Penanganan"]:::uc
    UC08["UC-08 Kelola Profil Penerima"]:::uc
    UC09["UC-09 Notifikasi Multi-kanal"]:::uc
    UC10["UC-10 Dashboard Monitoring dan Kepatuhan"]:::uc
    UC11["UC-11 Manajemen Pengguna dan Audit"]:::uc
    UC12["UC-12 Modul Motivasi Donor"]:::uc
    UC13["UC-13 Konfigurasi Regulasi Daerah"]:::uc
    UC14["UC-14 Traceability End-to-End"]:::uc
  end
  DBG --> UC01
  DBG --> UC02
  DBG --> UC12
  DBG --> UC14
  PEN --> UC08
  PEN --> UC06
  PEN --> UC07
  PEN --> UC14
  KUR --> UC01
  KUR --> UC05
  ADM --> UC10
  ADM --> UC11
  ADM --> UC13
  ADM --> UC03
  ADM --> UC04
  SYS --> UC03
  SYS --> UC04
  SYS --> UC09
  UC02 -.->|include| UC01
  UC02 -.->|include| UC03
  UC04 -.->|include| UC03
  UC04 -.->|include| UC05
  UC06 -.->|include| UC07
  UC06 -.->|include| UC09
  UC10 -.->|include| UC14
  UC03 -.->|extend| UC11`;

/* ------------------------------------------------------- drawio -> svg */
function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function attr(str, name) {
  const m = str.match(new RegExp(name + '="([^"]*)"'));
  return m ? m[1] : null;
}
function parseFlowPage(xml, pageName) {
  const m = xml.match(new RegExp('<diagram[^>]*name="' + pageName + '"[^>]*>([\\s\\S]*?)</diagram>'));
  if (!m) throw new Error('diagram tidak ditemukan: ' + pageName);
  const body = m[1];
  const nodes = [], edges = [], labels = [];
  const re = /<mxCell\s([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g;
  let c;
  while ((c = re.exec(body))) {
    const a = c[1], inner = c[2] || '';
    const id = attr(a, 'id');
    const parent = attr(a, 'parent');
    const isEdge = attr(a, 'edge') === '1';
    const isVertex = attr(a, 'vertex') === '1';
    const style = attr(a, 'style') || '';
    const gm = inner.match(/<mxGeometry([^>]*?)(?:\/>|>([\s\S]*?)<\/mxGeometry>)/);
    const geo = { x: 0, y: 0, w: 0, h: 0, ox: 0, oy: 0 };
    if (gm) {
      const ga = gm[1], ginner = gm[2] || '';
      const gnum = (n) => { const v = attr(ga, n); return v === null ? null : parseFloat(v); };
      geo.x = gnum('x') || 0; geo.y = gnum('y') || 0;
      geo.w = gnum('width') || 0; geo.h = gnum('height') || 0;
      const off = ginner.match(/<mxPoint([^>]*)\/>/);
      if (off) { const ox = attr(off[1], 'x'), oy = attr(off[1], 'y'); geo.ox = ox ? parseFloat(ox) : 0; geo.oy = oy ? parseFloat(oy) : 0; }
    }
    if (isEdge && !isVertex) {
      edges.push({ id, source: attr(a, 'source'), target: attr(a, 'target'), style, labels: [] });
    } else if (isVertex) {
      const cell = { id, parent, style, geo, raw: attr(a, 'value') || '' };
      if (parent && parent.startsWith && parent !== '1' && parent !== '0') labels.push(cell);
      else nodes.push(cell);
    }
  }
  const edgeById = {};
  edges.forEach(e => edgeById[e.id] = e);
  labels.forEach(l => { const e = edgeById[l.parent]; if (e) e.labels.push(l); });
  return { nodes, edges };
}

function nodeShape(style) {
  if (/rhombus/.test(style)) return 'rhombus';
  if (/ellipse/.test(style)) return 'ellipse';
  if (/rounded=1/.test(style)) return 'round';
  return 'rect';
}
function nodeFill(style) { const m = style.match(/fillColor=([^;]+)/); return m ? m[1] : '#FFFFFF'; }
function nodeStroke(style) { const m = style.match(/strokeColor=([^;]+)/); return m ? m[1] : '#333333'; }

function polyLen(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return d;
}
function polyHits(pts, obstacles) {
  let hits = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(seg / 6));
    for (let k = 0; k <= steps; k++) {
      const r = k / steps, x = a.x + (b.x - a.x) * r, y = a.y + (b.y - a.y) * r;
      for (const o of obstacles) {
        if (x > o.x - 5 && x < o.x + o.w + 5 && y > o.y - 5 && y < o.y + o.h + 5) { hits++; break; }
      }
    }
  }
  return hits;
}
function routeEdge(s, t, rects) {
  const obstacles = rects.filter(o => o.id !== s.id && o.id !== t.id);
  const sc = { x: s.x + s.w / 2, y: s.y + s.h / 2 }, tc = { x: t.x + t.w / 2, y: t.y + t.h / 2 };
  const dx = tc.x - sc.x, dy = tc.y - sc.y, adx = Math.abs(dx), ady = Math.abs(dy);
  const y1 = dy >= 0 ? s.y + s.h : s.y;
  const ty = dy >= 0 ? t.y : t.y + t.h;
  const x1 = dx >= 0 ? s.x + s.w : s.x;
  const tx = dx >= 0 ? t.x : t.x + t.w;
  const mx = (sc.x + tc.x) / 2, my = (sc.y + tc.y) / 2;
  const cands = [];
  if (adx < 6) cands.push([{ x: sc.x, y: y1 }, { x: tc.x, y: ty }]);
  if (ady < 6) cands.push([{ x: x1, y: sc.y }, { x: tx, y: tc.y }]);
  cands.push([{ x: sc.x, y: y1 }, { x: sc.x, y: ty }, { x: tc.x, y: ty }]);
  cands.push([{ x: sc.x, y: y1 }, { x: mx, y: y1 }, { x: mx, y: ty }, { x: tc.x, y: ty }]);
  cands.push([{ x: x1, y: sc.y }, { x: tx, y: sc.y }, { x: tx, y: tc.y }]);
  cands.push([{ x: x1, y: sc.y }, { x: x1, y: my }, { x: tx, y: my }, { x: tx, y: tc.y }]);
  if (adx < 6) {
    cands.push([{ x: sc.x, y: y1 }, { x: sc.x + 56, y: y1 }, { x: sc.x + 56, y: ty }, { x: tc.x, y: ty }]);
    cands.push([{ x: sc.x, y: y1 }, { x: sc.x - 56, y: y1 }, { x: sc.x - 56, y: ty }, { x: tc.x, y: ty }]);
  }
  if (ady < 6) {
    cands.push([{ x: x1, y: sc.y }, { x: x1, y: sc.y + 56 }, { x: tx, y: sc.y + 56 }, { x: tx, y: tc.y }]);
    cands.push([{ x: x1, y: sc.y }, { x: x1, y: sc.y - 56 }, { x: tx, y: sc.y - 56 }, { x: tx, y: tc.y }]);
  }
  let best = null, bestScore = Infinity;
  for (let c of cands) {
    c = c.filter((p, i) => i === 0 || Math.hypot(p.x - c[i - 1].x, p.y - c[i - 1].y) > 1);
    if (c.length < 2) continue;
    const score = polyHits(c, obstacles) * 100 + polyLen(c) * 0.02;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best || [{ x: sc.x, y: y1 }, { x: tc.x, y: ty }];
}
function pointAt(pts, frac) {
  let total = 0; const segs = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); segs.push(d); total += d; }
  let want = total * frac;
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i] || i === segs.length - 1) {
      const r = segs[i] ? want / segs[i] : 0;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * r, y: pts[i].y + (pts[i + 1].y - pts[i].y) * r };
    }
    want -= segs[i];
  }
  return pts[0];
}
function rectHits(r, list, pad) {
  for (const o of list) {
    if (r.x < o.x + o.w + pad && r.x + r.w + pad > o.x && r.y < o.y + o.h + pad && r.y + r.h + pad > o.y) return true;
  }
  return false;
}
function textHtml(raw, cls) {
  const decoded = decodeEntities(raw);
  const lines = decoded.split(/<br\s*\/?>/i);
  const body = lines.map(l => escXml(l)).join('<br/>');
  return `<div class="${cls}">${body}</div>`;
}

function renderFlowSvg(pageName) {
  const { nodes, edges } = parseFlowPage(fs.readFileSync(DRAWIO, 'utf8'), pageName);
  const rects = nodes.map(n => ({ id: n.id, x: n.geo.x, y: n.geo.y, w: n.geo.w, h: n.geo.h }));
  const byId = {}; rects.forEach(r => byId[r.id] = r);
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  rects.forEach(r => { minX = Math.min(minX, r.x); minY = Math.min(minY, r.y); maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h); });
  const PAD = 26;
  minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;
  const W = maxX - minX, H = maxY - minY;

  let edgeSvg = '', labelSvg = '';
  const labelRects = [];
  for (const e of edges) {
    const s = byId[e.source], t = byId[e.target];
    if (!s || !t) continue;
    const pts = routeEdge(s, t, rects);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
    edgeSvg += `<path d="${d}" fill="none" stroke="#333333" stroke-width="1.6" marker-end="url(#fcArrow)"/>`;
    for (const lb of e.labels) {
      const lines = decodeEntities(lb.raw).split(/<br\s*\/?>/i);
      const lw = Math.max(...lines.map(l => l.length)) * 6.6 + 12;
      const lh = lines.length * 16 + 8;
      const fx = lb.geo.ox || 0, fy = lb.geo.oy || 0;
      let place = null;
      for (const f of [0.5, 0.62, 0.38, 0.72, 0.3, 0.8, 0.22, 0.88]) {
        const p = pointAt(pts, f);
        const r = { x: p.x + fx - lw / 2, y: p.y + fy - lh / 2, w: lw, h: lh };
        if (!rectHits(r, rects, 3) && !rectHits(r, labelRects, 4)) { place = r; break; }
      }
      if (!place) {
        const p = pointAt(pts, 0.5);
        place = { x: p.x + fx - lw / 2, y: p.y + fy - lh / 2, w: lw, h: lh };
      }
      labelRects.push(place);
      labelSvg += `<foreignObject x="${place.x.toFixed(1)}" y="${place.y.toFixed(1)}" width="${lw.toFixed(1)}" height="${lh.toFixed(1)}">${textHtml(lb.raw, 'lbl-txt')}</foreignObject>`;
    }
  }

  let nodeSvg = '';
  for (const n of nodes) {
    const x = n.geo.x, y = n.geo.y, w = n.geo.w, h = n.geo.h;
    const shape = nodeShape(n.style), fill = nodeFill(n.style), stroke = nodeStroke(n.style);
    let el;
    if (shape === 'rhombus') {
      const cx = x + w / 2, cy = y + h / 2;
      el = `<polygon points="${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
    } else if (shape === 'ellipse') {
      el = `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
    } else if (shape === 'round') {
      const rx = Math.min(h / 2, w / 2);
      el = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
    } else {
      el = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
    }
    const cls = shape === 'rhombus' ? 'node-txt diamond' : 'node-txt';
    nodeSvg += el + `<foreignObject x="${x}" y="${y}" width="${w}" height="${h}">${textHtml(n.raw, cls)}</foreignObject>`;
  }

  return { svg:
`<svg class="flow" xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(0)} ${minY.toFixed(0)} ${W.toFixed(0)} ${H.toFixed(0)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${pageName}">
<defs><marker id="fcArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#333333"/></marker></defs>
${edgeSvg}${nodeSvg}${labelSvg}</svg>`, w: W, h: H };
}

/* --------------------------------------------------------------- layout */
// kotak isi gambar (px @96dpi) — margin halaman gambar 10mm
const BOX = { pw: 718, ph: 998, lw: 1047, lh: 692 };
function pickOrient(w, h) {
  const p = Math.min(BOX.pw / w, BOX.ph / h);
  const l = Math.min(BOX.lw / w, BOX.lh / h);
  return (l >= p * 1.08) ? { land: true, s: l } : { land: false, s: p };
}

const FLOW_DEFS = [
  { id: 'activity-unggah-klasifikasi-mbg', cap: 'Gambar 3.1 Flowchart Alur 1: Unggah Sampah MBG \u2192 Klasifikasi \u2192 Routing (FR-02, FR-11, FR-13)', note: 'Sumber: node diagram activity-unggah-klasifikasi-mbg pada docs/arsitektur/UML_EcoMatch.drawio' },
  { id: 'activity-routing-mbg-tps', cap: 'Gambar 3.2 Flowchart Alur 2: AI Routing MBG \u2192 Penerima (FR-04, FR-05, FR-13)', note: 'Sumber: node diagram activity-routing-mbg-tps pada docs/arsitektur/UML_EcoMatch.drawio' },
  { id: 'activity-serah-terima-otp', cap: 'Gambar 3.3 Flowchart Alur 3: Serah Terima, Foto Bukti & Verifikasi OTP (FR-07, FR-08, FR-12)', note: 'Sumber: node diagram activity-serah-terima-otp pada docs/arsitektur/UML_EcoMatch.drawio' },
  { id: 'activity-registrasi-eco-match', cap: 'Gambar 3.4 Flowchart Alur 4: Registrasi & Verifikasi Akun Multi-Role (FR-01, FR-12)', note: 'Sumber: node diagram activity-registrasi-eco-match pada docs/arsitektur/UML_EcoMatch.drawio' }
];

const PNG_DEFS = [
  { file: 'ERD_EcoMatch.png', cap: 'Gambar 3.6 Conceptual Data Model (ERD) Basis Data EcoMatch' },
  { file: 'EcoMatch_02a_activity_klasifikasi.png', cap: 'Gambar 3.7 Activity Diagram: Unggah & Klasifikasi Sampah (FR-02, FR-11)' },
  { file: 'EcoMatch_02b_activity_routing.png', cap: 'Gambar 3.8 Activity Diagram: Routing MBG \u2192 Penerima (FR-04, FR-13)' },
  { file: 'EcoMatch_03_activity_otp.png', cap: 'Gambar 3.9 Activity Diagram: Serah Terima OTP (FR-07, FR-08)' },
  { file: 'EcoMatch_04_activity_registrasi.png', cap: 'Gambar 3.10 Activity Diagram: Registrasi Multi-Role (FR-01, FR-12)' },
  { file: 'EcoMatch_06_sequence_klasifikasi.png', cap: 'Gambar 3.11 Sequence Diagram: Klasifikasi Sampah (LOOP + ALT)' },
  { file: 'EcoMatch_07_sequence_routing.png', cap: 'Gambar 3.12 Sequence Diagram: Routing MBG \u2192 Penerima (LOOP + ALT)' },
  { file: 'EcoMatch_08_sequence_otp.png', cap: 'Gambar 3.13 Sequence Diagram: Serah Terima OTP &amp; Penanganan (ALT + OPT)' },
  { file: 'EcoMatch_05_class.png', cap: 'Gambar 3.14 Class Diagram Backend EcoMatch' },
  { file: 'EcoMatch_01_arsitektur_3tier.png', cap: 'Gambar 3.15 Arsitektur Sistem Three-Tier EcoMatch' }
];

/* ----------------------------------------------------------------- html */
function tocItem(label, key) {
  const p = PAGE_MAP[key];
  return `<li>${label}${p ? `<span class="dots"></span><span class="pnum">${p}</span>` : ''}</li>`;
}

function table(headers, rows, cls) {
  const th = headers.map(h => `<th>${h}</th>`).join('');
  const tb = rows.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('');
  return `<table class="${cls || ''}"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`;
}

function buildHtml() {
  const flowFigs = FLOW_DEFS.map((f, i) => {
    const { svg, w, h } = renderFlowSvg(f.id);
    const o = pickOrient(w, h);
    return `<figure class="fp${o.land ? ' land' : ''}">
  <div class="fbox">${svg}</div>
  <figcaption>${f.cap}<span class="src">${f.note}</span></figcaption>
</figure>`;
  }).join('\n');

  const pngFigs = PNG_DEFS.map(f => {
    const dims = imageSize(path.join(DOCS, 'arsitektur', f.file));
    const o = pickOrient(dims.w, dims.h);
    const rel = 'arsitektur/' + f.file;
    return `<figure class="fp${o.land ? ' land' : ''}">
  <div class="fbox"><img src="${rel}" alt="${f.cap}"></div>
  <figcaption>${f.cap}<span class="src">Sumber: docs/${rel}</span></figcaption>
</figure>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>SRS/BRD EcoMatch - ${COVER.kelas}</title>
<script src="vendor/mermaid.min.js"></script>
<style>
  @page { size: A4; margin: 16mm 16mm 15mm; }
  @page fp { size: A4; margin: 10mm; }
  @page fl { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #14181f; }
  h1, h2, h3, h4 { font-weight: 600; color: #0f2f4f; margin: 0 0 8px; }
  h2 { font-size: 15pt; border-bottom: 2px solid #0f2f4f; padding-bottom: 4px; margin-top: 0; }
  h3 { font-size: 12pt; margin-top: 18px; }
  h4 { font-size: 10.5pt; margin-top: 14px; }
  p { margin: 0 0 8px; text-align: justify; }
  ul, ol { margin: 0 0 10px; padding-left: 22px; }
  li { margin-bottom: 4px; text-align: justify; }
  section { page-break-before: always; }
  section.cont { page-break-before: auto; }

  /* ---------- cover ---------- */
  .cover { page-break-before: always; text-align: center; padding-top: 6mm; }
  .cover .inst { font-size: 12pt; letter-spacing: .06em; font-weight: 700; color: #0f2f4f; line-height: 1.45; }
  .cover .rule { border-top: 3px solid #0f2f4f; width: 100%; margin: 8px 0 22px; }
  .cover .doctype { font-size: 16pt; font-weight: 700; color: #14181f; line-height: 1.4; }
  .cover .doctype small { display: block; font-size: 11.5pt; font-weight: 400; margin-top: 4px; color: #333; }
  .cover .untuk { margin: 14px 0 4px; font-size: 11pt; }
  .cover .app { font-size: 22pt; font-weight: 700; color: #0f6f4f; letter-spacing: .04em; }
  .cover .tagline { font-size: 11pt; margin-top: 6px; color: #222; }
  .cover .box { display: inline-block; border: 1.6px solid #0f2f4f; border-radius: 8px; padding: 10px 26px; margin-top: 26px; }
  .cover .meta { margin-top: 26px; font-size: 10.5pt; text-align: left; display: inline-block; }
  .cover .meta div { margin-bottom: 5px; }
  .cover .meta b { display: inline-block; min-width: 120px; }
  .cover .authors { margin-top: 4px; font-size: 11pt; }
  .cover .authors table { margin: 6px auto 0; border-collapse: collapse; font-size: 10.5pt; }
  .cover .authors td { padding: 3px 14px; }
  .cover .foot { margin-top: 34px; font-size: 10.5pt; font-weight: 600; letter-spacing: .12em; color: #0f2f4f; }
  .cover .ver { margin-top: 6px; font-size: 9.5pt; color: #444; font-weight: 400; letter-spacing: 0; }

  /* ---------- toc ---------- */
  .toc { column-count: 1; }
  .toc ol { list-style: none; padding: 0; margin: 0; }
  .toc li { display: flex; align-items: baseline; margin-bottom: 6px; font-size: 10.5pt; }
  .toc .dots { flex: 1; border-bottom: 1px dotted #999; margin: 0 6px 4px; }
  .toc .pnum { font-weight: 600; color: #0f2f4f; }
  .toc .lvl2 { padding-left: 18px; }
  .toc .lvl1 { font-weight: 600; color: #0f2f4f; }

  /* ---------- tables ---------- */
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 6px 0 14px; }
  th, td { border: 1px solid #9aa5b1; padding: 4px 6px; vertical-align: top; text-align: left; }
  th { background: #e8eef5; font-weight: 600; color: #0f2f4f; }
  tbody tr:nth-child(even) { background: #f7f9fb; }
  .code { font-family: Consolas, "Courier New", monospace; font-weight: 600; white-space: nowrap; color: #0f2f4f; }
  .note { font-size: 9pt; color: #555; font-style: italic; }

  /* ---------- halaman gambar ---------- */
  figure.fp { page: fp; page-break-before: always; margin: 0; display: flex; flex-direction: column; height: 267mm; }
  figure.fp.land { page: fl; height: 190mm; }
  .fbox { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; overflow: hidden; }
  .fbox svg.flow { width: 100%; height: 100%; display: block; }
  .fbox img { max-width: 100%; max-height: 100%; object-fit: contain; }
  figcaption { font-size: 9.5pt; text-align: center; color: #14181f; padding-top: 5px; font-weight: 600; }
  figcaption .src { display: block; font-weight: 400; font-size: 8pt; color: #666; font-style: italic; margin-top: 1px; }
  .node-txt, .lbl-txt { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; text-align: center; font-family: "Segoe UI", Arial, sans-serif; line-height: 1.2; overflow: hidden; }
  .node-txt { font-size: 14px; color: #14181f; padding: 1px 5px; }
  .node-txt.diamond { font-size: 13px; padding: 1px 14px; }
  .lbl-txt { font-size: 12.5px; color: #14181f; -webkit-text-stroke: 3.5px #ffffff; paint-order: stroke fill; }

  /* ---------- use case mermaid ---------- */
  #usecase { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
  #usecase .mermaid { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
  #usecase .mermaid svg { max-width: 100% !important; max-height: 100% !important; height: auto; }
  .sig { margin-top: 26px; display: flex; justify-content: space-between; font-size: 10pt; }
  .sig .col { width: 45%; text-align: center; }
  .sig .name { margin-top: 46px; font-weight: 600; text-decoration: underline; }
  .badge { display: inline-block; background: #0f6f4f; color: #fff; border-radius: 4px; padding: 1px 8px; font-size: 9pt; font-weight: 600; }
</style>
</head>
<body>

<!-- ============================ COVER ============================ -->
<section class="cover">
  <div class="inst">${COVER.universitas}<br>${COVER.sekolah}<br>Program Studi ${COVER.prodi}</div>
  <div class="rule"></div>
  <div class="doctype">DOKUMEN SRS/BRD<br>
    <small>Software Requirements Specification &amp; Business Requirements Document</small>
  </div>
  <div class="untuk">untuk sistem</div>
  <div class="app">${COVER.judul}</div>
  <div class="tagline">${COVER.subjudul}</div>
  <div class="box">
    <div style="font-size:12pt;font-weight:700;color:#0f2f4f;">Kelas ${COVER.kelas}</div>
    <div class="authors">
      Disusun oleh:
      <table>
        <tr><td>1. Nayla Aurellia Azarine</td><td>${COVER.nimNayla}</td></tr>
        <tr><td>2. Fida Muyasaroh</td><td>${COVER.nimFida}</td></tr>
      </table>
    </div>
  </div>
  <div class="meta">
    <div><b>Mata Kuliah</b>: ${COVER.mk}</div>
    <div><b>Program Studi</b>: ${COVER.prodi}</div>
    <div><b>Dosen Pengampu</b>: ${COVER.dosen} (NIP. ${COVER.nip})</div>
    <div><b>Kelas</b>: ${COVER.kelas}</div>
  </div>
  <div class="foot">${COVER.tanggal.toUpperCase()}</div>
  <div class="ver">${COVER.basis} &middot; Dokumen FIX (SRS/BRD)</div>
</section>

<!-- ============================ DAFTAR ISI ============================ -->
<section>
  <h2>DAFTAR ISI</h2>
  <div class="toc">
    <ol>
      ${tocItem('BAB I  BAGIAN BRD (Business Requirements Document)', 'BRD')}
      <li class="lvl2">1.1 Latar Belakang Bisnis (PIC Analysis)</li>
      <li class="lvl2">1.2 Tujuan Sistem</li>
      <li class="lvl2">1.3 Ruang Lingkup Sistem (In Scope / Out of Scope)</li>
      <li class="lvl2">1.4 Pemangku Kepentingan &amp; Aktor Sistem</li>
      <li class="lvl2">1.5 Proses Bisnis As-Is dan To-Be</li>
      <li class="lvl2">1.6 Daftar Istilah Penting (Glossary)</li>
      ${tocItem('BAB II  BAGIAN SRS (Software Requirements Specification)', 'SRS')}
      <li class="lvl2">2.1 Gambaran Umum Sistem</li>
      <li class="lvl2">2.2 Kebutuhan Fungsional (FR-01 s.d. FR-17)</li>
      <li class="lvl2">2.3 Kebutuhan Non-Fungsional (NFR-01 s.d. NFR-11)</li>
      <li class="lvl2">2.4 Metode Pengembangan Sistem (SDLC)</li>
      ${tocItem('BAB III  PEMODELAN DIAGRAM SISTEM', 'DIAGRAM')}
      <li class="lvl2">3.1 Flowchart 4 Alur Proses Bisnis (dari node UML_EcoMatch.drawio)</li>
      <li class="lvl2">3.2 Use Case Diagram (Mermaid, baru)</li>
      <li class="lvl2">3.3 ERD, Activity, Sequence, dan Class Diagram (PNG)</li>
      ${tocItem('BAB IV  PENUTUP &amp; REFERENSI', 'PENUTUP')}
    </ol>
  </div>
</section>

<!-- ============================ BAB I : BRD ============================ -->
<section>
  <h2>BAB I &mdash; BAGIAN BRD (BUSINESS REQUIREMENTS DOCUMENT)</h2>

  <h3>1.1 Latar Belakang Bisnis (PIC Analysis)</h3>
  <p>Program Makan Bergizi Gratis (MBG) di Kota Madiun menghasilkan sampah makanan setiap hari berupa nasi sisa, sayur, lauk, kulit buah, dan sisa campuran dari dapur/SPPG. Berdasarkan regulasi daerah, TPS biasa sudah tidak boleh menerima sampah organik, sehingga sisa makanan MBG harus disalurkan ke lembaga penerima yang tepat — panti asuhan/yayasan bila layak konsumsi dan peternakan bila tidak layak. Permasalahan proses bisnis saat ini dianalisis dengan kerangka PIC (Performance, Information, Economics, Control, Efficiency, Service):</p>
  <ul>
    <li><b>Performance</b>: penentuan penerima yang menerima sisa makanan masih manual (telepon/WhatsApp antar pengelola MBG dan pengelola panti/peternakan), sehingga pemilihan penerima tidak optimal dan sering melebihi radius layanan.</li>
    <li><b>Information</b>: tidak ada data terpusat mengenai jenis, volume, dan kondisi (layak/tidak layak) sisa makanan MBG maupun kapasitas serta jenis tiap penerima.</li>
    <li><b>Economics</b>: biaya penjemputan membengkak karena rute dipilih berdasarkan asumsi jarak lurus, bukan rute jalan tercepat, dan kapasitas penerima tidak dimanfaatkan optimal.</li>
    <li><b>Control</b>: tidak ada bukti digital rantai penanganan (traceability) dari dapur MBG hingga penerima menyalurkan, sehingga laporan kepatuhan ke Pemkot Madiun sulit dipertanggungjawabkan.</li>
    <li><b>Efficiency</b>: koordinasi manual memakan waktu lama, rawan miskomunikasi, dan sampah yang terlambat membusuk menimbulkan bau serta risiko sanitasi.</li>
    <li><b>Service</b>: layanan penyaluran sisa makanan tidak konsisten dan tidak dapat diprediksi karena ketersediaan kapasitas penerima tidak terpantau waktu nyata.</li>
  </ul>
  <p>Solusi bisnis yang diusulkan adalah platform digital <b>EcoMatch</b>: sistem AI Routing yang mengklasifikasi jenis sampah dan kelayakan konsumsi, memilih penerima terbaik (layak ke panti/yayasan, tidak layak ke peternakan) berdasarkan kapasitas, jarak/rute, dan urgensi pembusukan, serta menghasilkan bukti traceability dan laporan kepatuhan regulasi daerah Kota Madiun.</p>

  <h3>1.2 Tujuan Sistem</h3>
  <ol>${OBJECTIVES.map(o => `<li>${o}</li>`).join('')}</ol>

  <h3>1.3 Ruang Lingkup Sistem</h3>
  <h4>a. Termasuk ruang lingkup (In Scope)</h4>
  <ul>${SCOPE_IN.map(s => `<li>${s}</li>`).join('')}</ul>
  <h4>b. Tidak termasuk ruang lingkup (Out of Scope)</h4>
  <ul>${SCOPE_OUT.map(s => `<li>${s}</li>`).join('')}</ul>

  <h3>1.4 Pemangku Kepentingan &amp; Aktor Sistem</h3>
  ${table(['Aktor', 'Karakteristik', 'Hak Akses'], AKTOR)}

  <h3>1.5 Proses Bisnis As-Is dan To-Be</h3>
  <h4>a. As-Is (manual)</h4>
  <p>Koordinasi penyaluran sampah makanan MBG dilakukan manual: pengelola MBG menepon/mengirim pesan kepada pengelola panti asuhan atau peternakan satu per satu untuk menanyakan kesediaan dan kapasitas, memilih penerima berdasarkan perkiraan jarak, lalu mencatat serah terima di buku tamu. Tidak ada klasifikasi jenis sampah maupun kelayakan konsumsi, tidak ada pemantauan kapasitas waktu nyata, dan bukti penanganan hanya berupa kertas yang sulit diaudit saat diminta laporan kepatuhan oleh Pemkot Madiun.</p>
  <h4>b. To-Be (sistem aplikasi EcoMatch)</h4>
  <p>Pengelola MBG cukup mengunggah data sampah makanan (termasuk kelayakan konsumsi) melalui PWA; sistem mengklasifikasi jenis dan tingkat pembusukan serta memberi saran kelayakan, menjalankan AI Routing untuk memilih penerima terbaik (layak ke panti/yayasan, tidak layak ke peternakan) beserta rute jalan tercepat, menugaskan kurir, memverifikasi serah terima dengan foto dan OTP, mencatat penanganan di penerima, sekaligus membangun jejak traceability dan laporan kepatuhan secara otomatis.</p>

  <h3>1.6 Daftar Istilah Penting (Glossary)</h3>
  ${table(['Istilah', 'Definisi'], GLOSSARY)}
</section>

<!-- ============================ BAB II : SRS ============================ -->
<section>
  <h2>BAB II &mdash; BAGIAN SRS (SOFTWARE REQUIREMENTS SPECIFICATION)</h2>

  <h3>2.1 Gambaran Umum Sistem</h3>
  <p>EcoMatch adalah platform digital AI Routing penyaluran sisa makanan MBG ke penerima yang mengintegrasikan aplikasi PWA multi-peran (Donor MBG, Penerima, Kurir) dengan dashboard Administrator, mesin klasifikasi sampah, mesin routing multi-kriteria, serta modul kepatuhan regulasi Kota Madiun.</p>
  <p>Melalui aplikasi PWA, pengelola MBG mengunggah sampah makanan (jenis, berat, waktu produksi, foto, kelayakan konsumsi), sistem mengklasifikasinya lalu memilih penerima terbaik berdasarkan kelayakan (layak ke panti/yayasan, tidak layak ke peternakan), kapasitas tersisa, jarak/rute, dan urgensi; kurir menjemput dan mengantar dengan bukti foto dan OTP, penerima mencatat penanganan, dan Admin memantau laporan kepatuhan.</p>

  <h3>2.2 Kebutuhan Fungsional (Functional Requirements &ndash; FR)</h3>
  <p class="note">Tabel 3.1 Kebutuhan Fungsional (FR-01 s.d. FR-17) &mdash; sumber: docs/SKPL_EcoMatch_v2.0.docx (BAB III.a).</p>
  ${table(['Kode', 'Nama Fitur', 'Deskripsi Kebutuhan', 'Aktor'], FR.map(r => [`<span class="code">${r[0]}</span>`, `<b>${r[1]}</b>`, r[2], r[3]]))}
  <p><b>Trasebilitas pemenuhan</b>: seluruh FR-01 s.d. FR-17 dipetakan ke diagram alur, use case, ERD, activity, sequence, dan class diagram pada Bab III; serta kebutuhan non-fungsional pada tabel 3.2.</p>

  <h3>2.3 Kebutuhan Non-Fungsional (Non-Functional Requirements &ndash; NFR)</h3>
  <p class="note">Tabel 3.2 Kebutuhan Non-Fungsional (NFR-01 s.d. NFR-11) &mdash; sumber: docs/SKPL_EcoMatch_v2.0.docx (BAB III.b).</p>
  ${table(['Kode', 'Kategori', 'Deskripsi Kebutuhan'], NFR.map(r => [`<span class="code">${r[0]}</span>`, `<b>${r[1]}</b>`, r[2]]))}

  <h3>2.4 Metode Pengembangan Sistem (SDLC)</h3>
  <p>Pengembangan sistem EcoMatch menggunakan metode Agile-Scrum karena kebutuhan sistem &mdash; khususnya parameter dan bobot algoritma AI Routing &mdash; berpotensi menyesuaikan diri berdasarkan hasil uji coba/pilot bersama mitra donor dan lembaga penerima. Tahapan yang diterapkan:</p>
  <ul>
    <li><b>Product Backlog</b>: menyusun dan memprioritaskan seluruh kebutuhan fungsional dan non-fungsional sistem.</li>
    <li><b>Sprint Planning</b>: membagi backlog ke dalam sprint 2 minggu dengan target fitur yang jelas (mis. modul registrasi, modul AI Routing, modul GIS).</li>
    <li><b>Sprint Execution (Design&ndash;Development&ndash;Testing)</b>: perancangan antarmuka, implementasi backend/frontend, dan pengujian fungsional.</li>
    <li><b>Sprint Review &amp; Retrospective</b>: evaluasi hasil sprint bersama dosen pengampu/stakeholder dan perbaikan proses.</li>
    <li><b>Deployment &amp; Pilot Testing</b>: rilis bertahap ke lingkungan uji coba bersama mitra donor dan lembaga penerima terbatas.</li>
  </ul>
</section>

<!-- ============================ BAB III : DIAGRAM ============================ -->
<section>
  <h2>BAB III &mdash; PEMODELAN DIAGRAM SISTEM</h2>

  <h3>3.1 Flowchart 4 Alur Proses Bisnis</h3>
  <p>Empat alur inti sistem dirender langsung dari node dan edge pada file <span class="code">docs/arsitektur/UML_EcoMatch.drawio</span> (halaman <i>activity-unggah-klasifikasi-mbg</i>, <i>activity-routing-mbg-tps</i>, <i>activity-serah-terima-otp</i>, dan <i>activity-registrasi-eco-match</i>). Setiap halaman berikutnya memuat satu flowchart utuh beserta keterangannya.</p>
</section>
${flowFigs}

<section>
  <h3 style="margin-top:0">3.2 Use Case Diagram (Mermaid &ndash; baru)</h3>
  <p>Use case berikut disusun baru dengan sintaks Mermaid, memuat aktor, batas sistem, 14 use case, serta relasi <i>include</i>/<i>extend</i>.</p>
</section>
<figure class="fp">
  <div class="fbox"><div id="usecase"><pre class="mermaid">
${USECASE_MMD}
  </pre></div></div>
  <figcaption>Gambar 3.5 Use Case Diagram EcoMatch (Mermaid, include/extend)<span class="src">Sintaks baru: docs/tools/usecase-ecomatch.mmd &mdash; dirender oleh vendor/mermaid.min.js</span></figcaption>
</figure>

<section>
  <h3 style="margin-top:0">3.3 ERD, Activity, Sequence, dan Class Diagram</h3>
  <p>Seluruh diagram pada bagian ini diambil langsung dari berkas PNG di <span class="code">docs/arsitektur/</span> sesuai sumber dokumen arsitektur sistem EcoMatch v2.0.</p>
</section>
${pngFigs}

<!-- ============================ BAB IV ============================ -->
<section>
  <h2>BAB IV &mdash; PENUTUP &amp; REFERENSI</h2>
  <h3>4.1 Kesimpulan</h3>
  <p>Dokumen SRS/BRD EcoMatch ini memuat 17 kebutuhan fungsional (FR-01 s.d. FR-17) dan 11 kebutuhan non-fungsional (NFR-01 s.d. NFR-11) yang mencakup autentikasi RBAC, klasifikasi sampah, AI Routing, rute GIS, bukti serah terima, notifikasi, dashboard kepatuhan, motivasi donor, konfigurasi regulasi daerah, dan traceability end-to-end. Pemodelan sistem mencakup 4 flowchart alur bisnis (dirender dari node drawio), use case diagram baru (Mermaid), serta ERD, activity, sequence, dan class diagram dari PNG arsitektur.</p>
  <h3>4.2 Referensi</h3>
  <ol>
    <li>docs/SKPL_EcoMatch_v2.0.docx &mdash; Dokumen Spesifikasi Kebutuhan Perangkat Lunak EcoMatch v2.0 (sumber FR/NFR, BRD, dan glasari).</li>
    <li>docs/arsitektur/UML_EcoMatch.drawio &mdash; 12 halaman diagram UML/flowchart sumber render flowchart alur.</li>
    <li>docs/arsitektur/*.png &mdash; ERD, activity, sequence, class, dan arsitektur 3-tier.</li>
    <li>docs/arsitektur/Dokumen_Arsitektur_Sistem_EcoMatch_v2.0.md &mdash; dokumen arsitektur sistem.</li>
    <li>Sumber eksternal: IEEE 830-1998 (SRS), PMBOK/Agile-Scrum, Leaflet/OpenStreetMap/OSRM/PostGIS.</li>
  </ol>
  <div class="sig">
    <div class="col">Mengetahui,<br>Dosen Pengampu<br>${COVER.dosen}<div class="name">${COVER.dosen}</div><div>NIP. ${COVER.nip}</div></div>
    <div class="col">Madiun, 10 November 2026<br>Penyusun,<br>Kelas ${COVER.kelas}<div class="name">Nayla Aurellia Azarine &amp; Fida Muyasaroh</div><div>NIM. ${COVER.nimNayla} / ${COVER.nimFida}</div></div>
  </div>
</section>

<script>
  mermaid.initialize({ startOnLoad: true, securityLevel: 'loose', theme: 'neutral',
    fontFamily: 'Segoe UI, Arial, sans-serif', flowchart: { useMaxWidth: false, htmlLabels: true, nodeSpacing: 38, rankSpacing: 52 } });
</script>
</body>
</html>`;
}

/* --------------------------------------------------------- ukuran png */
function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 1, 4) === 'PNG') {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  return { w: 1200, h: 900 };
}

fs.writeFileSync(OUT, buildHtml(), 'utf8');
console.log('tulis', OUT, fs.statSync(OUT).size, 'bytes');
