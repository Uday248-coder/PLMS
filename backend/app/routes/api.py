"""Frontend compat layer (Option B).

Bridges the Industrial Tactile frontend contract (frontend/src/services/api.js)
to the real SQLAlchemy models without breaking legacy /api/* routes.

Covers: lots, slots, student bookings/fines, guard actions, admin
metrics/audit/maintenance, and the virtual clock with speed support.
All broadcasts emit frontend `type:` events AND legacy `event:` payloads.
"""
import logging
import math
import re
from datetime import datetime, timezone, timedelta, date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..deps import current_user, require_admin
from ..clock import (
    get_current_time,
    get_speed,
    set_speed,
    jump_clock,
    set_virtual_time,
    reset_to_realtime,
)
from ..fine_engine import (
    run_fine_engine_tick,
    FINE_PER_HOUR,
    BUFFER_MINUTES,
    LATE_FEE_PER_DAY,
    AUTHORITY_FLAG_THRESHOLD,
)
from ..sms import notify_student
from ..realtime import broadcast_all

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["compat"])

ACTIVE_STATUSES = ["booked", "parked", "overstay"]


def _audit_broadcast(db: Session, student_id: str, action: str, message: str):
    """Write a NotificationLog entry AND broadcast AUDIT event to all connected frontends."""
    now = get_current_time()
    entry = models.NotificationLog(
        student_id=student_id,
        type=action.lower(),
        channel="system",
        message=message,
        created_at=now,
    )
    db.add(entry)
    db.flush()
    student = db.get(models.Student, student_id) if student_id else None
    severity = "critical" if any(k in action.lower() for k in ("fine", "overstay", "flag")) else (
        "warning" if "warning" in action.lower() else "info"
    )
    broadcast_all({"type": "AUDIT", "entry": {
        "id": entry.id,
        "timestamp": now.isoformat(),
        "actor_id": student_id,
        "actor_role": (student.role if student else "system"),
        "action": action.upper(),
        "severity": severity,
        "details": message,
    }})


# ---------------- helpers ----------------
def _slot_type(slot) -> str:
    m = re.search(r"(\d+)", slot.slot_name or "")
    n = int(m.group(1)) if m else 0
    if n in (7, 14):
        return "handicap"
    if n and n % 11 == 0:
        return "ev"
    if n and n % 6 == 0:
        return "bike"
    return "car"


def _to_front_status(display: str) -> str:
    return {
        "available": "AVAILABLE",
        "booked": "BOOKED",
        "parked": "PARKED",
        "overstay": "OVERSTAY",
        "blocked": "CLOSED",
        "occupied": "PARKED",
        "reserved": "MAINTENANCE",
    }.get((display or "available").lower(), "AVAILABLE")


def _norm_shift(shift: str | None) -> str:
    s = (shift or "").lower()
    if s in ("shift_1", "shift1", "shift-1"):
        return "shift_1"
    if s in ("shift_2", "shift2", "shift-2"):
        return "shift_2"
    return s or "shift_1"


def _front_shift(shift: str) -> str:
    return {"shift_1": "SHIFT_1", "shift_2": "SHIFT_2"}.get((shift or "").lower(), "SHIFT_1")


def _shift_end_dt(shift: str, ref_date: str) -> datetime:
    y, m, d = map(int, ref_date.split("-"))
    hh, mm = (12, 30) if shift == "shift_1" else (17, 30)
    return datetime(y, m, d, hh, mm, tzinfo=timezone.utc)


def _user_payload(db: Session, student) -> dict:
    b = db.execute(
        select(models.Booking)
        .where(models.Booking.student_id == student.id)
        .order_by(models.Booking.booked_at.desc())
    ).scalars().first()
    plate = (b.vehicle_plate if b and b.vehicle_plate else "") or ""
    return {
        "id": student.id,
        "name": student.name,
        "roll_number": student.roll_number,
        "email": student.email,
        "vehicle_plate": plate,
        "phone": student.phone,
        "phone_number": student.phone,
        "unpaid_fine_total": student.unpaid_fine_total,
        "is_flagged": student.is_flagged,
        "role": student.role,
    }


