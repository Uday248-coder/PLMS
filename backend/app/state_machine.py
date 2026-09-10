"""Centrally-enforced state machine (§2). NOTHING mutates slot.status outside this module."""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from . import models

# (from_status, event) -> to_status
TRANSITIONS = {
    ("free", "assign"): "reserved_pending",
    ("reserved_pending", "guard_confirm"): "occupied",
    ("reserved_pending", "driver_park_tap"): "self_reported",
    ("reserved_pending", "timeout"): "free",
    ("self_reported", "guard_confirm"): "occupied",
    ("self_reported", "guard_deny"): "mismatch",
    ("self_reported", "grace_promote"): "occupied",
    ("occupied", "guard_checkout"): "free",
    ("occupied", "driver_leave_tap"): "self_reported_leaving",
    ("self_reported_leaving", "guard_confirm_gone"): "free",
    ("self_reported_leaving", "guard_deny"): "mismatch",
    ("self_reported_leaving", "grace_promote"): "free",
    ("mismatch", "admin_resolve"): "free",
}


def audit(db: Session, *, actor_id="", actor_type="system", action, session_id=None, slot_id=None):
    db.add(models.AuditLog(actor_id=actor_id, actor_type=actor_type, action=action,
                           session_id=session_id, slot_id=slot_id,
                           timestamp=datetime.now(timezone.utc)))


def transition(db: Session, slot: models.Slot, event: str, *, actor_id="", actor_type="system",
               session: models.ParkingSession | None = None) -> models.Slot:
    """Server-side validated transition. Raises ValueError on illegal move."""
    key = (slot.status, event)
    if key not in TRANSITIONS:
        raise ValueError(f"Illegal transition: {slot.status} + {event}")
    to_status = TRANSITIONS[key]
    from_status = slot.status
    now = datetime.now(timezone.utc)
    slot.status = to_status
    if session is not None:
        session.status = to_status
        if to_status == "occupied" and session.start_time is None:
            session.start_time = now
        if to_status == "free" and session.actual_end_time is None:
            session.actual_end_time = now
    if to_status in ("free", "mismatch"):
        slot.reserved_at = None
    if to_status == "reserved_pending":
        slot.reserved_at = now
    if to_status == "mismatch":
        # Never block the physical spot on a dispute: reopen immediately, flag session.
        slot.status = "free"
        slot.current_session_id = None
    audit(db, actor_id=actor_id, actor_type=actor_type,
          action=f"{from_status}->{to_status} via {event}",
          session_id=session.id if session else slot.current_session_id,
          slot_id=slot.id)
    db.flush()
    return slot
