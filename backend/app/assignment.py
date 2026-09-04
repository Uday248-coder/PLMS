"""Auto-assignment: nearest free slot of matching type. Demo = lowest zone+number."""
from sqlalchemy import select
from sqlalchemy.orm import Session
from . import models


def nearest_free_slot(db: Session, lot_id: str, vehicle_type: str) -> models.Slot | None:
    stmt = (select(models.Slot)
            .where(models.Slot.lot_id == lot_id,
                   models.Slot.vehicle_type == vehicle_type,
                   models.Slot.status == "free")
            .order_by(models.Slot.zone, models.Slot.number)
            .limit(1))
    return db.execute(stmt).scalar_one_or_none()


def lot_full_response(lot_id: str) -> dict:
    return {"detail": "lot full for this vehicle type",
            "lot_id": lot_id,
            "guard_contact": "Please see the on-site guard for assistance."}
