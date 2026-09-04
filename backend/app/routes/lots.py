"""Lot endpoints: listing, default demo lot, admin provisioning, slot grid, alerts."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models
from ..deps import require_admin
from ..seed import ensure_demo_lot

router = APIRouter()


@router.get("/api/lots")
def list_lots(db: Session = Depends(get_db)):
    rows = db.execute(select(models.Lot)).scalars().all()
    return [{"id": l.id, "name": l.name, "location": l.location} for l in rows]


@router.get("/api/lots/default")
def default_lot(db: Session = Depends(get_db)):
    lot = ensure_demo_lot(db)
    return {"lot_id": lot.id, "name": lot.name}


@router.post("/api/lots/provision")
def provision_lot(name: str, location: str = "", car: int = 6, bike: int = 6,
                  db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Admin: create lot + auto-generate Slot rows. Zero manual DB entry."""
    name = (name or "").strip()
    if not name:
        raise HTTPException(422, "name is required and must be non-empty")
    if len(name) > 80:
        raise HTTPException(422, "name must be 80 characters or fewer")
    if len(location or "") > 200:
        raise HTTPException(422, "location must be 200 characters or fewer")
    if not isinstance(car, int) or not isinstance(bike, int) or not (0 <= car <= 200) or not (0 <= bike <= 200):
        raise HTTPException(422, "car and bike must be integers in 0..200")
    lot = models.Lot(name=name, location=location)
    db.add(lot)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "lot name already exists")
    for i in range(1, car + 1):
        db.add(models.Slot(lot_id=lot.id, zone="A", number=f"{i:02d}", vehicle_type="car", status="free"))
    for i in range(1, bike + 1):
        db.add(models.Slot(lot_id=lot.id, zone="B", number=f"{i:02d}", vehicle_type="bike", status="free"))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "lot name already exists")
    return {"lot_id": lot.id, "name": name}


@router.get("/api/lots/{lot_id}/slots")
def list_slots(lot_id: str, db: Session = Depends(get_db)):
    lot = db.get(models.Lot, lot_id)
    if not lot:
        raise HTTPException(404, "lot not found")
    rows = db.execute(select(models.Slot).where(models.Slot.lot_id == lot_id)
                      .order_by(models.Slot.zone, models.Slot.number)).scalars().all()
    return [{"id": s.id, "zone": s.zone, "number": s.number, "vehicle_type": s.vehicle_type,
             "status": s.status, "session": s.current_session_id} for s in rows]


@router.get("/api/lots/{lot_id}/alerts")
def lot_alerts(lot_id: str, db: Session = Depends(get_db)):
    lot = db.get(models.Lot, lot_id)
    if not lot:
        raise HTTPException(404, "lot not found")
    pending = db.execute(select(models.Slot).where(
        models.Slot.lot_id == lot_id,
        models.Slot.status.in_(["self_reported", "self_reported_leaving"]))).scalars().all()
    return {"needs_guard_action": [{"slot_id": s.id, "zone": s.zone, "number": s.number,
                                    "status": s.status, "session": s.current_session_id} for s in pending]}
