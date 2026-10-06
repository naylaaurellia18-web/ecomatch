/**
 * Jembatan ke modul AI Matching Python (FastAPI) — SKPL: "Python (modul AI Matching)".
 * Bila layanan tidak terjangkau / timeout / respons rusak → kembalikan null,
 * pemanggil (server/lib/matching.js) jatuh ke mesin JavaScript lokal (fallback).
 */

const AI_BASE = (process.env.AI_MATCHING_URL || 'http://127.0.0.1:8001').replace(/\/$/, '');
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 1800);

const status = {
  mesin: 'javascript-fallback',
  aktif: false,
  endpoint: AI_BASE,
  terakhir_ok: null,
  durasi_ms: null,
  galat: null,
};

async function hitPython(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_BASE}/v1/matching`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.matches)) throw new Error('respons tidak berisi matches[]');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Coba mesin Python; null bila gagal (pemanggil memakai mesin JS).
 */
async function computeWithPython({ listings, needs, couriers, now = Date.now() }) {
  try {
    const started = Date.now();
    const data = await hitPython({ listings, needs, couriers, now });
    status.mesin = 'python-fastapi';
    status.aktif = true;
    status.terakhir_ok = new Date().toISOString();
    status.durasi_ms = Date.now() - started;
    status.galat = null;
    return data;
  } catch (e) {
    status.mesin = 'javascript-fallback';
    status.aktif = false;
    status.durasi_ms = null;
    status.galat = (e && e.message) || String(e);
    return null;
  }
}

function engineStatus() {
  return { ...status };
}

module.exports = { computeWithPython, engineStatus, AI_BASE };
