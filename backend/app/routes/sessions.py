"""Session core: check-in, tap engine, history. Driver taps stay public (walk-in)."""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models
from ..schemas import Checkin, Tap, VALID_FLOW_TYPES, VALID_VEHICLE_TYPES
from ..state_machine import transition
from ..assignment import lot_full_response, nearest_free_slot
from ..realtime import notify

router = APIRouter()


async def tap(body: Tap, event: str, db: Session, notice: str):
    sess = db.get(models.ParkingSession, body.session_id)
    if not sess:
        raise HTTPException(404, "session not found")
    slot = db.get(models.Slot, sess.slot_id)
    if not slot:
        raise HTTPException(404, "session not found")
    if sess.status == "mismatch":
        raise HTTPException(410, "This request was denied by the guard and closed. Please get a new slot.")
    if slot.current_session_id != sess.id:
        raise HTTPException(410, "This session is stale and closed for its slot. Please get a new slot.")
    transition(db, slot, event, actor_type="system" if "driver" in notice else "guard", session=sess)
    db.commit()
    if event == "guard_deny":
        # Terminal for the driver: slot reopened to free, session dead in review queue.
        payload = {"event": notice, "slot_id": slot.id, "status": "mismatch",
                   "slot_status": slot.status, "session_id": sess.id, "terminal": True,
                   "message": "Denied by guard — slot reopened, sent to review queue. Please get a new slot."}
        await notify(sess.lot_id, payload)
        return {"status": "mismatch", "slot_status": slot.status, "session_id": sess.id,
                "terminal": True, "message": payload["message"]}
    await notify(sess.lot_id, {"event": notice, "slot_id": slot.id,
                               "status": slot.status, "session_id": sess.id})
    return {"status": slot.status, "session_id": sess.id}


@router.post("/api/checkin")
async def checkin(body: Checkin, db: Session = Depends(get_db)):
    """Atomic assign: slot leaves available pool immediately (no double-assign gap)."""
    if body.vehicle_type not in VALID_VEHICLE_TYPES:
        raise HTTPException(422, "vehicle_type must be one of car|bike|truck")
    if body.flow_type not in VALID_FLOW_TYPES:
        raise HTTPException(422, "flow_type must be one of guard_managed|self_report")
    if body.estimated_minutes is not None and not (1 <= body.estimated_minutes <= 1440):
        raise HTTPException(422, "estimated_minutes must be in 1..1440")
    if len(body.vehicle_ref or "") > 20:
        raise HTTPException(422, "vehicle_ref must be 20 characters or fewer")
    lot = db.get(models.Lot, body.lot_id)
    if not lot:
        raise HTTPException(404, "lot not found")
    slot = nearest_free_slot(db, body.lot_id, body.vehicle_type)
    if not slot:
        raise HTTPException(409, lot_full_response(body.lot_id))
    transition(db, slot, "assign", actor_type="system")
    sess = models.ParkingSession(slot_id=slot.id, lot_id=body.lot_id, flow_type=body.flow_type,
                                 status=slot.status, vehicle_ref=body.vehicle_ref,
                                 estimated_end_time=None)
    if body.estimated_minutes:
        sess.estimated_end_time = datetime.utcnow() + timedelta(minutes=body.estimated_minutes)
    db.add(sess)
    db.flush()
    slot.current_session_id = sess.id
    # guard_managed shortcut: guard marks occupied directly
    if body.flow_type == "guard_managed":
        transition(db, slot, "guard_confirm", actor_type="guard", session=sess)
    db.commit()
    await notify(body.lot_id, {"event": "slot_changed", "slot_id": slot.id, "status": slot.status})
    return {"session_id": sess.id, "zone": slot.zone, "number": slot.number, "status": slot.status}


@router.get("/api/sessions/recent")
def recent_sessions(lot_id: str | None = None, limit: int = 30, db: Session = Depends(get_db)):
    limit = max(1, min(limit, 100))
    stmt = select(models.ParkingSession).order_by(models.ParkingSession.actual_end_time.desc().nulls_first())
    if lot_id:
        stmt = stmt.where(models.ParkingSession.lot_id == lot_id)
    rows = db.execute(stmt.limit(limit)).scalars().all()
    return [{"id": r.id, "slot_id": r.slot_id, "lot_id": r.lot_id, "status": r.status,
             "flow": r.flow_type, "vehicle_ref": r.vehicle_ref,
             "start": str(r.start_time), "end": str(r.actual_end_time)} for r in rows]
