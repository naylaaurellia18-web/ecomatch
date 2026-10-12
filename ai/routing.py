"""Mesin AI Routing EcoMatch — memilih kombinasi sampah makanan MBG -> TPS Pengolah -> kurir.

FR-04/FR-13. Konfigurasi dibaca dari config/routing.json (bobot jenis_cocok 0,35;
kapasitas 0,25; jarak 0,25; urgensi 0,15; radius 15 km; BATAS_SKOR 0,3).

Bentuk input mengikuti tabel di db/schema_ecomatch.sql:
  sampah: { id_sampah, lat, lng, berat_kg, waktu_produksi, status, kategori?, tingkat_pembusukan? }
  tps:    { id_tps, lat, lng, jenis_diterima[], kapasitas_kg_hari, sisa_kapasitas_kg?, aktif }
  kurir:  { id_kurir, lat, lng, kapasitas }
Posisi donor diambil dari kolom lat/lng objek sampah (join dari tabel user).
"""
from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Any

from klasifikasi import kategori_dari_teks, tingkat_pembusukan

EARTH_RADIUS_KM = 6371.0
CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "routing.json"


def load_config(path: Path | str = CONFIG_PATH) -> dict[str, Any]:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


CONFIG = load_config()
BOBOT = CONFIG["bobot"]
RADIUS_KM = float(CONFIG["radius_layanan_km"])
BATAS_SKOR = float(CONFIG["batas_skor"])
SKOR_PENUH_KM = float(CONFIG["jarak_skor_penuh_km"])


def haversine_km(lat1, lng1, lat2, lng2) -> float | None:
    vals = (lat1, lng1, lat2, lng2)
    if any(v is None for v in vals):
        return None
    try:
        vals = tuple(float(v) for v in vals)
    except (TypeError, ValueError):
        return None
    lat1, lng1, lat2, lng2 = vals
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


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


def parse_jenis_diterima(value) -> list[str]:
    if isinstance(value, list):
        return [str(v) for v in value]
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(v) for v in parsed]
        except json.JSONDecodeError:
            return [v.strip() for v in value.split(",") if v.strip()]
    return []


def skor_jenis_cocok(kategori: str, diterima: list[str]) -> float | None:
    """None = gugur (jenis tidak diterima TPS)."""
    if not diterima:
        return None
    if kategori in diterima:
        return float(CONFIG["skor_jenis_cocok"]["cocok"])
    if "lainnya" in diterima:
        return float(CONFIG["skor_jenis_cocok"]["sebagian"])
    return None


def skor_jarak(km: float | None) -> float:
    if km is None:
        return 0.0
    if km <= SKOR_PENUH_KM:
        return 1.0
    if km >= RADIUS_KM:
        return 0.0
    return 1.0 - (km - SKOR_PENUH_KM) / (RADIUS_KM - SKOR_PENUH_KM)


def skor_kapasitas(rasio: float) -> float:
    """rasio = kapasitas tersedia / berat sampah (aturan Tabel 2.3 dokumen arsitektur)."""
    if rasio <= 0:
        return 0.0
    for band in CONFIG["skor_kapasitas"]:
        if rasio >= float(band["min_rasio"]):
            return float(band["skor"])
    return 0.0


def skor_urgensi(tingkat: str) -> float:
    return float(CONFIG["skor_urgensi"].get(tingkat, 0.5))


def _kategori_sampah(s: dict) -> str:
    if s.get("kategori"):
        return str(s["kategori"])
    teks = " ".join(str(s.get(k) or "") for k in ("nama_sampah", "jenis_makanan", "deskripsi"))
    return kategori_dari_teks(teks)["kategori"]


def _tingkat_sampah(s: dict, now_ms: float) -> str:
    if s.get("tingkat_pembusukan"):
        return str(s["tingkat_pembusukan"])
    try:
        return tingkat_pembusukan(s.get("waktu_produksi"), now_ms=now_ms)
    except (TypeError, ValueError):
        return "segar"


