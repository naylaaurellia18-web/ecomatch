/* Halaman Masuk / Daftar / Lupa sandi — split screen, validasi inline,
   tombol lihat-sandi, kartu pilihan peran. Endpoint sama dengan versi lama. */
import { store, isLocalHost } from '../core/store.js';
import { api } from '../core/api.js';
import { icon, esc, toast } from '../core/ui.js';
import { locationSelectHtml, bindLocationSelects } from '../core/forms.js';
import { applyTheme, getTheme, bindTheme } from '../core/theme.js';

function eyeBtn() {
  return `<button class="input-eye" type="button" data-eye aria-label="Tampilkan kata sandi">${icon('eye', 17)}</button>`;
}

function passwordField(id, label, placeholder = '••••••••', autocomplete = 'current-password', required = true, name = 'password') {
  return `
    <div class="field">
      <label class="label" for="${id}">${label}${required ? '<span class="req">*</span>' : ''}</label>
      <div class="input-wrap">
        <input class="input" id="${id}" name="${name}" type="password" placeholder="${placeholder}"
          autocomplete="${autocomplete}" ${required ? 'required' : ''} minlength="6" />
        ${eyeBtn()}
      </div>
      <div class="err-msg" data-err-for="${id}" hidden></div>
    </div>`;
}

