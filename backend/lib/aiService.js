/**
 * Jembatan ke layanan AI EcoMatch (Python/FastAPI, port 8001) — SKPL:
 * "Python (modul AI Routing)". Endpoint: POST /v1/routing dan POST /v1/classify.
 *
 * Bila layanan tidak terjangkau / timeout (default 1,8 dtk, NFR-02) / respons
 * rusak -> mengembalikan null dan pemanggil (backend/lib/routing.js,
 * backend/lib/klasifikasi.js) jatuh ke mesin JavaScript lokal (fallback).
 */

function defaultAiBase() {
  // Di Vercel: panggil fungsi Python serverless pada project yang sama (/api/ai).
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/ai`;
  }
  return 'http://127.0.0.1:8001';
}

const AI_BASE = (process.env.AI_MATCHING_URL || defaultAiBase()).replace(/\/$/, '');
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 1800);

const status = {
  mesin: 'javascript-fallback',
  aktif: false,
  endpoint: AI_BASE,
  terakhir_ok: null,
  durasi_ms: null,
  galat: null,
  endpoint_terakhir: null,
};

async function postJson(pathname, payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_BASE}${pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function catat(pathname, started, ok, galat) {
  status.endpoint_terakhir = pathname;
  if (ok) {
    status.mesin = 'python-fastapi';
    status.aktif = true;
    status.terakhir_ok = new Date().toISOString();
    status.durasi_ms = Date.now() - started;
    status.galat = null;
  } else {
    status.mesin = 'javascript-fallback';
    status.aktif = false;
    status.durasi_ms = null;
    status.galat = galat || 'tidak diketahui';
  }
}

/** Coba mesin Python untuk routing; null bila gagal (pemanggil pakai mesin JS). */
async function hitRouting(payload) {
  const started = Date.now();
  try {
    const data = await postJson('/v1/routing', payload);
    if (!data || !Array.isArray(data.alokasi)) throw new Error('respons tidak berisi alokasi[]');
    catat('/v1/routing', started, true);
    return data;
  } catch (e) {
    catat('/v1/routing', started, false, (e && e.message) || String(e));
    return null;
  }
}

/** Coba mesin Python untuk klasifikasi; null bila gagal (pemanggil pakai JS). */
async function hitClassify(payload) {
  const started = Date.now();
  try {
    const data = await postJson('/v1/classify', payload);
    if (!data || !data.kategori) throw new Error('respons klasifikasi tidak valid');
    return data;
  } catch (e) {
    status.galat = (e && e.message) || String(e);
    return null;
  } finally {
    void started;
  }
}

function engineStatus() {
  return { ...status };
}

module.exports = { hitRouting, hitClassify, engineStatus, AI_BASE, AI_TIMEOUT_MS };
