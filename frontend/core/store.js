/* Status autentikasi — kunci localStorage disamakan dengan versi lama
   (ecomatch_token / ecomatch_user) supaya sesi yang sudah login tetap dikenali. */

const KEY_TOKEN = 'ecomatch_token';
const KEY_USER = 'ecomatch_user';

function readUser() {
  try {
    return JSON.parse(localStorage.getItem(KEY_USER) || 'null') || null;
  } catch {
    return null;
  }
}

let token = localStorage.getItem(KEY_TOKEN) || '';
let user = readUser();

export const store = {
  get token() { return token; },
  get user() { return user; },
  get isAuth() { return Boolean(token && user); },
  get role() { return (user && user.role) || ''; },
  get nama() { return (user && (user.nama || user.email)) || ''; },

  set(tokenVal, userObj) {
    token = tokenVal;
    user = userObj;
    try {
      localStorage.setItem(KEY_TOKEN, tokenVal);
      localStorage.setItem(KEY_USER, JSON.stringify(userObj));
    } catch (_) { /* private mode */ }
  },

  patch(partial) {
    user = { ...(user || {}), ...partial };
    try { localStorage.setItem(KEY_USER, JSON.stringify(user)); } catch (_) {}
    return user;
  },

  clear() {
    token = '';
    user = null;
    try {
      localStorage.removeItem(KEY_TOKEN);
      localStorage.removeItem(KEY_USER);
    } catch (_) {}
  },
};

export function isLocalHost() {
  return /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname);
}

/** Inisial avatar (maks 2 huruf) dari nama/email. */
export function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
