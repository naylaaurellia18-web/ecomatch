import { api } from '../core/api.js';
import { icon, esc, pageHead, fmtDate, statusTag, emptyHtml, flowStripHtml, flowStepsHtml, toast } from '../core/ui.js';
import { bindForms } from '../core/forms.js';

let countdownTimer = null;

function otpInputs(id, prefill) {
  return `<div class="otp-inputs" data-otp-group="${id}" role="group" aria-label="Kode OTP 6 digit">
    ${[0, 1, 2, 3, 4, 5]
      .map(
        (i) => `<input inputmode="numeric" maxlength="1" data-otp-slot="${i}" id="otp-${id}-${i}"
          aria-label="Digit ${i + 1}" autocomplete="one-time-code" value="${prefill ? prefill[i] || '' : ''}" />`
      )
      .join('')}
  </div>`;
}

function countdownText(expiredAt) {
  const diff = new Date(expiredAt).getTime() - Date.now();
  if (diff <= 0) return 'Kedaluwarsa';
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `Berlaku ${m}:${String(s).padStart(2, '0')} lagi`;
}

function waitingCard(m, otp) {
  const code = otp && otp.kode && !otp.digunakan_pada ? otp.kode : null;
  const expired = otp && otp.kedaluwarsa_pada && new Date(otp.kedaluwarsa_pada).getTime() < Date.now();
  const live = code && !expired;

  return `<div class="task" data-alokasi="${m.id_alokasi}">
    <div class="row row-between row-wrap" style="align-items:flex-start">
      <div class="grow">
        <div style="font-weight:700">${esc(m.nama_sampah)} — ${m.berat_kg} kg ${statusTag(m.kategori || m.jenis_makanan)}</div>
        <div class="t-sm muted">Dari ${esc(m.nama_donor)} · Kurir ${esc(m.nama_kurir)}</div>
      </div>
      ${statusTag(m.status)}
    </div>

    ${flowStepsHtml(m.status)}

    <div class="card-accent" style="border-radius:var(--r-md);padding:var(--sp-4);text-align:center">
      ${live
        ? `<div class="eyebrow">Kode OTP Anda</div>
           <div style="font-size:34px;font-weight:800;letter-spacing:.32em;margin:6px 0">${esc(code)}</div>
           <div class="t-sm"><span class="otp-countdown" data-expiry="${esc(otp.kedaluwarsa_pada)}">${countdownText(otp.kedaluwarsa_pada)}</span></div>`
        : `<div class="eyebrow">Kode OTP</div>
           <div class="t-sm muted" style="margin-top:6px">${otp ? (otp.digunakan_pada ? 'Sudah dipakai' : expired ? 'Kedaluwarsa — minta OTP ulang' : 'Belum dibuat — menunggu kurir mengunggah foto & menjemput') : 'Belum ada data OTP'}</div>`}
    </div>

    ${otpInputs(m.id_alokasi, live ? code : '')}

    <div class="row row-2 row-wrap" style="margin-top:var(--sp-3)">
      <button class="btn btn-primary btn-sm" type="button" data-verify="${m.id_alokasi}">${icon('check', 14)} Konfirmasi terima</button>
      <button class="btn btn-outline btn-sm" type="button" data-post="/api/deliveries/${m.id_alokasi}/resend-otp">Kirim ulang OTP</button>
    </div>
  </div>`;
}

async function otpView() {
  const rows = await api('/api/routing');
  const ready = rows.filter((m) => ['dijemput', 'terkirim'].includes(m.status));
  const withOtp = await Promise.all(
    ready.map(async (m) => {
      let otp = null;
      try { otp = await api(`/api/deliveries/${m.id_alokasi}/otp-status`); } catch (_) {}
      return { ...m, otpInfo: otp };
    })
  );

  return `${pageHead('Konfirmasi OTP', 'Masukkan kode 6 digit untuk konfirmasi serah terima sampah makanan')}
  ${flowStripHtml(['Kurir jemput sampah', 'Kurir antar ke TPS', 'OTP muncul di sini', 'Konfirmasi terima'])}
  <div class="section"><div class="card">
    <div class="card-head"><div><h2>Menunggu konfirmasi</h2></div></div>
    <div class="stack stack-4">
      ${withOtp.length === 0 ? emptyHtml('Belum ada kiriman menunggu konfirmasi OTP', 'Alur: kurir jemput → antar → OTP muncul di sini.') : withOtp.map((m) => waitingCard(m, m.otpInfo)).join('')}
    </div>
  </div></div>

  <div class="section"><div class="card">
    <div class="card-head"><div><h2>Riwayat kiriman</h2></div></div>
    ${
      rows.length === 0
        ? emptyHtml('Belum ada kiriman', '')
        : `<div class="table-wrap" style="border:none">
      <table class="table">
        <thead><tr><th>Sampah</th><th>Donor</th><th>Kurir</th><th>Status</th></tr></thead>
        <tbody>
        ${rows
          .map(
            (m) => `<tr>
          <td>${esc(m.nama_sampah)} <span class="muted">${m.berat_kg} kg</span></td>
          <td>${esc(m.nama_donor)}</td>
          <td>${esc(m.nama_kurir)}</td>
          <td>${statusTag(m.status)}</td>
        </tr>`
          )
          .join('')}
        </tbody>
      </table></div>`
    }
  </div></div>`;
}

function bindOtp(root, rerender) {
  root.querySelectorAll('[data-otp-group]').forEach((group) => {
    const slots = [...group.querySelectorAll('[data-otp-slot]')];
    slots.forEach((input, idx) => {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 1);
        if (input.value && idx < slots.length - 1) slots[idx + 1].focus();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && idx > 0) slots[idx - 1].focus();
        if (e.key === 'ArrowLeft' && idx > 0) slots[idx - 1].focus();
        if (e.key === 'ArrowRight' && idx < slots.length - 1) slots[idx + 1].focus();
      });
      input.addEventListener('paste', (e) => {
        const txt = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
        if (!txt) return;
        e.preventDefault();
        slots.forEach((s, i) => { s.value = txt[i] || ''; });
        slots[Math.min(txt.length, slots.length - 1)].focus();
      });
    });
  });

  root.querySelectorAll('[data-verify]').forEach((btn) => {
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', async () => {
      const id = btn.dataset.verify;
      const group = root.querySelector(`[data-otp-group="${id}"]`);
      const otp = group ? [...group.querySelectorAll('[data-otp-slot]')].map((s) => s.value).join('') : '';
      if (otp.length !== 6) { toast('Masukkan OTP 6 digit dulu', 'error'); return; }
      btn.disabled = true;
      try {
        const res = await api(`/api/deliveries/${id}/verify-otp`, { method: 'POST', body: { otp } });
        toast(res.message || 'Berhasil');
        rerender();
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
      }
    });
  });

  clearInterval(countdownTimer);
  const ticks = () => {
    root.querySelectorAll('.otp-countdown[data-expiry]').forEach((el) => {
      el.textContent = countdownText(el.dataset.expiry);
    });
  };
  countdownTimer = setInterval(ticks, 1000);
}

export async function mount(root, ctx) {
  root.innerHTML = await otpView();
  bindForms(root, ctx.rerender);
  bindOtp(root, ctx.rerender);
}

export function cleanup() {
  clearInterval(countdownTimer);
  countdownTimer = null;
}
