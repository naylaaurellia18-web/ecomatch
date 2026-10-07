const API = '';
let token = localStorage.getItem('frai_token') || '';
let me = JSON.parse(localStorage.getItem('frai_user') || 'null');
let currentTab = '';
let gisMap = null;
let gisLayer = null;

const MADIUN_CENTER = [-7.63, 111.52];
const MADIUN_BOUNDS = [[-7.95, 111.2], [-7.3, 111.8]];

function inMadiun(lat, lng) {
  if (lat == null || lng == null) return false;
  const [[s, w], [n, e]] = MADIUN_BOUNDS;
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

const LOCATIONS = [
  { label: 'Kota Madiun', lat: -7.6245, lng: 111.525 },
  { label: 'Caruban', lat: -7.5494, lng: 111.6403 },
  { label: 'Mejayan', lat: -7.5519, lng: 111.4536 },
  { label: 'Balerejo', lat: -7.5483, lng: 111.5597 },
  { label: 'Dagangan', lat: -7.6061, lng: 111.6244 },
  { label: 'Dolopo', lat: -7.7503, lng: 111.55 },
  { label: 'Geger', lat: -7.7225, lng: 111.4683 },
  { label: 'Saradan', lat: -7.5317, lng: 111.335 },
  { label: 'Kartoharjo', lat: -7.6014, lng: 111.4844 },
  { label: 'Taman', lat: -7.6503, lng: 111.5172 },
  { label: 'Wungu', lat: -7.6833, lng: 111.5167 },
  { label: 'Sawahan', lat: -7.5267, lng: 111.4697 },
];

function locationSelectHtml(opts = {}) {
  const {
    label = 'Lokasi',
    required = false,
    hint = 'Pilih kecamatan/kota di sekitar Madiun, atau gunakan GPS di perangkat Anda',
  } = opts;
  return `
  <div class="loc-field">
    <label>${label}${required ? '' : ' <span class="muted">(opsional)</span>'}</label>
    <select name="location" data-loc-select ${required ? 'required' : ''}>
      <option value="">Pilih lokasi…</option>
      ${LOCATIONS.map((l) => `<option value="${l.lat},${l.lng}">${l.label}</option>`).join('')}
      <option value="gps">Gunakan lokasi saya (GPS)</option>
    </select>
    <input type="hidden" name="lat" data-loc-lat value="" />
    <input type="hidden" name="lng" data-loc-lng value="" />
    <div class="field-hint">${hint}</div>
  </div>`;
}

function bindLocationSelects(root = document) {
  root.querySelectorAll('[data-loc-select]').forEach((sel) => {
    if (sel._bound) return;
    sel._bound = true;
    sel.addEventListener('change', () => {
      const form = sel.closest('form');
      if (!form) return;
      const latIn = form.querySelector('[data-loc-lat]');
      const lngIn = form.querySelector('[data-loc-lng]');
      if (!latIn || !lngIn) return;
      if (sel.value === 'gps') {
        if (!navigator.geolocation) {
          toast('GPS tidak didukung di peramban ini', 'error');
          sel.value = '';
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            latIn.value = pos.coords.latitude.toFixed(6);
            lngIn.value = pos.coords.longitude.toFixed(6);
            toast('Lokasi perangkat terisi');
          },
          () => {
            toast('Izin lokasi ditolak — pilih kota manual', 'error');
            sel.value = '';
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      } else if (sel.value) {
        const [lat, lng] = sel.value.split(',');
        latIn.value = lat;
        lngIn.value = lng;
      } else {
        latIn.value = '';
        lngIn.value = '';
      }
    });
  });
}

function flowStepsHtml(status) {
  const order = ['dialokasikan', 'dijemput', 'terkirim', 'terverifikasi'];
  const labels = {
    dialokasikan: 'Dialokasikan',
    diajukan: 'Dialokasikan',
    diterima: 'Dialokasikan',
    dijemput: 'Dijemput',
    terkirim: 'Sampai',
    terverifikasi: 'Selesai',
    dibatalkan: 'Dibatalkan',
  };
  const key = ['diajukan', 'diterima'].includes(status) ? 'dialokasikan' : status;
  const idx = order.indexOf(key);
  if (status === 'dibatalkan') {
    return `<div class="flow-steps"><span class="flow-step cancelled">Dibatalkan</span></div>`;
  }
  return `
  <div class="flow-steps">
    ${order
      .map((s, i) => {
        const state = idx < 0 ? '' : i < idx ? 'done' : i === idx ? 'current' : '';
        return `<span class="flow-step ${state}">${labels[s]}</span>`;
      })
      .join('<span class="flow-arrow">→</span>')}
  </div>`;
}

function flowStripHtml(steps) {
  return `
  <div class="card flow-card">
    <div class="flow-strip">
      ${steps
        .map(
          (s, i) =>
            `${i ? '<span class="flow-strip-arrow">→</span>' : ''}<span class="flow-strip-step"><b>${i + 1}</b>${esc(s)}</span>`
        )
        .join('')}
    </div>
  </div>`;
}

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  map: '<path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z"/><path d="M9 3v15"/><path d="M15 6v15"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  key: '<path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  sparkles: '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4M19 17v4M3 5h4M17 19h4"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
};

function icon(name, size = 16) {
  const body = ICONS[name] || ICONS.dashboard;
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function getTheme() {
  return localStorage.getItem('frai_theme') === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('frai_theme', theme);
  const isDark = theme === 'dark';
  const trackHtml = `
    <span class="switch-track" aria-hidden="true">
      <span class="switch-thumb">${icon(isDark ? 'moon' : 'sun', 12)}</span>
    </span>
    <span class="switch-label">${isDark ? 'Gelap' : 'Terang'}</span>`;
  const nextLabel = isDark ? 'Mode terang' : 'Mode gelap';
  document.querySelectorAll('#themeToggle, [data-theme-toggle]').forEach((btn) => {
    btn.innerHTML = trackHtml;
    btn.title = nextLabel;
    btn.setAttribute('aria-label', `Aktifkan ${nextLabel.toLowerCase()}`);
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', isDark ? 'true' : 'false');
    btn.dataset.themeState = theme;
  });
}

function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

function pageHead(title, desc = '', actions = '') {
  return `<div class="page-head">
    <div>
      <h1>${title}</h1>
      ${desc ? `<div class="desc">${desc}</div>` : ''}
    </div>
    ${actions ? `<div class="actions">${actions}</div>` : ''}
  </div>`;
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.hidden = true), 3500);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtDate(s) {
  if (!s) return '-';
  const d = new Date(s.endsWith('Z') || s.includes('+') ? s : s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusTag(s) {
  const map = {
    tersedia: ['tag-green', 'Tersedia'], dialokasikan: ['tag-blue', 'Dialokasikan'],
    dijemput: ['tag-yellow', 'Dijemput'], terkirim: ['tag-yellow', 'Terkirim'],
    terverifikasi: ['tag-green', 'Terverifikasi'], dibatalkan: ['tag-gray', 'Dibatalkan'],
    gagal: ['tag-red', 'Gagal'], diajukan: ['tag-blue', 'Dialokasikan'],
    diterima: ['tag-blue', 'Dialokasikan'], terbuka: ['tag-green', 'Terbuka'],
    dipenuhi: ['tag-green', 'Dipenuhi'], kedaluwarsa: ['tag-gray', 'Kedaluwarsa'],
    menunggu: ['tag-yellow', 'Menunggu'], aktif: ['tag-green', 'Aktif'],
    ditolak: ['tag-red', 'Ditolak'], antre: ['tag-yellow', 'Antre'],
    simulasi: ['tag-blue', 'Simulasi'],
    kritis: ['tag-red', 'Kritis'], tinggi: ['tag-yellow', 'Tinggi'],
    sedang: ['tag-blue', 'Sedang'], rendah: ['tag-gray', 'Rendah'],
    basah: ['tag-blue', 'Makanan Basah'], kering: ['tag-yellow', 'Makanan Kering'],
    donor: ['tag-blue', 'Donor'], penerima: ['tag-green', 'Penerima'],
    donor_mbg: ['tag-blue', 'Donor MBG'], tps_pengolah: ['tag-green', 'TPS Pengolah'],
    kurir: ['tag-yellow', 'Kurir'], admin: ['tag-gray', 'Admin'],
    nasi: ['tag-blue', 'Nasi'], sayur: ['tag-green', 'Sayur'], lauk: ['tag-yellow', 'Lauk'],
    buah: ['tag-green', 'Buah'], campuran: ['tag-blue', 'Campuran'], lainnya: ['tag-gray', 'Lainnya'],
    sisa_nasi: ['tag-blue', 'Sisa Nasi'], kulit_buah: ['tag-green', 'Kulit/Sisa Buah'],
    segar: ['tag-green', 'Segar'], mulai_busu: ['tag-yellow', 'Mulai Busuk'],
    busuk: ['tag-red', 'Busuk'],
  };
  const [cls, label] = map[s] || ['tag-gray', s];
  return `<span class="tag ${cls}">${label}</span>`;
}

const ROLE_LABEL = {
  donor_mbg: 'Donor MBG',
  tps_pengolah: 'TPS Pengolah',
  kurir: 'Kurir',
  admin: 'Admin',
};

const JENIS_SAMPAH = ['nasi', 'sayur', 'lauk', 'buah', 'campuran', 'lainnya'];
const JENIS_LABEL = {
  nasi: 'Nasi', sayur: 'Sayur', lauk: 'Lauk', buah: 'Buah', campuran: 'Campuran',
  lainnya: 'Lainnya', sisa_nasi: 'Sisa Nasi', kulit_buah: 'Kulit/Sisa Buah',
};
function jenisLabel(j) {
  return JENIS_LABEL[j] || String(j || '').replace(/_/g, ' ');
}
const JENIS_TPS = [
  ['tps_3r', 'TPS 3R'],
  ['tps_komposter', 'TPS Komposter'],
  ['tps_maggot', 'TPS Maggot/BSSF'],
  ['tps_eco_enzyme', 'TPS Eco Enzyme'],
  ['bank_sampah', 'Bank Sampah'],
  ['lainnya', 'Lainnya'],
];
const JENIS_PENGOLAHAN = [
  ['komposter', 'Komposter'],
  ['maggot_bsf', 'Maggot BSF'],
  ['eco_enzyme', 'Eco Enzyme'],
  ['bank_sampah', 'Bank Sampah'],
  ['lainnya', 'Lainnya'],
];
const KATEGORI_DITERIMA = ['sisa_nasi', 'sayur', 'lauk', 'kulit_buah', 'campuran', 'lainnya'];

const FOOD_TYPE_LABEL = { basah: 'Makanan Basah', kering: 'Makanan Kering' };

function sopKeyForJenis(jenis) {
  return ['nasi', 'sayur', 'lauk', 'buah', 'campuran', 'sisa_nasi', 'kulit_buah'].includes(jenis)
    ? 'basah'
    : jenis === 'kering'
      ? 'kering'
      : null;
}

const SOP = {
  basah: {
    title: 'SOP Makanan Basah',
    warn: 'Makanan basah mudah basi & tumbuh bakteri — utamakan rantai dingin dan waktu singkat.',
    sections: [
      {
        title: 'Packing',
        items: [
          'Gunakan wadah food-grade tertutup rapat (container/box mika bersegel)',
          'Pisahkan makanan matang dan mentah — jangan dicampur',
          'Label wadah: nama makanan, jam masak/sisa, masa simpan, porsi',
          'Bungkus dengan ice gel/cold pack bila suhu harus tetap dingin',
          'Hindari kertas koran / wadah terbuka saat pengantaran',
        ],
      },
      {
        title: 'Penyimpanan',
        items: [
          'Suhu penyimpanan ≤ 5°C (chiller) atau ≤ -18°C (freezer) bila bisa',
          'Bila tidak ada chiller: simpan di tempat paling dingin, maksimal 2 jam sebelum penjemputan',
          'Jangan simpan di bawah matahari / ruang panas dapur',
          'Simpan berdasarkan FEFO (First Expired, First Out)',
        ],
      },
      {
        title: 'Suhu & Rentang Aman',
        items: [
          'Zona berbahaya 5°C–60°C — makanan basah jangan lama di rentang ini',
          'Target: dari dapur → kurir → TPS dalam ≤ 4 jam (ideal ≤ 2 jam)',
          'Saat tiba, TPS cek bau, tekstur, dan suhu — bila ragu, olah segera',
        ],
      },
      {
        title: 'Hygiene & Transport',
        items: [
          'Cuci tangan / pakai sarung tangan saat mengemas',
          'Dasar kendaraan bersih; makanan tidak bersentuhan langsung dengan lantai bagasi',
          'Antar langsung — tidak boleh ditinggal di dashboard panas',
          'Foto kondisi makanan saat penjemputan sebagai bukti rantai penanganan',
        ],
      },
    ],
  },
  kering: {
    title: 'SOP Makanan Kering',
    warn: 'Makanan kering lebih tahan lama, tapi tetap jaga kelembapan & kemasan utuh.',
    sections: [
      {
        title: 'Packing',
        items: [
          'Pakai kemasan asli yang masih utuh, atau ziplock/foil food-grade',
          'Pastikan kemasan tidak sobek, bocor, atau lembap',
          'Gabungkan item serupa dalam kardus/kotak bertumpuk rapi',
          'Label: nama produk, tanggal kedaluwarsa, jumlah, kondisi kemasan',
        ],
      },
      {
        title: 'Penyimpanan',
        items: [
          'Simpan kering, sejuk, teduh — hindari kelembapan tinggi',
          'Jauhkan dari bau menyengat (mis. deterjen, bensin) agar tidak menyerap aroma',
          'Angin-anginkan gudang; jangan menumpuk menempel lantai lembap',
          'Rotasi stok FEFO — yang kedaluwarsa paling dekat didahulukan',
        ],
      },
      {
        title: 'Rentang Aman',
        items: [
          'Umumnya aman di suhu ruang selama kemasan tersegel',
          'Hindari suhu ekstrem & sinar matahari langsung (bisa mencairkan/rusak)',
          'Cek masa simpan sebelum dicatat; yang kedaluwarsa tidak boleh diolah',
        ],
      },
      {
        title: 'Hygiene & Transport',
        items: [
          'Kemas lapis luar bersih; jangan taruh di bagasi basah',
          'Pisahkan dari makanan basah saat dijadikan satu rute',
          'Foto kemasan utuh saat penjemputan',
        ],
      },
    ],
  },
};

function foodTypeTag(t) {
  if (t !== 'basah' && t !== 'kering') return '—';
  return statusTag(t);
}

function sopHtml(type, { compact = false } = {}) {
  const s = SOP[type];
  if (!s) return '';
  if (compact) {
    return `
    <div class="sop sop-compact sop-${type}">
      <div class="sop-head">${icon('shield', 14)} <strong>${s.title}</strong> ${foodTypeTag(type)}</div>
      <ul class="sop-list">
        ${s.sections.flatMap((sec) => sec.items.slice(0, 2)).slice(0, 6).map((i) => `<li>${esc(i)}</li>`).join('')}
      </ul>
    </div>`;
  }
  return `
  <details class="sop-details">
    <summary>${icon('shield', 14)} Panduan SOP ${type === 'basah' ? 'Makanan Basah' : 'Makanan Kering'} — buka panduan</summary>
    <div class="sop sop-${type}" data-sop="${type}">
      <div class="sop-head">
        ${icon('shield', 16)}
        <div>
          <strong>${s.title}</strong>
          <div class="sop-warn">${esc(s.warn)}</div>
        </div>
        <span class="sop-badge">${type === 'basah' ? icon('refresh', 14) + ' Rantai dingin' : icon('package', 14) + ' Jaga kering'}</span>
      </div>
      <div class="sop-grid">
        ${s.sections.map((sec) => `
          <div class="sop-sec">
            <div class="sop-sec-title">${esc(sec.title)}</div>
            <ul class="sop-list">
              ${sec.items.map((i) => `<li>${icon('check', 12)}<span>${esc(i)}</span></li>`).join('')}
            </ul>
          </div>`).join('')}
      </div>
    </div>
  </details>`;
}

function bindSopToggle(root = document) {
  const sel = root.querySelector('[name="jenis_makanan"]');
  const box = root.querySelector('#sopBox');
  if (!sel || !box) return;
  const paint = () => {
    const t = sel.value === 'kering' ? 'kering' : 'basah';
    box.innerHTML = sopHtml(t);
  };
  sel.addEventListener('change', paint);
  paint();
}

function logout() {
  try {
    localStorage.removeItem('frai_token');
    localStorage.removeItem('frai_user');
  } catch (_) {}
  token = '';
  me = null;
  currentTab = '';
  destroyMap();
  closeSidebar();
  render();
}
window.logout = logout;

const NAV = {
  admin: [
    ['dashboard', 'dashboard', 'Beranda'],
    ['gis', 'map', 'Peta GIS'],
    ['users', 'users', 'Pengguna'],
    ['matches', 'cpu', 'Routing AI'],
    ['outbox', 'message', 'Pesan Terkirim'],
    ['logs', 'file', 'Catatan Audit'],
    ['notif', 'bell', 'Notifikasi'],
  ],
  donor_mbg: [
    ['donor', 'package', 'Catat Sampah'],
    ['donor-listings', 'list', 'Stok Sampah'],
    ['donor-matches', 'link', 'Routing Saya'],
    ['donor-points', 'award', 'Poin & Insentif'],
    ['gis', 'map', 'Peta GIS'],
    ['notif', 'bell', 'Notifikasi'],
  ],
  tps_pengolah: [
    ['recipient', 'heart', 'Profil TPS'],
    ['recipient-matches', 'key', 'Konfirmasi OTP'],
    ['gis', 'map', 'Peta GIS'],
    ['notif', 'bell', 'Notifikasi'],
  ],
  kurir: [
    ['courier', 'truck', 'Tugas Kurir'],
    ['gis', 'map', 'Peta GIS'],
    ['notif', 'bell', 'Notifikasi'],
  ],
};

const TAB_TITLES = {
  dashboard: 'Beranda',
  gis: 'Peta GIS',
  users: 'Pengguna',
  matches: 'Routing AI',
  outbox: 'Pesan Terkirim',
  logs: 'Catatan Audit',
  notif: 'Notifikasi',
  donor: 'Catat Sampah',
  'donor-listings': 'Stok Sampah',
  'donor-matches': 'Routing Saya',
  'donor-points': 'Poin & Insentif',
  recipient: 'Profil TPS',
  'recipient-matches': 'Konfirmasi OTP',
  courier: 'Tugas Kurir',
};

function renderNav() {
  const tabs = NAV[me?.role] || [];
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.innerHTML =
    `<div class="nav-label">Navigasi</div>` +
    tabs
      .map(
        ([id, ic, label]) =>
          `<button type="button" class="${currentTab === id ? 'active' : ''}" data-tab="${id}">${icon(ic, 17)}<span>${label}</span></button>`
      )
      .join('');
  const top = document.getElementById('topbarTitle');
  if (top) top.textContent = TAB_TITLES[currentTab] || 'Beranda';
}

function setTab(t) {
  if (!t) return;
  const same = currentTab === t;
  currentTab = t;
  closeSidebar();
  renderNav();
  if (!same) destroyMap();
  renderView();
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}
function destroyMap() {
  if (gisMap) {
    gisMap.remove();
    gisMap = null;
    gisLayer = null;
  }
}

function render() {
  const authRoot = document.getElementById('authRoot');
  const layout = document.getElementById('appLayout');

  if (!token || !me) {
    layout.hidden = true;
    authRoot.hidden = false;
    authRoot.innerHTML = renderAuth();
    bindAuth();
    applyTheme(getTheme());
    return;
  }

  destroyMap();
  authRoot.hidden = true;
  authRoot.innerHTML = '';
  layout.hidden = false;

  document.getElementById('userName').textContent = me.nama;
  document.getElementById('userRole').textContent = ROLE_LABEL[me.role] || me.role;
  const avatar = document.getElementById('userAvatar');
  if (avatar) {
    const initials = String(me.nama || me.email || '?')
      .split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    avatar.textContent = initials;
  }
  const topUser = document.getElementById('topbarUser');
  if (topUser) topUser.textContent = me.nama || me.email || '';
  const statusEl = document.getElementById('userStatus');
  if (statusEl) statusEl.textContent = me.status === 'aktif' ? 'Terverifikasi' : me.status;

  const tabs = NAV[me.role] || [];
  if (!tabs.length) {
    layout.hidden = true;
    authRoot.hidden = false;
    authRoot.innerHTML = `<div class="empty"><div class="empty-title">Peran ${esc(me.role)} tidak memiliki menu</div>
      <button class="btn" onclick="logout()">Keluar</button></div>`;
    return;
  }
  if (!currentTab || !tabs.find((t) => t[0] === currentTab)) currentTab = tabs[0][0];
  renderNav();

  renderView();
}

async function renderView() {
  const view = document.getElementById('view');
  view.innerHTML = '<div class="empty"><div class="empty-title">Memuat data…</div></div>';
  try {
    const renderers = {
      dashboard: renderAdminDashboard,
      gis: renderGisMap,
      users: renderAdminUsers,
      matches: renderAdminMatches,
      outbox: renderAdminOutbox,
      logs: renderAdminLogs,
      notif: renderNotif,
      donor: renderDonorForm,
      'donor-listings': renderDonorListings,
      'donor-matches': renderDonorMatches,
      'donor-points': renderDonorPoints,
      recipient: renderTpsProfile,
      'recipient-matches': renderRecipientMatches,
      courier: renderCourier,
    };
    const fn = renderers[currentTab];
    view.innerHTML = fn ? await fn() : '<div class="empty">Halaman tidak ditemukan</div>';
    if (fn) {
      bindView();
      bindSopToggle(view);
      if (currentTab === 'gis') initGisMap();
    }
  } catch (e) {
    view.innerHTML = `<div class="empty"><div class="empty-title">Terjadi kesalahan</div>${esc(e.message)}</div>`;
  }
}

function formDataToObject(fd) {
  const body = {};
  fd.forEach((v, k) => {
    if (k in body) {
      body[k] = Array.isArray(body[k]) ? [...body[k], v] : [body[k], v];
    } else {
      body[k] = v;
    }
  });
  return body;
}

function bindView() {
  bindLocationSelects(document.getElementById('view'));
  document.querySelectorAll('form[data-action]').forEach((f) => {
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(f);
      if (fd.has('location')) {
        if (!fd.get('lat')) fd.delete('lat');
        if (!fd.get('lng')) fd.delete('lng');
        fd.delete('location');
      }
      try {
        let res;
        if (f.dataset.multipart === '1') {
          res = await api(f.dataset.endpoint, { method: 'POST', body: fd });
        } else {
          const body = formDataToObject(fd);
          res = await api(f.dataset.endpoint, { method: f.dataset.method || 'POST', body });
        }
        let pesan = res.message || 'Berhasil';
        if (res.klasifikasi) {
          pesan += ` — klasifikasi: ${res.klasifikasi.kategori}/${res.klasifikasi.tingkat_pembusukan} (${Math.round(Number(res.klasifikasi.skor_keyakinan || 0) * 100)}%)`;
        }
        toast(pesan);
        renderView();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  });

  document.querySelectorAll('[data-post]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.confirm && !confirm(btn.dataset.confirm)) return;
      btn.disabled = true;
      try {
        const body = btn.dataset.body ? JSON.parse(btn.dataset.body) : {};
        const res = await api(btn.dataset.post, { method: btn.dataset.method || 'POST', body });
        toast(res.message || 'Berhasil');
        renderView();
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-patch]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const body = JSON.parse(btn.dataset.body || '{}');
        const res = await api(btn.dataset.patch, { method: 'PATCH', body });
        toast(res.message || 'Berhasil');
        renderView();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  });

  document.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const msg = btn.dataset.confirm || 'Hapus item ini?';
      if (!confirm(msg)) return;
      try {
        const res = await api(btn.dataset.delete, { method: 'DELETE' });
        toast(res.message || 'Dihapus');
        renderView();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  });
}

/* ========== GIS MAP ========== */

async function renderGisMap() {
  const [geo, alokasi] = await Promise.all([
    api('/api/geo'),
    api('/api/routing').catch(() => []),
  ]);
  const users = geo.users || [];
  const tps = geo.tps || [];
  const active = alokasi.filter((m) => !['dibatalkan'].includes(m.status));

  return `
  ${pageHead('Peta GIS', 'Sebaran donor MBG, TPS pengolah, kurir &amp; rute alokasi sampah')}
  <div class="card map-card">
    <div class="map-toolbar">
      <div class="map-legend">
        <span><i class="dot dot-donor"></i> Donor MBG</span>
        <span><i class="dot dot-recipient"></i> TPS Pengolah</span>
        <span><i class="dot dot-courier"></i> Kurir</span>
        <span><i class="dot dot-listing"></i> Sampah tersedia</span>
        <span><i class="dot" style="background:#2563eb;border-radius:2px;height:3px;width:16px"></i> Rute alokasi</span>
      </div>
    </div>
    <div class="map-wrap"><div id="gisMap"></div></div>
    <div class="map-stats">
      <div class="stat"><div class="label">Donor MBG</div><div class="value">${users.filter((u) => u.role === 'donor_mbg' && u.lat).length}</div></div>
      <div class="stat"><div class="label">TPS Pengolah</div><div class="value">${tps.filter((t) => t.lat).length}</div></div>
      <div class="stat"><div class="label">Kurir</div><div class="value">${users.filter((u) => u.role === 'kurir' && u.lat).length}</div></div>
      <div class="stat accent"><div class="label">Rute aktif</div><div class="value">${active.length}</div></div>
    </div>
  </div>
  <p class="muted" style="font-size:12.5px">Marker hanya menampilkan lokasi di area Madiun.</p>`;
}

function initGisMap() {
  const el = document.getElementById('gisMap');
  if (!el || typeof L === 'undefined') return;

  destroyMap();
  gisMap = L.map('gisMap', { zoomControl: true }).setView(MADIUN_CENTER, 11);
  gisLayer = L.layerGroup().addTo(gisMap);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap',
  }).addTo(gisMap);

  gisMap.fitBounds(MADIUN_BOUNDS);

  loadMapData().catch((e) => toast(e.message, 'error'));

  setTimeout(() => gisMap && gisMap.invalidateSize(), 200);
}

