"""Session core: check-in, tap engine, extend, history. Driver taps stay public (walk-in)."""
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models
from ..schemas import Checkin, Tap, Extend, VALID_FLOW_TYPES, VALID_VEHICLE_TYPES, MAX_TOTAL_PARKING_MINUTES
from ..state_machine import transition, audit as _audit
from ..assignment import lot_full_response, nearest_free_slot
from ..realtime import notify
from ..deps import require_admin

log = logging.getLogger(__name__)

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
    plate = (body.vehicle_ref or "").strip()
    if not plate:
        raise HTTPException(422, "vehicle_ref (plate number) is required")
    if len(plate) > 20:
        raise HTTPException(422, "vehicle_ref must be 20 characters or fewer")
    if not (1 <= body.estimated_minutes <= 1440):
        raise HTTPException(422, "estimated_minutes must be in 1..1440")
    lot = db.get(models.Lot, body.lot_id)
    if not lot:
        raise HTTPException(404, "lot not found")
    slot = nearest_free_slot(db, body.lot_id, body.vehicle_type)
    if not slot:
        raise HTTPException(409, lot_full_response(body.lot_id))
    transition(db, slot, "assign", actor_type="system")
    now = datetime.now(timezone.utc)
    sess = models.ParkingSession(
        slot_id=slot.id, lot_id=body.lot_id, flow_type=body.flow_type,
        status=slot.status, vehicle_ref=plate,
        estimated_end_time=now + timedelta(minutes=body.estimated_minutes),
    )
    db.add(sess)
    db.flush()
    slot.current_session_id = sess.id
    if body.flow_type == "guard_managed":
        transition(db, slot, "guard_confirm", actor_type="guard", session=sess)
    db.commit()
    await notify(body.lot_id, {"event": "slot_changed", "slot_id": slot.id, "status": slot.status})
    log.info("Check-in: lot=%s slot=%s session=%s plate=%s est_min=%d",
             body.lot_id, slot.id, sess.id, plate, body.estimated_minutes)
    return {
        "session_id": sess.id, "zone": slot.zone, "number": slot.number,
        "status": slot.status, "estimated_minutes": body.estimated_minutes,
    }


@router.post("/api/driver/extend")
async def extend_session(body: Extend, db: Session = Depends(get_db)):
    """Extend a parking session's estimated end time. Additive to current end, not now.
    Clears overdue_notified_at so the sweeper can re-arm if the driver goes over again."""
    if not (1 <= body.additional_minutes <= 1440):
        raise HTTPException(422, "additional_minutes must be in 1..1440")
    sess = db.get(models.ParkingSession, body.session_id)
    if not sess:
        raise HTTPException(404, "session not found")
    if sess.status == "mismatch":
        raise HTTPException(410, "This session was denied and cannot be extended.")
    if sess.actual_end_time is not None:
        raise HTTPException(410, "This session is already closed and cannot be extended.")
    slot = db.get(models.Slot, sess.slot_id)
    if not slot or slot.current_session_id != sess.id:
        raise HTTPException(410, "This session is stale and cannot be extended.")
    # 24h total cap from original created_at
    now = datetime.now(timezone.utc)
    created = sess.created_at
    if created and created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    current_end = sess.estimated_end_time or now
    if current_end.tzinfo is None:
        current_end = current_end.replace(tzinfo=timezone.utc)
    # Additive: extend from current end time (not from now)
    new_end = max(current_end, now) + timedelta(minutes=body.additional_minutes)
    if created and (new_end - created) > timedelta(minutes=MAX_TOTAL_PARKING_MINUTES):
        remaining = MAX_TOTAL_PARKING_MINUTES - int((now - created).total_seconds() / 60)
        raise HTTPException(
            422,
            f"Cannot exceed 24h total parking. You have about {max(0, remaining)} minutes remaining.",
        )
    sess.estimated_end_time = new_end
    sess.overdue_notified_at = None  # re-arm overdue notification
    _audit(db, actor_type="system",
           action=f"extend +{body.additional_minutes}min -> {new_end.isoformat()}",
           session_id=sess.id, slot_id=slot.id)
    db.commit()
    await notify(sess.lot_id, {
        "event": "session_extended", "slot_id": slot.id,
        "session_id": sess.id, "new_end": new_end.isoformat(),
    })
    log.info("Extended: session=%s +%dmin new_end=%s", sess.id, body.additional_minutes, new_end)
    return {
        "session_id": sess.id, "estimated_end": new_end.isoformat(),
        "additional_minutes": body.additional_minutes,
    }


@router.get("/api/sessions/recent")
def recent_sessions(
    lot_id: str | None = None,
    limit: int = 30,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    limit = max(1, min(limit, 100))
    stmt = select(models.ParkingSession).order_by(
        models.ParkingSession.actual_end_time.desc().nulls_first()
    )
    if lot_id:
        stmt = stmt.where(models.ParkingSession.lot_id == lot_id)
    rows = db.execute(stmt.limit(limit)).scalars().all()
    return [
        {
            "id": r.id, "slot_id": r.slot_id, "lot_id": r.lot_id, "status": r.status,
            "flow": r.flow_type, "vehicle_ref": r.vehicle_ref,
            "start": str(r.start_time), "end": str(r.actual_end_time),
            "estimated_end": str(r.estimated_end_time) if r.estimated_end_time else None,
        }
        for r in rows
    ]
