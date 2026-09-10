"""Auth + admin: login, aggregate overview, mismatch resolve, sweep. Admin-only ops."""
import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from ..config import settings
from ..database import get_db
from .. import models
from ..auth import create_token, hash_password, verify_password
from ..background import sweep_once
from ..deps import require_admin
from ..realtime import notify
from ..schemas import Login, Tap
from ..state_machine import audit as _audit, transition

log = logging.getLogger(__name__)

router = APIRouter()

_login_hits: dict[str, deque] = defaultdict(deque)


def _throttle_login(ip: str):
    """Sliding-window cap per IP. In-process only — use a reverse-proxy rate limiter
    in a multi-worker deploy (see CORS_ORIGINS / nginx config)."""
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
        log.warning("Failed login attempt for name=%r role=%s", body.name, body.role)
        raise HTTPException(401, "bad credentials")
    # For guards: return their assigned lot IDs from the association table
    lot_ids = ""
    if body.role == "guard":
        rows = db.execute(
            select(models.GuardLot).where(models.GuardLot.guard_id == user.id)
        ).scalars().all()
        lot_ids = ",".join(r.lot_id for r in rows)
    log.info("Login: name=%r role=%s", body.name, body.role)
    return {"token": create_token(user.id, body.role), "role": body.role,
            "name": user.name, "lot_ids": lot_ids}


@router.get("/api/stats/overview")
def stats_overview(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Admin aggregate: occupancy %, per-lot counts, mismatches, overstays."""
    all_lots = db.execute(select(models.Lot)).scalars().all()
    out = []
    total_slots = total_occ = 0
    for lot in all_lots:
        slots = db.execute(select(models.Slot).where(models.Slot.lot_id == lot.id)).scalars().all()
        occ = sum(1 for s in slots if s.status != "free")
        total_slots += len(slots)
        total_occ += occ
        out.append({"lot_id": lot.id, "name": lot.name, "total": len(slots),
                    "occupied": occ, "free": len(slots) - occ,
                    "pct": round(100 * occ / len(slots), 1) if slots else 0})

    # Accurate unresolved mismatch count (not capped by LIMIT)
    mismatch_total = db.execute(
        select(func.count()).where(models.ParkingSession.status == "mismatch")
    ).scalar() or 0
    mismatches = db.execute(
        select(models.AuditLog)
        .where(models.AuditLog.action.like("%mismatch%"))
        .order_by(models.AuditLog.id.desc())
        .limit(20)
    ).scalars().all()

    now = datetime.now(timezone.utc)
    overstays = db.execute(
        select(models.ParkingSession).where(
            models.ParkingSession.actual_end_time.is_(None),
            models.ParkingSession.estimated_end_time.is_not(None),
            models.ParkingSession.estimated_end_time < now,
        ).limit(50)
    ).scalars().all()

    return {
        "lots": out,
        "system_pct": round(100 * total_occ / total_slots, 1) if total_slots else 0,
        "mismatch_count": mismatch_total,
        "mismatches": [{"slot_id": m.slot_id, "session_id": m.session_id,
                        "action": m.action, "at": str(m.timestamp)} for m in mismatches],
        "overstays": [{"session_id": o.id, "slot_id": o.slot_id, "lot_id": o.lot_id,
                       "vehicle_ref": o.vehicle_ref} for o in overstays],
    }


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
        raise HTTPException(404, "slot not found")
    if slot.status == "free" or slot.current_session_id != sess.id:
        # Deny already reopened the physical slot (it may since have been
        # reassigned to a live session): close only the session row.
        sess.status = "free"
        if sess.actual_end_time is None:
            sess.actual_end_time = datetime.now(timezone.utc)
        _audit(db, actor_type="admin", action="mismatch->free via admin_resolve",
               session_id=sess.id, slot_id=slot.id)
        db.flush()
    else:
        transition(db, slot, "admin_resolve", actor_type="admin", session=sess)
    db.commit()
    log.info("Admin resolved mismatch session=%s", sess.id)
    await notify(sess.lot_id, {"event": "admin_resolved", "slot_id": slot.id,
                               "status": slot.status, "session_id": sess.id})
    return {"status": sess.status, "session_id": sess.id}


class GuardCreate(BaseModel):
    name: str
    password: str
    lot_ids: list[str] = []

class GuardReset(BaseModel):
    new_password: str

@router.get("/api/admin/guards")
def list_guards(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    guards = db.execute(select(models.Guard)).scalars().all()
    out = []
    for g in guards:
        lots = db.execute(select(models.GuardLot.lot_id).where(models.GuardLot.guard_id == g.id)).scalars().all()
        out.append({"id": g.id, "name": g.name, "lot_ids": lots})
    return {"guards": out}

@router.post("/api/admin/guards")
def create_guard(body: GuardCreate, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    if db.execute(select(models.Guard).where(models.Guard.name == body.name)).scalars().first():
        raise HTTPException(400, "Guard name already exists")
    guard = models.Guard(name=body.name, password_hash=hash_password(body.password))
    db.add(guard)
    db.commit()
    db.refresh(guard)
    for lid in body.lot_ids:
        db.add(models.GuardLot(guard_id=guard.id, lot_id=lid))
    db.commit()
    return {"id": guard.id, "name": guard.name, "lot_ids": body.lot_ids}

@router.put("/api/admin/guards/{guard_id}/reset_password")
def reset_guard_password(guard_id: str, body: GuardReset, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    guard = db.get(models.Guard, guard_id)
    if not guard:
        raise HTTPException(404, "Guard not found")
    guard.password_hash = hash_password(body.new_password)
    db.commit()
    return {"message": "Password reset successful"}

@router.post("/api/sweep")
def sweep(_admin=Depends(require_admin)):
    return sweep_once()
