/* Shell aplikasi: sidebar (desktop) + bottom-nav (mobile) + topbar.
   Menu per peran disamakan persis dengan versi lama. */
import { icon, esc } from '../core/ui.js';
import { initials } from '../core/store.js';

export const NAV = {
  admin: [
    ['dashboard', 'dashboard', 'Beranda'],
    ['gis', 'map', 'Peta GIS'],
    ['users', 'users', 'Pengguna'],
    ['matches', 'cpu', 'Routing AI'],
    ['outbox', 'message', 'Pesan Terkirim'],
    ['logs', 'file', 'Catatan Audit'],
    ['notif', 'bell', 'Notifikasi'],
    ['akun', 'key', 'Ganti Sandi'],
  ],
  donor_mbg: [
    ['donor', 'upload', 'Catat Sampah'],
    ['donor-listings', 'list', 'Stok Sampah'],
    ['donor-matches', 'route', 'Routing Saya'],
    ['donor-points', 'award', 'Poin & Insentif'],
    ['gis', 'map', 'Peta GIS'],
    ['notif', 'bell', 'Notifikasi'],
    ['akun', 'key', 'Ganti Sandi'],
  ],
  tps_pengolah: [
    ['recipient', 'heart', 'Profil TPS'],
    ['recipient-matches', 'key', 'Konfirmasi OTP'],
    ['gis', 'map', 'Peta GIS'],
    ['notif', 'bell', 'Notifikasi'],
    ['akun', 'key', 'Ganti Sandi'],
  ],
  kurir: [
    ['courier', 'truck', 'Tugas Kurir'],
    ['gis', 'map', 'Peta GIS'],
    ['notif', 'bell', 'Notifikasi'],
    ['akun', 'key', 'Ganti Sandi'],
  ],
};

export const TAB_TITLES = {
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
  akun: 'Ganti Kata Sandi',
};

/** Ikon per tab (dipakai sidebar & bottom-nav). */
function tabIcon(id) {
  const all = Object.values(NAV).flat();
  const hit = all.find((t) => t[0] === id);
  return hit ? hit[1] : 'grid';
}

export function tabsFor(role) {
  return NAV[role] || [];
}

/** HTML shell (bagian statis) — di-render sekali saat login. */
export function shellHtml() {
  return `
    <div class="sidebar-overlay" id="sidebarOverlay" aria-hidden="true"></div>

    <aside class="sidebar" id="sidebar" aria-label="Menu utama">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">${icon('leaf', 20)}</span>
        <div class="brand-text">
          <div class="brand-name">EcoMatch</div>
          <div class="brand-tag">AI Routing Sampah Makanan MBG</div>
        </div>
      </div>

      <nav class="nav" id="nav"></nav>

      <div class="side-user">
        <div class="avatar" id="userAvatar" aria-hidden="true">?</div>
        <div class="grow">
          <div class="user-name" id="userName">—</div>
          <div class="user-meta"><span class="pill" id="userRole">—</span></div>
        </div>
        <button class="btn-icon btn" type="button" id="sideLogout" title="Keluar" aria-label="Keluar dari akun">${icon('logout', 16)}</button>
      </div>
    </aside>

    <div class="app-body">
      <header class="topbar">
        <button class="btn btn-icon menu-btn" id="menuToggle" type="button" aria-label="Buka menu navigasi">${icon('menu', 20)}</button>
        <div class="topbar-title" id="topbarTitle">Beranda</div>
        <div class="topbar-right">
          <span class="env-chip badge badge-success badge-dot only-desktop">Sistem Aktif</span>
          <button class="btn btn-icon" id="notifBtn" type="button" title="Notifikasi" aria-label="Buka notifikasi">${icon('bell', 18)}</button>
          <button class="btn btn-icon" id="themeToggle" type="button" data-theme-toggle title="Ganti tema" aria-label="Ganti tema terang/gelap"></button>
          <div class="only-mobile">
            <div class="avatar" id="topAvatar" style="width:34px;height:34px;font-size:12px">?</div>
          </div>
        </div>
      </header>

      <main class="content" id="view" tabindex="-1"></main>
    </div>

    <nav class="bottomnav" id="bottomnav" aria-label="Menu cepat"></nav>
  `;
}

/** Isi ulang menu sidebar + bottom-nav sesuai peran & tab aktif. */
export function renderNav(user, currentTab) {
  const tabs = tabsFor(user && user.role);
  const nav = document.getElementById('nav');
  const bottom = document.getElementById('bottomnav');

  if (nav) {
    nav.innerHTML =
      `<div class="nav-label">Navigasi</div>` +
      tabs
        .map(
          ([id, , label]) => `
          <button type="button" class="nav-item ${currentTab === id ? 'active' : ''}" data-tab="${id}"
            ${currentTab === id ? 'aria-current="page"' : ''}>
            ${icon(tabIcon(id), 17)}<span>${esc(label)}</span>
          </button>`
        )
        .join('');
  }

  // Bottom-nav hanya 5 item utama agar tidak sesak di layar kecil.
  if (bottom) {
    bottom.innerHTML = tabs
      .slice(0, 5)
      .map(
        ([id, , label]) => `
        <button type="button" class="bottomnav-item ${currentTab === id ? 'active' : ''}" data-tab="${id}"
          ${currentTab === id ? 'aria-current="page"' : ''}>
          ${icon(tabIcon(id), 20)}<span>${esc(label.length > 11 ? label.slice(0, 10) + '…' : label)}</span>
        </button>`
      )
      .join('');
  }

  const top = document.getElementById('topbarTitle');
  if (top) top.textContent = TAB_TITLES[currentTab] || 'Beranda';
}

/** Isi identitas user di sidebar/topbar. */
export function renderUser(user) {
  const name = user.nama || user.email || '-';
  const ini = initials(name);
  const roleLabel = { admin: 'Admin', donor_mbg: 'Donor MBG', tps_pengolah: 'TPS Pengolah', kurir: 'Kurir' }[user.role] || user.role;

  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  set('userName', name);
  set('userRole', roleLabel);
  set('topAvatar', ini);
  const av = document.getElementById('userAvatar');
  if (av) av.textContent = ini;
}

/** Pasang handler shell (sidebar, logout, notif, tema). */
export function bindShell({ onNav, onLogout, onNotif } = {}) {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const open = () => { sidebar?.classList.add('open'); overlay?.classList.add('show'); };
  const close = () => { sidebar?.classList.remove('open'); overlay?.classList.remove('show'); };

  document.getElementById('menuToggle')?.addEventListener('click', open);
  overlay?.addEventListener('click', close);
  document.getElementById('sideLogout')?.addEventListener('click', onLogout);
  document.getElementById('topbarLogout')?.addEventListener('click', onLogout);
  document.getElementById('notifBtn')?.addEventListener('click', () => onNotif && onNotif());

  // Delegasi klik tab (sidebar maupun bottom-nav)
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-tab]');
    if (!btn) return;
    const host = btn.closest('#nav') || btn.closest('#bottomnav');
    if (!host) return;
    close();
    onNav && onNav(btn.dataset.tab);
  });
}
