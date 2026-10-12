"""Layanan AI EcoMatch (Python/FastAPI) — AI Routing + klasifikasi sampah (FR-04, FR-06).

Jalankan:  python -m uvicorn main:app --host 127.0.0.1 --port 8001
Endpoint:
  GET  /health       -> cek kesehatan layanan
  POST /v1/routing   -> { sampah[], tps[], kurir[], now? } -> { alokasi[], jumlah, durasi_ms }
  POST /v1/classify  -> { teks?, nama_sampah?, waktu_produksi? } -> { kategori, tingkat_pembusukan, ... }
Backend Node memanggil /v1/routing lebih dulu; bila gagal/lewat batas waktu,
otomatis jatuh ke mesin JavaScript di backend/lib (fallback).
"""
from __future__ import annotations

import time

from fastapi import FastAPI
from pydantic import BaseModel, Field

from klasifikasi import klasifikasi
from routing import CONFIG as ROUTING_CONFIG
from routing import hitung_routing

app = FastAPI(
    title="EcoMatch — Modul AI Routing",
    description=(
        "Pemilihan TPS Pengolah + kurir untuk sampah makanan MBG dengan skor "
        "multi-kriteria (jenis_cocok 0,35; kapasitas 0,25; jarak 0,25; urgensi 0,15) "
        "plus klasifikasi rule-based — konfigurasi di config/routing.json"
    ),
    version="2.0.0",
)


class RoutingRequest(BaseModel):
    sampah: list[dict] = Field(default_factory=list)
    tps: list[dict] = Field(default_factory=list)
    kurir: list[dict] = Field(default_factory=list)
    now: float | None = None


class ClassifyRequest(BaseModel):
    teks: str | None = None
    nama_sampah: str | None = None
    deskripsi: str | None = None
    jenis_makanan: str | None = None
    waktu_produksi: str | None = None


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "mesin": "python-fastapi",
        "modul": "ai.routing",
        "konfigurasi": "config/routing.json",
        "bobot": ROUTING_CONFIG["bobot"],
        "radius_layanan_km": ROUTING_CONFIG["radius_layanan_km"],
        "batas_skor": ROUTING_CONFIG["batas_skor"],
    }


@app.post("/v1/routing")
def routing(req: RoutingRequest) -> dict:
    started = time.perf_counter()
    now_ms = req.now if req.now is not None else time.time() * 1000
    hasil = hitung_routing(req.sampah, req.tps, req.kurir, now_ms=now_ms)
    durasi_ms = (time.perf_counter() - started) * 1000
    return {
        "mesin": "python-fastapi",
        "jumlah": hasil["jumlah"],
        "durasi_ms": round(durasi_ms, 2),
        "rata_rata_skor": hasil["rata_rata_skor"],
        "kandidat": hasil["kandidat"],
        "kandidat_gugur": hasil["kandidat_gugur"],
        "kandidat_input": {
            "sampah": len(req.sampah),
            "tps": len(req.tps),
            "kurir": len(req.kurir),
        },
        "alokasi": hasil["alokasi"],
    }


@app.post("/v1/classify")
def classify(req: ClassifyRequest) -> dict:
    started = time.perf_counter()
    hasil = klasifikasi(req.model_dump(exclude_none=True))
    durasi_ms = (time.perf_counter() - started) * 1000
    hasil["durasi_ms"] = round(durasi_ms, 3)
    return hasil
