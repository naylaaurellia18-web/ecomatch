"""Klasifikasi rule-based sampah makanan EcoMatch (FR-06, FR-07).

Tidak ada model terlatih: kategori ditentukan kata kunci dari config/routing.json
(config.klasifikasi.kategori), tingkat pembusukan dari umur sejak waktu_produksi.
keyakinan = n/(n+1) dengan n = jumlah kata kunci yang cocok; bila di bawah
ambang_keyakinan sistem menandai perlu_verifikasi untuk admin.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "routing.json"


def load_config(path: Path | str = CONFIG_PATH) -> dict[str, Any]:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


CONFIG = load_config()


def _normalisasi(teks: str) -> str:
    return " ".join(str(teks or "").lower().split())


def kategori_dari_teks(teks: str, config=None) -> dict:
    cfg = (config or CONFIG)["klasifikasi"]
    teks_n = _normalisasi(teks)
    if not teks_n:
        return {
            "kategori": "lainnya",
            "skor_keyakinan": 0.0,
            "metode": "rule_based",
            "alasan": "teks kosong",
            "perlu_verifikasi": True,
        }

    terbaik_kategori = "lainnya"
    terbaik_keyakinan = 0.0
    terbaik_kata: list[str] = []
    for kategori, daftar in cfg["kategori"].items():
        cocok = [k for k in daftar if k and _normalisasi(k) in teks_n]
        n = len(cocok)
        if n == 0:
            continue
        keyakinan = n / (n + 1)
        if keyakinan > terbaik_keyakinan:
            terbaik_kategori = kategori
            terbaik_keyakinan = keyakinan
            terbaik_kata = cocok

    ambang = float(cfg["ambang_keyakinan"])
    if terbaik_keyakinan == 0:
        return {
            "kategori": "lainnya",
            "skor_keyakinan": 0.0,
            "metode": "rule_based",
            "alasan": "tidak ada kata kunci yang cocok",
            "perlu_verifikasi": True,
        }
    return {
        "kategori": terbaik_kategori,
        "skor_keyakinan": round(terbaik_keyakinan, 3),
        "metode": "rule_based",
        "alasan": "kata kunci cocok: " + ", ".join(terbaik_kata),
        "perlu_verifikasi": terbaik_keyakinan < ambang,
    }


def _parse_waktu_ms(value) -> float:
    if isinstance(value, (int, float)):
        v = float(value)
        return v * 1000 if v < 1e12 else v
    if not isinstance(value, str) or not value:
        raise ValueError("waktu kosong")
    from datetime import datetime, timezone

    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp() * 1000


def tingkat_pembusukan(waktu_produksi, now_ms: float | None = None, config=None) -> str:
    """Umur (jam sejak waktu_produksi) -> segar | sedang | busuk (config.pembusukan)."""
    cfg = (config or CONFIG)["pembusukan"]
    now = now_ms if now_ms is not None else time.time() * 1000
    umur_jam = (now - _parse_waktu_ms(waktu_produksi)) / 3_600_000
    if umur_jam <= float(cfg["segar_maks_jam"]):
        return "segar"
    if umur_jam <= float(cfg["sedang_maks_jam"]):
        return "sedang"
    return "busuk"


def klasifikasi(payload: dict, now_ms: float | None = None, config=None) -> dict:
    """Gabungan klasifikasi: teks -> kategori; waktu_produksi -> tingkat pembusukan."""
    cfg = config or CONFIG
    teks = payload.get("teks") or " ".join(
        str(payload.get(k) or "") for k in ("nama_sampah", "nama_makanan", "deskripsi", "jenis_makanan")
    )
    hasil = kategori_dari_teks(teks, cfg)
    now = now_ms if now_ms is not None else time.time() * 1000
    try:
        hasil["tingkat_pembusukan"] = tingkat_pembusukan(payload.get("waktu_produksi"), now, cfg)
    except (TypeError, ValueError):
        hasil["tingkat_pembusukan"] = None
        hasil["perlu_verifikasi"] = True
    hasil["umur_jam"] = None
    if payload.get("waktu_produksi"):
        try:
            hasil["umur_jam"] = round((now - _parse_waktu_ms(payload["waktu_produksi"])) / 3_600_000, 2)
        except (TypeError, ValueError):
            pass
    return hasil
