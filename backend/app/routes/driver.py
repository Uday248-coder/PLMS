"""Driver taps: public, walk-in, no login."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas import Tap
from .sessions import tap

router = APIRouter()


@router.post("/api/driver/parked")
async def driver_parked(body: Tap, db: Session = Depends(get_db)):
    return await tap(body, "driver_park_tap", db, "driver_self_reported")


@router.post("/api/driver/leaving")
async def driver_leaving(body: Tap, db: Session = Depends(get_db)):
    return await tap(body, "driver_leave_tap", db, "driver_leaving")
