/* Bootstrap & router — pengganti bootstrapping global di app.js versi lama.
   Halaman dimuat secara dinamis (dynamic import) sehingga index.html cukup
   satu entry: <script type="module" src="/core/main.js">. */
import { store, isLocalHost } from './store.js';
import { api } from './api.js';
import { esc, toast, emptyHtml, skeletonHtml } from './ui.js';
import { applyTheme, getTheme, bindTheme } from './theme.js';
import { shellHtml, renderNav, renderUser, bindShell, tabsFor } from '../components/shell.js';
import { renderAuth, bindAuth } from '../pages/auth.js';

/* Tab -> modul halaman (tiap modul mengekspor `mount(root, ctx)`). */
const PAGES = {
  dashboard: () => import('../pages/dashboard.js'),
  gis: () => import('../pages/gis.js'),
  users: () => import('../pages/admin.js'),
  matches: () => import('../pages/admin.js'),
  outbox: () => import('../pages/admin.js'),
  logs: () => import('../pages/admin.js'),
  donor: () => import('../pages/upload.js'),
  'donor-listings': () => import('../pages/upload.js'),
  'donor-matches': () => import('../pages/routing.js'),
  'donor-points': () => import('../pages/points.js'),
  recipient: () => import('../pages/tps.js'),
  'recipient-matches': () => import('../pages/otp.js'),
  courier: () => import('../pages/courier.js'),
  notif: () => import('../pages/notifications.js'),
  akun: () => import('../pages/account.js'),
};

let currentTab = '';
let activeModule = null;
let notifTimer = null;

const $ = (id) => document.getElementById(id);

function ctx() {
  return {
    user: store.user,
    tab: currentTab,
    api,
    navigate,
    rerender: renderView,
    refreshNav: () => renderNav(store.user, currentTab),
  };
}

function placeholder(title) {
  return `<div class="card">${emptyHtml(
    'Halaman sedang dikerjakan',
    `${title} masih dalam pengerjaan pada rombak UI ini.`,
    ''
  )}</div>`;
}

function errorCard(err) {
  console.error('[view]', err);
  return `<div class="card">${emptyHtml(
    'Gagal memuat halaman',
    err && err.message ? err.message : 'Terjadi kesalahan tak terduga.',
    `<button class="btn btn-primary" data-rerender>Coba lagi</button>`
  )}</div>`;
}

async function renderView() {
  const view = $('view');
  if (!view) return;

  if (activeModule && typeof activeModule.cleanup === 'function') {
    try { activeModule.cleanup(); } catch (_) {}
  }
  activeModule = null;

  view.setAttribute('aria-busy', 'true');
  view.innerHTML = skeletonHtml(3);

  try {
    const loader = PAGES[currentTab];
    if (!loader) {
      view.innerHTML = placeholder(currentTab);
      return;
    }
    const mod = await loader();
    if (typeof mod.mount !== 'function') {
      view.innerHTML = placeholder(currentTab);
      return;
    }
    activeModule = mod;
    await mod.mount(view, ctx());
    bindTheme(view);
  } catch (err) {
    // Modul belum ada (404) atau gagal dieksekusi — tampilkan placeholder.
    if (err && (err.name === 'TypeError' || /Failed to fetch|404|Invalid module/.test(String(err.message)))) {
      view.innerHTML = placeholder(currentTab);
    } else {
      view.innerHTML = errorCard(err);
    }
  } finally {
    view.removeAttribute('aria-busy');
  }
}

function navigate(tab) {
  if (!tab) return;
  const tabs = tabsFor(store.role);
  if (!tabs.some((t) => t[0] === tab)) return;
  const changed = currentTab !== tab;
  currentTab = tab;
  renderNav(store.user, currentTab);

  const url = new URL(location.href);
  url.searchParams.set('tab', tab);
  history.replaceState({}, '', url);

  if (changed || !($('view') && $('view').innerHTML.trim())) renderView();
}

/* ---------- Sesi ---------- */

function showAuth() {
  clearInterval(notifTimer);
  notifTimer = null;
  const layout = $('appLayout');
  const authRoot = $('authRoot');
  if (layout) layout.hidden = true;
  if (authRoot) {
    authRoot.hidden = false;
    authRoot.innerHTML = renderAuth();
    bindAuth(() => render());
    applyTheme(getTheme());
  }
  document.title = 'Masuk · EcoMatch';
}

function showNoMenu() {
  $('appLayout').hidden = true;
  $('authRoot').hidden = false;
  $('authRoot').innerHTML = `<div class="wrap"><div class="card">${emptyHtml(
    `Peran ${store.role} tidak memiliki menu`,
    'Hubungi admin EcoMatch untuk mendapatkan hak akses.',
    `<button class="btn btn-primary" id="noMenuLogout">Keluar</button>`
  )}</div></div>`;
  $('noMenuLogout')?.addEventListener('click', logout);
}

function render() {
  if (!store.isAuth) { showAuth(); return; }

  const tabs = tabsFor(store.role);
  if (!tabs.length) { showNoMenu(); return; }

  $('authRoot').hidden = true;
  $('authRoot').innerHTML = '';
  const layout = $('appLayout');
  if (!layout.dataset.built) {
    layout.innerHTML = shellHtml();
    layout.dataset.built = '1';
    bindShell({ onNav: navigate, onLogout: logout, onNotif: () => navigate('notif') });
    bindTheme(layout);
  }
  layout.hidden = false;

  renderUser(store.user);
  if (!currentTab || !tabs.some((t) => t[0] === currentTab)) currentTab = tabs[0][0];
  renderNav(store.user, currentTab);
  renderView();

  document.title = `${store.nama} · EcoMatch`;

  // Segarkan daftar notifikasi saat tab notif aktif (interval sama dengan versi lama).
  clearInterval(notifTimer);
  notifTimer = setInterval(() => {
    if (store.isAuth && currentTab === 'notif') renderView();
  }, 10000);
}

function logout() {
  store.clear();
  currentTab = '';
  toast('Anda telah keluar');
  render();
}

/* ---------- Kegagalan sesi & error global ---------- */

let lastErr = 0;
function warnOnce(msg) {
  const now = Date.now();
  if (now - lastErr < 2500) return;
  lastErr = now;
  toast(msg, 'error');
}

window.addEventListener('ecomatch:unauthorized', () => {
  toast('Sesi Anda berakhir — silakan masuk lagi', 'error');
  currentTab = '';
  render();
});

window.addEventListener('unhandledrejection', (ev) => {
  const msg = ev.reason && ev.reason.message;
  warnOnce(msg || 'Terjadi kesalahan jaringan');
});

window.addEventListener('error', (ev) => {
  warnOnce(ev.message || 'Terjadi kesalahan');
});

document.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-rerender]')) renderView();
});

/* ---------- Mulai ---------- */

applyTheme(getTheme());

const urlTab = new URLSearchParams(location.search).get('tab');
if (urlTab && store.isAuth) currentTab = urlTab;

render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

if (isLocalHost()) {
  console.info('[EcoMatch] mode lokal — AI routing memakai', api ? 'endpoint produksi bila AI_MATCHING_URL di-set' : '-');
}