def _booking_payload(b, db: Session) -> dict:
    slot = db.get(models.ParkingSlot, b.slot_id)
    end = _shift_end_dt(b.shift, b.booking_date)
    return {
        "id": b.id,
        "student_id": b.student_id,
        "slot_id": b.slot_id,
        "shift": _front_shift(b.shift),
        "status": b.status,
        "vehicle_plate": b.vehicle_plate,
        "booked_at": b.booked_at.isoformat() if b.booked_at else None,
        "parked_at": b.parked_at.isoformat() if b.parked_at else None,
        "left_at": b.left_at.isoformat() if b.left_at else None,
        "expected_exit_at": end.isoformat(),
        "fine_amount": b.fine_amount or 0,
        "slot_name": slot.slot_name if slot else "",
    }


def _fine_reason(reason: str) -> str:
    r = (reason or "").lower()
    if "overstay" in r:
        return "OVERSTAY"
    if "late" in r:
        return "LATE_FEE"
    return "OVERSTAY"


def _fine_payload(f, now: datetime) -> dict:
    created = f.created_at if f.created_at and f.created_at.tzinfo else (
        f.created_at.replace(tzinfo=timezone.utc) if f.created_at else None
    )
    age_days = (now - created).days if created else 0
    overdue = max(0, age_days - 7)
    status = "paid" if f.status in ("paid", "waived") else "unpaid"
    return {
        "id": f.id,
        "booking_id": f.booking_id,
        "student_id": f.student_id,
        "amount": f.total_amount,
        "base_amount": f.base_amount,
        "reason": _fine_reason(f.reason),
        "status": status,
        "issued_at": f.created_at.isoformat() if f.created_at else now.isoformat(),
        "paid_at": f.paid_at.isoformat() if f.paid_at else None,
        "days_overdue": overdue,
        "description": f.reason or "",
    }


def _active_map(db: Session) -> dict:
    rows = db.execute(
        select(models.Booking).where(models.Booking.status.in_(ACTIVE_STATUSES))
    ).scalars().all()
    return {b.slot_id: b for b in rows}


def _slot_payload(slot, active: dict) -> dict:
    b = active.get(slot.id)
    if slot.override_status != "available":
        display = slot.override_status
    elif b:
        display = b.status
    else:
        display = "available"
    return {
        "id": slot.id,
        "lot_id": slot.lot_id,
        "slot_number": slot.slot_name,
        "slot_type": _slot_type(slot),
        "status": _to_front_status(display),
        "current_booking_id": b.id if b else None,
        "vehicle_plate": b.vehicle_plate if b else None,
    }


def _frontend_shift_for(dt: datetime) -> str:
    mins = dt.hour * 60 + dt.minute
    if 9 * 60 <= mins < 12 * 60 + 30:
        return "SHIFT_1"
    if 12 * 60 + 30 <= mins < 14 * 60:
        return "MIDDAY_CLOSED"
    if 14 * 60 <= mins < 17 * 60 + 30:
        return "SHIFT_2"
    return "OFF_HOURS"


def _recompute_student(db: Session, student_id: str):
    total = db.execute(
        select(func.sum(models.Fine.total_amount)).where(
            models.Fine.student_id == student_id, models.Fine.status == "unpaid"
        )
    ).scalar() or 0
    s = db.get(models.Student, student_id)
    if s:
        s.unpaid_fine_total = total
        s.is_flagged = total >= AUTHORITY_FLAG_THRESHOLD
    return s


# ---------------- lots & slots ----------------
@router.get("/lots")
def list_lots(db: Session = Depends(get_db)):
    lots = db.execute(select(models.Lot).order_by(models.Lot.name)).scalars().all()
    return [
        {
            "id": lot.id,
            "name": lot.name,
            "location": lot.location or "",
            "total_slots": lot.total_slots,
            "is_active": True,
        }
        for lot in lots
    ]


@router.get("/slots")
def list_slots(lot_id: str | None = None, slot_type: str | None = None, status: str | None = None, db: Session = Depends(get_db)):
    run_fine_engine_tick()
    q = select(models.ParkingSlot).order_by(models.ParkingSlot.slot_name)
    if lot_id:
        q = q.where(models.ParkingSlot.lot_id == lot_id)
    slots = db.execute(q).scalars().all()
    active = _active_map(db)
    out = [_slot_payload(s, active) for s in slots]
    if slot_type:
        out = [s for s in out if s["slot_type"] == slot_type]
    if status:
        out = [s for s in out if s["status"] == status]
    return out


