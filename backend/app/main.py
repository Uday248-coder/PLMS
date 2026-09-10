"""App factory: wiring only. Routes live in app/routes/, auth in deps.py, seed in seed.py."""
import asyncio
import logging
import logging.config
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.staticfiles import StaticFiles
from .background import sweep_once
from .config import get_cors_origins
from .database import Base, engine, SessionLocal
from . import models  # noqa: F401 — ensures models register for create_all
from .realtime import notify
from .routes import admin, auth, driver, guard, lots, sessions, views, ws
from .seed import ensure_demo_lots, ensure_seed_users

_FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
_DIST_DIR = _FRONTEND_DIR / "dist"

logging.config.dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "%(asctime)s %(levelname)s %(name)s: %(message)s",
            "datefmt": "%Y-%m-%dT%H:%M:%S",
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "default",
        }
    },
    "root": {"handlers": ["console"], "level": "INFO"},
})

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seeded_lots = ensure_demo_lots(db)
        ensure_seed_users(db, ",".join(l.id for l in seeded_lots))
    finally:
        db.close()

    stop = asyncio.Event()

    async def sweeper():
        while not stop.is_set():
            try:
                result = await asyncio.to_thread(sweep_once)
                for evt in result.get("_overdue_events", []):
                    lot_id = evt.pop("lot_id", "")
                    if lot_id:
                        await notify(lot_id, evt)
            except Exception:
                log.exception("Unhandled error in background sweeper")
            try:
                await asyncio.wait_for(stop.wait(), timeout=60)
            except asyncio.TimeoutError:
                pass

    task = asyncio.create_task(sweeper())
    log.info("Parking system started")
    yield
    stop.set()
    await task
    log.info("Parking system shut down")


app = FastAPI(title="Parking Slot Management", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ValueError)
async def value_error_handler(request, exc):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


for _router in (auth.router, views.router, lots.router, sessions.router, driver.router,
                guard.router, admin.router, ws.router):
    app.include_router(_router)

# Serve React build assets (JS, CSS, images) at /assets/
if (_DIST_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=str(_DIST_DIR / "assets")), name="static-assets")
