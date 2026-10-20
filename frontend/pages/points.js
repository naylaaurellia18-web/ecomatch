import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { icon, esc, pageHead, fmtDate, statusTag, emptyHtml, flowStripHtml } from '../core/ui.js';
import { bindForms } from '../core/forms.js';
import { kpiCard, kpiGrid } from '../components/kpi.js';

async function pointsView() {
  const m = await api('/api/mbg/motivation');
  const target = Number(m.target_kg_klaim_pertama || 5);
  const progres = Math.min(100, Math.round((Number(m.kg_terverifikasi) / target) * 100));
  const bisaKlaim = Number(m.kg_terverifikasi) >= target;
  const klaimRows = m.klaim || [];
  const cert = klaimRows.find((k) => k.jenis_insentif === 'sertifikat');

  return `${pageHead('Poin &amp; Insentif', 'Poin kepatuhan dari kg sampah terverifikasi + klaim insentif (FR-15)')}
  ${flowStripHtml(['Catat sampah', 'Sampah terverifikasi di TPS', 'Poin bertambah', 'Klaim insentif'])}
  ${kpiGrid([
    kpiCard({ label: 'Kg dialihkan', value: m.kg_dialihkan, unit: 'kg', hint: 'status aktif', ic: 'leaf' }),
    kpiCard({ label: 'Kg terverifikasi', value: m.kg_terverifikasi, unit: 'kg', hint: `target klaim ${target} kg`, ic: 'check' }),
    kpiCard({ label: 'Poin', value: m.poin, hint: `${m.poin_per_kg} poin / kg`, ic: 'award', tone: 'warning' }),
    kpiCard({ label: 'Progres klaim', value: `${progres}%`, hint: bisaKlaim ? 'siap diklaim' : `kurang ${(target - Number(m.kg_terverifikasi)).toFixed(1)} kg`, ic: 'zap', tone: bisaKlaim ? '' : 'warning' }),
  ])}

  <div class="section"><div class="split-2">
    <div class="card">
      <div class="card-head">
        <div><h2>${icon('award', 16)} Motivasi</h2>
        <div class="page-sub">Target dibuka setelah ${target} kg sampah terverifikasi</div></div>
      </div>
      <p style="margin-bottom:var(--sp-4)">${esc(m.motivasi || '')}</p>
      <div class="meter" style="margin-bottom:var(--sp-4)">
        <div class="meter-top"><span>${m.kg_terverifikasi} kg terverifikasi</span><span>${target} kg</span></div>
        <span class="xp-track"><span class="xp-fill" style="width:${progres}%"></span></span>
      </div>
      <div class="row row-2 row-wrap">
        ${['sertifikat', 'badge', 'laporan_kepatuhan', 'laporan_csr']
          .map(
            (j) => `<button class="btn btn-sm ${bisaKlaim ? 'btn-primary' : 'btn-outline'}" data-post="/api/mbg/motivation/claim"
              data-body='{"jenis_insentif":"${j}"}' ${bisaKlaim ? '' : `data-confirm="Anda belum mencapai ${target} kg terverifikasi — klaim akan ditolak. Lanjutkan?"`}>Klaim ${j.replace(/_/g, ' ')}</button>`
          )
          .join('')}
      </div>
    </div>

    <div class="certificate">
      <span class="medal">${icon('award', 30)}</span>
      <div class="t-xs eyebrow">Sertifikat Kepatuhan</div>
      <div style="font-weight:800;font-size:var(--fs-lg)">${esc(store.nama)}</div>
      <div class="t-sm muted">${cert ? `Diterbitkan ${fmtDate(cert.created_at)}` : `Terbuka setelah ${target} kg terverifikasi`}</div>
      <span class="badge ${cert ? 'badge-success' : 'badge-warning'} badge-dot">${cert ? 'Sudah diklaim' : 'Belum diklaim'}</span>
    </div>
  </div></div>

  <div class="section"><div class="card">
    <div class="card-head"><div><h2>Riwayat klaim</h2></div></div>
    ${
      klaimRows.length === 0
        ? emptyHtml('Belum ada klaim', 'Kumpulkan kg terverifikasi lalu klaim insentif.')
        : `<div class="table-wrap" style="border:none">
      <table class="table">
        <thead><tr><th>#</th><th>Jenis</th><th>Nilai</th><th>Periode</th><th>Waktu</th></tr></thead>
        <tbody>
        ${klaimRows
          .map(
            (k) => `<tr>
          <td class="muted">${k.id_motivasi}</td>
          <td>${statusTag(k.jenis_insentif)}</td>
          <td><b>${k.nilai}</b></td>
          <td>${esc(k.periode)}</td>
          <td class="muted">${fmtDate(k.created_at)}</td>
        </tr>`
          )
          .join('')}
        </tbody>
      </table></div>`
    }
  </div></div>`;
}

export async function mount(root, ctx) {
  root.innerHTML = await pointsView();
  bindForms(root, ctx.rerender);
}
