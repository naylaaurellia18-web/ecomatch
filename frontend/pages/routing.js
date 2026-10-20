import { api } from '../core/api.js';
import { icon, esc, pageHead, statusTag, emptyHtml } from '../core/ui.js';
import { bindForms } from '../core/forms.js';

async function donorMatches() {
  const rows = await api('/api/routing');
  return `${pageHead('Routing Sampah Saya', 'Hasil routing AI untuk sampah makanan yang Anda catat')}
  <div class="section"><div class="card">
    ${
      rows.length === 0
        ? emptyHtml('Belum ada alokasi', 'Tunggu admin menjalankan routing AI.')
        : `<div class="table-wrap" style="border:none">
      <table class="table">
        <thead><tr><th>Sampah</th><th>TPS Pengolah</th><th>Kurir</th><th>Skor</th><th>Status</th></tr></thead>
        <tbody>
        ${rows
          .map(
            (m) => `<tr>
          <td><b>${esc(m.nama_sampah)}</b> ${statusTag(m.kategori || m.jenis_makanan)}<br><span class="muted">${m.berat_kg} kg</span></td>
          <td>${esc(m.nama_tps)}<br><span class="muted">${m.jarak_km} km</span></td>
          <td>${esc(m.nama_kurir)}</td>
          <td>
            <b>${m.skor_persen ?? ''}%</b>
            ${m.skor_persen != null ? `<div class="progress" style="margin-top:6px;min-width:110px"><span class="progress-bar" style="width:${m.skor_persen}%"></span></div>` : ''}
          </td>
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
  root.innerHTML = await donorMatches();
  bindForms(root, ctx.rerender);
}
