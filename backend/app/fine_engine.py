"""Fine & Overstay Engine.
Manages 15-min hidden buffer, ₹200/hr fine accrual, 7-day late penalties (+₹20/day), and authority flags.
Broadcasts standard frontend events: FINE_ISSUED, SLOT_UPDATED, AUDIT alongside legacy engine_tick.
"""
import math
import logging
from datetime import datetime, timezone, timedelta, date
from sqlalchemy import select
from .database import SessionLocal
from . import models
from .clock import get_current_time, get_current_shift, SHIFT_1_END, SHIFT_2_END
from .sms import notify_student
from .realtime import broadcast_all

log = logging.getLogger(__name__)

FINE_PER_HOUR = 200
BUFFER_MINUTES = 15
LATE_FEE_PER_DAY = 20
AUTHORITY_FLAG_THRESHOLD = 1000

def _aware(dt):
    """SQLite strips tzinfo on read — re-attach UTC for safe arithmetic."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)

def _get_shift_end_datetime(shift_key: str, ref_date_str: str) -> datetime:
    """Returns the UTC datetime when the shift ends for that date."""
    y, m, d = map(int, ref_date_str.split("-"))
    ref_date = date(y, m, d)
    if shift_key == "shift_1":
        end_time = SHIFT_1_END
    else:
        end_time = SHIFT_2_END
    return datetime(ref_date.year, ref_date.month, ref_date.day, end_time.hour, end_time.minute, tzinfo=timezone.utc)


def _fine_payload(f, now: datetime) -> dict:
    """Build frontend-compatible fine payload."""
    created = f.created_at if f.created_at and f.created_at.tzinfo else (
        f.created_at.replace(tzinfo=timezone.utc) if f.created_at else None
    )
    age_days = (now - created).days if created else 0
    overdue = max(0, age_days - 7)
    reason = (f.reason or "").lower()
    reason_type = "OVERSTAY" if "overstay" in reason else ("LATE_FEE" if "late" in reason else "OVERSTAY")
    return {
        "id": f.id,
        "booking_id": f.booking_id,
        "student_id": f.student_id,
        "amount": f.total_amount,
        "base_amount": f.base_amount,
        "reason": reason_type,
        "status": "paid" if f.status in ("paid", "waived") else "unpaid",
        "issued_at": f.created_at.isoformat() if f.created_at else now.isoformat(),
        "paid_at": f.paid_at.isoformat() if f.paid_at else None,
        "days_overdue": overdue,
        "description": f.reason or "",
    }


def _audit_entry(db, student_id: str, action: str, message: str, now: datetime) -> dict:
    """Write a NotificationLog and return an audit payload for broadcast."""
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
    severity = "critical" if any(k in action.lower() for k in ("fine", "overstay", "flag")) else "info"
    return {
        "id": entry.id,
        "timestamp": now.isoformat(),
        "actor_id": student_id,
        "actor_role": (student.role if student else "system"),
        "action": action.upper(),
        "severity": severity,
        "details": message,
    }


import re

def _slot_payload_for_broadcast(slot, booking=None) -> dict:
    """Build a lightweight slot payload for SLOT_UPDATED broadcasts."""
    m = re.search(r"(\d+)", slot.slot_name or "")
    n = int(m.group(1)) if m else 0
    if n in (7, 14):
        stype = "handicap"
    elif n and n % 11 == 0:
        stype = "ev"
    elif n and n % 6 == 0:
        stype = "bike"
    else:
        stype = "car"

    if slot.override_status != "available":
        display = slot.override_status
    elif booking:
        display = booking.status
    else:
        display = "available"

    status_map = {
        "available": "AVAILABLE", "booked": "BOOKED", "parked": "PARKED",
        "overstay": "OVERSTAY", "blocked": "CLOSED", "occupied": "PARKED",
        "reserved": "MAINTENANCE",
    }
    return {
        "id": slot.id,
        "lot_id": slot.lot_id,
        "slot_number": slot.slot_name,
        "slot_type": stype,
        "status": status_map.get((display or "available").lower(), "AVAILABLE"),
        "current_booking_id": booking.id if booking else None,
        "vehicle_plate": booking.vehicle_plate if booking else None,
    }


def run_fine_engine_tick() -> dict:
    """
    Evaluates all active bookings against the current virtual/system time.
    Calculates overstay, sends warnings, accrues fines, and applies 7-day late fees.
    Broadcasts FINE_ISSUED, SLOT_UPDATED, and AUDIT events to all connected frontends.
    """
    now = get_current_time()
    db = SessionLocal()
    stats = {"evaluated": 0, "overdue": 0, "fines_updated": 0, "notifications_sent": 0}

    try:
        # 1. Check active/parked bookings for overstay
        active_bookings = db.execute(
            select(models.Booking).where(models.Booking.status.in_(["booked", "parked", "overstay"]))
        ).scalars().all()

        for b in active_bookings:
            stats["evaluated"] += 1
            shift_end_dt = _get_shift_end_datetime(b.shift, b.booking_date)
            buffer_end_dt = shift_end_dt + timedelta(minutes=BUFFER_MINUTES)
            slot = db.get(models.ParkingSlot, b.slot_id)
            student = db.get(models.Student, b.student_id)
            slot_label = f"{slot.lot.name} - {slot.slot_name}" if slot and slot.lot else (slot.slot_name if slot else "Slot")

            # Check 15-minute advance warning (between 15 min before shift end and shift end)
            warning_window_start = shift_end_dt - timedelta(minutes=15)
            if warning_window_start <= now < shift_end_dt:
                # Send warning if not sent yet
                already_warned = db.execute(
                    select(models.NotificationLog).where(
                        models.NotificationLog.student_id == b.student_id,
                        models.NotificationLog.type == f"warning_15min_{b.id}"
                    )
                ).scalar_one_or_none()
                if not already_warned and student:
                    notify_student(
                        db, student,
                        notif_type=f"warning_15min_{b.id}",
                        channel="both",
                        message=f"⏰ Shift Ending Soon: Your booking for {slot_label} ends at {shift_end_dt.strftime('%I:%M %p')}. Please prepare to vacate or request Shift 2 extension."
                    )
                    stats["notifications_sent"] += 1

            # Check shift ended notice (during buffer)
            if shift_end_dt <= now < buffer_end_dt:
                already_ended_notified = db.execute(
                    select(models.NotificationLog).where(
                        models.NotificationLog.student_id == b.student_id,
                        models.NotificationLog.type == f"shift_ended_{b.id}"
                    )
                ).scalar_one_or_none()
                if not already_ended_notified and student:
                    notify_student(
                        db, student,
                        notif_type=f"shift_ended_{b.id}",
                        channel="both",
                        message=f"⚠️ Shift Ended: Your session for {slot_label} ended at {shift_end_dt.strftime('%I:%M %p')}. Please vacate immediately to avoid fines."
                    )
                    stats["notifications_sent"] += 1

            # Check overstay & reckon fines (after hidden buffer)
            if now > buffer_end_dt:
                overtime_secs = (now - buffer_end_dt).total_seconds()
                overtime_mins = max(1, int(overtime_secs / 60))
                b.overtime_minutes = overtime_mins

                was_new_overstay = b.status != "overstay"
                b.status = "overstay"

                # ₹200 / hour (minimum 1 hour chunk)
                hours_billable = math.ceil(overtime_mins / 60)
                calculated_fine = hours_billable * FINE_PER_HOUR
                b.fine_amount = calculated_fine

                # Find or create corresponding Fine record
                fine_record = db.execute(
                    select(models.Fine).where(models.Fine.booking_id == b.id).order_by(models.Fine.created_at.desc())
                ).scalars().first()

                if not fine_record:
                    fine_record = models.Fine(
                        booking_id=b.id,
                        student_id=b.student_id,
                        base_amount=calculated_fine,
                        total_amount=calculated_fine,
                        reason=f"Overstay past shift buffer on {slot_label} ({overtime_mins} min)",
                        status="unpaid",
                        created_at=now
                    )
                    db.add(fine_record)
                    db.flush()
                    stats["fines_updated"] += 1

                    # Send fine started alert
                    if student:
                        notify_student(
                            db, student,
                            notif_type=f"fine_started_{b.id}",
                            channel="both",
                            message=f"🚨 Overstay Penalty Active: You exceeded the departure buffer on {slot_label}. Fine of ₹{calculated_fine} has been issued (₹{FINE_PER_HOUR}/hr)."
                        )
                        stats["notifications_sent"] += 1

                    # Broadcast FINE_ISSUED to all connected frontends
                    broadcast_all({"type": "FINE_ISSUED", "fine": _fine_payload(fine_record, now)})

                    # Broadcast AUDIT entry
                    audit = _audit_entry(
                        db, b.student_id, "FINE_ISSUED",
                        f"Fine of ₹{calculated_fine} issued for overstay on {slot_label} ({overtime_mins} min).",
                        now
                    )
                    broadcast_all({"type": "AUDIT", "entry": audit})

                else:
                    if fine_record.base_amount != calculated_fine:
                        fine_record.base_amount = calculated_fine
                        fine_record.total_amount = fine_record.base_amount + fine_record.late_fee
                        stats["fines_updated"] += 1

                        # Broadcast updated fine
                        broadcast_all({"type": "FINE_ISSUED", "fine": _fine_payload(fine_record, now)})

                # Broadcast SLOT_UPDATED when status transitions or updates
                if slot and (was_new_overstay or stats["fines_updated"] > 0):
                    broadcast_all({"type": "SLOT_UPDATED", "slot": _slot_payload_for_broadcast(slot, b)})

                stats["overdue"] += 1

        # 2. Check all unpaid fines older than 7 days for +₹20/day escalation
        unpaid_fines = db.execute(
            select(models.Fine).where(models.Fine.status == "unpaid")
        ).scalars().all()

        for f in unpaid_fines:
            fine_age_days = (now - _aware(f.created_at)).days
            if fine_age_days > 7:
                days_over = fine_age_days - 7
                calculated_late_fee = days_over * LATE_FEE_PER_DAY
                if f.late_fee != calculated_late_fee:
                    f.late_fee = calculated_late_fee
                    f.total_amount = f.base_amount + f.late_fee
                    stats["fines_updated"] += 1

        # 3. Recalculate unpaid_fine_total and authority flags for all students with fines
        students = db.execute(select(models.Student)).scalars().all()
        for s in students:
            total_unpaid = sum(f.total_amount for f in s.fines if f.status == "unpaid")
            s.unpaid_fine_total = total_unpaid
            if total_unpaid >= AUTHORITY_FLAG_THRESHOLD:
                if not s.is_flagged:
                    s.is_flagged = True
                    notify_student(
                        db, s,
                        notif_type="authority_flag",
                        channel="both",
                        message=f"⚠️ URGENT: Your outstanding campus parking fine of ₹{total_unpaid} has been escalated to Campus Authorities. Clear immediately to avoid suspension."
                    )
                    # Broadcast authority flag as audit
                    audit = _audit_entry(
                        db, s.id, "AUTHORITY_FLAG",
                        f"Student {s.name} flagged — outstanding fines of ₹{total_unpaid} exceed threshold.",
                        now
                    )
                    broadcast_all({"type": "AUDIT", "entry": audit})
            else:
                s.is_flagged = False

        db.commit()

        # Broadcast legacy engine_tick for backward compatibility
        broadcast_all({
            "event": "engine_tick",
            "time": now.isoformat(),
            "stats": stats
        })

    except Exception:
        log.exception("run_fine_engine_tick failed")
        db.rollback()
    finally:
        db.close()

    return stats
