import { api } from '../core/api.js';
import { icon, esc, pageHead, fmtDate, statusTag, emptyHtml } from '../core/ui.js';
import { bindForms } from '../core/forms.js';
import { kpiCard, kpiGrid } from '../components/kpi.js';

async function usersView() {
  const users = await api('/api/admin/users');
  return `${pageHead('Pengguna', 'Verifikasi, tolak, atau hapus akun donor MBG, TPS pengolah, dan kurir')}
  <div class="section"><div class="card">
    ${
      users.length <= 1
        ? emptyHtml('Belum ada pengguna selain admin', 'Ajukan pendaftaran dari halaman masuk.')
        : `<div class="table-wrap" style="border:none">
      <table class="table">
        <thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th>Status</th><th>Lokasi</th><th style="text-align:right">Aksi</th></tr></thead>
        <tbody>
        ${users
          .map(
            (u) => `<tr>
          <td><b>${esc(u.nama)}</b>${u.nama_lembaga ? `<br><span class="muted">${esc(u.nama_lembaga)}</span>` : ''}</td>
          <td>${esc(u.email)}</td>
          <td>${statusTag(u.role)}</td>
          <td>${statusTag(u.status)}</td>
          <td class="muted">${esc(u.alamat || '—')}${u.kapasitas ? `<br>kap. ${u.kapasitas} porsi` : ''}</td>
          <td>
            <div class="cell-actions">
            ${u.status !== 'aktif' && u.role !== 'admin' ? `<button class="btn btn-sm btn-primary" data-patch="/api/admin/users/${u.id_user}/status" data-body='{"status":"aktif"}'>Verifikasi</button>` : ''}
            ${u.status !== 'ditolak' && u.role !== 'admin' ? `<button class="btn btn-sm btn-danger" data-patch="/api/admin/users/${u.id_user}/status" data-body='{"status":"ditolak"}'>Tolak</button>` : ''}
            ${u.role !== 'admin' ? `<button class="btn btn-sm btn-outline" data-delete="/api/admin/users/${u.id_user}">Hapus</button>` : ''}
            </div>
          </td>
        </tr>`
          )
          .join('')}
        </tbody>
      </table></div>`
    }
  </div></div>`;
}