def hitung_skor(s: dict, t: dict, k: dict, now_ms: float, config=None) -> dict:
    """Skor satu kombinasi (sampah, TPS, kurir). Mengembalikan {"gugur": alasan}
    bila kandidat gugur di filter aturan (status/jarak/jenis/kapasitas)."""
    cfg = config or CONFIG
    berat = float(s.get("berat_kg") or 0)
    if berat <= 0:
        return {"gugur": "berat"}
    if s.get("status", "tersedia") != "tersedia":
        return {"gugur": "status"}
    if not (t.get("aktif", True)):
        return {"gugur": "tps_nonaktif"}

    km = haversine_km(s.get("lat"), s.get("lng"), t.get("lat"), t.get("lng"))
    if km is None or km > float(cfg["radius_layanan_km"]):
        return {"gugur": "jarak"}

    kategori = _kategori_sampah(s)
    s_jenis = skor_jenis_cocok(kategori, parse_jenis_diterima(t.get("jenis_diterima")))
    if s_jenis is None:
        return {"gugur": "jenis"}

    sisa_tps = t.get("sisa_kapasitas_kg")
    if sisa_tps is None:
        sisa_tps = t.get("kapasitas_kg_hari") or 0
    sisa_tps = float(sisa_tps)
    kap_kurir = float(k.get("kapasitas") or 0)
    if sisa_tps <= 0 or kap_kurir <= 0 or berat > sisa_tps:
        return {"gugur": "kapasitas"}

    rasio = min(sisa_tps / berat, kap_kurir / berat)
    s_kap = skor_kapasitas(rasio)
    s_jar = skor_jarak(km)
    tingkat = _tingkat_sampah(s, now_ms)
    s_urg = skor_urgensi(tingkat)
    total = (
        float(cfg["bobot"]["jenis_cocok"]) * s_jenis
        + float(cfg["bobot"]["kapasitas"]) * s_kap
        + float(cfg["bobot"]["jarak"]) * s_jar
        + float(cfg["bobot"]["urgensi"]) * s_urg
    )
    return {
        "kategori": kategori,
        "tingkat_pembusukan": tingkat,
        "skor_jenis_cocok": round(s_jenis, 4),
        "skor_kapasitas": round(s_kap, 4),
        "skor_jarak": round(s_jar, 4),
        "skor_urgensi": round(s_urg, 4),
        "skor_matching": round(total, 4),
        "jarak_km": round(km, 2),
        "rasio_kapasitas": round(rasio, 3),
        "_sisa_tps": sisa_tps,
    }


def hitung_routing(
    sampah_list: list[dict],
    tps_list: list[dict],
    kurir_list: list[dict],
    now_ms: float | None = None,
    config=None,
) -> dict:
    """Greedy assignment: kandidat diurutkan skor tertinggi; satu sampah satu TPS,
    kapasitas TPS dipotong saat dipilih, satu kurir satu perjalanan per putaran."""
    cfg = config or CONFIG
    now = now_ms if now_ms is not None else time.time() * 1000
    radius = float(cfg["radius_layanan_km"])
    batas = float(cfg["batas_skor"])

    sisa_tps_map = {}
    for t in tps_list:
        sisa = t.get("sisa_kapasitas_kg")
        if sisa is None:
            sisa = t.get("kapasitas_kg_hari") or 0
        sisa_tps_map[t.get("id_tps") or t.get("id_user")] = float(sisa)

    kandidat: list[dict] = []
    gugur = {"status": 0, "jarak": 0, "jenis": 0, "kapasitas": 0, "skor": 0}

    for s in sampah_list:
        for t in tps_list:
            tid = t.get("id_tps") or t.get("id_user")
            t2 = dict(t)
            t2["sisa_kapasitas_kg"] = sisa_tps_map.get(tid, 0)
            for k in kurir_list:
                hasil = hitung_skor(s, t2, k, now, cfg)
                if "gugur" in hasil:
                    gugur[hasil["gugur"]] = gugur.get(hasil["gugur"], 0) + 1
                    continue
                if hasil["skor_matching"] < batas:
                    gugur["skor"] += 1
                    continue
                kandidat.append(
                    {
                        "id_sampah": s.get("id_sampah"),
                        "id_tps": tid,
                        "id_kurir": k.get("id_kurir", k.get("id_user")),
                        "skor_matching": hasil["skor_matching"],
                        "skor_jenis_cocok": hasil["skor_jenis_cocok"],
                        "skor_kapasitas": hasil["skor_kapasitas"],
                        "skor_jarak": hasil["skor_jarak"],
                        "skor_urgensi": hasil["skor_urgensi"],
                        "jarak_km": hasil["jarak_km"],
                        "kategori": hasil["kategori"],
                        "tingkat_pembusukan": hasil["tingkat_pembusukan"],
                    }
                )

    kandidat.sort(key=lambda c: (-c["skor_matching"], c["jarak_km"]))

    dipakai_sampah: set = set()
    dipakai_kurir: set = set()
    alokasi: list[dict] = []
    for c in kandidat:
        if c["id_sampah"] in dipakai_sampah:
            continue
        if c["id_kurir"] in dipakai_kurir:
            continue
        if sisa_tps_map.get(c["id_tps"], 0) <= 0:
            continue
        berat = 0.0
        for s in sampah_list:
            if s.get("id_sampah") == c["id_sampah"]:
                berat = float(s.get("berat_kg") or 0)
                break
        if berat > sisa_tps_map.get(c["id_tps"], 0):
            continue
        sisa_tps_map[c["id_tps"]] = sisa_tps_map.get(c["id_tps"], 0) - berat
        dipakai_sampah.add(c["id_sampah"])
        dipakai_kurir.add(c["id_kurir"])
        alokasi.append(c)

    rata2 = round(sum(a["skor_matching"] for a in alokasi) / len(alokasi), 4) if alokasi else 0.0
    return {
        "alokasi": alokasi,
        "jumlah": len(alokasi),
        "rata_rata_skor": rata2,
        "kandidat": len(kandidat),
        "kandidat_gugur": gugur,
        "sisa_kapasitas_tps": {str(k): round(v, 2) for k, v in sisa_tps_map.items()},
    }
