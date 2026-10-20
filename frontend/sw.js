const CACHE = 'ecomatch-v3-green';
const PRECACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/styles/app.css',
  '/theme.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/core/main.js',
  '/core/api.js',
  '/core/store.js',
  '/core/theme.js',
  '/core/ui.js',
  '/core/forms.js',
  '/core/constants.js',
  '/components/shell.js',
  '/components/kpi.js',
  '/components/charts.js',
  '/components/map.js',
  '/components/sop.js',
  '/pages/auth.js',
  '/pages/dashboard.js',
  '/pages/admin.js',
  '/pages/upload.js',
  '/pages/routing.js',
  '/pages/points.js',
  '/pages/tps.js',
  '/pages/otp.js',
  '/pages/courier.js',
  '/pages/gis.js',
  '/pages/notifications.js',
  '/pages/account.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // Satu berkas gagal tidak membatalkan precache yang lain.
        Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Selalu jaringan untuk API & file unggahan (data tidak boleh basi).
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
    event.respondWith(fetch(request));
    return;
  }

  const isNavigate = request.mode === 'navigate';

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          if (isNavigate) return caches.match('/offline.html').then((o) => o || Response.error());
          return Response.error();
        })
      )
  );
});
