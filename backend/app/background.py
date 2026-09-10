"""Background sweeps: reserved_pending timeout, self_report grace auto-promote, overdue notification."""
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
    counts = {"reserved_reverted": 0, "self_promoted": 0, "leave_promoted": 0,
              "overstays": 0, "overdue_notified": 0}
    overdue_events: list[dict] = []  # collected for WS push after commit
    try:
        # reserved_pending with no driver action -> free.
        pending = db.execute(
            select(models.Slot).where(models.Slot.status == "reserved_pending")
        ).scalars().all()
        for slot in pending:
            reference_time = slot.reserved_at
            if reference_time is None:
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
            if now - reference_time > timedelta(minutes=settings.RESERVED_PENDING_TIMEOUT_MIN):
                sess = None
                if slot.current_session_id:
                    sess = db.get(models.ParkingSession, slot.current_session_id)
                transition(db, slot, "timeout", actor_type="system", session=sess)
                counts["reserved_reverted"] += 1
                log.info("Sweep: timed out reserved slot %s", slot.id)

        # self_reported / self_reported_leaving grace window.
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

        # Overdue detection + notification push.
        active = db.execute(
            select(models.ParkingSession).where(
                models.ParkingSession.actual_end_time.is_(None),
                models.ParkingSession.estimated_end_time.is_not(None),
                models.ParkingSession.estimated_end_time < now,
            )
        ).scalars().all()
        counts["overstays"] = len(active)

        for sess in active:
            if sess.overdue_notified_at is not None:
                continue  # already notified; skip until driver extends (which resets this flag)
            est = sess.estimated_end_time
            if est and est.tzinfo is None:
                est = est.replace(tzinfo=timezone.utc)
            minutes_over = int((now - est).total_seconds() / 60) if est else 0
            sess.overdue_notified_at = now
            counts["overdue_notified"] += 1
            overdue_events.append({
                "event": "overdue",
                "session_id": sess.id,
                "slot_id": sess.slot_id,
                "lot_id": sess.lot_id,
                "vehicle_ref": sess.vehicle_ref or "",
                "minutes_over": minutes_over,
            })
            log.info("Sweep: overdue session=%s slot=%s plate=%s +%dmin",
                     sess.id, sess.slot_id, sess.vehicle_ref, minutes_over)

        db.commit()
    except Exception:
        log.exception("sweep_once failed — slots may be stuck in pending states")
        db.rollback()
    finally:
        db.close()

    # Return events for WS push (caller in main.py handles async broadcast)
    counts["_overdue_events"] = overdue_events
    return counts
