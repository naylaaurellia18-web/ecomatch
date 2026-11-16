import { api } from '../core/api.js';
import { icon, esc, pageHead, flowStripHtml } from '../core/ui.js';
import { bindForms, locationSelectHtml } from '../core/forms.js';
import { JENIS_PENERIMA, KATEGORI_DITERIMA, jenisLabel } from '../core/constants.js';
import { kpiCard, kpiGrid } from '../components/kpi.js';

function selectHtml(name, options, selected) {
  return `<select class="select" id="${name}" name="${name}">
    ${options.map(([v, l]) => `<option value="${v}"${selected === v ? ' selected' : ''}>${l}</option>`).join('')}
  </select>`;
}

function jenisDiterimaFormHtml(selected = []) {
  return `<div class="grid grid-3">
    ${KATEGORI_DITERIMA.map(
      (k) => `<label class="role-card" style="padding:8px 10px;gap:8px">
        <input type="checkbox" name="jenis_diterima" value="${k}" ${selected.includes(k) ? 'checked' : ''} />
        <span><b style="font-size:13px">${jenisLabel(k)}</b></span>
      </label>`
    ).join('')}
  </div>`;
}

function registerForm(galat) {
  return `${pageHead('Daftarkan Penerima', 'Akun Anda belum punya profil penerima — isi data dasar agar bisa menerima alokasi routing')}
  ${flowStripHtml(['Daftar profil penerima', 'Admin verifikasi', 'Terima alokasi routing', 'Konfirmasi OTP'])}
  <div class="section"><div class="card card-pad-lg">
    <form data-action="1" data-endpoint="/api/penerima/register">
      <div class="field">
        <label class="label" for="pNama">Nama lembaga / penerima<span class="req">*</span></label>
        <input class="input" id="pNama" name="nama_penerima" required maxlength="120" placeholder="Panti Asuhan Al-Hidayah" />
      </div>
      <div class="grid grid-2">
        <div class="field"><label class="label" for="pJenis">Jenis penerima</label>${selectHtml('jenis_penerima', JENIS_PENERIMA)}
          <div class="t-xs muted" style="margin-top:4px">Peternakan menerima sisa <b>tidak layak</b> — panti/yayasan menerima yang <b>layak</b></div>
        </div>
        <div class="field"><label class="label" for="pKap">Kapasitas (kg/hari)</label><input class="input" id="pKap" name="kapasitas_kg_hari" type="number" min="0" max="100000" value="100" /></div>
      </div>
      <div class="field">
        <label class="label" for="pRad">Radius layanan (km)</label><input class="input" id="pRad" name="radius_layanan_km" type="number" min="0" max="100" value="15" />
      </div>
      <div class="field" style="margin-top:var(--sp-4)">
        <span class="label">Kategori sampah yang diterima</span>
        ${jenisDiterimaFormHtml(KATEGORI_DITERIMA)}
      </div>
      ${locationSelectHtml({ label: 'Lokasi penerima', hint: 'Wajib agar penerima muncul di routing & peta' })}
      <div class="row" style="margin-top:var(--sp-5)">
        <button class="btn btn-primary" type="submit">${icon('upload', 15)} Daftarkan penerima</button>
      </div>
      ${galat ? `<p class="muted t-xs" style="margin-top:10px">${esc(galat)}</p>` : ''}
    </form>
  </div></div>`;
}