async function loadMapData() {
  if (!gisMap || !gisLayer) return;

  const [geo, alokasi] = await Promise.all([
    api('/api/geo'),
    api('/api/routing').catch(() => []),
  ]);
  const users = geo.users || [];
  const listings = geo.listings || [];
  const tpsById = new Map((geo.tps || []).map((t) => [Number(t.id_user), t]));

  gisLayer.clearLayers();

  const mkIcon = (color) =>
    L.divIcon({
      className: '',
      html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 2px ${color}88"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -8],
    });

  for (const u of users) {
    if (!inMadiun(u.lat, u.lng)) continue;
    if (!['donor_mbg', 'tps_pengolah', 'kurir'].includes(u.role)) continue;
    const colors = { donor_mbg: '#2563eb', tps_pengolah: '#dc2626', kurir: '#f59e0b' };
    const roleLabel = { donor_mbg: 'Donor MBG', tps_pengolah: 'TPS Pengolah', kurir: 'Kurir' };
    const tps = u.role === 'tps_pengolah' ? tpsById.get(Number(u.id_user)) : null;
    L.marker([u.lat, u.lng], { icon: mkIcon(colors[u.role]) })
      .bindPopup(
        `<b>${esc(u.nama)}</b><br>${roleLabel[u.role]} · ${statusTag(u.status)}<br>` +
          `<span class="muted">${esc(u.alamat || '')}</span>` +
          (tps
            ? `<br><span class="muted">${esc(tps.nama_tps || '')} · ${Number(tps.kapasitas_kg_hari || 0)} kg/hari</span>`
            : u.kapasitas
              ? `<br><span class="muted">Kapasitas: ${u.kapasitas} porsi</span>`
              : '')
      )
      .addTo(gisLayer);
  }

  for (const l of listings) {
    if (!inMadiun(l.lat, l.lng)) continue;
    if (!['tersedia', 'dialokasikan'].includes(l.status)) continue;
    L.circleMarker([l.lat, l.lng], {
      radius: 7,
      color: '#fff',
      weight: 2,
      fillColor: '#16a34a',
      fillOpacity: 0.95,
    })
      .bindPopup(
        `<b>${esc(l.nama_sampah)}</b><br>${l.berat_kg} kg · ${statusTag(l.jenis_makanan)} · ${statusTag(l.status)}<br>` +
          `<span class="muted">Diproduksi: ${fmtDate(l.waktu_produksi)}</span>`
      )
      .addTo(gisLayer);
  }

  for (const m of alokasi) {
    if (!m.rute || m.status === 'dibatalkan') continue;
    const pts = (m.rute.titik || [])
      .filter((w) => inMadiun(w.lat, w.lng))
      .map((w) => [w.lat, w.lng]);
    if (pts.length < 2) continue;

    L.polyline(pts, { color: '#2563eb', weight: 4, opacity: 0.75, dashArray: '8 6' }).addTo(gisLayer);

    const mid = pts[Math.floor(pts.length / 2)];
    L.circleMarker(mid, {
      radius: 5,
      color: '#fff',
      weight: 2,
      fillColor: '#7c3aed',
      fillOpacity: 1,
    })
      .bindPopup(
          `<b>Alokasi #${m.id_alokasi}</b><br>${esc(m.nama_sampah || '')} → ${esc(m.nama_tps || '')}<br>` +
          `${m.jarak_km} km · ${statusTag(m.status)}` +
          (m.skor_persen != null ? `<br>Skor: ${m.skor_persen}%` : '')
      )
      .addTo(gisLayer);
  }
}

