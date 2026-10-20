import { api } from '../core/api.js';
import { icon, esc, pageHead, emptyHtml } from '../core/ui.js';
import { bindForms } from '../core/forms.js';
import { kpiCard, kpiGrid } from '../components/kpi.js';
import { donut, bars } from '../components/charts.js';

function tableCard(title, sub, rows) {
  return `<div class="card">
    <div class="card-head">
      <div><h2>${title}</h2>${sub ? `<div class="page-sub">${sub}</div>` : ''}</div>
    </div>
    <div class="table-wrap" style="border:none">
      <table class="table">
        <tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right"><b>${v}</b></td></tr>`).join('')}</tbody>
      </table>
    </div>
  </div>`;
}

async function adminDashboard() {
  const s = await api('/api/admin/stats');
  const runs = s.kinerja?.riwayat_routing || [];
  const isEmpty = (s.sampah?.total ?? 0) === 0 && (s.alokasi?.total ?? 0) === 0 && (s.users?.total ?? 0) <= 1;
  const sla = s.kinerja?.target_routing_ms ?? 3000;

  const onboarding = isEmpty
    ? `<div class="section"><div class="card">
        ${emptyHtml('Web masih kosong — siap diisi dari nol', 'Alur peluncuran: daftarkan donor MBG & TPS, verifikasi pengguna, lalu jalankan routing AI.')}
        <div class="stack stack-3" style="padding:0 var(--sp-5) var(--sp-5)">
          ${[
            ['1', 'Donor catat sampah makanan', 'Foto, berat kg, jenis, lokasi'],
            ['2', 'Klasifikasi & routing AI', 'Skor multi-kriteria + rute peta'],
            ['3', 'Admin verifikasi pengguna', 'Aktifkan akun donor, TPS, kurir'],
            ['4', 'Kurir jemput, TPS konfirmasi OTP', 'Serah terima terlacak sampai log pengolahan'],
          ]
            .map(
              ([n, t, d]) => `<div class="row" style="gap:14px;align-items:flex-start">
                <span class="step-num" style="background:var(--primary);color:#fff;width:28px;height:28px">${n}</span>
                <div><div style="font-weight:700">${t}</div><div class="t-sm muted">${d}</div></div>
              </div>`
            )
            .join('')}
        </div>
      </div></div>`
    : '';

  const kpis = kpiGrid([
    kpiCard({ label: 'Total pengguna', value: s.users.total, hint: `${s.users.menunggu} menunggu verifikasi`, ic: 'users' }),
    kpiCard({ label: 'Total alokasi', value: s.alokasi.total, hint: `${s.alokasi.terverifikasi} terverifikasi`, ic: 'route' }),
    kpiCard({ label: 'Kg dialihkan', value: s.dampak.kg_dialihkan, unit: 'kg', hint: 'status aktif', ic: 'leaf' }),
    kpiCard({ label: 'Kg terverifikasi', value: s.dampak.kg_terverifikasi, unit: 'kg', hint: 'selesai di TPS', ic: 'check' }),
    kpiCard({ label: 'Rata-rata skor', value: `${s.dampak.rata_rata_skor_persen}%`, ic: 'sparkles', tone: 'info' }),
    kpiCard({ label: 'Rata-rata jarak', value: s.dampak.rata_rata_jarak_km, unit: 'km', ic: 'map', tone: 'info' }),
    kpiCard({ label: 'Klasifikasi AI', value: s.klasifikasi.total, hint: `${s.klasifikasi.perlu_verifikasi} perlu verifikasi`, ic: 'cpu', tone: 'warning' }),
    kpiCard({ label: 'Catatan audit', value: s.dampak.log_audit, hint: 'tidak dapat diubah', ic: 'file' }),
    kpiCard({ label: 'Pesan outbox', value: s.dampak.pesan_outbox ?? 0, hint: `WA ${s.kanal?.whatsapp === 'live' ? 'aktif' : 'sim'} · Email ${s.kanal?.email === 'live' ? 'aktif' : 'sim'}`, ic: 'message' }),
    kpiCard({ label: 'Durasi routing', value: runs[0]?.durasi_ms ?? '—', unit: 'ms', hint: `SLA ${sla} ms`, ic: 'zap', tone: 'warning' }),
  ]);

  const peran = donut(
    [
      { label: 'Donor MBG', value: s.users.donor_mbg },
      { label: 'TPS', value: s.users.tps_pengolah },
      { label: 'Kurir', value: s.users.kurir },
      { label: 'Admin', value: s.users.admin },
    ].filter((x) => Number(x.value) > 0),
    { center: String(s.users.total), sub: 'pengguna' }
  );

  const sampahCard = tableCard('Sampah &amp; TPS', '', [
    ['Sampah tersedia', `${s.sampah.tersedia} / ${s.sampah.total}`],
    ['Sampah terverifikasi', s.sampah.terverifikasi],
    ['TPS aktif', `${s.tps.aktif} / ${s.tps.total}`],
    ['Klasifikasi perlu verifikasi', s.klasifikasi.perlu_verifikasi],
  ]);

  const kinerja = `<div class="section"><div class="card">
    <div class="card-head">
      <div><h2>Riwayat kinerja routing AI</h2>
      <div class="page-sub">Durasi tiap kali dijalankan — target SLA ${sla} ms</div></div>
    </div>
    ${
      runs.length === 0
        ? emptyHtml('Belum ada proses', 'Klik “Jalankan Routing AI” untuk memulai.')
        : `${bars(
            runs.slice(0, 6).map((r) => ({
              label: `${r.mesin || 'js'}`,
              pct: Math.min(100, Math.round((Number(r.durasi_ms || 0) / sla) * 100)),
              display: `${r.durasi_ms} ms`,
              color: Number(r.durasi_ms) > sla ? 'var(--warning)' : 'var(--primary)',
            }))
          )}<div class="table-wrap" style="margin-top:var(--sp-4);border:none">
            <table class="table">
              <thead><tr><th>Kandidat (Sampah/TPS/Kurir)</th><th>Alokasi dibuat</th><th>Mesin</th><th>Durasi (ms)</th></tr></thead>
              <tbody>${runs
                .map(
                  (r) => `<tr>
                    <td>${r.kandidat_sampah ?? '—'}/${r.kandidat_tps ?? '—'}/${r.kandidat_kurir ?? '—'}</td>
                    <td><b>${r.dibuat ?? '—'}</b></td>
                    <td class="muted">${esc(r.mesin || '—')}</td>
                    <td><b>${r.durasi_ms ?? '—'}</b></td>
                  </tr>`
                )
                .join('')}</tbody>
            </table></div>`
    }
  </div></div>`;

  return `${pageHead(
    'Beranda',
    'Ringkasan operasional pengalihan sampah makanan MBG ke TPS pengolah',
    `<button class="btn" data-post="/api/routing/run">${icon('sparkles', 15)} Jalankan Routing AI</button>
     <button class="btn btn-outline" data-post="/api/admin/clean" data-confirm="Hapus semua data transaksi (sampah, alokasi, log pengolahan, notifikasi)? Akun login tetap ada.">Bersihkan Data</button>`
  )}
  ${onboarding}
  ${kpis}
  <div class="section"><div class="grid grid-2">
    <div class="card">
      <div class="card-head"><div><h2>Distribusi peran</h2></div></div>
      ${peran}
    </div>
    ${sampahCard}
  </div></div>
  ${kinerja}`;
}

export async function mount(root, ctx) {
  root.innerHTML = await adminDashboard();
  bindForms(root, ctx.rerender);
}
