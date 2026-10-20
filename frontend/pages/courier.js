import { api } from '../core/api.js';
import { icon, esc, pageHead, statusTag, emptyHtml, flowStripHtml, flowStepsHtml } from '../core/ui.js';
import { bindForms } from '../core/forms.js';
import { sopKeyForJenis, sopHtml } from '../components/sop.js';

function photoField(m, kind) {
  const isPickup = kind === 'jemput';
  const name = isPickup ? 'foto_jemput' : 'foto_antar';
  const endpoint = isPickup ? 'pickup' : 'deliver';
  return `<form class="stack stack-3" data-action="1" data-endpoint="/api/deliveries/${m.id_alokasi}/${endpoint}" data-multipart="1"
      data-photo-form="${m.id_alokasi}-${kind}" style="margin-top:var(--sp-3)">
    <label class="label">${isPickup ? 'Foto kondisi sampah' : 'Foto bukti pengantaran'} <span class="hint">(wajib, maks 1MB)</span></label>
    <div class="row row-2 row-wrap" style="align-items:center">
      <input class="input" type="file" name="${name}" accept="image/*" capture="environment" required style="max-width:340px" />
      <button class="btn btn-primary btn-capture" type="submit" style="flex:1;min-width:220px">
        ${icon(isPickup ? 'camera' : 'check', 18)} ${isPickup ? 'Foto & jemput' : 'Tandai sampai di TPS'}
      </button>
    </div>
  </form>`;
}

function routeBlock(route) {
  if (!route) return '';
  return `<div style="margin-top:var(--sp-3)">
    <div class="row row-between" style="margin-bottom:8px">
      <strong class="t-sm">${icon('route', 14)} Rute pengantaran</strong>
      <span class="muted t-sm">${route.total_jarak_km} km · ± ${route.total_durasi_menit} menit</span>
    </div>
    <div class="flow">${(route.titik || [])
      .map((w, i) => `${i ? '<span class="arrow">→</span>' : ''}<span class="step ${i === 0 ? 'active' : ''}">${esc(w.nama)}</span>`)
      .join('')}</div>
    <p class="muted t-xs" style="margin-top:6px">Tahap: ${(route.segmen || [])
      .map((l) => `${esc(l.dari)}→${esc(l.ke)}: ${l.jarak_km} km / ${l.durasi_menit} mnt`)
      .join(' · ')}</p>
  </div>`;
}

function taskCard(m) {
  const sopKey = sopKeyForJenis(m.jenis_makanan) || sopKeyForJenis(m.kategori);
  const photos = [m.foto_jemput, m.foto_antar].filter(Boolean);

  return `<div class="task">
    <div class="row row-between row-wrap" style="align-items:flex-start">
      <div class="grow">
        <div style="font-weight:700">Alokasi #${m.id_alokasi}: ${esc(m.nama_sampah)} — ${m.berat_kg} kg ${statusTag(m.kategori || m.jenis_makanan)}</div>
        <div class="t-sm muted">Untuk ${esc(m.nama_tps)} · Skor ${m.skor_persen ?? ''}% · Jarak ${m.jarak_km} km</div>
      </div>
      ${statusTag(m.status)}
    </div>

    ${flowStepsHtml(m.status)}
    ${sopKey ? sopHtml(sopKey, { compact: true }) : ''}
    ${routeBlock(m.rute)}

    <p class="muted t-xs" style="margin-top:8px">Jemput: (${m.lat_donor ?? '—'}, ${m.lng_donor ?? '—'})<br>
    Antar: ${esc(m.nama_tps)} (${m.lat_tps ?? '—'}, ${m.lng_tps ?? '—'})</p>

    ${photos.length
      ? `<div class="task-photos">${photos.map((p) => `<img src="${p}" alt="Bukti penjemputan/pengantaran" />`).join('')}</div>`
      : ''}

    ${m.status === 'dialokasikan' ? photoField(m, 'jemput') : ''}
    ${m.status === 'dijemput' ? photoField(m, 'antar') : ''}
    ${m.status === 'terkirim' ? `<div class="muted t-sm" style="margin-top:10px">${icon('clock', 14)} Menunggu TPS memasukkan OTP…</div>` : ''}
  </div>`;
}

async function courierView() {
  const rows = await api('/api/routing');
  const active = rows.filter((m) => ['dialokasikan', 'dijemput', 'terkirim'].includes(m.status));

  return `${pageHead('Tugas Kurir', 'Ambil foto kondisi sampah, antar ke TPS, dan tandai status pengiriman')}
  ${flowStripHtml(['Terima tugas', 'Foto & jemput', 'Antar & tandai sampai', 'TPS OTP → selesai'])}
  <div class="section"><div class="card">
    <div class="card-head"><div><h2>Tugas aktif</h2></div></div>
    <div class="stack stack-4">
      ${active.length === 0 ? emptyHtml('Belum ada tugas', 'Minta admin menjalankan routing AI.', '', 'truck') : active.map(taskCard).join('')}
    </div>
  </div></div>

  <div class="section"><div class="card">
    <div class="card-head"><div><h2>Riwayat tugas</h2></div></div>
    ${
      rows.length === 0
        ? emptyHtml('Belum ada riwayat', '')
        : `<div class="table-wrap" style="border:none">
      <table class="table">
        <thead><tr><th>#</th><th>Sampah</th><th>TPS</th><th>Skor</th><th>Jarak</th><th>Status</th></tr></thead>
        <tbody>
        ${rows
          .map(
            (m) => `<tr>
          <td class="muted">${m.id_alokasi}</td>
          <td>${esc(m.nama_sampah)}</td>
          <td>${esc(m.nama_tps)}</td>
          <td><b>${m.skor_persen ?? ''}%</b></td>
          <td>${m.jarak_km} km</td>
          <td>${statusTag(m.status)}</td>
        </tr>`
          )
          .join('')}
        </tbody>
      </table></div>`
    }
  </div></div>`;
}

export async function mount(root, ctx) {
  root.innerHTML = await courierView();
  bindForms(root, ctx.rerender);
}