/* ========== AUTH ========== */

function isLocalHost() {
  return ['localhost', '127.0.0.1', ''].includes(location.hostname);
}

function renderAuth() {
  const demoNote = isLocalHost()
    ? `<div class="demo-note">Coba langsung — Admin: <b>admin@ecomatch.id</b> / <b>admin123</b></div>`
    : '';
  return `
  <div class="auth-wrap">
    <aside class="auth-aside">
      <div class="auth-brand">
        <span class="mark">${icon('leaf', 20)}</span>
        <span>EcoMatch</span>
      </div>
      <div class="auth-hero">
        <h2>Sisa makanan MBG bukan akhir — olah kembali di TPS</h2>
        <p>EcoMatch mengalihkan sampah makanan MBG ke TPS pengolah terdekat dengan routing AI &amp; peta GIS.</p>
        <ul class="auth-points">
          <li><span class="tick">${icon('check', 12)}</span> Catat sampah makanan hanya dengan foto</li>
          <li><span class="tick">${icon('check', 12)}</span> Klasifikasi &amp; routing AI otomatis</li>
          <li><span class="tick">${icon('check', 12)}</span> Pantau penjemputan di peta</li>
          <li><span class="tick">${icon('check', 12)}</span> Serah terima terverifikasi via OTP</li>
        </ul>
      </div>
      <div class="auth-foot">Mengalihkan sampah makanan MBG dengan aman dan terlacak</div>
    </aside>
    <div class="auth-panel">
      <button class="theme-switch auth-theme" type="button" data-theme-toggle title="Ganti tema" aria-label="Ganti tema terang/gelap"></button>
      <div class="auth-card">
        <div class="eyebrow">AI Routing Sampah Makanan MBG</div>
        <h1>Masuk ke akun Anda</h1>
        <p class="sub">Belum punya akun? Daftar gratis — cuma 4 langkah singkat.</p>
        <div class="auth-tabs">
          <button id="tabLogin" class="active" type="button">Masuk</button>
          <button id="tabReg" type="button">Daftar</button>
        </div>
        <form id="formLogin" data-action="1" data-endpoint="/api/auth/login">
          <label>Email</label>
          <input name="email" type="email" required placeholder="nama@contoh.id" autocomplete="email" />
          <label>Kata Sandi</label>
          <input name="password" type="password" required placeholder="••••••••" autocomplete="current-password" />
          <div class="login-row">
            <button class="btn btn-block" type="submit">${icon('arrowRight', 15)} Masuk</button>
            <button class="link-btn" type="button" id="btnForgot">Lupa kata sandi?</button>
          </div>
          ${demoNote}
        </form>
        <form id="formReg" hidden data-action="1" data-endpoint="/api/auth/register">
          <label>Nama / Nama Organisasi</label>
          <input name="nama" required placeholder="SPPG Dapur MBG Kota Madiun" />
          <label>Email</label>
          <input name="email" type="email" required autocomplete="email" placeholder="nama@contoh.id" />
          <label>Kata Sandi</label>
          <input name="password" type="password" minlength="6" required autocomplete="new-password" placeholder="minimal 6 karakter" />
          <label>Saya mendaftar sebagai</label>
          <div class="role-cards">
            <label class="role-card">
              <input type="radio" name="role" value="donor_mbg" checked />
              <span class="role-card-body"><b>Donor MBG</b><small>Punya sisa makanan MBG (dapur/SPPG/hotel/resto)</small></span>
            </label>
            <label class="role-card">
              <input type="radio" name="role" value="tps_pengolah" />
              <span class="role-card-body"><b>TPS Pengolah</b><small>Mengelola TPS kompos/bank sampah/maggot</small></span>
            </label>
            <label class="role-card">
              <input type="radio" name="role" value="kurir" />
              <span class="role-card-body"><b>Kurir</b><small>Ingin jadi relawan penjemput sampah</small></span>
            </label>
          </div>
          <details class="more-details">
            <summary>Informasi tambahan <span class="muted">(boleh dilewati)</span></summary>
            <div class="more-details-body">
              <label>Telepon</label>
              <input name="telepon" placeholder="08xxx" inputmode="tel" />
              <label>Alamat</label>
              <input name="alamat" placeholder="Jl. …, Madiun" />
              ${locationSelectHtml({ label: 'Lokasi domisili', hint: 'Untuk peta & perhitungan rute — pilih kota atau GPS' })}
              <div id="courierField" hidden>
                <label>Kapasitas Logistik (porsi)</label>
                <input name="kapasitas" type="number" min="1" placeholder="50" />
              </div>
              <div id="orgField">
                <label>Nama Organisasi / SPPG</label>
                <input name="nama_lembaga" placeholder="SPPG / TPS / Komunitas" />
              </div>
            </div>
          </details>
          <button class="btn btn-block" type="submit">Daftar sekarang</button>
          <p class="reg-note">Akun perlu diverifikasi admin dulu — akun TPS juga perlu melengkapi profil TPS setelah disetujui.</p>
        </form>
        <form id="formForgot" hidden>
          <label>Email terdaftar</label>
          <input name="email" type="email" required placeholder="nama@contoh.id" autocomplete="email" />
          <button class="btn btn-block" type="submit">Kirim kode reset</button>
          <p class="reg-note">Kode 6 digit berlaku 15 menit, dikirim ke email Anda.</p>
          <button class="link-btn back-login" type="button" id="btnBackLogin">← Kembali ke masuk</button>
        </form>
        <form id="formReset" hidden>
          <label>Email</label>
          <input name="email" type="email" required autocomplete="email" />
          <label>Kode reset (6 digit)</label>
          <input name="kode" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required placeholder="123456" autocomplete="one-time-code" />
          <label>Kata sandi baru</label>
          <input name="password" type="password" minlength="6" required autocomplete="new-password" placeholder="minimal 6 karakter" />
          <button class="btn btn-block" type="submit">Simpan sandi baru</button>
          <button class="link-btn back-login" type="button" id="btnBackLogin2">← Kembali ke masuk</button>
        </form>
        <div class="auth-legal">
          <a href="/privacy.html">Kebijakan Privasi</a>
          <span>·</span>
          <a href="/syarat.html">Syarat &amp; Ketentuan</a>
        </div>
      </div>
    </div>
  </div>`;
}

