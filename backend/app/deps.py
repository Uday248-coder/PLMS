"""Shared auth dependencies."""
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from .database import get_db
from . import models
from .auth import decode_token

def current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "login required")
    try:
        payload = decode_token(authorization[7:])
    except Exception:
        raise HTTPException(401, "invalid or expired token")
    role, sub = payload.get("role"), payload.get("sub")
    user = db.execute(select(models.Student).where(models.Student.id == sub)).scalar_one_or_none()
    if user is None:
        raise HTTPException(401, "user not found")
    return role, user

def require_admin(who=Depends(current_user)):
    role, _ = who
    if role != "admin":
        raise HTTPException(403, "admin only")
    return who