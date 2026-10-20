import { api } from '../core/api.js';
import { icon, esc, pageHead, flowStripHtml } from '../core/ui.js';
import { bindForms, locationSelectHtml } from '../core/forms.js';
import { JENIS_TPS, JENIS_PENGOLAHAN, KATEGORI_DITERIMA, jenisLabel } from '../core/constants.js';
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
  return `${pageHead('Daftarkan TPS Pengolah', 'Akun Anda belum punya profil TPS — isi data dasar agar bisa menerima alokasi routing')}
  ${flowStripHtml(['Daftar profil TPS', 'Admin verifikasi', 'Terima alokasi routing', 'Konfirmasi OTP'])}
  <div class="section"><div class="card card-pad-lg">
    <form data-action="1" data-endpoint="/api/tps/register">
      <div class="field">
        <label class="label" for="tpsNama">Nama TPS<span class="req">*</span></label>
        <input class="input" id="tpsNama" name="nama_tps" required maxlength="120" placeholder="TPS Kompos Kawatan" />
      </div>
      <div class="grid grid-2">
        <div class="field"><label class="label" for="tpsJenis">Jenis TPS</label>${selectHtml('jenis_tps', JENIS_TPS)}</div>
        <div class="field"><label class="label" for="tpsOlah">Jenis pengolahan</label>${selectHtml('jenis_pengolahan', JENIS_PENGOLAHAN)}</div>
      </div>
      <div class="grid grid-2">
        <div class="field"><label class="label" for="tpsKap">Kapasitas (kg/hari)</label><input class="input" id="tpsKap" name="kapasitas_kg_hari" type="number" min="0" max="100000" value="100" /></div>
        <div class="field"><label class="label" for="tpsRad">Radius layanan (km)</label><input class="input" id="tpsRad" name="radius_layanan_km" type="number" min="0" max="100" value="15" /></div>
      </div>
      <div class="field" style="margin-top:var(--sp-4)">
        <span class="label">Kategori sampah yang diterima</span>
        ${jenisDiterimaFormHtml(KATEGORI_DITERIMA)}
      </div>
      ${locationSelectHtml({ label: 'Lokasi TPS', hint: 'Wajib agar TPS muncul di routing & peta' })}
      <div class="row" style="margin-top:var(--sp-5)">
        <button class="btn btn-primary" type="submit">${icon('upload', 15)} Daftarkan TPS</button>
      </div>
      ${galat ? `<p class="muted t-xs" style="margin-top:10px">${esc(galat)}</p>` : ''}
    </form>
  </div></div>`;
}

function profileView(tps) {
  const terpakai = Number(tps.terpakai_kg_hari_ini || 0);
  const kapasitas = Number(tps.kapasitas_kg_hari || 0);
  const progres = kapasitas > 0 ? Math.min(100, Math.round((terpakai / kapasitas) * 100)) : 0;

  return `${pageHead('Profil TPS Pengolah', 'Kapasitas, jenis olahan, dan lokasi TPS Anda (FR-03)')}
  ${flowStripHtml(['Profil & kapasitas', 'Routing AI alokasikan sampah', 'Kurir antar', 'OTP + log pengolahan'])}
  ${kpiGrid([
    kpiCard({ label: 'Kapasitas harian', value: kapasitas, unit: 'kg/hari', ic: 'package' }),
    kpiCard({ label: 'Terpakai hari ini', value: terpakai, unit: 'kg', hint: `${progres}% dari kapasitas`, ic: 'zap', tone: 'info' }),
    kpiCard({ label: 'Sisa kapasitas', value: tps.sisa_kapasitas_kg, unit: 'kg', hint: 'kg hari ini', ic: 'leaf' }),
    kpiCard({ label: 'Status', value: tps.aktif ? 'Aktif' : 'Nonaktif', hint: `radius ${tps.radius_layanan_km} km`, ic: 'shield', tone: tps.aktif ? '' : 'danger' }),
  ])}
  <div class="section"><div class="card card-pad-lg">
    <div class="card-head"><div><h2>Ubah profil TPS</h2></div></div>
    <form data-action="1" data-endpoint="/api/tps/me" data-method="PATCH">
      <div class="field">
        <label class="label" for="pNama">Nama TPS<span class="req">*</span></label>
        <input class="input" id="pNama" name="nama_tps" required maxlength="120" value="${esc(tps.nama_tps || '')}" />
      </div>
      <div class="grid grid-2">
        <div class="field"><label class="label" for="pJenis">Jenis TPS</label>${selectHtml('jenis_tps', JENIS_TPS, tps.jenis_tps)}</div>
        <div class="field"><label class="label" for="pOlah">Jenis pengolahan</label>${selectHtml('jenis_pengolahan', JENIS_PENGOLAHAN, tps.jenis_pengolahan)}</div>
      </div>
      <div class="grid grid-3">
        <div class="field"><label class="label" for="pKap">Kapasitas (kg/hari)</label><input class="input" id="pKap" name="kapasitas_kg_hari" type="number" min="0" max="100000" value="${kapasitas}" /></div>
        <div class="field"><label class="label" for="pRad">Radius (km)</label><input class="input" id="pRad" name="radius_layanan_km" type="number" min="0" max="100" value="${tps.radius_layanan_km}" /></div>
        <div class="field"><label class="label" for="pAktif">Status TPS</label>
          <select class="select" id="pAktif" name="aktif">
            <option value="1" ${tps.aktif ? 'selected' : ''}>Aktif menerima</option>
            <option value="0" ${!tps.aktif ? 'selected' : ''}>Nonaktif</option>
          </select>
        </div>
      </div>
      <div class="field" style="margin-top:var(--sp-4)">
        <span class="label">Kategori sampah yang diterima</span>
        ${jenisDiterimaFormHtml(tps.jenis_diterima || [])}
      </div>
      <div class="grid grid-2">
        <div class="field"><label class="label" for="pTel">Telepon</label><input class="input" id="pTel" name="telepon" value="${esc(tps.telepon || '')}" placeholder="08xxx" /></div>
        <div class="field"><label class="label" for="pIzin">Izin operasional</label><input class="input" id="pIzin" name="izin_operasional" maxlength="200" value="${esc(tps.izin_operasional || '')}" placeholder="NIB / izin kelurahan…" /></div>
      </div>
      <div class="field" style="margin-top:var(--sp-4)">
        <label class="label" for="pAlamat">Alamat</label>
        <input class="input" id="pAlamat" name="alamat" maxlength="300" value="${esc(tps.alamat || '')}" placeholder="Jl. …, Madiun" />
      </div>
      ${locationSelectHtml({ label: 'Lokasi TPS', hint: 'Pilih ulang bila TPS pindah — agar rute & peta diperbarui' })}
      <div class="row" style="margin-top:var(--sp-5)">
        <button class="btn btn-primary" type="submit">${icon('check', 15)} Simpan profil</button>
      </div>
    </form>
  </div></div>`;
}

export async function mount(root, ctx) {
  let tps = null;
  let galat = null;
  try {
    tps = await api('/api/tps/me');
  } catch (e) {
    galat = e.message;
  }

  if (!tps) {
    root.innerHTML = registerForm(galat);
  } else {
    root.innerHTML = profileView(tps);
  }
  bindForms(root, ctx.rerender);
}
