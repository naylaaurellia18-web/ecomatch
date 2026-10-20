import { api } from '../core/api.js';
import { icon, esc, fmtDate, statusTag, pageHead, emptyHtml, flowStripHtml } from '../core/ui.js';
import { bindForms, locationSelectHtml } from '../core/forms.js';
import { JENIS_SAMPAH, jenisLabel } from '../core/constants.js';
import { sopHtml, bindSopToggle } from '../components/sop.js';

const STEPS = ['Detail sampah', 'Waktu & lokasi', 'Konfirmasi'];

function wizardStepper(active) {
  return `<div class="stepper" id="wizStepper">
    ${STEPS.map((s, i) => `${i ? '<span class="step-line"></span>' : ''}<span class="step ${i === active ? 'active' : ''} ${i < active ? 'done' : ''}" data-step-pill="${i}"><span class="step-num">${i + 1}</span>${s}</span>`).join('')}
  </div>`;
}

function donorForm() {
  const now = new Date(Date.now() - 60000);
  const waktuDefault = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return `${pageHead('Catat Sampah Makanan MBG', 'Catat sisa makanan MBG dari dapur/SPPG untuk dialihkan ke TPS pengolah')}
  ${flowStripHtml(['Isi form + foto', 'Klasifikasi otomatis', 'Routing AI ke TPS', 'Kurir jemput & OTP TPS'])}
  <div class="section"><div class="card card-pad-lg">
    <form id="wasteForm" data-action="1" data-endpoint="/api/waste" data-multipart="1" novalidate>
      ${wizardStepper(0)}

      <div class="stack stack-4" data-step-panel="0">
        <div class="field">
          <label class="label" for="wNama">Nama sampah makanan<span class="req">*</span></label>
          <input class="input" id="wNama" name="nama_sampah" required maxlength="200" placeholder="Sisa nasi kotak sarapan MBG" />
        </div>
        <div class="grid grid-2">
          <div class="field">
            <label class="label" for="wJenis">Jenis makanan<span class="req">*</span></label>
            <select class="select" id="wJenis" name="jenis_makanan" required>
              ${JENIS_SAMPAH.map((j) => `<option value="${j}"${j === 'campuran' ? ' selected' : ''}>${jenisLabel(j)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="label" for="wBerat">Berat (kg)<span class="req">*</span></label>
            <input class="input" id="wBerat" name="berat_kg" type="number" min="0.1" max="10000" step="0.1" required placeholder="18.5" />
          </div>
        </div>

        <div class="field">
          <label class="label">Foto kondisi sampah <span class="hint">(wajib, maks 1MB)</span><span class="req">*</span></label>
          <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Unggah foto sampah">
            <div id="dzEmpty">${icon('camera', 28)}<div style="margin-top:8px;font-weight:700">Tarik foto ke sini atau klik untuk memilih</div>
            <div class="t-xs muted">Format JPG/PNG, ukuran maksimal 1MB</div></div>
            <div id="dzPreview" hidden><img class="preview-img" id="dzImg" alt="Pratinjau foto sampah" />
              <div class="t-sm" id="dzName" style="margin-top:8px"></div></div>
          </div>
          <input class="sr-only" id="wFoto" name="foto" type="file" accept="image/*" required />
          <div class="err-msg" data-err-for="wFoto" hidden></div>
        </div>
      </div>

      <div class="stack stack-4" data-step-panel="1" hidden>
        <div class="field">
          <label class="label" for="wWaktu">Waktu produksi<span class="req">*</span></label>
          <input class="input" id="wWaktu" name="waktu_produksi" type="datetime-local" required value="${waktuDefault}" />
        </div>
        ${locationSelectHtml({ label: 'Lokasi penjemputan', hint: 'Kosongkan untuk pakai alamat akun — pilih kota atau GPS' })}
      </div>

      <div class="stack stack-4" data-step-panel="2" hidden>
        <div class="card card-accent">
          <div class="eyebrow">Ringkasan</div>
          <div class="stack stack-2" style="margin-top:10px">
            <div><span class="muted">Nama:</span> <b id="sumNama">—</b></div>
            <div><span class="muted">Jenis / berat:</span> <b id="sumJenis">—</b></div>
            <div><span class="muted">Waktu produksi:</span> <b id="sumWaktu">—</b></div>
            <div><span class="muted">Lokasi:</span> <b id="sumLokasi">—</b></div>
            <div><span class="muted">Foto:</span> <b id="sumFoto">—</b></div>
          </div>
        </div>
        <div class="t-sm muted">Sampah akan diklasifikasi otomatis (FR-11) lalu menunggu routing AI (FR-04) menuju TPS terdekat.</div>
        <div id="sopBox">${sopHtml('basah')}</div>
      </div>

      <div class="row row-between" style="margin-top:var(--sp-6)">
        <button class="btn btn-outline" type="button" id="wizBack" hidden>${icon('arrowLeft', 15)} Kembali</button>
        <span class="grow"></span>
        <button class="btn btn-primary" type="button" id="wizNext">Lanjut ${icon('arrowRight', 15)}</button>
        <button class="btn btn-primary" type="submit" id="wizSubmit" hidden>${icon('upload', 15)} Simpan sampah makanan</button>
      </div>
      <div class="err-msg" id="wizErr" hidden style="margin-top:10px"></div>
    </form>
  </div></div>`;
}

function initWizard(root) {
  const form = root.querySelector('#wasteForm');
  if (!form || form._wiz) return;
  form._wiz = true;

  let step = 0;
  const panels = [...root.querySelectorAll('[data-step-panel]')];
  const pills = [...root.querySelectorAll('[data-step-pill]')];
  const btnNext = root.querySelector('#wizNext');
  const btnBack = root.querySelector('#wizBack');
  const btnSubmit = root.querySelector('#wizSubmit');
  const err = root.querySelector('#wizErr');

  const show = () => {
    panels.forEach((p, i) => { p.hidden = i !== step; });
    pills.forEach((p, i) => {
      p.classList.toggle('active', i === step);
      p.classList.toggle('done', i < step);
    });
    btnBack.hidden = step === 0;
    btnNext.hidden = step === panels.length - 1;
    btnSubmit.hidden = step !== panels.length - 1;
    err.hidden = true;
    if (step === 2) fillSummary();
  };

  function validateStep() {
    const panel = panels[step];
    const required = [...panel.querySelectorAll('[required]')];
    for (const el of required) {
      if (!el.checkValidity()) {
        el.reportValidity();
        el.classList.add('input-invalid', 'shake');
        setTimeout(() => el.classList.remove('shake'), 350);
        return false;
      }
    }
    return true;
  }

  function fillSummary() {
    const g = (n) => form.querySelector(`[name="${n}"]`);
    root.querySelector('#sumNama').textContent = g('nama_sampah').value || '—';
    root.querySelector('#sumJenis').textContent = `${g('jenis_makanan').selectedOptions[0].textContent} · ${g('berat_kg').value || '—'} kg`;
    const w = g('waktu_produksi').value;
    root.querySelector('#sumWaktu').textContent = w ? fmtDate(w) : '—';
    const lat = g('lat').value;
    const locSel = form.querySelector('[data-loc-select]');
    root.querySelector('#sumLokasi').textContent = lat
      ? `${locSel.selectedOptions[0].textContent} (${lat}, ${g('lng').value})`
      : 'pakai alamat akun';
    const f = g('foto').files[0];
    root.querySelector('#sumFoto').textContent = f ? f.name : '—';
  }

  btnNext.addEventListener('click', () => {
    if (!validateStep()) return;
    step = Math.min(panels.length - 1, step + 1);
    show();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  btnBack.addEventListener('click', () => {
    step = Math.max(0, step - 1);
    show();
  });

  const fileInput = root.querySelector('#wFoto');
  const dz = root.querySelector('#dropzone');
  const pick = () => fileInput.click();
  dz.addEventListener('click', pick);
  dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  ['dragenter', 'dragover'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove('dragover'); }));
  dz.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    const dt = new DataTransfer();
    dt.items.add(f);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  });
  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    const empty = root.querySelector('#dzEmpty');
    const prev = root.querySelector('#dzPreview');
    const box = root.querySelector('#wizErr');
    if (!f) { empty.hidden = false; prev.hidden = true; dz.classList.remove('has-file'); return; }
    if (f.size > 1024 * 1024) {
      box.textContent = `Foto ${(f.size / 1024 / 1024).toFixed(2)}MB melebihi batas 1MB — pilih foto lain.`;
      box.hidden = false;
      fileInput.value = '';
      return;
    }
    box.hidden = true;
    dz.classList.add('has-file');
    empty.hidden = true;
    prev.hidden = false;
    root.querySelector('#dzImg').src = URL.createObjectURL(f);
    root.querySelector('#dzName').textContent = `${f.name} · ${(f.size / 1024).toFixed(0)} KB`;
  });

  show();
  bindSopToggle(root);
}

async function donorListings() {
  const rows = await api('/api/waste/mine');
  return `${pageHead('Stok Sampah Saya', 'Pantau status sampah makanan yang telah Anda catat')}
  <div class="section"><div class="card">
    ${
      rows.length === 0
        ? emptyHtml('Belum ada stok sampah', 'Catat sampah makanan terlebih dahulu.')
        : `<div class="table-wrap" style="border:none">
      <table class="table">
        <thead><tr><th>Foto</th><th>Nama</th><th>Jenis</th><th>Berat</th><th>Klasifikasi</th><th>Produksi</th><th>Status</th><th style="text-align:right">Aksi</th></tr></thead>
        <tbody>
        ${rows
          .map(
            (l) => `<tr>
          <td>${l.foto_url ? `<img src="${l.foto_url}" alt="" style="width:46px;height:46px;object-fit:cover;border-radius:10px;border:1px solid var(--line)" />` : '—'}</td>
          <td><b>${esc(l.nama_sampah)}</b></td>
          <td>${statusTag(l.jenis_makanan)}</td>
          <td>${l.berat_kg} kg</td>
          <td>${l.kategori ? `${statusTag(l.kategori)} <span class="muted">${statusTag(l.tingkat_pembusukan)}</span>` : '—'}</td>
          <td class="muted">${fmtDate(l.waktu_produksi)}</td>
          <td>${statusTag(l.status)}</td>
          <td><div class="cell-actions">${['tersedia', 'dialokasikan'].includes(l.status) ? `<button class="btn btn-sm btn-danger" data-patch="/api/waste/${l.id_sampah}" data-body='{"status":"dibatalkan"}'>Batalkan</button>` : '—'}</div></td>
        </tr>`
          )
          .join('')}
        </tbody>
      </table></div>`
    }
  </div></div>
  <div class="section"><div class="card">
    <div class="card-head">
      <div><h2>Panduan SOP penanganan</h2>
      <div class="page-sub">Wajib dipatuhi saat pengemasan &amp; pengantaran</div></div>
    </div>
    <div class="grid grid-2">
      ${sopHtml('basah', { compact: true })}
      ${sopHtml('kering', { compact: true })}
    </div>
  </div></div>`;
}

export async function mount(root, ctx) {
  if (ctx.tab === 'donor') {
    root.innerHTML = donorForm();
    initWizard(root);
  } else {
    root.innerHTML = await donorListings();
  }
  bindForms(root, ctx.rerender);
}
