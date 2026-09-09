"""Background sweeps: reserved_pending timeout, self_report grace auto-promote, overstay flag."""
import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from .database import SessionLocal
from . import models
from .state_machine import transition
from .config import settings

log = logging.getLogger(__name__)


def sweep_once(now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    db = SessionLocal()
    counts = {"reserved_reverted": 0, "self_promoted": 0, "leave_promoted": 0, "overstays": 0}
    try:
        # reserved_pending with no driver action -> free.
        # Use slot.reserved_at (set by the state machine on assign) as the reliable clock.
        # Fall back to AuditLog lookup only for rows created before the reserved_at column existed.
        pending = db.execute(
            select(models.Slot).where(models.Slot.status == "reserved_pending")
        ).scalars().all()
        for slot in pending:
            reference_time = slot.reserved_at
            if reference_time is None:
                # Legacy row: find timestamp from AuditLog
                last = db.execute(
                    select(models.AuditLog)
                    .where(models.AuditLog.slot_id == slot.id)
                    .order_by(models.AuditLog.id.desc())
                    .limit(1)
                ).scalar_one_or_none()
                reference_time = last.timestamp if last else None
            if reference_time is None:
                continue
            # Normalise to offset-aware for comparison
            if reference_time.tzinfo is None:
                reference_time = reference_time.replace(tzinfo=timezone.utc)
            if now - reference_time > timedelta(minutes=settings.RESERVED_PENDING_TIMEOUT_MIN):
                sess = None
                if slot.current_session_id:
                    sess = db.get(models.ParkingSession, slot.current_session_id)
                transition(db, slot, "timeout", actor_type="system", session=sess)
                counts["reserved_reverted"] += 1
                log.info("Sweep: timed out reserved slot %s", slot.id)

        # self_reported / self_reported_leaving grace window — use session.created_at.
        for status, event, key in [
            ("self_reported", "grace_promote", "self_promoted"),
            ("self_reported_leaving", "grace_promote", "leave_promoted"),
        ]:
            rows = db.execute(
                select(models.Slot).where(models.Slot.status == status)
            ).scalars().all()
            for slot in rows:
                sess = None
                reference_time = None
                if slot.current_session_id:
                    sess = db.get(models.ParkingSession, slot.current_session_id)
                    if sess:
                        reference_time = sess.created_at
                if reference_time is None:
                    # Legacy fallback
                    last = db.execute(
                        select(models.AuditLog)
                        .where(models.AuditLog.slot_id == slot.id)
                        .order_by(models.AuditLog.id.desc())
                        .limit(1)
                    ).scalar_one_or_none()
                    reference_time = last.timestamp if last else None
                if reference_time is None:
                    continue
                if reference_time.tzinfo is None:
                    reference_time = reference_time.replace(tzinfo=timezone.utc)
                if now - reference_time > timedelta(minutes=settings.SELF_REPORT_GRACE_MIN):
                    transition(db, slot, event, actor_type="system", session=sess)
                    counts[key] += 1
                    log.info("Sweep: grace-promoted slot %s via %s", slot.id, event)

        # Overstay visibility (no enforcement)
        active = db.execute(
            select(models.ParkingSession).where(
                models.ParkingSession.actual_end_time.is_(None),
                models.ParkingSession.estimated_end_time.is_not(None),
                models.ParkingSession.estimated_end_time < now,
            )
        ).scalars().all()
        counts["overstays"] = len(active)
        db.commit()
    except Exception:
        log.exception("sweep_once failed — slots may be stuck in pending states")
        db.rollback()
    finally:
        db.close()
    return counts
