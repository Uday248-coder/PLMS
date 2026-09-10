"""Shared auth dependencies. Kiosk/driver endpoints stay public (walk-in)."""
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from .database import get_db
from . import models
from .auth import decode_token


def current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    """Bearer JWT -> (role, user)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "login required")
    try:
        payload = decode_token(authorization[7:])
    except Exception:
        raise HTTPException(401, "invalid or expired token")
    role, sub = payload.get("role"), payload.get("sub")
    if role == "admin":
        user = db.get(models.Admin, sub) or db.execute(
            select(models.Admin).where(models.Admin.name == sub)).scalars().first()
    elif role == "guard":
        user = db.get(models.Guard, sub) or db.execute(
            select(models.Guard).where(models.Guard.name == sub)).scalars().first()
    elif role == "driver":
        user = db.get(models.Driver, sub) or db.execute(
            select(models.Driver).where(models.Driver.email == sub)).scalars().first()
    else:
        raise HTTPException(401, "unknown role")
    if user is None:
        raise HTTPException(401, "user not found")
    return role, user


def require_admin(who=Depends(current_user)):
    role, _ = who
    if role != "admin":
        raise HTTPException(403, "admin only")
    return who


def guard_can_touch(guard: models.Guard, lot_id: str, db: Session) -> bool:
    """Return True if this guard is assigned to the given lot (GuardLot table)."""
    row = db.execute(
        select(models.GuardLot).where(
            models.GuardLot.guard_id == guard.id,
            models.GuardLot.lot_id == lot_id,
        )
    ).scalar_one_or_none()
    return row is not None


def guard_session_check(db: Session, session_id: str, who) -> models.ParkingSession:
    role, user = who
    if role != "guard":
        raise HTTPException(403, "guard only")
    sess = db.get(models.ParkingSession, session_id)
    if not sess:
        raise HTTPException(404, "session not found")
    if not guard_can_touch(user, sess.lot_id, db):
        raise HTTPException(403, "not your assigned lot")
    return sess
