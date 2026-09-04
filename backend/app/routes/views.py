"""Static views + health. No auth (pages do their own login)."""
from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter()
FRONTEND_DIR = Path(__file__).resolve().parents[3] / "frontend"


def _page(name: str):
    f = FRONTEND_DIR / name
    return FileResponse(str(f)) if f.exists() else {"detail": f"{name} missing"}


@router.get("/api/health")
def health():
    return {"ok": True}


@router.get("/")
def root():
    return _page("index.html")


@router.get("/shared.js")
def shared_js():
    return FileResponse(str(FRONTEND_DIR / "shared.js"), media_type="application/javascript")


@router.get("/manifest.json")
def manifest():
    return FileResponse(str(FRONTEND_DIR / "manifest.json"), media_type="application/json")


@router.get("/sw.js")
def service_worker():
    return FileResponse(str(FRONTEND_DIR / "sw.js"), media_type="application/javascript")


@router.get("/guard")
def guard_view():
    return _page("guard.html")


@router.get("/kiosk")
def kiosk_view():
    return _page("kiosk.html")


@router.get("/admin")
def admin_view():
    return _page("admin.html")
