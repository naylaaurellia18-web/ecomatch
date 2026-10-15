"""Entrypoint Vercel Function (@vercel/python) untuk layanan AI EcoMatch.

Memuat aplikasi FastAPI dari ai/main.py. Berkas ai/** dan config/** disertakan
lewat includeFiles di vercel.json. Dilayani pada path /api/ai/*.

Backend Node (backend/lib/aiService.js) memanggil endpoint ini; bila tak
terjangkau/timeout, otomatis jatuh ke mesin JavaScript (fallback).
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ai"))
sys.path.insert(0, str(ROOT))

from main import app as _fastapi_app  # noqa: E402


class _StripPrefix:
    """Delegasikan ke app FastAPI dengan prefix /api/ai dihapus bila ada.

    Vercel dapat mengirim path lengkap (/api/ai/v1/routing) atau sudah tanpa
    prefix; kelas ini menangani keduanya agar route FastAPI /health dan /v1/*
    tetap cocok.
    """

    def __init__(self, app, prefixes):
        self.app = app
        self.prefixes = prefixes

    async def __call__(self, scope, receive, send):
        if scope.get("type") in ("http", "websocket"):
            path = scope.get("path", "")
            for prefix in self.prefixes:
                if path.startswith(prefix):
                    scope = dict(scope)
                    scope["root_path"] = scope.get("root_path", "") + prefix
                    scope["path"] = path[len(prefix):] or "/"
                    break
        await self.app(scope, receive, send)


app = _StripPrefix(_fastapi_app, ["/api/ai"])
