"""App factory: wiring only. Routes live in app/routes/, auth in deps.py, seed in seed.py."""
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .background import sweep_once
from .database import Base, engine, SessionLocal
from .routes import admin, driver, guard, lots, sessions, views, ws
from .seed import ensure_demo_lots, ensure_seed_users


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        lots = ensure_demo_lots(db)
        ensure_seed_users(db, ",".join(l.id for l in lots))
    finally:
        db.close()
    stop = asyncio.Event()

    async def sweeper():
        while not stop.is_set():
            try:
                await asyncio.to_thread(sweep_once)
            except Exception:
                pass
            try:
                await asyncio.wait_for(stop.wait(), timeout=60)
            except asyncio.TimeoutError:
                pass

    task = asyncio.create_task(sweeper())
    yield
    stop.set()
    await task


Base.metadata.create_all(bind=engine)
_seed_db = SessionLocal()
try:
    _lots = ensure_demo_lots(_seed_db)
    ensure_seed_users(_seed_db, ",".join(l.id for l in _lots))
finally:
    _seed_db.close()

app = FastAPI(title="Parking Slot Management (demo)", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(ValueError)
async def value_error_handler(request, exc):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


for _router in (views.router, lots.router, sessions.router, driver.router,
                guard.router, admin.router, ws.router):
    app.include_router(_router)
