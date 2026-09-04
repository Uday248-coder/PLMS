"""Auth + admin: login, aggregate overview, mismatch resolve, sweep. Admin-only ops."""
import time
from collections import defaultdict, deque
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..config import settings
from ..database import get_db
from .. import models
from ..auth import create_token, verify_password
from ..background import sweep_once
from ..deps import require_admin
from ..realtime import notify
from ..schemas import Login, Tap
from ..state_machine import audit as _audit, transition

router = APIRouter()

_login_hits: dict[str, deque] = defaultdict(deque)


def _throttle_login(ip: str):
    """Sliding-window cap per IP. Zero-cost, in-process (use a gateway limiter for multi-worker)."""
    now = time.monotonic()
    hits = _login_hits[ip]
    while hits and now - hits[0] > 60:
        hits.popleft()
    if len(hits) >= settings.LOGIN_ATTEMPTS_PER_MINUTE:
        raise HTTPException(429, "too many login attempts, try again in a minute")
    hits.append(now)


@router.post("/api/auth/login")
def login(body: Login, request: Request, db: Session = Depends(get_db)):
    _throttle_login(request.client.host if request.client else "unknown")
    if len(body.password or "") > 128:
        raise HTTPException(422, "password too long")
    if body.role == "admin":
        user = db.execute(select(models.Admin).where(models.Admin.name == body.name)).scalars().first()
    elif body.role == "guard":
        user = db.execute(select(models.Guard).where(models.Guard.name == body.name)).scalars().first()
    else:
        raise HTTPException(422, "role must be guard|admin")
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "bad credentials")
    return {"token": create_token(user.id, body.role), "role": body.role, "name": user.name,
            "lot_ids": getattr(user, "lot_ids", "")}


@router.get("/api/stats/overview")
def stats_overview(db: Session = Depends(get_db)):
    """Admin aggregate: occupancy %, per-lot counts, mismatches, overstays. Zero-cost SQL."""
    lots = db.execute(select(models.Lot)).scalars().all()
    out = []
    total_slots = total_occ = 0
    for lot in lots:
        slots = db.execute(select(models.Slot).where(models.Slot.lot_id == lot.id)).scalars().all()
        occ = sum(1 for s in slots if s.status != "free")
        total_slots += len(slots)
        total_occ += occ
        out.append({"lot_id": lot.id, "name": lot.name, "total": len(slots),
                    "occupied": occ, "free": len(slots) - occ,
                    "pct": round(100 * occ / len(slots), 1) if slots else 0})
    mismatches = db.execute(select(models.AuditLog).where(models.AuditLog.action.like("%mismatch%"))
                            .order_by(models.AuditLog.id.desc()).limit(20)).scalars().all()
    now = datetime.utcnow()
    overstays = db.execute(select(models.ParkingSession).where(
        models.ParkingSession.actual_end_time.is_(None),
        models.ParkingSession.estimated_end_time.is_not(None),
        models.ParkingSession.estimated_end_time < now).limit(50)).scalars().all()
    return {"lots": out, "system_pct": round(100 * total_occ / total_slots, 1) if total_slots else 0,
            "mismatch_count": len(mismatches),
            "mismatches": [{"slot_id": m.slot_id, "session_id": m.session_id,
                            "action": m.action, "at": str(m.timestamp)} for m in mismatches],
            "overstays": [{"session_id": o.id, "slot_id": o.slot_id, "lot_id": o.lot_id,
                           "vehicle_ref": o.vehicle_ref} for o in overstays]}


@router.post("/api/admin/resolve")
async def admin_resolve(body: Tap, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Clear a mismatch (denied) session back to free. No-op pointer cleanup included."""
    sess = db.get(models.ParkingSession, body.session_id)
    if not sess:
        raise HTTPException(404, "session not found")
    if sess.status != "mismatch":
        raise HTTPException(409, "session is not in mismatch state")
    slot = db.get(models.Slot, sess.slot_id)
    if not slot:
        raise HTTPException(404, "session not found")
    if slot.status == "free" or slot.current_session_id != sess.id:
        # Deny already reopened the physical slot (it may since have been
        # reassigned to a live session): close only the session row so the
        # current occupant is never disturbed.
        sess.status = "free"
        if sess.actual_end_time is None:
            sess.actual_end_time = datetime.utcnow()
        _audit(db, actor_type="admin", action="mismatch->free via admin_resolve",
               session_id=sess.id, slot_id=slot.id)
        db.flush()
    else:
        transition(db, slot, "admin_resolve", actor_type="admin", session=sess)
    db.commit()
    await notify(sess.lot_id, {"event": "admin_resolved", "slot_id": slot.id,
                               "status": slot.status, "session_id": sess.id})
    return {"status": sess.status, "session_id": sess.id}


@router.post("/api/sweep")
def sweep(_admin=Depends(require_admin)):
    return sweep_once()
