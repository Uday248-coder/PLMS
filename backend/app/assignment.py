"""Auto-assignment: nearest free slot of matching type. Demo = lowest zone+number."""
import logging
from sqlalchemy import select
from sqlalchemy.orm import Session
from . import models
from .config import settings

log = logging.getLogger(__name__)


def nearest_free_slot(db: Session, lot_id: str, vehicle_type: str) -> models.Slot | None:
    stmt = (
        select(models.Slot)
        .where(
            models.Slot.lot_id == lot_id,
            models.Slot.vehicle_type == vehicle_type,
            models.Slot.status == "free",
        )
        .order_by(models.Slot.zone, models.Slot.number)
        .limit(1)
    )
    # Use SELECT FOR UPDATE SKIP LOCKED on Postgres to prevent double-assignment
    # under concurrent workers. SQLite uses file-level locking so it is not needed.
    if not settings.DATABASE_URL.startswith("sqlite"):
        stmt = stmt.with_for_update(skip_locked=True)
    return db.execute(stmt).scalar_one_or_none()


def lot_full_response(lot_id: str) -> str:
    return f"Lot {lot_id} is full for this vehicle type. Please see the on-site guard for assistance."
