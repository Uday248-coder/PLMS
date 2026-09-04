"""Background sweeps: reserved_pending timeout, self_report grace auto-promote, overstay flag."""
from datetime import datetime, timedelta
from sqlalchemy import select
from .database import SessionLocal
from . import models
from .state_machine import transition
from .config import settings


def sweep_once(now: datetime | None = None) -> dict:
    now = now or datetime.utcnow()
    db = SessionLocal()
    counts = {"reserved_reverted": 0, "self_promoted": 0, "leave_promoted": 0, "overstays": 0}
    try:
        # reserved_pending with no driver action -> free (use updated heuristic: sessions table has no updated_at,
        # so demo sweep reverts stale reserved via session start==None older than timeout — tracked in-memory below).
        # Full implementation uses slot reservation timestamp; demo keeps it queryable via AuditLog time.
        pending = db.execute(select(models.Slot).where(models.Slot.status == "reserved_pending")).scalars().all()
        for slot in pending:
            last = db.execute(select(models.AuditLog).where(models.AuditLog.slot_id == slot.id)
                              .order_by(models.AuditLog.id.desc()).limit(1)).scalar_one_or_none()
            if last and now - last.timestamp > timedelta(minutes=settings.RESERVED_PENDING_TIMEOUT_MIN):
                transition(db, slot, "timeout", actor_type="system")
                counts["reserved_reverted"] += 1
        for status, event, key in [("self_reported", "grace_promote", "self_promoted"),
                                   ("self_reported_leaving", "grace_promote", "leave_promoted")]:
            rows = db.execute(select(models.Slot).where(models.Slot.status == status)).scalars().all()
            for slot in rows:
                last = db.execute(select(models.AuditLog).where(models.AuditLog.slot_id == slot.id)
                                  .order_by(models.AuditLog.id.desc()).limit(1)).scalar_one_or_none()
                if last and now - last.timestamp > timedelta(minutes=settings.SELF_REPORT_GRACE_MIN):
                    sess = None
                    if slot.current_session_id:
                        sess = db.get(models.ParkingSession, slot.current_session_id)
                    transition(db, slot, event, actor_type="system", session=sess)
                    counts[key] += 1
        # overstay flag (visibility only, no enforcement)
        active = db.execute(select(models.ParkingSession).where(
            models.ParkingSession.actual_end_time.is_(None),
            models.ParkingSession.estimated_end_time.is_not(None),
            models.ParkingSession.estimated_end_time < now)).scalars().all()
        counts["overstays"] = len(active)
        db.commit()
    finally:
        db.close()
    return counts
