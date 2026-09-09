"""Guard taps: login + assigned-lot scope enforced."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models
from ..schemas import Tap
from ..deps import current_user, guard_can_touch, guard_session_check
from .sessions import tap

log = logging.getLogger(__name__)

router = APIRouter()

_CONFIRMABLE = {"self_reported", "self_reported_leaving"}


@router.post("/api/guard/confirm")
async def guard_confirm(body: Tap, db: Session = Depends(get_db), who=Depends(current_user)):
    role, user = who
    if role != "guard":
        raise HTTPException(403, "guard only")
    sess = db.get(models.ParkingSession, body.session_id)
    if not sess:
        raise HTTPException(404, "session not found")
    if not guard_can_touch(user, sess.lot_id, db):
        raise HTTPException(403, "not your assigned lot")
    slot = db.get(models.Slot, sess.slot_id)
    if not slot:
        raise HTTPException(404, "slot not found")
    if slot.status not in _CONFIRMABLE:
        raise HTTPException(
            409,
            f"Cannot confirm: slot is '{slot.status}'. "
            "Only self_reported or self_reported_leaving slots can be confirmed.",
        )
    event = "guard_confirm" if slot.status == "self_reported" else "guard_confirm_gone"
    return await tap(body, event, db, "guard_confirmed")


@router.post("/api/guard/deny")
async def guard_deny(body: Tap, db: Session = Depends(get_db), who=Depends(current_user)):
    guard_session_check(db, body.session_id, who)
    return await tap(body, "guard_deny", db, "guard_denied")


@router.post("/api/guard/checkout")
async def guard_checkout(body: Tap, db: Session = Depends(get_db), who=Depends(current_user)):
    guard_session_check(db, body.session_id, who)
    return await tap(body, "guard_checkout", db, "guard_checked_out")