function bindAuth() {
  const tabLogin = document.getElementById('tabLogin');
  const tabReg = document.getElementById('tabReg');
  const formLogin = document.getElementById('formLogin');
  const formReg = document.getElementById('formReg');
  const formForgot = document.getElementById('formForgot');
  const formReset = document.getElementById('formReset');

  function showPanel(which) {
    const map = { login: formLogin, reg: formReg, forgot: formForgot, reset: formReset };
    Object.values(map).forEach((f) => { if (f) f.hidden = true; });
    if (map[which]) map[which].hidden = false;
    document.querySelector('.auth-tabs').hidden = which === 'forgot' || which === 'reset';
    tabLogin.classList.toggle('active', which === 'login');
    tabReg.classList.toggle('active', which === 'reg');
  }

  tabLogin.onclick = () => showPanel('login');
  tabReg.onclick = () => showPanel('reg');
  document.getElementById('btnForgot')?.addEventListener('click', () => showPanel('forgot'));
  document.getElementById('btnBackLogin')?.addEventListener('click', () => showPanel('login'));
  document.getElementById('btnBackLogin2')?.addEventListener('click', () => showPanel('login'));

  formLogin.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(formLogin);
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: { email: fd.get('email'), password: fd.get('password') },
      });
      token = res.token;
      me = res.user;
      localStorage.setItem('frai_token', token);
      localStorage.setItem('frai_user', JSON.stringify(me));
      if (me.status === 'menunggu') toast('Akun belum diverifikasi admin', 'error');
      else toast(`Selamat datang, ${me.nama}`);
      currentTab = '';
      render();
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  formReg.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(formReg);
    const body = formDataToObject(fd);
    if (!body.lat) delete body.lat;
    if (!body.lng) delete body.lng;
    delete body.location;
    try {
      const res = await api('/api/auth/register', { method: 'POST', body });
      toast(res.message);
      showRegSuccess(body.email, body.role);
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  formForgot?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = new FormData(formForgot).get('email');
    try {
      const res = await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      toast(res.message);
      const emailInput = formReset?.querySelector('input[name="email"]');
      if (emailInput) emailInput.value = email;
      showPanel('reset');
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  formReset?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(formReset);
    try {
      const res = await api('/api/auth/reset-password', {
        method: 'POST',
        body: { email: fd.get('email'), kode: fd.get('kode'), password: fd.get('password') },
      });
      toast(res.message);
      const loginEmail = formLogin?.querySelector('input[name="email"]');
      if (loginEmail) loginEmail.value = fd.get('email');
      showPanel('login');
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  formReg.querySelectorAll('input[name="role"]').forEach((r) =>
    r.addEventListener('change', () => {
      const isCourier = formReg.role.value === 'kurir';
      document.getElementById('courierField').hidden = !isCourier;
      document.getElementById('orgField').hidden = isCourier;
    })
  );

  bindLocationSelects(formReg);
}

function showRegSuccess(email, role) {
  const card = document.querySelector('.auth-card');
  if (!card) return;
  const catatanTps =
    role === 'tps_pengolah'
      ? ' <b>Setelah disetujui admin</b>, lengkapi profil TPS (kapasitas, jenis olahan) agar bisa menerima alokasi routing.'
      : '';
  card.innerHTML = `
    <div class="auth-success">
      <div class="auth-success-icon">${icon('check', 28)}</div>
      <h1>Pendaftaran berhasil!</h1>
      <p class="sub">Akun <b>${esc(email)}</b> sudah dibuat. <b>Menunggu verifikasi admin</b> dulu ya — setelah itu Anda bisa masuk.${catatanTps}</p>
      <button class="btn btn-block" id="backToLogin">${icon('arrowRight', 15)} Kembali ke halaman masuk</button>
    </div>`;
  document.getElementById('backToLogin').onclick = () => render();
}

/* ========== PAGES ========== */

async function renderAdminDashboard() {
  const s = await api('/api/admin/stats');
  const runs = s.kinerja?.riwayat_routing || [];
  const isEmpty =
    (s.sampah?.total ?? 0) === 0 && (s.alokasi?.total ?? 0) === 0 && (s.users?.total ?? 0) <= 1;

  return `
  ${pageHead(
    'Beranda',
    'Ringkasan operasional pengalihan sampah makanan MBG ke TPS pengolah',
    `<div class="row">
      <button class="btn" data-post="/api/routing/run">${icon('sparkles', 15)} Jalankan Routing AI</button>
      <button class="btn btn-outline" data-post="/api/admin/clean" data-confirm="Hapus semua data transaksi (sampah, alokasi, log pengolahan, notifikasi)? Akun login tetap ada.">Bersihkan Data</button>
    </div>`
  )}
  ${isEmpty ? `
  <div class="card">
    <div class="empty" style="border:none;background:transparent;padding:12px 8px">
      <div class="empty-title">Web masih kosong — siap diisi dari nol</div>
      Alur peluncuran: daftarkan donor MBG &amp; TPS, verifikasi pengguna, lalu jalankan routing AI.
    </div>
    <div class="flow-list">
      <div class="flow-item"><span class="flow-num">1</span><div><strong>Donor catat sampah makanan</strong><span>Foto, berat kg, jenis, lokasi</span></div></div>
      <div class="flow-item"><span class="flow-num">2</span><div><strong>Klasifikasi &amp; routing AI</strong><span>Skor multi-kriteria + rute peta</span></div></div>
      <div class="flow-item"><span class="flow-num">3</span><div><strong>Admin verifikasi pengguna</strong><span>Aktifkan akun donor, TPS, kurir</span></div></div>
      <div class="flow-item"><span class="flow-num">4</span><div><strong>Kurir jemput, TPS konfirmasi OTP</strong><span>Serah terima terlacak sampai log pengolahan</span></div></div>
    </div>
  </div>` : ''}
  <div class="stat-grid">
    <div class="stat"><div class="label">Total pengguna</div><div class="value">${s.users.total}</div><div class="hint">${s.users.menunggu} menunggu verifikasi</div></div>
    <div class="stat"><div class="label">Total alokasi</div><div class="value">${s.alokasi.total}</div><div class="hint">${s.alokasi.terverifikasi} terverifikasi</div></div>
    <div class="stat accent"><div class="label">Kg dialihkan</div><div class="value">${s.dampak.kg_dialihkan}</div><div class="hint">kg (status aktif)</div></div>
    <div class="stat"><div class="label">Kg terverifikasi</div><div class="value">${s.dampak.kg_terverifikasi}</div><div class="hint">kg selesai di TPS</div></div>
    <div class="stat"><div class="label">Rata-rata skor</div><div class="value">${s.dampak.rata_rata_skor_persen}%</div></div>
    <div class="stat"><div class="label">Rata-rata jarak</div><div class="value">${s.dampak.rata_rata_jarak_km}</div><div class="hint">km</div></div>
    <div class="stat"><div class="label">Klasifikasi AI</div><div class="value">${s.klasifikasi.total}</div><div class="hint">${s.klasifikasi.perlu_verifikasi} perlu verifikasi</div></div>
    <div class="stat"><div class="label">Catatan audit</div><div class="value">${s.dampak.log_audit}</div><div class="hint">tidak dapat diubah</div></div>
    <div class="stat"><div class="label">Pesan outbox</div><div class="value">${s.dampak.pesan_outbox ?? 0}</div><div class="hint">WA ${s.kanal?.whatsapp === 'live' ? 'aktif' : 'sim'} · Email ${s.kanal?.email === 'live' ? 'aktif' : 'sim'}</div></div>
    <div class="stat"><div class="label">Durasi routing</div><div class="value">${runs[0]?.durasi_ms ?? '—'}</div><div class="hint">ms · SLA ${s.kinerja?.target_routing_ms ?? 3000} ms</div></div>
  </div>
  <div class="grid grid-2">
    <div class="card">
      <h2>Distribusi peran</h2>
      <div class="table-wrap">
      <table>
        <tbody>
          <tr><td>Donor MBG</td><td style="text-align:right"><b>${s.users.donor_mbg}</b></td></tr>
          <tr><td>TPS Pengolah</td><td style="text-align:right"><b>${s.users.tps_pengolah}</b></td></tr>
          <tr><td>Kurir</td><td style="text-align:right"><b>${s.users.kurir}</b></td></tr>
          <tr><td>Admin</td><td style="text-align:right"><b>${s.users.admin}</b></td></tr>
        </tbody>
      </table>
      </div>
    </div>
    <div class="card">
      <h2>Sampah &amp; TPS</h2>
      <div class="table-wrap">
      <table>
        <tbody>
          <tr><td>Sampah tersedia</td><td style="text-align:right"><b>${s.sampah.tersedia} / ${s.sampah.total}</b></td></tr>
          <tr><td>Sampah terverifikasi</td><td style="text-align:right"><b>${s.sampah.terverifikasi}</b></td></tr>
          <tr><td>TPS aktif</td><td style="text-align:right"><b>${s.tps.aktif} / ${s.tps.total}</b></td></tr>
          <tr><td>Klasifikasi perlu verifikasi</td><td style="text-align:right"><b>${s.klasifikasi.perlu_verifikasi}</b></td></tr>
        </tbody>
      </table>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-head">
      <div>
        <h2>Riwayat kinerja routing AI</h2>
        <div class="sub">Durasi tiap kali dijalankan — target SLA ${s.kinerja?.target_routing_ms ?? 3000} ms</div>
      </div>
    </div>
    ${runs.length === 0 ? '<div class="empty">Belum ada proses — klik “Jalankan Routing AI”.</div>' : `
    <div class="table-wrap">
    <table>
      <thead><tr><th>Kandidat (Sampah/TPS/Kurir)</th><th>Alokasi dibuat</th><th>Mesin</th><th>Durasi (ms)</th></tr></thead>
      <tbody>
      ${runs.map(r => `<tr><td>${r.kandidat_sampah ?? '—'}/${r.kandidat_tps ?? '—'}/${r.kandidat_kurir ?? '—'}</td><td><b>${r.dibuat ?? '—'}</b></td><td class="muted">${esc(r.mesin || '—')}</td><td><b>${r.durasi_ms ?? '—'}</b></td></tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

async function renderAdminUsers() {
  const users = await api('/api/admin/users');
  return `
  ${pageHead('Pengguna', 'Verifikasi, tolak, atau hapus akun donor MBG, TPS pengolah, dan kurir')}
  <div class="card">
    ${users.length <= 1 ? '<div class="empty">Belum ada pengguna selain admin. Ajukan pendaftaran dari halaman masuk.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Nama</th><th>Email</th><th>Peran</th><th>Status</th><th>Lokasi</th><th>Aksi</th></tr>
      </thead>
      <tbody>
      ${users.map(u => `
      <tr>
        <td><b>${esc(u.nama)}</b>${u.nama_lembaga ? `<br><span class="muted">${esc(u.nama_lembaga)}</span>` : ''}</td>
        <td>${esc(u.email)}</td>
        <td>${statusTag(u.role)}</td>
        <td>${statusTag(u.status)}</td>
        <td class="muted">${esc(u.alamat || '—')}${u.kapasitas ? `<br>kap. ${u.kapasitas} porsi` : ''}</td>
        <td>
          <div class="row">
          ${u.status !== 'aktif' && u.role !== 'admin' ? `<button class="btn btn-sm" data-patch="/api/admin/users/${u.id_user}/status" data-body='{"status":"aktif"}'>Verifikasi</button>` : ''}
          ${u.status !== 'ditolak' && u.role !== 'admin' ? `<button class="btn btn-sm btn-danger" data-patch="/api/admin/users/${u.id_user}/status" data-body='{"status":"ditolak"}'>Tolak</button>` : ''}
          ${u.role !== 'admin' ? `<button class="btn btn-sm btn-outline" data-delete="/api/admin/users/${u.id_user}">Hapus</button>` : ''}
          </div>
        </td>
      </tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

async function renderAdminMatches() {
  const rows = await api('/api/routing');
  return `
  ${pageHead(
    'Routing AI',
    'Sampah makanan dialokasikan ke TPS pengolah &amp; kurir terdekat',
    `<button class="btn" data-post="/api/routing/run">${icon('sparkles', 15)} Jalankan Routing</button>`
  )}
  <div class="card">
    <div class="card-head">
      <div>
        <h2>Hasil alokasi</h2>
        <div class="sub">${rows.length} entri · skor = 0,35×jenis + 0,25×kapasitas + 0,25×jarak + 0,15×urgensi</div>
      </div>
    </div>
    ${rows.length === 0 ? '<div class="empty"><div class="empty-title">Belum ada alokasi</div>Catat sampah makanan &amp; daftarkan TPS dulu, lalu jalankan routing AI.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>#</th><th>Sampah → TPS</th><th>Kurir</th><th>Skor</th><th>Jarak</th><th>Status</th></tr>
      </thead>
      <tbody>
      ${rows.map(m => `
      <tr>
        <td class="muted">${m.id_alokasi}</td>
        <td><b>${esc(m.nama_sampah)}</b> (${m.berat_kg} kg) ${statusTag(m.kategori || m.jenis_makanan)}<br>→ ${esc(m.nama_tps)} ${m.tingkat_pembusukan ? statusTag(m.tingkat_pembusukan) : ''}<br><span class="muted">${esc(m.nama_donor)} → ${esc(m.nama_tps)}</span></td>
        <td>${esc(m.nama_kurir)}</td>
        <td>
          <b>${m.skor_persen}%</b>
          <div class="score-bar"><div style="width:${m.skor_persen}%"></div></div>
          <span class="muted">jenis ${Number(m.skor_jenis_cocok*100).toFixed(0)} · kap. ${Number(m.skor_kapasitas*100).toFixed(0)} · jarak ${Number(m.skor_jarak*100).toFixed(0)} · urg. ${Number(m.skor_urgensi*100).toFixed(0)}</span>
        </td>
        <td>${m.jarak_km} km</td>
        <td>${statusTag(m.status)}</td>
      </tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

async function renderAdminLogs() {
  const logs = await api('/api/admin/logs');
  return `
  ${pageHead('Catatan Audit', 'Riwayat aktivitas sistem — tidak dapat diubah atau dihapus')}
  <div class="card">
    ${logs.length === 0 ? '<div class="empty">Belum ada aktivitas tercatat.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>ID</th><th>Waktu</th><th>User</th><th>Aksi</th><th>Entitas</th><th>Detail</th></tr>
      </thead>
      <tbody>
      ${logs.map(l => `
      <tr>
        <td class="muted">${l.id_log}</td>
        <td class="muted">${fmtDate(l.created_at)}</td>
        <td>${esc(l.nama_pengguna || 'sistem')}</td>
        <td><code>${esc(l.aksi)}</code></td>
        <td>${esc(l.entitas)}${l.id_entitas ? '#' + esc(l.id_entitas) : ''}</td>
        <td class="muted" style="max-width:260px;word-break:break-all">${l.detail ? esc(l.detail) : '—'}</td>
      </tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

async function renderAdminOutbox() {
  const data = await api('/api/admin/outbox');
  const rows = data.pesan || [];
  const ch = data.kanal || {};
  const chChip = (state) =>
    state === 'live'
      ? '<span class="pill" style="background:var(--brand-soft);color:var(--brand);border:1px solid var(--brand-border)">Aktif</span>'
      : '<span class="pill" style="background:var(--code-bg);color:var(--code-color);border:1px solid var(--line)">Simulasi</span>';
  return `
  ${pageHead(
    'Pesan Terkirim',
    'Riwayat notifikasi WhatsApp &amp; email',
    rows.some((m) => m.status === 'terkirim' || m.status === 'simulasi')
      ? `<button class="btn btn-outline" data-delete="/api/admin/outbox/sent" data-confirm="Hapus semua pesan yang sudah terkirim dari riwayat?">Hapus Pesan Terkirim</button>`
      : ''
  )}
  <div class="stat-grid">
    <div class="stat"><div class="label">WhatsApp</div><div class="value" style="font-size:1.1rem">${ch.whatsapp === 'live' ? 'Terhubung' : 'Simulasi'}</div><div class="hint">${ch.whatsapp === 'live' ? 'CallMeBot aktif' : 'isi CALLMEBOT_APIKEY'}</div></div>
    <div class="stat"><div class="label">Email</div><div class="value" style="font-size:1.1rem">${ch.email === 'live' ? 'Terhubung' : 'Simulasi'}</div><div class="hint">${ch.email === 'live' ? 'SMTP aktif' : 'isi SMTP_* untuk kirim nyata'}</div></div>
    <div class="stat accent"><div class="label">Total pesan</div><div class="value">${rows.length}</div></div>
  </div>
  <div class="card">
    <div class="card-head">
      <div>
        <h2>Riwayat outbox</h2>
        <div class="sub">terkirim = nyata · simulasi = demo · antre = menunggu · gagal = gagal</div>
      </div>
      <div class="row">
        <span class="muted">${icon('phone', 14)} WhatsApp ${chChip(ch.whatsapp)}</span>
        <span class="muted">${icon('mail', 14)} Email ${chChip(ch.email)}</span>
      </div>
    </div>
    ${rows.length === 0 ? '<div class="empty">Belum ada pesan — notifikasi otomatis saat alokasi, pickup, OTP, atau verifikasi.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>#</th><th>Kanal</th><th>Penerima</th><th>Subjek</th><th>Status</th><th>Waktu</th></tr>
      </thead>
      <tbody>
      ${rows.map((m) => `
      <tr>
        <td class="muted">${m.id_pesan}</td>
        <td>${m.kanal === 'whatsapp' ? icon('phone', 13) : icon('mail', 13)} ${m.kanal === 'whatsapp' ? 'WhatsApp' : 'Email'}</td>
        <td>${esc(m.tujuan || '—')}<br><span class="muted">${esc(m.nama_pengguna || '')}</span></td>
        <td><b>${esc(m.subjek || '—')}</b><br><span class="muted" style="max-width:280px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.isi || '')}</span></td>
        <td>${statusTag(m.status)}${m.error ? `<br><span class="muted">${esc(m.error)}</span>` : ''}</td>
        <td class="muted">${fmtDate(m.created_at)}</td>
      </tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

async function renderDonorForm() {
  const now = new Date(Date.now() - 60000);
  const waktuDefault = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return `
  ${pageHead('Catat Sampah Makanan MBG', 'Catat sisa makanan MBG dari dapur/SPPG untuk dialihkan ke TPS pengolah')}
  ${flowStripHtml(['Isi form + foto', 'Klasifikasi otomatis', 'Routing AI ke TPS', 'Kurir jemput &amp; OTP TPS'])}
  <div class="card">
    <form data-action="1" data-endpoint="/api/waste" data-multipart="1">
      <label>Nama sampah makanan</label>
      <input name="nama_sampah" required maxlength="200" placeholder="Sisa nasi kotak sarapan MBG" />
      <div class="grid grid-2">
        <div>
          <label>Jenis makanan</label>
          <select name="jenis_makanan" required>
            ${JENIS_SAMPAH.map((j) => `<option value="${j}"${j === 'campuran' ? ' selected' : ''}>${jenisLabel(j)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Berat (kg)</label>
          <input name="berat_kg" type="number" min="0.1" max="10000" step="0.1" required placeholder="18.5" />
        </div>
      </div>
      <label>Waktu produksi</label>
      <input name="waktu_produksi" type="datetime-local" required value="${waktuDefault}" />
      ${locationSelectHtml({
        label: 'Lokasi penjemputan',
        hint: 'Kosongkan untuk pakai alamat akun — pilih kota atau GPS',
      })}
      <label class="section-gap">Foto kondisi sampah (wajib, maks 1MB)</label>
      <input name="foto" type="file" accept="image/*" required />
      <div class="form-actions">
        <button class="btn" type="submit">${icon('upload', 15)} Simpan sampah makanan</button>
      </div>
      <p class="muted" style="font-size:12.5px">Sampah akan diklasifikasi otomatis (FR-11) lalu menunggu routing AI (FR-04) menuju TPS terdekat.</p>
    </form>
  </div>`;
}

async function renderDonorListings() {
  const rows = await api('/api/waste/mine');
  return `
  ${pageHead('Stok Sampah Saya', 'Pantau status sampah makanan yang telah Anda catat')}
  <div class="card">
    ${rows.length === 0 ? '<div class="empty"><div class="empty-title">Belum ada stok sampah</div>Catat sampah makanan terlebih dahulu.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Foto</th><th>Nama</th><th>Jenis</th><th>Berat</th><th>Klasifikasi</th><th>Produksi</th><th>Status</th><th>Aksi</th></tr>
      </thead>
      <tbody>
      ${rows.map(l => `
      <tr>
        <td>${l.foto_url ? `<img class="thumb" src="${l.foto_url}" alt="" />` : '—'}</td>
        <td><b>${esc(l.nama_sampah)}</b></td>
        <td>${statusTag(l.jenis_makanan)}</td>
        <td>${l.berat_kg} kg</td>
        <td>${l.kategori ? `${statusTag(l.kategori)} <span class="muted">${statusTag(l.tingkat_pembusukan)}</span>` : '—'}</td>
        <td class="muted">${fmtDate(l.waktu_produksi)}</td>
        <td>${statusTag(l.status)}</td>
        <td>${['tersedia','dialokasikan'].includes(l.status) ? `<button class="btn btn-sm btn-danger" data-patch="/api/waste/${l.id_sampah}" data-body='{"status":"dibatalkan"}'>Batalkan</button>` : '—'}</td>
      </tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>
  <div class="card">
    <div class="card-head">
      <div>
        <h2>Panduan SOP penanganan</h2>
        <div class="sub">Wajib dipatuhi saat pengemasan &amp; pengantaran</div>
      </div>
    </div>
    <div class="grid grid-2">
      ${sopHtml('basah', { compact: true })}
      ${sopHtml('kering', { compact: true })}
    </div>
  </div>`;
}

async function renderDonorMatches() {
  const rows = await api('/api/routing');
  return `
  ${pageHead('Routing Sampah Saya', 'Hasil routing AI untuk sampah makanan yang Anda catat')}
  <div class="card">
    ${rows.length === 0 ? '<div class="empty"><div class="empty-title">Belum ada alokasi</div>Tunggu admin menjalankan routing AI.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Sampah</th><th>TPS Pengolah</th><th>Kurir</th><th>Skor</th><th>Status</th></tr>
      </thead>
      <tbody>
      ${rows.map(m => `
      <tr>
        <td><b>${esc(m.nama_sampah)}</b> ${statusTag(m.kategori || m.jenis_makanan)}<br><span class="muted">${m.berat_kg} kg</span></td>
        <td>${esc(m.nama_tps)}<br><span class="muted">${m.jarak_km} km</span></td>
        <td>${esc(m.nama_kurir)}</td>
        <td><b>${m.skor_persen ?? ''}%</b></td>
        <td>${statusTag(m.status)}</td>
      </tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

async function renderDonorPoints() {
  const m = await api('/api/mbg/motivation');
  const target = Number(m.target_kg_klaim_pertama || 5);
  const progres = Math.min(100, Math.round((Number(m.kg_terverifikasi) / target) * 100));
  const bisaKlaim = Number(m.kg_terverifikasi) >= target;
  const klaimRows = m.klaim || [];
  return `
  ${pageHead('Poin &amp; Insentif', 'Poin kepatuhan dari kg sampah terverifikasi + klaim insentif (FR-15)')}
  ${flowStripHtml(['Catat sampah', 'Sampah terverifikasi di TPS', 'Poin bertambah', 'Klaim insentif'])}
  <div class="stat-grid">
    <div class="stat"><div class="label">Kg dialihkan</div><div class="value">${m.kg_dialihkan}</div><div class="hint">kg status aktif</div></div>
    <div class="stat"><div class="label">Kg terverifikasi</div><div class="value">${m.kg_terverifikasi}</div><div class="hint">target klaim ${target} kg</div></div>
    <div class="stat accent"><div class="label">Poin</div><div class="value">${m.poin}</div><div class="hint">${m.poin_per_kg} poin / kg</div></div>
    <div class="stat"><div class="label">Progres klaim</div><div class="value">${progres}%</div><div class="hint">${bisaKlaim ? 'siap diklaim' : `kurang ${(target - Number(m.kg_terverifikasi)).toFixed(1)} kg`}</div></div>
  </div>
  <div class="card">
    <div class="card-head"><h2>${icon('award', 16)} Motivasi</h2></div>
    <p>${esc(m.motivasi || '')}</p>
    <div class="row" style="margin-top:12px">
      ${['sertifikat', 'badge', 'laporan_kepatuhan', 'laporan_csr'].map((j) => `
        <button class="btn btn-sm ${bisaKlaim ? '' : 'btn-outline'}" data-post="/api/mbg/motivation/claim" data-body='{"jenis_insentif":"${j}"}' ${bisaKlaim ? '' : `data-confirm="Anda belum mencapai ${target} kg terverifikasi — klaim akan ditolak. Lanjutkan?"`}>Klaim ${j.replace(/_/g, ' ')}</button>
      `).join('')}
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h2>Riwayat klaim</h2></div>
    ${klaimRows.length === 0 ? '<div class="empty">Belum ada klaim.</div>' : `
    <div class="table-wrap">
    <table>
      <thead><tr><th>#</th><th>Jenis</th><th>Nilai</th><th>Periode</th><th>Waktu</th></tr></thead>
      <tbody>
      ${klaimRows.map((k) => `<tr><td class="muted">${k.id_motivasi}</td><td>${statusTag(k.jenis_insentif)}</td><td><b>${k.nilai}</b></td><td>${esc(k.periode)}</td><td class="muted">${fmtDate(k.created_at)}</td></tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

function jenisDiterimaFormHtml(selected = []) {
  return `
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px">
    ${KATEGORI_DITERIMA.map((k) => `
      <label class="role-card" style="padding:6px 8px">
        <input type="checkbox" name="jenis_diterima" value="${k}" ${selected.includes(k) ? 'checked' : ''} />
        <span class="role-card-body" style="gap:2px"><b style="font-size:12.5px">${jenisLabel(k)}</b></span>
      </label>`).join('')}
  </div>`;
}

async function renderTpsProfile() {
  let tps = null;
  let galat = null;
  try {
    tps = await api('/api/tps/me');
  } catch (e) {
    galat = e.message;
  }

  if (!tps) {
    return `
    ${pageHead('Daftarkan TPS Pengolah', 'Akun Anda belum punya profil TPS — isi data dasar agar bisa menerima alokasi routing')}
    ${flowStripHtml(['Daftar profil TPS', 'Admin verifikasi', 'Terima alokasi routing', 'Konfirmasi OTP'])}
    <div class="card">
      <p class="muted">${galat ? esc(galat) : ''}</p>
      <form data-action="1" data-endpoint="/api/tps/register">
        <label>Nama TPS</label>
        <input name="nama_tps" required maxlength="120" placeholder="TPS Kompos Kawatan" />
        <div class="grid grid-2">
          <div>
            <label>Jenis TPS</label>
            <select name="jenis_tps">${JENIS_TPS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
          </div>
          <div>
            <label>Jenis pengolahan</label>
            <select name="jenis_pengolahan">${JENIS_PENGOLAHAN.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
          </div>
        </div>
        <div class="grid grid-2">
          <div><label>Kapasitas (kg/hari)</label><input name="kapasitas_kg_hari" type="number" min="0" max="100000" value="100" /></div>
          <div><label>Radius layanan (km)</label><input name="radius_layanan_km" type="number" min="0" max="100" value="15" /></div>
        </div>
        <label class="section-gap">Kategori sampah yang diterima</label>
        ${jenisDiterimaFormHtml(KATEGORI_DITERIMA)}
        ${locationSelectHtml({ label: 'Lokasi TPS', hint: 'Wajib agar TPS muncul di routing &amp; peta' })}
        <div class="form-actions">
          <button class="btn" type="submit">${icon('upload', 15)} Daftarkan TPS</button>
        </div>
      </form>
    </div>`;
  }

  const terpakai = Number(tps.terpakai_kg_hari_ini || 0);
  const kapasitas = Number(tps.kapasitas_kg_hari || 0);
  const progres = kapasitas > 0 ? Math.min(100, Math.round((terpakai / kapasitas) * 100)) : 0;
  return `
  ${pageHead('Profil TPS Pengolah', 'Kapasitas, jenis olahan, dan lokasi TPS Anda (FR-03)')}
  ${flowStripHtml(['Profil &amp; kapasitas', 'Routing AI alokasikan sampah', 'Kurir antar', 'OTP + log pengolahan'])}
  <div class="stat-grid">
    <div class="stat"><div class="label">Kapasitas harian</div><div class="value">${kapasitas}</div><div class="hint">kg/hari</div></div>
    <div class="stat"><div class="label">Terpakai hari ini</div><div class="value">${terpakai}</div><div class="hint">${progres}% dari kapasitas</div></div>
    <div class="stat accent"><div class="label">Sisa kapasitas</div><div class="value">${tps.sisa_kapasitas_kg}</div><div class="hint">kg hari ini</div></div>
    <div class="stat"><div class="label">Status</div><div class="value" style="font-size:1.1rem">${tps.aktif ? 'Aktif' : 'Nonaktif'}</div><div class="hint">radius ${tps.radius_layanan_km} km</div></div>
  </div>
  <div class="card">
    <div class="card-head"><h2>Ubah profil TPS</h2></div>
    <form data-action="1" data-endpoint="/api/tps/me" data-method="PATCH">
      <label>Nama TPS</label>
      <input name="nama_tps" required maxlength="120" value="${esc(tps.nama_tps || '')}" />
      <div class="grid grid-2">
        <div>
          <label>Jenis TPS</label>
          <select name="jenis_tps">${JENIS_TPS.map(([v, l]) => `<option value="${v}" ${tps.jenis_tps === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <div>
          <label>Jenis pengolahan</label>
          <select name="jenis_pengolahan">${JENIS_PENGOLAHAN.map(([v, l]) => `<option value="${v}" ${tps.jenis_pengolahan === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
      </div>
      <div class="grid grid-3">
        <div><label>Kapasitas (kg/hari)</label><input name="kapasitas_kg_hari" type="number" min="0" max="100000" value="${kapasitas}" /></div>
        <div><label>Radius (km)</label><input name="radius_layanan_km" type="number" min="0" max="100" value="${tps.radius_layanan_km}" /></div>
        <div>
          <label>Status TPS</label>
          <select name="aktif"><option value="1" ${tps.aktif ? 'selected' : ''}>Aktif menerima</option><option value="0" ${!tps.aktif ? 'selected' : ''}>Nonaktif</option></select>
        </div>
      </div>
      <label class="section-gap">Kategori sampah yang diterima</label>
      ${jenisDiterimaFormHtml(tps.jenis_diterima || [])}
      <div class="grid grid-2">
        <div><label>Telepon</label><input name="telepon" value="${esc(tps.telepon || '')}" placeholder="08xxx" /></div>
        <div><label>Izin operasional</label><input name="izin_operasional" maxlength="200" value="${esc(tps.izin_operasional || '')}" placeholder="NIB / izin kelurahan…" /></div>
      </div>
      <label class="section-gap">Alamat</label>
      <input name="alamat" maxlength="300" value="${esc(tps.alamat || '')}" placeholder="Jl. …, Madiun" />
      ${locationSelectHtml({
        label: 'Lokasi TPS',
        hint: 'Pilih ulang bila TPS pindah — agar rute & peta diperbarui',
      })}
      <div class="form-actions">
        <button class="btn" type="submit">${icon('check', 15)} Simpan profil</button>
      </div>
    </form>
  </div>`;
}

async function renderRecipientMatches() {
  const rows = await api('/api/routing');
  const ready = rows.filter((m) => ['dijemput', 'terkirim'].includes(m.status));
  const withOtp = await Promise.all(
    ready.map(async (m) => {
      let otp = null;
      try {
        otp = await api(`/api/deliveries/${m.id_alokasi}/otp-status`);
      } catch (_) {}
      return { ...m, otpInfo: otp };
    })
  );
  return `
  ${pageHead(
    'Konfirmasi OTP',
    'Masukkan kode 6 digit untuk konfirmasi serah terima sampah makanan'
  )}
  ${flowStripHtml(['Kurir jemput sampah', 'Kurir antar ke TPS', 'OTP muncul di sini', 'Konfirmasi terima'])}
  <div class="card">
    <div class="card-head"><h2>Menunggu konfirmasi</h2></div>
    ${withOtp.length === 0 ? '<div class="empty">Belum ada kiriman menunggu konfirmasi OTP.</div>' : withOtp.map((m) => {
      const code = m.otpInfo?.kode && !m.otpInfo.digunakan_pada ? m.otpInfo.kode : null;
      const expired = m.otpInfo?.kedaluwarsa_pada && new Date(m.otpInfo.kedaluwarsa_pada).getTime() < Date.now();
      return `
      <div class="notif unread">
        <div class="spread">
          <div>
            <div class="notif-title">${esc(m.nama_sampah)} — ${m.berat_kg} kg ${statusTag(m.kategori || m.jenis_makanan)}</div>
            <span class="muted">Dari ${esc(m.nama_donor)} · Kurir ${esc(m.nama_kurir)}</span>
          </div>
          ${statusTag(m.status)}
        </div>
        ${flowStepsHtml(m.status)}
        ${
          code && !expired
            ? `<div class="otp-box">
                <div class="otp-label">Kode OTP Anda</div>
                <div class="otp-code">${esc(code)}</div>
                <div class="muted">Berlaku s/d ${fmtDate(m.otpInfo.kedaluwarsa_pada)}</div>
              </div>`
            : `<div class="otp-box otp-box-wait">
                <div class="otp-label">Kode OTP</div>
                <div class="muted">${m.otpInfo?.digunakan_pada ? 'Sudah dipakai' : expired ? 'Kedaluwarsa — minta OTP ulang' : 'Belum dibuat — menunggu kurir mengunggah foto & menjemput'}</div>
              </div>`
        }
        <div class="row" style="margin-top:10px">
          <input style="max-width:200px;margin:0" id="otp-${m.id_alokasi}" placeholder="6 digit OTP" maxlength="6" inputmode="numeric" value="${code && !expired ? esc(code) : ''}" />
          <button class="btn btn-sm" type="button" id="verifyBtn-${m.id_alokasi}" data-verify="${m.id_alokasi}">${icon('check', 14)} Konfirmasi terima</button>
          <button class="btn btn-sm btn-outline" type="button" data-post="/api/deliveries/${m.id_alokasi}/resend-otp">Kirim ulang OTP</button>
        </div>
      </div>`;
    }).join('')}
  </div>
  <div class="card">
    <div class="card-head"><h2>Riwayat kiriman</h2></div>
    ${rows.length === 0 ? '<div class="empty">Belum ada kiriman.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Sampah</th><th>Donor</th><th>Kurir</th><th>Status</th></tr>
      </thead>
      <tbody>
      ${rows.map(m => `<tr><td>${esc(m.nama_sampah)} <span class="muted">${m.berat_kg} kg</span></td><td>${esc(m.nama_donor)}</td><td>${esc(m.nama_kurir)}</td><td>${statusTag(m.status)}</td></tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

async function renderCourier() {
  const rows = await api('/api/routing');
  const active = rows.filter((m) => ['dialokasikan', 'dijemput', 'terkirim'].includes(m.status));
  return `
  ${pageHead('Tugas Kurir', 'Ambil foto kondisi sampah, antar ke TPS, dan tandai status pengiriman')}
  ${flowStripHtml(['Terima tugas', 'Foto &amp; jemput', 'Antar &amp; tandai sampai', 'TPS OTP → selesai'])}
  <div class="card">
    <div class="card-head"><h2>Tugas aktif</h2></div>
    ${active.length === 0 ? '<div class="empty"><div class="empty-title">Belum ada tugas</div>Minta admin menjalankan routing AI.</div>' : active.map((m) => {
      const route = m.rute;
      const sopKey = sopKeyForJenis(m.jenis_makanan) || sopKeyForJenis(m.kategori);
      return `
      <div class="notif unread">
        <div class="spread">
          <div>
            <div class="notif-title">Alokasi #${m.id_alokasi}: ${esc(m.nama_sampah)} — ${m.berat_kg} kg ${statusTag(m.kategori || m.jenis_makanan)}</div>
            <span class="muted">Untuk ${esc(m.nama_tps)} · Skor ${m.skor_persen ?? ''}% · Jarak ${m.jarak_km} km</span>
          </div>
          ${statusTag(m.status)}
        </div>
        ${flowStepsHtml(m.status)}
        ${sopKey ? sopHtml(sopKey, { compact: true }) : ''}
        ${route ? `
        <div style="margin-top:12px">
          <div class="spread" style="margin-bottom:6px">
            <strong style="font-size:13px">${icon('route', 14)} Rute pengantaran</strong>
            <span class="muted">${route.total_jarak_km} km · ± ${route.total_durasi_menit} menit</span>
          </div>
          ${(route.titik || []).map((w) => `<div class="route-step">${esc(w.nama)}</div>`).join('')}
          <p class="muted" style="margin-top:6px">Tahap: ${(route.segmen || []).map((l) => `${esc(l.dari)}→${esc(l.ke)}: ${l.jarak_km} km / ${l.durasi_menit} mnt`).join(' · ')}</p>
        </div>
        ` : ''}
        <p class="muted" style="margin-top:8px">Jemput: (${m.lat_donor ?? '—'}, ${m.lng_donor ?? '—'})<br>
        Antar: ${esc(m.nama_tps)} (${m.lat_tps ?? '—'}, ${m.lng_tps ?? '—'})</p>
        <div class="row" style="margin-top:10px">
          ${m.status === 'dialokasikan' ? `
            <form id="pickup-${m.id_alokasi}" data-action="1" data-endpoint="/api/deliveries/${m.id_alokasi}/pickup" data-multipart="1">
              <label>Foto kondisi sampah (wajib, maks 1MB)</label>
              <input type="file" name="foto_jemput" accept="image/*" required style="margin:0" />
              <div class="form-actions">
                <button class="btn btn-sm" type="submit">${icon('upload', 14)} Foto &amp; jemput</button>
              </div>
            </form>
          ` : ''}
          ${m.status === 'dijemput' ? `
            <form id="deliver-${m.id_alokasi}" data-action="1" data-endpoint="/api/deliveries/${m.id_alokasi}/deliver" data-multipart="1">
              <label>Foto bukti pengantaran (wajib, maks 1MB)</label>
              <input type="file" name="foto_antar" accept="image/*" required style="margin:0" />
              <div class="form-actions">
                <button class="btn btn-sm" type="submit">${icon('check', 14)} Tandai sampai di TPS</button>
              </div>
            </form>
          ` : ''}
          ${m.status === 'terkirim' ? `<span class="muted">Menunggu TPS memasukkan OTP…</span>` : ''}
          ${m.foto_jemput ? `<img class="thumb" src="${m.foto_jemput}" alt="Foto penjemputan" />` : ''}
          ${m.foto_antar ? `<img class="thumb" src="${m.foto_antar}" alt="Foto pengantaran" />` : ''}
        </div>
      </div>`;
    }).join('')}
  </div>
  <div class="card">
    <div class="card-head"><h2>Riwayat tugas</h2></div>
    ${rows.length === 0 ? '<div class="empty">Belum ada riwayat.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>#</th><th>Sampah</th><th>TPS</th><th>Skor</th><th>Jarak</th><th>Status</th></tr>
      </thead>
      <tbody>
      ${rows.map(m => `<tr><td class="muted">${m.id_alokasi}</td><td>${esc(m.nama_sampah)}</td><td>${esc(m.nama_tps)}</td><td><b>${m.skor_persen ?? ''}%</b></td><td>${m.jarak_km} km</td><td>${statusTag(m.status)}</td></tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

async function renderNotif() {
  const rows = await api('/api/notifications');
  return `
  ${pageHead(
    'Notifikasi',
    'Pembaruan alokasi, penjemputan, dan status serah terima',
    `<button class="btn btn-outline btn-sm" data-post="/api/notifications/read-all">${icon('check', 14)} Tandai semua dibaca</button>`
  )}
  <div class="card">
    ${rows.length === 0 ? '<div class="empty">Belum ada notifikasi.</div>' : rows.map((n) => `
      <div class="notif ${n.dibaca_pada ? '' : 'unread'}">
        <div class="notif-title">${esc(n.judul)}</div>
        <p class="muted" style="margin-bottom:6px">${esc(n.pesan)}</p>
        <div class="spread">
          <span class="muted">${fmtDate(n.created_at)}</span>
          ${n.dibaca_pada ? '' : `<button class="btn btn-sm btn-ghost" data-post="/api/notifications/${n.id_notifikasi}/read">Tandai dibaca</button>`}
        </div>
      </div>`).join('')}
  </div>`;
}

/* OTP verify buttons (khusus halaman TPS) */
document.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('[data-verify]');
  if (!btn) return;
  const id = btn.dataset.verify;
  const input = document.getElementById(`otp-${id}`);
  if (!input || !input.value) {
    toast('Masukkan OTP dulu', 'error');
    return;
  }
  try {
    const res = await api(`/api/deliveries/${id}/verify-otp`, {
      method: 'POST',
      body: { otp: input.value },
    });
    toast(res.message || 'Berhasil');
    renderView();
  } catch (e) {
    toast(e.message, 'error');
  }
});

/* Sidebar toggle */
document.getElementById('menuToggle')?.addEventListener('click', openSidebar);
document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);

/* Nav tabs (delegasi — selalu aktif walau renderNav ulang) */
document.addEventListener('click', (ev) => {
  const tabBtn = ev.target.closest('[data-tab]');
  if (tabBtn && document.getElementById('nav')?.contains(tabBtn)) {
    setTab(tabBtn.dataset.tab);
  }
});

/* Logout */
document.getElementById('topbarLogout')?.addEventListener('click', () => logout());
document.getElementById('sidebar')?.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-logout]')) logout();
});

/* Theme toggle */
document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
document.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-theme-toggle]')) toggleTheme();
});
applyTheme(getTheme());

setInterval(async () => {
  if (!token || !me) return;
  if (currentTab === 'notif') renderView();
}, 10000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

const urlTab = new URLSearchParams(location.search).get('tab');
if (urlTab && token && me) currentTab = urlTab;

render();
applyTheme(getTheme());
