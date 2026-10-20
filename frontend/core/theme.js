/* Tema terang/gelap — disimpan di ecomatch_theme (sama dengan versi lama). */
import { icon } from './ui.js';

const KEY = 'ecomatch_theme';

export function getTheme() {
  return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(KEY, theme); } catch (_) {}

  const isDark = theme === 'dark';
  const nextLabel = isDark ? 'Mode terang' : 'Mode gelap';

  // Tombol ikon kompak (topbar & kartu auth) — cukup ikon + aria-label.
  document.querySelectorAll('#themeToggle, [data-theme-toggle]').forEach((btn) => {
    btn.innerHTML = icon(isDark ? 'sun' : 'moon', 18);
    btn.title = nextLabel;
    btn.setAttribute('aria-label', `Aktifkan ${nextLabel.toLowerCase()}`);
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', isDark ? 'true' : 'false');
    btn.dataset.themeState = theme;
  });
}

export function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

/** Pasang handler toggle tema pada semua tombol [data-theme-toggle]. */
export function bindTheme(root = document) {
  root.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    if (btn._themeBound) return;
    btn._themeBound = true;
    btn.addEventListener('click', toggleTheme);
  });
}
