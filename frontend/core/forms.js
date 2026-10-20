/* Penanganan form/tombol terdelegasi — kontrak persis seperti versi lama:
   - <form data-action data-endpoint [data-method] [data-multipart="1"]>
   - [data-post] / [data-patch] / [data-delete] (+ opsional data-confirm, data-body)
   Setelah sukses, callback `done()` dipanggil untuk render ulang.
*/
import { api } from './api.js';
import { toast } from './ui.js';
import { LOCATIONS } from './constants.js';

function formDataToObject(fd) {
  const body = {};
  fd.forEach((v, k) => {
    if (k in body) {
      body[k] = Array.isArray(body[k]) ? [...body[k], v] : [body[k], v];
    } else {
      body[k] = v;
    }
  });
  return body;
}
export { formDataToObject };

/** Field pilih lokasi (kota Madiun + GPS). */
export function locationSelectHtml(opts = {}) {
  const {
    label = 'Lokasi',
    required = false,
    hint = 'Pilih kecamatan/kota di sekitar Madiun, atau gunakan GPS di perangkat Anda',
  } = opts;
  return `
  <div class="field">
    <label class="label" for="loc-${label.replace(/\W/g, '')}">${label}${required ? '' : ' <span class="hint">(opsional)</span>'}</label>
    <select class="select" name="location" id="loc-${label.replace(/\W/g, '')}" data-loc-select ${required ? 'required' : ''}>
      <option value="">Pilih lokasi…</option>
      ${LOCATIONS.map((l) => `<option value="${l.lat},${l.lng}">${l.label}</option>`).join('')}
      <option value="gps">Gunakan lokasi saya (GPS)</option>
    </select>
    <input type="hidden" name="lat" data-loc-lat value="" />
    <input type="hidden" name="lng" data-loc-lng value="" />
    <div class="err-msg muted t-xs" style="color:var(--muted);font-weight:500">${hint}</div>
  </div>`;
}

export function bindLocationSelects(root) {
  (root || document).querySelectorAll('[data-loc-select]').forEach((sel) => {
    if (sel._bound) return;
    sel._bound = true;
    sel.addEventListener('change', () => {
      const form = sel.closest('form');
      if (!form) return;
      const latIn = form.querySelector('[data-loc-lat]');
      const lngIn = form.querySelector('[data-loc-lng]');
      if (!latIn || !lngIn) return;
      if (sel.value === 'gps') {
        if (!navigator.geolocation) {
          toast('GPS tidak didukung di peramban ini', 'error');
          sel.value = '';
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            latIn.value = pos.coords.latitude.toFixed(6);
            lngIn.value = pos.coords.longitude.toFixed(6);
            toast('Lokasi perangkat terisi');
          },
          () => {
            toast('Izin lokasi ditolak — pilih kota manual', 'error');
            sel.value = '';
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      } else if (sel.value) {
        const [lat, lng] = sel.value.split(',');
        latIn.value = lat;
        lngIn.value = lng;
      } else {
        latIn.value = '';
        lngIn.value = '';
      }
    });
  });
}

/** Pasang seluruh handler interaksi dalam satu root. */
export function bindForms(root, done) {
  const el = root || document;
  const rerender = typeof done === 'function' ? done : () => {};

  bindLocationSelects(el);

  el.querySelectorAll('form[data-action]').forEach((f) => {
    if (f._bound) return;
    f._bound = true;
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(f);

      if (fd.has('konfirmasi_sandi')) {
        if (fd.get('konfirmasi_sandi') !== fd.get('password_baru')) {
          toast('Konfirmasi kata sandi baru tidak cocok', 'error');
          return;
        }
        fd.delete('konfirmasi_sandi');
      }
      if (fd.has('location')) {
        if (!fd.get('lat')) fd.delete('lat');
        if (!fd.get('lng')) fd.delete('lng');
        fd.delete('location');
      }

      const submitBtn = f.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        let res;
        if (f.dataset.multipart === '1') {
          res = await api(f.dataset.endpoint, { method: 'POST', body: fd });
        } else {
          const body = formDataToObject(fd);
          res = await api(f.dataset.endpoint, { method: f.dataset.method || 'POST', body });
        }
        let pesan = res.message || 'Berhasil';
        if (res.klasifikasi) {
          const k = res.klasifikasi;
          pesan += ` — klasifikasi: ${k.kategori}/${k.tingkat_pembusukan} (${Math.round(Number(k.skor_keyakinan || 0) * 100)}%)`;
        }
        toast(pesan);
        rerender();
      } catch (e) {
        toast(e.message, 'error');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  });

  el.querySelectorAll('[data-post]').forEach((btn) => {
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', async () => {
      if (btn.dataset.confirm && !confirm(btn.dataset.confirm)) return;
      btn.disabled = true;
      try {
        const body = btn.dataset.body ? JSON.parse(btn.dataset.body) : {};
        const res = await api(btn.dataset.post, { method: btn.dataset.method || 'POST', body });
        toast(res.message || 'Berhasil');
        rerender();
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
      }
    });
  });

  el.querySelectorAll('[data-patch]').forEach((btn) => {
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', async () => {
      try {
        const body = JSON.parse(btn.dataset.body || '{}');
        const res = await api(btn.dataset.patch, { method: 'PATCH', body });
        toast(res.message || 'Berhasil');
        rerender();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  });

  el.querySelectorAll('[data-delete]').forEach((btn) => {
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', async () => {
      const msg = btn.dataset.confirm || 'Hapus item ini?';
      if (!confirm(msg)) return;
      try {
        const res = await api(btn.dataset.delete, { method: 'DELETE' });
        toast(res.message || 'Dihapus');
        rerender();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  });
}