function profileView(p) {
  const terpakai = Number(p.terpakai_kg_hari_ini || 0);
  const kapasitas = Number(p.kapasitas_kg_hari || 0);
  const progres = kapasitas > 0 ? Math.min(100, Math.round((terpakai / kapasitas) * 100)) : 0;

  return `${pageHead('Profil Penerima', 'Kapasitas, jenis penerima, dan lokasi Anda (FR-03)')}
  ${flowStripHtml(['Profil & kapasitas', 'Routing AI alokasikan sampah', 'Kurir antar', 'OTP + log penerimaan'])}
  ${kpiGrid([
    kpiCard({ label: 'Kapasitas harian', value: kapasitas, unit: 'kg/hari', ic: 'package' }),
    kpiCard({ label: 'Terpakai hari ini', value: terpakai, unit: 'kg', hint: `${progres}% dari kapasitas`, ic: 'zap', tone: 'info' }),
    kpiCard({ label: 'Sisa kapasitas', value: p.sisa_kapasitas_kg, unit: 'kg', hint: 'kg hari ini', ic: 'leaf' }),
    kpiCard({ label: 'Status', value: p.aktif ? 'Aktif' : 'Nonaktif', hint: `radius ${p.radius_layanan_km} km`, ic: 'shield', tone: p.aktif ? '' : 'danger' }),
  ])}
  <div class="section"><div class="card card-pad-lg">
    <div class="card-head"><div><h2>Ubah profil penerima</h2></div></div>
    <form data-action="1" data-endpoint="/api/penerima/me" data-method="PATCH">
      <div class="field">
        <label class="label" for="fNama">Nama lembaga / penerima<span class="req">*</span></label>
        <input class="input" id="fNama" name="nama_penerima" required maxlength="120" value="${esc(p.nama_penerima || '')}" />
      </div>
      <div class="grid grid-2">
        <div class="field"><label class="label" for="fJenis">Jenis penerima</label>${selectHtml('jenis_penerima', JENIS_PENERIMA, p.jenis_penerima)}</div>
        <div class="field"><label class="label" for="fKap">Kapasitas (kg/hari)</label><input class="input" id="fKap" name="kapasitas_kg_hari" type="number" min="0" max="100000" value="${kapasitas}" /></div>
      </div>
      <div class="grid grid-2">
        <div class="field"><label class="label" for="fRad">Radius (km)</label><input class="input" id="fRad" name="radius_layanan_km" type="number" min="0" max="100" value="${p.radius_layanan_km}" /></div>
        <div class="field"><label class="label" for="fAktif">Status penerima</label>
          <select class="select" id="fAktif" name="aktif">
            <option value="1" ${p.aktif ? 'selected' : ''}>Aktif menerima</option>
            <option value="0" ${!p.aktif ? 'selected' : ''}>Nonaktif</option>
          </select>
        </div>
      </div>
      <div class="field" style="margin-top:var(--sp-4)">
        <span class="label">Kategori sampah yang diterima</span>
        ${jenisDiterimaFormHtml(p.jenis_diterima || [])}
      </div>
      <div class="grid grid-2">
        <div class="field"><label class="label" for="fTel">Telepon</label><input class="input" id="fTel" name="telepon" value="${esc(p.telepon || '')}" placeholder="08xxx" /></div>
        <div class="field"><label class="label" for="fIzin">Izin operasional</label><input class="input" id="fIzin" name="izin_operasional" maxlength="200" value="${esc(p.izin_operasional || '')}" placeholder="NIB / izin kelurahan…" /></div>
      </div>
      <div class="field" style="margin-top:var(--sp-4)">
        <label class="label" for="fAlamat">Alamat</label>
        <input class="input" id="fAlamat" name="alamat" maxlength="300" value="${esc(p.alamat || '')}" placeholder="Jl. …, Madiun" />
      </div>
      ${locationSelectHtml({ label: 'Lokasi penerima', hint: 'Pilih ulang bila pindah — agar rute & peta diperbarui' })}
      <div class="row" style="margin-top:var(--sp-5)">
        <button class="btn btn-primary" type="submit">${icon('check', 15)} Simpan profil</button>
      </div>
    </form>
  </div></div>`;
}

export async function mount(root, ctx) {
  let penerima = null;
  let galat = null;
  try {
    penerima = await api('/api/penerima/me');
  } catch (e) {
    galat = e.message;
  }

  if (!penerima) {
    root.innerHTML = registerForm(galat);
  } else {
    root.innerHTML = profileView(penerima);
  }
  bindForms(root, ctx.rerender);
}
