import { api } from '../core/api.js';
import { icon, esc, statusTag, fmtDate, pageHead } from '../core/ui.js';

export const MADIUN_CENTER = [-7.63, 111.52];
export const MADIUN_BOUNDS = [[-7.95, 111.2], [-7.3, 111.8]];

export function inMadiun(lat, lng) {
  if (!lat || !lng) return false;
  const [[s, w], [n, e]] = MADIUN_BOUNDS;
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

const ROLE_COLORS = { donor_mbg: 'donor', tps_pengolah: 'tps', kurir: 'kurir' };
const ROLE_ICON = { donor_mbg: 'leaf', tps_pengolah: 'recycle', kurir: 'truck' };
const ROLE_LABEL = { donor_mbg: 'Donor MBG', tps_pengolah: 'TPS Pengolah', kurir: 'Kurir' };

let map = null;
let layer = null;

export function destroyMap() {
  if (map) { map.remove(); map = null; layer = null; }
}

function pinIcon(kind, glyph) {
  return L.divIcon({
    className: '',
    html: `<div class="em-marker ${kind}"><span>${glyph}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28],
  });
}

async function loadData() {
  if (!map || !layer) return;
  const [geo, alokasi] = await Promise.all([
    api('/api/geo'),
    api('/api/routing').catch(() => []),
  ]);
  const users = geo.users || [];
  const listings = geo.listings || [];
  const tpsById = new Map((geo.tps || []).map((t) => [Number(t.id_user), t]));

  layer.clearLayers();

  for (const u of users) {
    if (!inMadiun(u.lat, u.lng)) continue;
    if (!['donor_mbg', 'tps_pengolah', 'kurir'].includes(u.role)) continue;
    const tps = u.role === 'tps_pengolah' ? tpsById.get(Number(u.id_user)) : null;
    L.marker([u.lat, u.lng], { icon: pinIcon(ROLE_COLORS[u.role], icon(ROLE_ICON[u.role], 14)) })
      .bindPopup(
        `<b>${esc(u.nama)}</b><br>${ROLE_LABEL[u.role]} · ${statusTag(u.status)}<br>` +
          `<span class="muted">${esc(u.alamat || '')}</span>` +
          (tps
            ? `<br><span class="muted">${esc(tps.nama_tps || '')} · ${Number(tps.kapasitas_kg_hari || 0)} kg/hari</span>`
            : u.kapasitas
              ? `<br><span class="muted">Kapasitas: ${u.kapasitas} porsi</span>`
              : '')
      )
      .addTo(layer);
  }

  for (const l of listings) {
    if (!inMadiun(l.lat, l.lng)) continue;
    if (!['tersedia', 'dialokasikan'].includes(l.status)) continue;
    L.circleMarker([l.lat, l.lng], {
      radius: 7, color: '#fff', weight: 2, fillColor: '#2E7D32', fillOpacity: 0.95,
    })
      .bindPopup(
        `<b>${esc(l.nama_sampah)}</b><br>${l.berat_kg} kg · ${statusTag(l.jenis_makanan)} · ${statusTag(l.status)}<br>` +
          `<span class="muted">Diproduksi: ${fmtDate(l.waktu_produksi)}</span>`
      )
      .addTo(layer);
  }

  for (const m of alokasi) {
    if (!m.rute || m.status === 'dibatalkan') continue;
    const pts = (m.rute.titik || []).filter((w) => inMadiun(w.lat, w.lng)).map((w) => [w.lat, w.lng]);
    if (pts.length < 2) continue;

    L.polyline(pts, { color: '#0277BD', weight: 4, opacity: 0.75, dashArray: '8 6' }).addTo(layer);

    const mid = pts[Math.floor(pts.length / 2)];
    L.circleMarker(mid, { radius: 5, color: '#fff', weight: 2, fillColor: '#FF6F00', fillOpacity: 1 })
      .bindPopup(
        `<b>Alokasi #${m.id_alokasi}</b><br>${esc(m.nama_sampah || '')} → ${esc(m.nama_tps || '')}<br>` +
          `${m.jarak_km} km · ${statusTag(m.status)}` +
          (m.skor_persen != null ? `<br>Skor: ${m.skor_persen}%` : '')
      )
      .addTo(layer);
  }
}

export function gisHtml(counts = {}) {
  const { donor = 0, tps = 0, kurir = 0, rute = 0 } = counts;
  return `${pageHead('Peta GIS', 'Sebaran donor MBG, TPS pengolah, kurir &amp; rute alokasi sampah')}
  <div class="section"><div class="map-panel">
    <div class="map-canvas" id="gisMap"></div>
    <div class="map-legend">
      <span class="legend-item"><span class="dot dot-donor"></span> Donor MBG</span>
      <span class="legend-item"><span class="dot dot-tps"></span> TPS Pengolah</span>
      <span class="legend-item"><span class="dot dot-kurir"></span> Kurir</span>
      <span class="legend-item"><span class="dot dot-sampah"></span> Sampah tersedia</span>
      <span class="legend-item"><span class="dot" style="background:#0277BD;border-radius:2px;height:3px;width:16px"></span> Rute alokasi</span>
    </div>
  </div></div>
  <div class="section"><div class="grid grid-4">
    <div class="kpi"><div class="kpi-label">Donor MBG</div><div class="kpi-value">${donor}</div></div>
    <div class="kpi"><div class="kpi-label">TPS Pengolah</div><div class="kpi-value">${tps}</div></div>
    <div class="kpi"><div class="kpi-label">Kurir</div><div class="kpi-value">${kurir}</div></div>
    <div class="kpi"><div class="kpi-label">Rute aktif</div><div class="kpi-value">${rute}</div></div>
  </div></div>
  <p class="muted t-xs">Marker hanya menampilkan lokasi di area Madiun.</p>`;
}

export async function initMap() {
  const el = document.getElementById('gisMap');
  if (!el || typeof L === 'undefined') return;

  destroyMap();
  map = L.map('gisMap', { zoomControl: true }).setView(MADIUN_CENTER, 11);
  layer = L.layerGroup().addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);

  map.fitBounds(MADIUN_BOUNDS);
  await loadData().catch(() => {});
  setTimeout(() => map && map.invalidateSize(), 200);
}

/** Jumlahkan marker untuk ringkasan KPI. */
export async function geoCounts() {
  const [geo, alokasi] = await Promise.all([
    api('/api/geo'),
    api('/api/routing').catch(() => []),
  ]);
  const users = geo.users || [];
  return {
    donor: users.filter((u) => u.role === 'donor_mbg' && u.lat).length,
    tps: (geo.tps || []).filter((t) => t.lat).length,
    kurir: users.filter((u) => u.role === 'kurir' && u.lat).length,
    rute: alokasi.filter((m) => m.status !== 'dibatalkan').length,
  };
}