# ---------------- student ----------------
@router.post("/student/reserve")
def student_reserve(body: dict, db: Session = Depends(get_db), who=Depends(current_user)):
    role, user = who
    if role != "student":
        raise HTTPException(403, "Students only")
    run_fine_engine_tick()
    student = db.get(models.Student, user.id)
    if student.unpaid_fine_total > 0 or student.is_flagged:
        raise HTTPException(403, f"HARD_BLOCK: Outstanding unpaid fines of ₹{student.unpaid_fine_total} must be cleared before booking.")
    slot_id = body.get("slot_id")
    shift = _norm_shift(body.get("shift"))
    if shift not in ("shift_1", "shift_2"):
        # Default to current shift when frontend sends MIDDAY/OFF labels
        now = get_current_time()
        mins = now.hour * 60 + now.minute
        shift = "shift_1" if mins < 12 * 60 + 30 else "shift_2"
    slot = db.get(models.ParkingSlot, slot_id)
    if not slot:
        raise HTTPException(404, "Slot not found")
    if slot.override_status != "available":
        raise HTTPException(409, f"Slot is {slot.override_status}")
    today = get_current_time().strftime("%Y-%m-%d")
    conflict = db.execute(
        select(models.Booking).where(
            models.Booking.slot_id == slot.id,
            models.Booking.booking_date == today,
            models.Booking.shift == shift,
            models.Booking.status.in_(ACTIVE_STATUSES),
        )
    ).scalar_one_or_none()
    if conflict:
        raise HTTPException(409, "Slot was just reserved by another student.")
    existing = db.execute(
        select(models.Booking).where(
            models.Booking.student_id == student.id,
            models.Booking.booking_date == today,
            models.Booking.status.in_(ACTIVE_STATUSES),
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "You already hold an active reservation.")
    plate = (body.get("vehicle_plate") or "").strip()
    if not plate:
        plate = _user_payload(db, student)["vehicle_plate"] or "CAMPUS-STUDENT"
    now = get_current_time()
    booking = models.Booking(
        student_id=student.id, slot_id=slot.id, booking_date=today,
        shift=shift, vehicle_plate=plate, status="booked", booked_at=now,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    notify_student(db, student, notif_type="booking_confirmed", channel="in_app",
                   message=f"Booking Confirmed: Bay {slot.slot_name} for {shift}.")
    db.commit()
    payload = _booking_payload(booking, db)
    broadcast_all({"type": "SLOT_UPDATED", "slot": _slot_payload(slot, _active_map(db))})
    broadcast_all({"event": "slot_reserved", "slot_id": slot.id, "status": "booked"})
    return payload


@router.post("/student/cancel")
def student_cancel(body: dict, db: Session = Depends(get_db), who=Depends(current_user)):
    b = db.get(models.Booking, body.get("booking_id"))
    if not b:
        raise HTTPException(404, "Booking not found")
    role, user = who
    if role == "student" and b.student_id != user.id:
        raise HTTPException(403, "Not your booking")
    if b.status != "booked":
        raise HTTPException(409, "Cannot cancel after parking")
    b.status = "cancelled"
    db.commit()
    broadcast_all({"type": "SLOT_UPDATED", "slot": _slot_payload(db.get(models.ParkingSlot, b.slot_id), _active_map(db))})
    return _booking_payload(b, db)


@router.post("/student/park")
def student_park(body: dict, db: Session = Depends(get_db), who=Depends(current_user)):
    """Student marks their vehicle as parked (self-check-in)."""
    role, user = who
    if role != "student":
        raise HTTPException(403, "Students only")
    b = db.get(models.Booking, body.get("booking_id"))
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.student_id != user.id:
        raise HTTPException(403, "Not your booking")
    if b.status not in ("booked", "overstay"):
        raise HTTPException(409, f"Cannot park — booking is {b.status}")
    b.status = "parked"
    b.parked_at = get_current_time()
    db.commit()
    slot = db.get(models.ParkingSlot, b.slot_id)
    broadcast_all({"type": "SLOT_UPDATED", "slot": _slot_payload(slot, _active_map(db))})
    _audit_broadcast(db, user.id, "STUDENT_PARKED", f"{user.name} parked at {slot.slot_name}.")
    db.commit()
    return _booking_payload(b, db)


@router.post("/student/leave")
def student_leave(body: dict, db: Session = Depends(get_db), who=Depends(current_user)):
    """Student vacates bay early (self-check-out)."""
    role, user = who
    if role != "student":
        raise HTTPException(403, "Students only")
    b = db.get(models.Booking, body.get("booking_id"))
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.student_id != user.id:
        raise HTTPException(403, "Not your booking")
    if b.status not in ("parked", "overstay"):
        raise HTTPException(409, f"Cannot leave — booking is {b.status}")
    b.status = "completed"
    b.left_at = get_current_time()
    db.commit()
    run_fine_engine_tick()
    slot = db.get(models.ParkingSlot, b.slot_id)
    broadcast_all({"type": "SLOT_UPDATED", "slot": _slot_payload(slot, _active_map(db))})
    _audit_broadcast(db, user.id, "STUDENT_LEFT", f"{user.name} vacated {slot.slot_name}.")
    db.commit()
    return _booking_payload(b, db)


@router.get("/student/bookings")
def student_bookings(db: Session = Depends(get_db), who=Depends(current_user)):
    rows = db.execute(
        select(models.Booking).where(models.Booking.student_id == who[1].id).order_by(models.Booking.booked_at.desc())
    ).scalars().all()
    return [_booking_payload(b, db) for b in rows]


@router.get("/student/active-booking")
def student_active(db: Session = Depends(get_db), who=Depends(current_user)):
    run_fine_engine_tick()
    b = db.execute(
        select(models.Booking).where(
            models.Booking.student_id == who[1].id,
            models.Booking.status.in_(ACTIVE_STATUSES),
        ).order_by(models.Booking.booked_at.desc())
    ).scalar_one_or_none()
    return _booking_payload(b, db) if b else None


@router.get("/student/fines")
def student_fines(db: Session = Depends(get_db), who=Depends(current_user)):
    run_fine_engine_tick()
    now = get_current_time()
    rows = db.execute(
        select(models.Fine).where(models.Fine.student_id == who[1].id).order_by(models.Fine.created_at.desc())
    ).scalars().all()
    return [_fine_payload(f, now) for f in rows]


@router.post("/student/fines/{fine_id}/pay")
def student_pay_fine(fine_id: str, db: Session = Depends(get_db), who=Depends(current_user)):
    f = db.get(models.Fine, fine_id)
    if not f or (who[0] == "student" and f.student_id != who[1].id):
        raise HTTPException(404, "Fine not found")
    if f.status != "paid":
        f.status = "paid"
        f.paid_at = get_current_time()
        b = db.get(models.Booking, f.booking_id)
        if b and f.total_amount:
            b.fine_amount = 0
        db.commit()
        run_fine_engine_tick()
    else:
        db.commit()
    student = _recompute_student(db, f.student_id)
    db.commit()
    now = get_current_time()
    broadcast_all({"type": "FINE_SETTLED", "student": _user_payload(db, student), "fine": _fine_payload(f, now)})
    return _fine_payload(f, now)


@router.post("/student/pay-all")
def student_pay_all(db: Session = Depends(get_db), who=Depends(current_user)):
    if who[0] != "student":
        raise HTTPException(403, "Students only")
    rows = db.execute(
        select(models.Fine).where(models.Fine.student_id == who[1].id, models.Fine.status == "unpaid")
    ).scalars().all()
    total = 0
    now = get_current_time()
    for f in rows:
        f.status = "paid"
        f.paid_at = now
        total += f.total_amount
    db.commit()
    run_fine_engine_tick()
    student = _recompute_student(db, who[1].id)
    db.commit()
    # Broadcast FINE_SETTLED so student screens update immediately
    broadcast_all({"type": "FINE_SETTLED", "student": _user_payload(db, student)})
    _audit_broadcast(db, who[1].id, "FINE_SETTLED", f"{student.name} settled all fines — ₹{total} paid.")
    db.commit()
    return {"ok": True, "total_paid": total, "user": _user_payload(db, student)}


# ---------------- guard ----------------
def _guard_payload(db: Session, booking) -> dict:
    slot = db.get(models.ParkingSlot, booking.slot_id)
    student = db.get(models.Student, booking.student_id)
    return {
        "booking": _booking_payload(booking, db),
        "slot": _slot_payload(slot, _active_map(db)) if slot else None,
        "student": _user_payload(db, student) if student else None,
    }


@router.get("/guard/lookup")
def guard_lookup(plate: str = "", db: Session = Depends(get_db), who=Depends(current_user)):
    if who[0] not in ("guard", "admin"):
        raise HTTPException(403, "Guard only")
    target = (plate or "").upper().strip()
    if not target:
        return None
    bookings = db.execute(
        select(models.Booking).where(models.Booking.status.in_(ACTIVE_STATUSES))
    ).scalars().all()
    for b in bookings:
        if (b.vehicle_plate or "").upper().strip() == target:
            return _guard_payload(db, b)
    for s in db.execute(select(models.Student)).scalars().all():
        latest = _user_payload(db, s)["vehicle_plate"]
        if latest and latest.upper().strip() == target:
            return {"student": _user_payload(db, s)}
    return None


@router.post("/guard/check-in")
def guard_check_in(body: dict, db: Session = Depends(get_db), who=Depends(current_user)):
    if who[0] not in ("guard", "admin"):
        raise HTTPException(403, "Guard only")
    b = db.get(models.Booking, body.get("booking_id"))
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.status != "booked":
        raise HTTPException(409, "Booking is not in a checkable-in state")
    b.status = "parked"
    b.parked_at = get_current_time()
    db.commit()
    broadcast_all({"type": "SLOT_UPDATED", "slot": _slot_payload(db.get(models.ParkingSlot, b.slot_id), _active_map(db))})
    return _booking_payload(b, db)


@router.post("/guard/check-out")
def guard_check_out(body: dict, db: Session = Depends(get_db), who=Depends(current_user)):
    if who[0] not in ("guard", "admin"):
        raise HTTPException(403, "Guard only")
    b = db.get(models.Booking, body.get("booking_id"))
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.status not in ("parked", "overstay"):
        raise HTTPException(409, "Booking is not parked")
    b.status = "completed"
    b.left_at = get_current_time()
    db.commit()
    run_fine_engine_tick()
    broadcast_all({"type": "SLOT_UPDATED", "slot": _slot_payload(db.get(models.ParkingSlot, b.slot_id), _active_map(db))})
    return _booking_payload(b, db)


@router.post("/guard/report-overstay")
def guard_report(body: dict, db: Session = Depends(get_db), who=Depends(current_user)):
    if who[0] not in ("guard", "admin"):
        raise HTTPException(403, "Guard only")
    b = db.get(models.Booking, body.get("booking_id"))
    if not b:
        raise HTTPException(404, "Booking not found")
    now = get_current_time()
    end = _shift_end_dt(b.shift, b.booking_date)
    over_mins = max(1, int((now - end).total_seconds() / 60)) if now > end else 60
    b.status = "overstay"
    b.overtime_minutes = over_mins
    amount = max(1, math.ceil(over_mins / 60)) * FINE_PER_HOUR
    b.fine_amount = amount
    fine = db.execute(select(models.Fine).where(models.Fine.booking_id == b.id).order_by(models.Fine.created_at.desc())).scalars().first()
    if fine is None:
        fine = models.Fine(booking_id=b.id, student_id=b.student_id, base_amount=amount,
                           total_amount=amount, reason=f"Overstay reported by guard ({over_mins} min)",
                           status="unpaid", created_at=now)
        db.add(fine)
    else:
        fine.base_amount = amount
        fine.total_amount = fine.base_amount + fine.late_fee
    db.commit()
    run_fine_engine_tick()
    student = _recompute_student(db, b.student_id)
    db.commit()
    fine = db.execute(select(models.Fine).where(models.Fine.booking_id == b.id).order_by(models.Fine.created_at.desc())).scalars().first()
    broadcast_all({"type": "FINE_ISSUED", "fine": _fine_payload(fine, get_current_time())})
    broadcast_all({"type": "SLOT_UPDATED", "slot": _slot_payload(db.get(models.ParkingSlot, b.slot_id), _active_map(db))})
    return _booking_payload(b, db)


# ---------------- admin ----------------
@router.get("/admin/metrics")
def admin_metrics(db: Session = Depends(get_db), who=Depends(require_admin)):
    run_fine_engine_tick()
    slots = db.execute(select(models.ParkingSlot)).scalars().all()
    active = _active_map(db)
    occupied = sum(1 for s in slots if s.id in active)
    overstays = sum(1 for b in active.values() if b.status == "overstay")
    collected = db.execute(select(func.sum(models.Fine.total_amount)).where(models.Fine.status == "paid")).scalar() or 0
    outstanding = db.execute(select(func.sum(models.Fine.total_amount)).where(models.Fine.status == "unpaid")).scalar() or 0
    flagged = db.execute(select(func.count(models.Student.id)).where(models.Student.role == "student", models.Student.is_flagged.is_(True))).scalar() or 0
    lots = db.execute(select(func.count(models.Lot.id))).scalar() or 0
    return {
        "totalSlots": len(slots), "occupied": occupied, "available": len(slots) - occupied,
        "overstays": overstays, "totalCollected": collected, "totalOutstanding": outstanding,
        "flaggedStudents": flagged, "lots": lots,
    }


@router.get("/admin/audit")
def admin_audit(db: Session = Depends(get_db), who=Depends(require_admin)):
    rows = db.execute(select(models.NotificationLog).order_by(models.NotificationLog.created_at.desc()).limit(200)).scalars().all()
    out = []
    for n in rows:
        student = db.get(models.Student, n.student_id) if n.student_id else None
        t = (n.type or "").lower()
        severity = "critical" if any(k in t for k in ("fine", "overstay", "flag")) else ("warning" if "warning" in t else "info")
        out.append({
            "id": n.id,
            "timestamp": n.created_at.isoformat() if n.created_at else get_current_time().isoformat(),
            "actor_id": n.student_id,
            "actor_role": (student.role if student else "system"),
            "action": (n.type or "event").upper(),
            "severity": severity,
            "details": n.message,
        })
    return out


@router.get("/admin/flagged")
def admin_flagged(db: Session = Depends(get_db), who=Depends(require_admin)):
    rows = db.execute(select(models.Student).where(models.Student.role == "student", models.Student.is_flagged.is_(True))).scalars().all()
    return [_user_payload(db, s) for s in rows]


@router.get("/admin/students")
def admin_students(db: Session = Depends(get_db), who=Depends(require_admin)):
    run_fine_engine_tick()
    rows = db.execute(select(models.Student).where(models.Student.role == "student").order_by(models.Student.name)).scalars().all()
    return [_user_payload(db, s) for s in rows]


def _apply_slot_status(db: Session, slot: models.ParkingSlot, target_status: str, admin_user, vehicle_plate: str | None = None):
    target = (target_status or "AVAILABLE").strip().upper()
    active_bookings = db.execute(
        select(models.Booking).where(models.Booking.slot_id == slot.id, models.Booking.status.in_(ACTIVE_STATUSES))
    ).scalars().all()
    now = get_current_time()

    if target in ("AVAILABLE", "CLEAR", "RESET"):
        slot.override_status = "available"
        for b in active_bookings:
            b.status = "cancelled"
            b.left_at = now
        _audit_broadcast(db, admin_user.id, "ADMIN_SLOT_RELEASE", f"Slot {slot.slot_name} manually set to AVAILABLE by Admin.")
    elif target in ("MAINTENANCE", "RESERVED"):
        slot.override_status = "reserved"
        for b in active_bookings:
            b.status = "cancelled"
            b.left_at = now
        _audit_broadcast(db, admin_user.id, "ADMIN_SLOT_MAINTENANCE", f"Slot {slot.slot_name} placed in MAINTENANCE by Admin.")
    elif target in ("CLOSED", "BLOCKED"):
        slot.override_status = "blocked"
        for b in active_bookings:
            b.status = "cancelled"
            b.left_at = now
        _audit_broadcast(db, admin_user.id, "ADMIN_SLOT_BLOCKED", f"Slot {slot.slot_name} BLOCKED by Admin.")
    elif target in ("PARKED", "OCCUPIED"):
        slot.override_status = "occupied"
        _audit_broadcast(db, admin_user.id, "ADMIN_SLOT_OCCUPIED", f"Slot {slot.slot_name} marked OCCUPIED by Admin.")
    else:
        slot.override_status = target.lower()

    db.commit()
    payload = _slot_payload(slot, _active_map(db))
    broadcast_all({"type": "SLOT_UPDATED", "slot": payload})
    return payload


@router.post("/admin/slots/{slot_id}/maintenance")
def admin_maintenance(slot_id: str, body: dict, db: Session = Depends(get_db), who=Depends(require_admin)):
    slot = db.get(models.ParkingSlot, slot_id)
    if not slot:
        raise HTTPException(404, "Slot not found")
    if "status" in body:
        return _apply_slot_status(db, slot, body["status"], who[1], body.get("vehicle_plate"))
    on = bool(body.get("on"))
    target = "MAINTENANCE" if on else "AVAILABLE"
    return _apply_slot_status(db, slot, target, who[1])


@router.post("/admin/slots/{slot_id}/status")
@router.post("/admin/slots/{slot_id}/override")
def admin_slot_status(slot_id: str, body: dict, db: Session = Depends(get_db), who=Depends(require_admin)):
    slot = db.get(models.ParkingSlot, slot_id)
    if not slot:
        raise HTTPException(404, "Slot not found")
    status = body.get("status") or body.get("override_status") or "AVAILABLE"
    return _apply_slot_status(db, slot, status, who[1], body.get("vehicle_plate"))


@router.post("/admin/reset-demo")
def admin_reset_demo(db: Session = Depends(get_db), who=Depends(require_admin)):
    from ..seed import seed_database
    # Clear any active bookings
    for b in db.execute(select(models.Booking).where(models.Booking.status.in_(ACTIVE_STATUSES))).scalars().all():
        b.status = "completed"
    seed_database(db)
    run_fine_engine_tick()
    broadcast_all({"type": "DEMO_RESET"})
    return {"ok": True, "message": "Demo state reset successfully"}


# ---------------- clock ----------------
@router.get("/clock")
def get_clock(db: Session = Depends(get_db)):
    now = get_current_time()
    return {
        "virtual_time": now.isoformat(),
        "speed": get_speed(),
        "shift": _frontend_shift_for(now),
        "display": now.strftime("%H:%M:%S"),
    }


@router.post("/clock/speed")
def post_speed(body: dict, who=Depends(require_admin)):
    speed = float(body.get("speed") or 1)
    set_speed(speed)
    now = get_current_time()
    broadcast_all({"type": "CLOCK_TICK", "virtual_time": now.isoformat(), "speed": get_speed(), "shift": _frontend_shift_for(now)})
    return {"speed": get_speed()}


@router.post("/clock/jump")
def post_jump(body: dict, who=Depends(require_admin)):
    minutes = float(body.get("minutes") or 0)
    now = jump_clock(timedelta(minutes=minutes))
    run_fine_engine_tick()
    broadcast_all({"type": "CLOCK_TICK", "virtual_time": now.isoformat(), "speed": get_speed(), "shift": _frontend_shift_for(now)})
    return {"virtual_time": now.isoformat()}


@router.post("/clock/set")
def post_set(body: dict, who=Depends(require_admin)):
    iso = body.get("virtual_time")
    try:
        dt = datetime.fromisoformat(iso)
    except Exception:
        raise HTTPException(400, "Invalid date")
    now = set_virtual_time(dt)
    run_fine_engine_tick()
    broadcast_all({"type": "CLOCK_TICK", "virtual_time": now.isoformat(), "speed": get_speed(), "shift": _frontend_shift_for(now)})
    return {"virtual_time": now.isoformat()}


@router.post("/clock/reset")
def post_reset(who=Depends(require_admin)):
    reset_to_realtime()
    return {"ok": True}
