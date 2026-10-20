/* Helper fetch — kontrak sama persis dengan versi lama:
   - Authorization: Bearer <token>
   - body object -> JSON otomatis, FormData dilewatkan apa adanya
   - error server dibaca dari field `error`
*/
import { store } from './store.js';

export const API = '';

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (store.token) headers.Authorization = `Bearer ${store.token}`;

  let body = opts.body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const hadToken = Boolean(store.token);
  const res = await fetch(API + path, { ...opts, headers, body });
  const data = await res.json().catch(() => ({}));

  // Sesi kedaluwarsa/ditolak: minta shell untuk kembali ke halaman masuk.
  if (res.status === 401 && hadToken) {
    store.clear();
    window.dispatchEvent(new CustomEvent('ecomatch:unauthorized'));
  }

  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const getJSON = (path) => api(path);
export const postJSON = (path, body, opts = {}) =>
  api(path, { ...opts, method: 'POST', body });
export const patchJSON = (path, body) =>
  api(path, { method: 'PATCH', body });
export const delJSON = (path) => api(path, { method: 'DELETE' });
