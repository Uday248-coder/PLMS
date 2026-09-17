"""FastAPI App Factory."""
import logging
import logging.config
from contextlib import asynccontextmanager
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .config import get_cors_origins
from .database import Base, engine, SessionLocal
from .seed import seed_database
from .fine_engine import run_fine_engine_tick
from .clock import get_current_time, get_speed
from .routes import auth_router, ws_router, api_router

from . import realtime

log = logging.getLogger(__name__)


async def _clock_tick_loop():
    """Autonomous background worker that:
    1. Ticks once per real second (advancing virtual time based on current speed).
    2. Broadcasts CLOCK_TICK to all connected WebSocket clients.
    3. Periodically runs the fine engine to detect overstays & accrue fines.
    """
    tick_count = 0
    while True:
        try:
            await asyncio.sleep(1)
            tick_count += 1

            now = get_current_time()
            speed = get_speed()

            # Determine shift from virtual time
            mins = now.hour * 60 + now.minute
            if 9 * 60 <= mins < 12 * 60 + 30:
                shift = "SHIFT_1"
            elif 12 * 60 + 30 <= mins < 14 * 60:
                shift = "MIDDAY_CLOSED"
            elif 14 * 60 <= mins < 17 * 60 + 30:
                shift = "SHIFT_2"
            else:
                shift = "OFF_HOURS"

            # Broadcast clock tick every second
            realtime.broadcast_all({
                "type": "CLOCK_TICK",
                "virtual_time": now.isoformat(),
                "speed": speed,
                "shift": shift,
            })

            # Run fine engine every 3 real seconds (or faster if speed > 1)
            engine_interval = max(1, 3 // max(1, int(speed)))
            if tick_count % engine_interval == 0:
                # Run in executor to avoid blocking the event loop
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, run_fine_engine_tick)

        except asyncio.CancelledError:
            log.info("Clock tick loop cancelled — shutting down.")
            break
        except Exception:
            log.exception("Clock tick loop error (will retry)")
            await asyncio.sleep(2)


@asynccontextmanager
async def lifespan(app: FastAPI):
    realtime.main_loop = asyncio.get_running_loop()
    # Ensure database schema is created
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db)
        run_fine_engine_tick()
    finally:
        db.close()
    log.info("Campus Parking System launched with 3 lots (60 slots) & virtual fine engine.")

    # Launch autonomous clock tick loop
    tick_task = asyncio.create_task(_clock_tick_loop())
    log.info("Background clock tick loop started.")

    yield

    # Gracefully cancel tick loop on shutdown
    tick_task.cancel()
    try:
        await tick_task
    except asyncio.CancelledError:
        pass
    log.info("Campus Parking System shut down.")

app = FastAPI(title="Campus Parking Slot Management System", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for dev/dual port isolation (:5173 & :5174)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(ValueError)
async def value_error_handler(request, exc):
    return JSONResponse(status_code=400, content={"detail": str(exc)})

# Include Routers
for _router in (auth_router, ws_router, api_router):
    app.include_router(_router)
