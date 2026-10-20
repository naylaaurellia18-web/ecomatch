import { store } from '../core/store.js';
import { icon, esc, pageHead, ROLE_LABEL, statusTag } from '../core/ui.js';
import { bindForms } from '../core/forms.js';

function akunView() {
  const u = store.user || {};
  return `${pageHead('Keamanan Akun', 'Ubah kata sandi akun Anda — kata sandi lama diverifikasi lebih dulu')}
  <div class="section"><div class="split-2">
    <div class="card card-pad-lg">
      <div class="card-head"><div><h2>Ganti kata sandi</h2></div></div>
      <form data-action="1" data-endpoint="/api/auth/password" class="stack stack-4">
        <div class="field">
          <label class="label" for="pwLama">Kata sandi saat ini<span class="req">*</span></label>
          <input class="input" id="pwLama" name="password_lama" type="password" required autocomplete="current-password" />
        </div>
        <div class="grid grid-2">
          <div class="field">
            <label class="label" for="pwBaru">Kata sandi baru<span class="req">*</span></label>
            <input class="input" id="pwBaru" name="password_baru" type="password" minlength="6" required autocomplete="new-password" placeholder="minimal 6 karakter" />
          </div>
          <div class="field">
            <label class="label" for="pwKonfirmasi">Ulangi kata sandi baru<span class="req">*</span></label>
            <input class="input" id="pwKonfirmasi" name="konfirmasi_sandi" type="password" minlength="6" required autocomplete="new-password" placeholder="ulangi kata sandi baru" />
          </div>
        </div>
        <div class="row">
          <button class="btn btn-primary" type="submit">${icon('key', 15)} Simpan kata sandi</button>
        </div>
      </form>
    </div>

    <div class="card">
      <div class="card-head"><div><h2>Info akun</h2></div></div>
      <div class="stack stack-3">
        <div class="row" style="gap:12px;align-items:center">
          <span class="avatar" style="width:46px;height:46px;font-size:15px">${esc(String(u.nama || u.email || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase())}</span>
          <div class="grow">
            <div style="font-weight:700">${esc(u.nama || '—')}</div>
            <div class="t-sm muted">${esc(u.email || '')}</div>
          </div>
        </div>
        <div class="row row-2 row-wrap">
          ${statusTag(u.role || '')}
          ${statusTag(u.status || '')}
        </div>
        <div class="t-sm muted">Peran: <b>${ROLE_LABEL[u.role] || u.role || '—'}</b>${u.nama_lembaga ? ` · ${esc(u.nama_lembaga)}` : ''}</div>
        <div class="divider"></div>
        <div class="t-xs muted">Masuk sebagai <b>${esc(u.nama || u.email || '')}</b> — ${esc(u.email || '')}</div>
      </div>
    </div>
  </div></div>`;
}

export async function mount(root, ctx) {
  root.innerHTML = akunView();
  bindForms(root, ctx.rerender);
}