async function matchesView() {
  const rows = await api('/api/routing');
  return `${pageHead(
    'Routing AI',
    'Sampah makanan dialokasikan ke TPS pengolah &amp; kurir terdekat',
    `<button class="btn btn-primary" data-post="/api/routing/run">${icon('sparkles', 15)} Jalankan Routing</button>`
  )}
  <div class="section"><div class="card">
    <div class="card-head">
      <div><h2>Hasil alokasi</h2>
      <div class="page-sub">${rows.length} entri · skor = 0,35×jenis + 0,25×kapasitas + 0,25×jarak + 0,15×urgensi</div></div>
    </div>
    ${
      rows.length === 0
        ? emptyHtml('Belum ada alokasi', 'Catat sampah makanan & daftarkan TPS dulu, lalu jalankan routing AI.')
        : `<div class="table-wrap" style="border:none">
      <table class="table">
        <thead><tr><th>#</th><th>Sampah → TPS</th><th>Kurir</th><th>Skor</th><th>Jarak</th><th>Status</th></tr></thead>
        <tbody>
        ${rows
          .map(
            (m) => `<tr>
          <td class="muted">${m.id_alokasi}</td>
          <td><b>${esc(m.nama_sampah)}</b> (${m.berat_kg} kg) ${statusTag(m.kategori || m.jenis_makanan)}<br>→ ${esc(m.nama_tps)} ${m.tingkat_pembusukan ? statusTag(m.tingkat_pembusukan) : ''}<br><span class="muted">${esc(m.nama_donor)} → ${esc(m.nama_tps)}</span></td>
          <td>${esc(m.nama_kurir)}</td>
          <td>
            <b>${m.skor_persen}%</b>
            <div class="progress" style="margin-top:6px;min-width:120px"><span class="progress-bar" style="width:${m.skor_persen}%"></span></div>
            <span class="muted t-xs">jenis ${Number(m.skor_jenis_cocok * 100).toFixed(0)} · kap. ${Number(m.skor_kapasitas * 100).toFixed(0)} · jarak ${Number(m.skor_jarak * 100).toFixed(0)} · urg. ${Number(m.skor_urgensi * 100).toFixed(0)}</span>
          </td>
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

async function logsView() {
  const logs = await api('/api/admin/logs');
  return `${pageHead('Catatan Audit', 'Riwayat aktivitas sistem — tidak dapat diubah atau dihapus')}
  <div class="section"><div class="card">
    ${
      logs.length === 0
        ? emptyHtml('Belum ada aktivitas tercatat', '')
        : `<div class="table-wrap" style="border:none">
      <table class="table">
        <thead><tr><th>ID</th><th>Waktu</th><th>User</th><th>Aksi</th><th>Entitas</th><th>Detail</th></tr></thead>
        <tbody>
        ${logs
          .map(
            (l) => `<tr>
          <td class="muted">${l.id_log}</td>
          <td class="muted">${fmtDate(l.created_at)}</td>
          <td>${esc(l.nama_pengguna || 'sistem')}</td>
          <td><span class="chip" style="cursor:default">${esc(l.aksi)}</span></td>
          <td>${esc(l.entitas)}${l.id_entitas ? '#' + esc(l.id_entitas) : ''}</td>
          <td class="muted" style="max-width:260px;word-break:break-all">${l.detail ? esc(l.detail) : '—'}</td>
        </tr>`
          )
          .join('')}
        </tbody>
      </table></div>`
    }
  </div></div>`;
}

async function outboxView() {
  const data = await api('/api/admin/outbox');
  const rows = data.pesan || [];
  const ch = data.kanal || {};
  const chChip = (state) =>
    state === 'live'
      ? `<span class="badge badge-success badge-dot">Aktif</span>`
      : `<span class="badge badge-dot">Simulasi</span>`;

  return `${pageHead(
    'Pesan Terkirim',
    'Riwayat notifikasi WhatsApp &amp; email',
    rows.some((m) => m.status === 'terkirim' || m.status === 'simulasi')
      ? `<button class="btn btn-outline" data-delete="/api/admin/outbox/sent" data-confirm="Hapus semua pesan yang sudah terkirim dari riwayat?">Hapus Pesan Terkirim</button>`
      : ''
  )}
  ${kpiGrid([
    kpiCard({
      label: 'WhatsApp',
      value: ch.whatsapp === 'live' ? 'Terhubung' : 'Simulasi',
      hint: ch.whatsapp === 'live' ? 'CallMeBot aktif' : 'isi CALLMEBOT_APIKEY',
      ic: 'phone',
      tone: ch.whatsapp === 'live' ? '' : 'warning',
    }),
    kpiCard({
      label: 'Email',
      value: ch.email === 'live' ? 'Terhubung' : 'Simulasi',
      hint: ch.email === 'live' ? 'SMTP aktif' : 'isi SMTP_* untuk kirim nyata',
      ic: 'mail',
      tone: ch.email === 'live' ? '' : 'warning',
    }),
    kpiCard({ label: 'Total pesan', value: rows.length, ic: 'message' }),
  ])}
  <div class="section"><div class="card">
    <div class="card-head">
      <div><h2>Riwayat outbox</h2>
      <div class="page-sub">terkirim = nyata · simulasi = demo · antre = menunggu · gagal = gagal</div></div>
      <div class="row row-2 row-wrap">
        <span class="muted t-sm">${icon('phone', 14)} WhatsApp ${chChip(ch.whatsapp)}</span>
        <span class="muted t-sm">${icon('mail', 14)} Email ${chChip(ch.email)}</span>
      </div>
    </div>
    ${
      rows.length === 0
        ? emptyHtml('Belum ada pesan', 'Notifikasi otomatis saat alokasi, pickup, OTP, atau verifikasi.')
        : `<div class="table-wrap" style="border:none">
      <table class="table">
        <thead><tr><th>#</th><th>Kanal</th><th>Penerima</th><th>Subjek</th><th>Status</th><th>Waktu</th></tr></thead>
        <tbody>
        ${rows
          .map(
            (m) => `<tr>
          <td class="muted">${m.id_pesan}</td>
          <td>${m.kanal === 'whatsapp' ? icon('phone', 13) : icon('mail', 13)} ${m.kanal === 'whatsapp' ? 'WhatsApp' : 'Email'}</td>
          <td>${esc(m.tujuan || '—')}<br><span class="muted">${esc(m.nama_pengguna || '')}</span></td>
          <td><b>${esc(m.subjek || '—')}</b><br><span class="muted" style="max-width:280px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.isi || '')}</span></td>
          <td>${statusTag(m.status)}${m.error ? `<br><span class="muted">${esc(m.error)}</span>` : ''}</td>
          <td class="muted">${fmtDate(m.created_at)}</td>
        </tr>`
          )
          .join('')}
        </tbody>
      </table></div>`
    }
  </div></div>`;
}

export async function mount(root, ctx) {
  const tab = ctx.tab;
  root.innerHTML =
    tab === 'users' ? await usersView()
    : tab === 'matches' ? await matchesView()
    : tab === 'logs' ? await logsView()
    : tab === 'outbox' ? await outboxView()
    : emptyHtml('Halaman tidak ditemukan', '');
  bindForms(root, ctx.rerender);
}
