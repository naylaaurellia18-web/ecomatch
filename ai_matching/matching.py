"""Mesin AI Matching Food Rescue AI — port dari server/lib/matching.js (SKPL: modul AI Matching Python).

Bobot/batas diambil dari server/config/matching.json supaya identik dengan aturan backend.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

EARTH_RADIUS_KM = 6371.0
CONFIG_PATH = Path(__file__).resolve().parent.parent / "server" / "config" / "matching.json"


def load_config() -> dict[str, Any]:
    with open(CONFIG_PATH, encoding="utf-8") as fh:
        return json.load(fh)


CONFIG = load_config()
BOBOT = CONFIG["bobot"]
BATAS_JARAK_KM = CONFIG["batas_jarak_km"]
SKOR_MINIMUM = CONFIG["skor_minimum"]
SKOR_URGENSI = CONFIG["skor_urgensi"]


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


def expiry_score(listing: dict, now_ms: float) -> float:
    try:
        expiry = _parse_time(listing.get("expiry_time"))
    except (TypeError, ValueError):
        return 0.0
    hours_left = (expiry - now_ms) / 3_600_000
    if hours_left <= 0:
        return 0.0
    for band in CONFIG["skor_masa_simpan"]:
        maks = band.get("maks_jam")
        if maks is None or hours_left <= maks:
            return float(band["skor"])
    return 0.0


def distance_score(km: float | None) -> float:
    if km is None:
        return 0.0
    penuh = CONFIG["jarak_skor_penuh_km"]
    if km <= penuh:
        return 1.0
    if km >= BATAS_JARAK_KM:
        return 0.0
    return 1.0 - (km - penuh) / (BATAS_JARAK_KM - penuh)


def capacity_score(courier: dict, portions: int) -> float:
    kap = courier.get("kapasitas")
    if not kap or kap <= 0:
        return 0.0
    ratio = portions / kap
    for band in CONFIG["skor_kapasitas"]:
        maks = band.get("maks_rasio")
        if maks is None or ratio <= maks:
            return float(band["skor"])
    return 0.0


def score_triplet(listing: dict, need: dict, courier: dict, now_ms: float) -> dict:
    d = _donor_latlng(listing)
    r = _need_latlng(need)
    c = {"lat": courier.get("lat"), "lng": courier.get("lng")}
    leg1 = haversine_km(c["lat"], c["lng"], d["lat"], d["lng"])
    leg2 = haversine_km(d["lat"], d["lng"], r["lat"], r["lng"])
    km = leg1 + leg2 if leg1 is not None and leg2 is not None else None
    s_expiry = expiry_score(listing, now_ms)
    s_dist = distance_score(km)
    s_urgency = float(SKOR_URGENSI.get(need.get("urgensi"), 0.5))
    s_cap = capacity_score(courier, listing.get("jumlah_porsi") or 0)
    total = (
        BOBOT["masa_simpan"] * s_expiry
        + BOBOT["jarak"] * s_dist
        + BOBOT["urgensi"] * s_urgency
        + BOBOT["kapasitas"] * s_cap
    )
    return {
        "km": km,
        "s_expiry": s_expiry,
        "s_dist": s_dist,
        "s_urgency": s_urgency,
        "s_cap": s_cap,
        "total": round(total, 4),
    }


def compute_matches(listings: list[dict], needs: list[dict], couriers: list[dict], now_ms: float) -> list[dict]:
    candidates: list[dict] = []

    for listing in listings:
        if listing.get("status") != "tersedia":
            continue
        try:
            if _parse_time(listing.get("expiry_time")) <= now_ms:
                continue
        except (TypeError, ValueError):
            continue

        for need in needs:
            if need.get("status") != "terbuka":
                continue
            if (need.get("porsi_dibutuhkan") or 0) > (listing.get("jumlah_porsi") or 0) * CONFIG["rasio_porsi_maks"]:
                continue
            if need.get("id_penerima") == listing.get("id_donor"):
                continue

            for courier in couriers:
                s = score_triplet(listing, need, courier, now_ms)
                if s["km"] is None or s["km"] > BATAS_JARAK_KM:
                    continue
                if s["total"] < SKOR_MINIMUM:
                    continue
                candidates.append(
                    {
                        "id_makanan": listing.get("id_makanan"),
                        "id_kebutuhan": need.get("id_kebutuhan"),
                        "id_penerima": need.get("id_penerima"),
                        "id_kurir": courier.get("id_user"),
                        "skor_matching": s["total"],
                        "skor_masa_simpan": s["s_expiry"],
                        "skor_jarak": s["s_dist"],
                        "skor_urgensi": s["s_urgency"],
                        "skor_kapasitas": s["s_cap"],
                        "jarak_km": round(s["km"], 2),
                    }
                )

    candidates.sort(key=lambda c: c["skor_matching"], reverse=True)

    used_listings: set = set()
    used_needs: set = set()
    used_couriers: set = set()
    selected: list[dict] = []
    for c in candidates:
        if c["id_makanan"] in used_listings:
            continue
        if c["id_kebutuhan"] in used_needs:
            continue
        if c["id_kurir"] in used_couriers:
            continue
        used_listings.add(c["id_makanan"])
        used_needs.add(c["id_kebutuhan"])
        used_couriers.add(c["id_kurir"])
        selected.append(c)

    return selected


def _parse_time(value) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str) or not value:
        raise ValueError("kosong")
    iso = value.replace("Z", "+00:00")
    from datetime import datetime

    dt = datetime.fromisoformat(iso)
    if dt.tzinfo is None:
        from datetime import timezone

        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp() * 1000


def _donor_latlng(l: dict) -> dict:
    lat = l.get("lat") if l.get("lat") is not None else l.get("lat_donor")
    lng = l.get("lng") if l.get("lng") is not None else l.get("lng_donor")
    return {"lat": lat, "lng": lng}


def _need_latlng(n: dict) -> dict:
    lat = n.get("lat") if n.get("lat") is not None else n.get("lat_penerima")
    lng = n.get("lng") if n.get("lng") is not None else n.get("lng_penerima")
    return {"lat": lat, "lng": lng}