export function renderAuth() {
  const demoNote = isLocalHost()
    ? `<div class="demo-note">Coba langsung — Admin: <b>admin@ecomatch.id</b> / <b>admin123</b></div>`
    : '';

  return `
  <div class="auth">
    <!-- Kolom kiri: hero gradient -->
    <section class="auth-hero">
      <div class="hero-tag">${icon('leaf', 18)} EcoMatch</div>
      <div class="stack stack-6">
        <div>
          <div class="eyebrow" style="color:#a5d6a7">AI Routing Sampah Makanan MBG</div>
          <h1>Sisa makanan MBG bukan akhir — olah kembali di TPS</h1>
          <p style="color:rgba(255,255,255,.85);max-width:46ch">
            EcoMatch mengalihkan sampah makanan MBG ke TPS pengolah terdekat dengan routing AI &amp; peta GIS.
          </p>
        </div>
        <ul class="auth-points">
          <li><span class="tick">${icon('check', 12)}</span> Catat sampah makanan hanya dengan foto</li>
          <li><span class="tick">${icon('check', 12)}</span> Klasifikasi &amp; routing AI otomatis</li>
          <li><span class="tick">${icon('check', 12)}</span> Pantau penjemputan di peta</li>
          <li><span class="tick">${icon('check', 12)}</span> Serah terima terverifikasi via OTP</li>
        </ul>
      </div>
      <div class="t-sm" style="color:rgba(255,255,255,.7)">Mengalihkan sampah makanan MBG dengan aman dan terlacak</div>
    </section>

    <!-- Kolom kanan: kartu form -->
    <section class="auth-panel">
      <div class="auth-card">
        <button class="btn btn-icon" type="button" data-theme-toggle
          style="position:absolute;top:16px;right:16px" title="Ganti tema" aria-label="Ganti tema terang/gelap"></button>

        <div class="eyebrow">AI Routing Sampah Makanan MBG</div>
        <h1 style="font-size:28px;margin:6px 0 4px">Masuk ke akun Anda</h1>
        <p class="muted t-sm" id="authSub">Belum punya akun? Daftar gratis — cuma 4 langkah singkat.</p>

        <div class="auth-tabs" style="margin-top:20px" role="tablist">
          <button class="auth-tab active" id="tabLogin" type="button" role="tab" aria-selected="true">Masuk</button>
          <button class="auth-tab" id="tabReg" type="button" role="tab" aria-selected="false">Daftar</button>
        </div>

        <!-- MASUK -->
        <form id="formLogin" class="stack stack-4" novalidate>
          <div class="field">
            <label class="label" for="loginEmail">Email<span class="req">*</span></label>
            <input class="input" id="loginEmail" name="email" type="email" required autocomplete="email"
              placeholder="nama@contoh.id" />
            <div class="err-msg" data-err-for="loginEmail" hidden></div>
          </div>
          ${passwordField('loginPassword', 'Kata Sandi')}
          <div class="row row-between">
            <button class="btn btn-primary btn-block" type="submit" style="flex:1">
              ${icon('arrowRight', 15)} Masuk
            </button>
            <button class="link-btn" type="button" id="btnForgot" style="margin-left:12px">Lupa kata sandi?</button>
          </div>
          ${demoNote}
        </form>

        <!-- DAFTAR -->
        <form id="formReg" class="stack stack-4" hidden novalidate>
          <div class="field">
            <label class="label" for="regNama">Nama / Nama Organisasi<span class="req">*</span></label>
            <input class="input" id="regNama" name="nama" required placeholder="SPPG Dapur MBG Kota Madiun" />
            <div class="err-msg" data-err-for="regNama" hidden></div>
          </div>
          <div class="field">
            <label class="label" for="regEmail">Email<span class="req">*</span></label>
            <input class="input" id="regEmail" name="email" type="email" required autocomplete="email"
              placeholder="nama@contoh.id" />
            <div class="err-msg" data-err-for="regEmail" hidden></div>
          </div>
          ${passwordField('regPassword', 'Kata Sandi', 'minimal 6 karakter', 'new-password')}

          <div class="field">
            <span class="label">Saya mendaftar sebagai<span class="req">*</span></span>
            <div class="role-cards">
              <label class="role-card">
                <input type="radio" name="role" value="donor_mbg" checked />
                ${icon('package', 20)}
                <span><b>Donor MBG</b><small>Punya sisa makanan MBG (dapur/SPPG/hotel/resto)</small></span>
              </label>
              <label class="role-card">
                <input type="radio" name="role" value="tps_pengolah" />
                ${icon('recycle', 20)}
                <span><b>TPS Pengolah</b><small>Mengelola TPS kompos/bank sampah/maggot</small></span>
              </label>
              <label class="role-card">
                <input type="radio" name="role" value="kurir" />
                ${icon('truck', 20)}
                <span><b>Kurir</b><small>Ingin jadi relawan penjemput sampah</small></span>
              </label>
            </div>
          </div>

          <details class="stack stack-3" style="border:1px solid var(--line);border-radius:14px;padding:12px 14px">
            <summary style="cursor:pointer;font-weight:600;font-size:14px">
              Informasi tambahan <span class="muted">(boleh dilewati)</span>
            </summary>
            <div class="stack stack-3" style="padding-top:10px">
              <div class="field">
                <label class="label" for="regTelepon">Telepon</label>
                <input class="input" id="regTelepon" name="telepon" placeholder="08xxx" inputmode="tel" />
              </div>
              <div class="field">
                <label class="label" for="regAlamat">Alamat</label>
                <input class="input" id="regAlamat" name="alamat" placeholder="Jl. …, Madiun" />
              </div>
              ${locationSelectHtml({ label: 'Lokasi domisili' })}
              <div class="field" id="courierField" hidden>
                <label class="label" for="regKapasitas">Kapasitas Logistik (porsi)</label>
                <input class="input" id="regKapasitas" name="kapasitas" type="number" min="1" placeholder="50" />
              </div>
              <div class="field" id="orgField">
                <label class="label" for="regLembaga">Nama Organisasi / SPPG</label>
                <input class="input" id="regLembaga" name="nama_lembaga" placeholder="SPPG / TPS / Komunitas" />
              </div>
            </div>
          </details>

          <button class="btn btn-primary btn-block" type="submit">Daftar sekarang</button>
          <p class="t-xs muted">Akun perlu diverifikasi admin dulu — akun TPS juga perlu melengkapi profil TPS setelah disetujui.</p>
        </form>

        <!-- LUPA SANDI -->
        <form id="formForgot" class="stack stack-4" hidden novalidate>
          <div class="field">
            <label class="label" for="forgotEmail">Email terdaftar<span class="req">*</span></label>
            <input class="input" id="forgotEmail" name="email" type="email" required placeholder="nama@contoh.id" />
          </div>
          <button class="btn btn-primary btn-block" type="submit">Kirim kode reset</button>
          <p class="t-xs muted">Kode 6 digit berlaku 15 menit, dikirim ke email Anda (lihat Pesan Terkirim bila tanpa SMTP).</p>
          <button class="link-btn" type="button" id="btnBackLogin">${icon('arrowLeft', 13)} Kembali ke masuk</button>
        </form>

        <!-- RESET SANDI -->
        <form id="formReset" class="stack stack-4" hidden novalidate>
          <div class="field">
            <label class="label" for="resetEmail">Email</label>
            <input class="input" id="resetEmail" name="email" type="email" required />
          </div>
          <div class="field">
            <label class="label" for="resetKode">Kode reset (6 digit)</label>
            <input class="input" id="resetKode" name="kode" inputmode="numeric" pattern="[0-9]{6}" maxlength="6"
              required placeholder="123456" autocomplete="one-time-code" />
          </div>
          ${passwordField('resetPassword', 'Kata sandi baru', 'minimal 6 karakter', 'new-password')}
          <button class="btn btn-primary btn-block" type="submit">Simpan sandi baru</button>
          <button class="link-btn" type="button" id="btnBackLogin2">${icon('arrowLeft', 13)} Kembali ke masuk</button>
        </form>

        <!-- SUKSES DAFTAR -->
        <div id="regSuccess" class="stack stack-3 text-center" hidden style="padding:12px 0">
          <div class="kpi-icon" style="margin:0 auto;width:56px;height:56px">${icon('check', 26)}</div>
          <h3>Pendaftaran berhasil</h3>
          <p class="t-sm muted" id="regSuccessMsg"></p>
          <button class="btn btn-primary btn-block" type="button" id="btnBackLogin3">Kembali ke masuk</button>
        </div>

        <div class="auth-legal">
          <a href="/privacy.html">Kebijakan Privasi</a>
          <span> · </span>
          <a href="/syarat.html">Syarat &amp; Ketentuan</a>
        </div>
      </div>
    </section>
  </div>`;
}

