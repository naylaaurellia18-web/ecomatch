/* Utilitas tampilan: ikon SVG, escape, toast, format, badge status, empty state. */

export const ICONS = {
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
  arrowLeft: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.4 0 10 7 10 7a17.9 17.9 0 0 1-3.2 4.19M6.6 6.6A17.8 17.8 0 0 0 2 11s3.6 7 10 7a9 9 0 0 0 5.4-1.6"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"/><line x1="2" x2="22" y1="2" y2="22"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  menu: '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  box: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M3 11h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  trendUp: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  recycle: '<path d="M7 19H4.8a2 2 0 0 1-1.7-3l2.4-4"/><path d="m9 5 2-3 2 3"/><path d="M14.8 12 17 8h4"/><path d="M20.5 17H14"/><path d="M12 21 9.6 17H5.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
};

/** Ikon SVG inline (aria-hidden; teks pendamping wajib dari pemanggil). */
export function icon(name, size = 16) {
  const body = ICONS[name] || ICONS.grid;
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** Escape teks untuk disisipkan ke template HTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Toast non-blocking (#toast di index.html). */
export function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.hidden = false;
  el.textContent = msg;
  el.className = `toast toast-${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = `toast toast-${type}`; }, 3500);
}

export function fmtDate(s) {
  if (!s) return '-';
  const d = new Date(s.endsWith('Z') || s.includes('+') ? s : `${s.replace(' ', 'T')}Z`);
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmtKg(n) {
  const v = Number(n || 0);
  return `${v.toLocaleString('id-ID')} kg`;
}

export function fmtPct(n) {
  return `${Math.round(Number(n || 0))}%`;
}

export const ROLE_LABEL = {
  donor_mbg: 'Donor MBG',
  tps_pengolah: 'TPS Pengolah',
  kurir: 'Kurir',
  admin: 'Admin',
};

/** Badge status — kelas .badge-* (lihat design system). */
const STATUS_MAP = {
  tersedia: ['badge-success', 'Tersedia'], dialokasikan: ['badge-info', 'Dialokasikan'],
  diajukan: ['badge-info', 'Dialokasikan'], diterima: ['badge-info', 'Dialokasikan'],
  dijemput: ['badge-warning', 'Dijemput'], terkirim: ['badge-warning', 'Terkirim'],
  terverifikasi: ['badge-success', 'Terverifikasi'], aktif: ['badge-success', 'Aktif'],
  dibatalkan: ['badge', 'Dibatalkan'], kedaluwarsa: ['badge', 'Kedaluwarsa'],
  gagal: ['badge-danger', 'Gagal'], menunggu: ['badge-warning', 'Menunggu'],
  ditolak: ['badge-danger', 'Ditolak'], antre: ['badge-warning', 'Antre'],
  terbuka: ['badge-success', 'Terbuka'], dipenuhi: ['badge-success', 'Dipenuhi'],
  simulasi: ['badge-info', 'Simulasi'], kritis: ['badge-danger', 'Kritis'],
  tinggi: ['badge-warning', 'Tinggi'], sedang: ['badge-info', 'Sedang'],
  rendah: ['badge', 'Rendah'], basah: ['badge-info', 'Makanan Basah'],
  kering: ['badge-warning', 'Makanan Kering'], donor: ['badge-info', 'Donor'],
  penerima: ['badge-success', 'Penerima'], donor_mbg: ['badge-info', 'Donor MBG'],
  tps_pengolah: ['badge-success', 'TPS Pengolah'], kurir: ['badge-warning', 'Kurir'],
  admin: ['badge-primary', 'Admin'],
  nasi: ['badge-info', 'Nasi'], sayur: ['badge-success', 'Sayur'],
  lauk: ['badge-warning', 'Lauk'], buah: ['badge-success', 'Buah'],
  campuran: ['badge-info', 'Campuran'], lainnya: ['badge', 'Lainnya'],
  sisa_nasi: ['badge-info', 'Sisa Nasi'], kulit_buah: ['badge-success', 'Kulit/Sisa Buah'],
  segar: ['badge-success', 'Segar'], mulai_busu: ['badge-warning', 'Mulai Busuk'],
  busuk: ['badge-danger', 'Busuk'],
};

export function statusTag(s) {
  const [cls, label] = STATUS_MAP[s] || ['badge', s];
  return `<span class="badge ${cls} badge-dot">${esc(label)}</span>`;
}

/** Kepala halaman: judul + deskripsi + aksi kanan. */
export function pageHead(title, desc = '', actions = '') {
  return `<div class="row row-between row-wrap" style="align-items:flex-start">
    <div class="grow">
      <h1 class="page-title">${title}</h1>
      ${desc ? `<div class="page-sub">${desc}</div>` : ''}
    </div>
    ${actions ? `<div class="row row-2 row-wrap">${actions}</div>` : ''}
  </div>`;
}

/** Empty state ilustratif (SVG). */
export function emptyHtml(title, desc = '', action = '', kind = 'leaf') {
  const art = {
    leaf: '<path d="M60 20C30 30 18 58 30 92c34 6 66-14 74-46-24-16-30-30-44-26Z" fill="#E8F5E9"/><path d="M40 96c8-24 24-44 52-56" stroke="#81C784" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="96" cy="88" r="7" fill="#81C784" opacity=".6"/>',
    inbox: '<rect x="16" y="42" width="88" height="54" rx="8" fill="#E8F5E9"/><path d="M16 62h22l8 14h28l8-14h22" stroke="#81C784" stroke-width="3" fill="none" stroke-linejoin="round"/>',
    truck: '<rect x="10" y="44" width="54" height="38" rx="6" fill="#E8F5E9"/><path d="M64 56h18l14 14v12H64z" fill="#F1F8E9"/><circle cx="32" cy="90" r="9" fill="#81C784"/><circle cx="82" cy="90" r="9" fill="#81C784"/>',
  }[kind] || '';
  return `<div class="empty">
    <svg viewBox="0 0 120 120" role="img" aria-label="${esc(title)}">${art}</svg>
    <div class="empty-title">${esc(title)}</div>
    ${desc ? `<div class="t-sm" style="max-width:44ch">${esc(desc)}</div>` : ''}
    ${action || ''}
  </div>`;
}

/** Kartu skeleton sederhana untuk loading. */
export function skeletonHtml(cards = 3) {
  const card = '<div class="skeleton sk-card"></div>';
  return `<div class="grid grid-3">${card.repeat(cards)}</div>
    <div style="margin-top:16px">
      <div class="skeleton sk-line w-60"></div>
      <div class="skeleton sk-line"></div>
      <div class="skeleton sk-line w-40"></div>
    </div>`;
}

/** Alur status pengiriman (Dialokasikan → Dijemput → Sampai → Selesai). */
export function flowStepsHtml(status) {
  const order = ['dialokasikan', 'dijemput', 'terkirim', 'terverifikasi'];
  const labels = {
    dialokasikan: 'Dialokasikan', diajukan: 'Dialokasikan', diterima: 'Dialokasikan',
    dijemput: 'Dijemput', terkirim: 'Sampai', terverifikasi: 'Selesai',
  };
  if (status === 'dibatalkan') {
    return `<div class="flow"><span class="badge badge-danger">Dibatalkan</span></div>`;
  }
  const key = ['diajukan', 'diterima'].includes(status) ? 'dialokasikan' : status;
  const idx = order.indexOf(key);
  return `<div class="flow">${order
    .map((s, i) => {
      const state = idx < 0 ? '' : i < idx ? 'done' : i === idx ? 'active' : '';
      return `<span class="step ${state}"><span class="step-num">${i + 1}</span>${labels[s]}</span>`;
    })
    .join('<span class="arrow">→</span>')}</div>`;
}

/** Strip langkah ilustratif (kartu berwarna). */
export function flowStripHtml(steps) {
  return `<div class="section"><div class="card">
    <div class="stepper">
      ${steps
        .map((s, i) => `${i ? '<span class="step-line"></span>' : ''}<span class="step ${i === 0 ? 'active' : ''}"><span class="step-num">${i + 1}</span>${esc(s)}</span>`)
        .join('')}
    </div>
  </div></div>`;
}
