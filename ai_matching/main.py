"""Layanan AI Matching (Python/FastAPI) — sesuai SKPL: 'Bahasa Pemrograman JavaScript/TypeScript,
Python (modul AI Matching)'.

Jalankan:  python -m uvicorn main:app --host 127.0.0.1 --port 8001
Endpoint:
  GET  /health      -> cek kesehatan layanan
  POST /v1/matching -> { listings, needs, couriers, now } -> { matches, jumlah, durasi_ms }
Backend Node memanggil endpoint ini lebih dulu; bila gagal/lewat batas waktu,
otomatis jatuh ke mesin JavaScript di server/lib/matching.js (fallback).
"""
from __future__ import annotations

import time

from fastapi import FastAPI
from pydantic import BaseModel, Field

from matching import compute_matches

app = FastAPI(
    title="Food Rescue AI — Modul AI Matching",
    description="Skoring & seleksi triplet (donor, penerima, kurir) dengan bobot dari config/matching.json",
    version="1.0.0",
)


class MatchRequest(BaseModel):
    listings: list[dict] = Field(default_factory=list)
    needs: list[dict] = Field(default_factory=list)
    couriers: list[dict] = Field(default_factory=list)
    now: float | None = None


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "mesin": "python-fastapi", "modul": "ai_matching.matching"}


@app.post("/v1/matching")
def matching(req: MatchRequest) -> dict:
    started = time.perf_counter()
    now_ms = req.now if req.now is not None else time.time() * 1000
    matches = compute_matches(req.listings, req.needs, req.couriers, now_ms)
    durasi_ms = (time.perf_counter() - started) * 1000
    return {
        "mesin": "python-fastapi",
        "jumlah": len(matches),
        "durasi_ms": round(durasi_ms, 2),
        "kandidat": {
            "makanan": len(req.listings),
            "kebutuhan": len(req.needs),
            "kurir": len(req.couriers),
        },
        "matches": matches,
    }