/** Validasi inline: tampilkan pesan + getarkan input bila salah. */
function setErr(input, msg) {
  const box = document.querySelector(`[data-err-for="${input.id}"]`);
  if (!box) return;
  if (msg) {
    box.textContent = msg;
    box.hidden = false;
    input.classList.add('input-invalid', 'shake');
    setTimeout(() => input.classList.remove('shake'), 350);
  } else {
    box.hidden = true;
    input.classList.remove('input-invalid');
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function bindAuth(onAuthed) {
  const $ = (id) => document.getElementById(id);
  const panels = ['formLogin', 'formReg', 'formForgot', 'formReset', 'regSuccess'];

  function show(name) {
    panels.forEach((p) => { const el = $(p); if (el) el.hidden = p !== name; });
    const isAuthPanel = name === 'formLogin' || name === 'formReg';
    document.querySelector('.auth-tabs').hidden = !isAuthPanel;
    $('tabLogin').classList.toggle('active', name === 'formLogin');
    $('tabReg').classList.toggle('active', name === 'formReg');
    $('tabLogin').setAttribute('aria-selected', name === 'formLogin');
    $('tabReg').setAttribute('aria-selected', name === 'formReg');
    $('authSub').textContent =
      name === 'formReg'
        ? 'Gratis — pilih peran, isi 4 langkah, langsung aktif.'
        : 'Belum punya akun? Daftar gratis — cuma 4 langkah singkat.';
  }

  $('tabLogin').onclick = () => show('formLogin');
  $('tabReg').onclick = () => show('formReg');
  $('btnForgot') && ($('btnForgot').onclick = () => show('formForgot'));
  $('btnBackLogin') && ($('btnBackLogin').onclick = () => show('formLogin'));
  $('btnBackLogin2') && ($('btnBackLogin2').onclick = () => show('formLogin'));
  $('btnBackLogin3') && ($('btnBackLogin3').onclick = () => show('formLogin'));

  // Tampilkan/sembunyikan kata sandi
  document.querySelectorAll('[data-eye]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      const show_ = input.type === 'password';
      input.type = show_ ? 'text' : 'password';
      btn.innerHTML = icon(show_ ? 'eyeOff' : 'eye', 17);
      btn.setAttribute('aria-label', show_ ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
    });
  });

  // Toggle field khusus peran saat daftar
  document.querySelectorAll('input[name="role"]').forEach((r) => {
    r.addEventListener('change', () => {
      const isKurir = r.value === 'kurir' && r.checked;
      $('courierField').hidden = !isKurir;
      $('orgField').hidden = isKurir;
    });
  });

  bindLocationSelects(document);

  /* ---- MASUK ---- */
  $('formLogin').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const email = f.email;
    const pass = f.password;
    let ok = true;
    if (!EMAIL_RE.test(email.value.trim())) { setErr(email, 'Format email tidak valid'); ok = false; } else setErr(email, '');
    if (!pass.value) { setErr(pass, 'Kata sandi wajib diisi'); ok = false; } else setErr(pass, '');
    if (!ok) return;

    const btn = f.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: { email: email.value.trim(), password: pass.value },
      });
      if (res.user && res.user.status === 'menunggu') {
        toast('Akun belum diverifikasi admin', 'error');
      } else {
        toast(`Selamat datang, ${res.user && res.user.nama}`);
      }
      store.set(res.token, res.user);
      onAuthed();
    } catch (e) {
      toast(e.message, 'error');
      pass.classList.add('input-invalid', 'shake');
      setTimeout(() => pass.classList.remove('shake'), 350);
    } finally {
      btn.disabled = false;
    }
  });

  /* ---- DAFTAR ---- */
  $('formReg').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const nama = f.nama, email = f.email, pass = f.password;
    let ok = true;
    if (nama.value.trim().length < 2) { setErr(nama, 'Nama minimal 2 karakter'); ok = false; } else setErr(nama, '');
    if (!EMAIL_RE.test(email.value.trim())) { setErr(email, 'Format email tidak valid'); ok = false; } else setErr(email, '');
    if (pass.value.length < 6) { setErr(pass, 'Kata sandi minimal 6 karakter'); ok = false; } else setErr(pass, '');
    if (!ok) return;

    const fd = new FormData(f);
    if (fd.has('location')) {
      if (!fd.get('lat')) fd.delete('lat');
      if (!fd.get('lng')) fd.delete('lng');
      fd.delete('location');
    }
    const body = {};
    fd.forEach((v, k) => { body[k] = v; });

    const btn = f.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await api('/api/auth/register', { method: 'POST', body });
      $('regSuccessMsg').textContent =
        `Kami mengirim konfirmasi untuk ${email.value.trim()} sebagai ${body.role}. Admin akan memverifikasi akun Anda.`;
      show('regSuccess');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  /* ---- LUPA SANDI ---- */
  $('formForgot').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = ev.target.email.value.trim();
    if (!EMAIL_RE.test(email)) { toast('Format email tidak valid', 'error'); return; }
    try {
      const res = await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      $('resetEmail').value = email;
      toast(res.message || 'Kode reset dikirim');
      show('formReset');
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  /* ---- RESET SANDI ---- */
  $('formReset').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    if (f.password.value.length < 6) { toast('Kata sandi minimal 6 karakter', 'error'); return; }
    try {
      const res = await api('/api/auth/reset-password', {
        method: 'POST',
        body: { email: f.email.value.trim(), kode: f.kode.value.trim(), password: f.password.value },
      });
      toast(res.message || 'Kata sandi berhasil diubah');
      f.reset();
      show('formLogin');
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  applyTheme(getTheme());
  bindTheme(document);
}
