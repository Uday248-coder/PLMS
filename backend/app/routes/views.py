"""Static views + health. Serves the React SPA from frontend/dist/ (local monolith mode)."""
from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter()
FRONTEND_DIR = Path(__file__).resolve().parents[3] / "frontend"
DIST_DIR = FRONTEND_DIR / "dist"
ASSETS_DIR = DIST_DIR / "assets"

_index = DIST_DIR / "index.html"


def _spa():
    return FileResponse(str(_index)) if _index.exists() else {"detail": "frontend not built"}


@router.get("/api/health")
def health():
    return {"ok": True}


@router.get("/")
def root():
    return _spa()


@router.get("/guard")
def guard_view():
    return _spa()


@router.get("/kiosk")
def kiosk_view():
    return _spa()


@router.get("/field")
def field_view():
    return _spa()


@router.get("/admin")
def admin_view():
    return _spa()


# Mount /assets/ only if the dist build exists.
# This must be registered on the app (not the router) so we do it here
# at import time — the main.py include_router call picks it up.
# NOTE: static mount is added in main.py after all routers.
