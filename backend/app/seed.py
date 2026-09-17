"""Database seeder: 3 Lots (partitioned slot prefixes), demo students with realistic fines, admin, guard."""
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from . import models
from .auth import hash_password

log = logging.getLogger(__name__)

DEMO_STUDENTS = [
    {
        "email": "alex@campus.edu",
        "name": "Alex Rivera",
        "roll_number": "CS21B001",
        "phone": "+91 98765 43210",
        "password": "alex123",
        "role": "student"
    },
    {
        "email": "priya@campus.edu",
        "name": "Priya Sharma",
        "roll_number": "EC21B045",
        "phone": "+91 98765 43211",
        "password": "priya123",
        "role": "student"
    },
    {
        "email": "rohit@campus.edu",
        "name": "Rohit Verma",
        "roll_number": "ME21B012",
        "phone": "+91 98765 43212",
        "password": "rohit123",
        "role": "student"
    },
    {
        "email": "ananya@campus.edu",
        "name": "Ananya Patel",
        "roll_number": "BT21B009",
        "phone": "+91 98765 43213",
        "password": "ananya123",
        "role": "student"
    },
    {
        "email": "admin@campus.edu",
        "name": "Campus Admin",
        "roll_number": "STAFF-ADM",
        "phone": "+91 98765 00001",
        "password": "admin123",
        "role": "admin"
    },
    {
        "email": "guard@campus.edu",
        "name": "Security Guard",
        "roll_number": "STAFF-GRD",
        "phone": "+91 98765 00002",
        "password": "guard123",
        "role": "guard"
    }
]

LOT_CONFIG = [
    {"name": "Lot A (Academic North)", "location": "North Gate - Near Academic Block A", "prefix": "A"},
    {"name": "Lot B (Engineering Plaza)", "location": "Central Plaza - Near Library & Cafeteria", "prefix": "B"},
    {"name": "Lot C (Sports Complex)", "location": "South Block - Near Hostels & Sports Ground", "prefix": "C"},
]

def seed_database(db: Session):
    # 1. Seed Lots & Slots with lot-specific prefixes
    lots_by_prefix = {}
    for lot_info in LOT_CONFIG:
        lot = db.execute(select(models.Lot).where(models.Lot.name == lot_info["name"])).scalar_one_or_none()
        if lot is None:
            # Also check for old lot names and skip if old data exists
            lot = models.Lot(name=lot_info["name"], location=lot_info["location"], total_slots=20)
            db.add(lot)
            db.flush()

        lots_by_prefix[lot_info["prefix"]] = lot

        # Check existing slots
        existing_slots = db.execute(select(models.ParkingSlot).where(models.ParkingSlot.lot_id == lot.id)).scalars().all()
        existing_names = {s.slot_name for s in existing_slots}

        prefix = lot_info["prefix"]
        for i in range(1, 21):
            slot_name = f"{prefix}{i:02d}"
            if slot_name not in existing_names:
                # Mark slot 20 in Lot A as maintenance blocked for demo visibility
                init_status = "blocked" if (prefix == "A" and i == 20) else "available"
                s = models.ParkingSlot(
                    lot_id=lot.id,
                    slot_name=slot_name,
                    override_status=init_status
                )
                db.add(s)

    db.flush()

    # 2. Seed Users (Students, Admin, Guard)
    students_by_email = {}
    for u in DEMO_STUDENTS:
        existing = db.execute(select(models.Student).where(models.Student.email == u["email"])).scalar_one_or_none()
        if existing is None:
            student = models.Student(
                email=u["email"],
                name=u["name"],
                roll_number=u["roll_number"],
                phone=u["phone"],
                password_hash=hash_password(u["password"]),
                role=u["role"],
                unpaid_fine_total=0,
                is_flagged=False
            )
            db.add(student)
            db.flush()
            students_by_email[u["email"]] = student
        else:
            students_by_email[u["email"]] = existing

    db.flush()

    # 3. Seed realistic demo data for investor demo personas
    priya = students_by_email.get("priya@campus.edu")
    rohit = students_by_email.get("rohit@campus.edu")

    # Only seed demo fines if Priya has 0 fines (first run or reset)
    if priya and priya.unpaid_fine_total == 0:
        _seed_priya_fine(db, priya, lots_by_prefix)

    if rohit and rohit.unpaid_fine_total == 0:
        _seed_rohit_fine(db, rohit, lots_by_prefix)

    # 4. Seed initial audit log entries for the admin audit page
    _seed_audit_logs(db, students_by_email)

    db.commit()
    log.info("Database seeded with 3 lots (A01-A20, B01-B20, C01-C20) and demo users with realistic fines.")


def _seed_priya_fine(db: Session, priya: models.Student, lots_by_prefix: dict):
    """Priya Sharma: ₹400 unpaid fine from a previous overstay."""
    now = datetime.now(tz=timezone.utc)
    yesterday = now - timedelta(days=1)

    # Find a slot in Lot B for her past booking
    lot_b = lots_by_prefix.get("B")
    if not lot_b:
        return
    slot = db.execute(
        select(models.ParkingSlot).where(models.ParkingSlot.lot_id == lot_b.id)
    ).scalars().first()
    if not slot:
        return

    existing_fine = db.execute(
        select(models.Fine).where(models.Fine.student_id == priya.id, models.Fine.status == "unpaid")
    ).scalars().first()
    if existing_fine:
        return

    # Create a completed overstay booking from yesterday
    booking = models.Booking(
        student_id=priya.id,
        slot_id=slot.id,
        booking_date=yesterday.strftime("%Y-%m-%d"),
        shift="shift_1",
        vehicle_plate="KA-01-AB-1234",
        status="completed",
        booked_at=yesterday.replace(hour=9, minute=15),
        parked_at=yesterday.replace(hour=9, minute=30),
        left_at=yesterday.replace(hour=14, minute=45),
        overtime_minutes=120,
        fine_amount=400,
    )
    db.add(booking)
    db.flush()

    # Create the unpaid fine
    fine = models.Fine(
        booking_id=booking.id,
        student_id=priya.id,
        base_amount=400,
        total_amount=400,
        reason=f"Overstay past shift buffer on {lot_b.name} - {slot.slot_name} (120 min)",
        status="unpaid",
        created_at=yesterday.replace(hour=13, minute=0),
    )
    db.add(fine)
    db.flush()

    # Update Priya's unpaid total
    priya.unpaid_fine_total = 400
    priya.is_flagged = False  # ₹400 < ₹1000 threshold


def _seed_rohit_fine(db: Session, rohit: models.Student, lots_by_prefix: dict):
    """Rohit Verma: ₹1200 unpaid fine + flagged for authority review."""
    now = datetime.now(tz=timezone.utc)
    three_days_ago = now - timedelta(days=3)

    lot_c = lots_by_prefix.get("C")
    if not lot_c:
        return
    slot = db.execute(
        select(models.ParkingSlot).where(models.ParkingSlot.lot_id == lot_c.id)
    ).scalars().first()
    if not slot:
        return

    existing_fine = db.execute(
        select(models.Fine).where(models.Fine.student_id == rohit.id, models.Fine.status == "unpaid")
    ).scalars().first()
    if existing_fine:
        return

    # Create a completed overstay booking from 3 days ago
    booking = models.Booking(
        student_id=rohit.id,
        slot_id=slot.id,
        booking_date=three_days_ago.strftime("%Y-%m-%d"),
        shift="shift_2",
        vehicle_plate="KA-02-CD-5678",
        status="completed",
        booked_at=three_days_ago.replace(hour=14, minute=0),
        parked_at=three_days_ago.replace(hour=14, minute=15),
        left_at=three_days_ago.replace(hour=23, minute=45),
        overtime_minutes=360,
        fine_amount=1200,
    )
    db.add(booking)
    db.flush()

    fine = models.Fine(
        booking_id=booking.id,
        student_id=rohit.id,
        base_amount=1200,
        total_amount=1200,
        reason=f"Overstay past shift buffer on {lot_c.name} - {slot.slot_name} (360 min)",
        status="unpaid",
        created_at=three_days_ago.replace(hour=18, minute=0),
    )
    db.add(fine)
    db.flush()

    # Update Rohit's unpaid total + flag
    rohit.unpaid_fine_total = 1200
    rohit.is_flagged = True  # ₹1200 > ₹1000 threshold


def _seed_audit_logs(db: Session, students_by_email: dict):
    """Seed a few realistic audit log entries for admin dashboard display."""
    # Only seed if no audit logs exist
    count = db.execute(select(models.NotificationLog)).scalars().all()
    if len(count) > 0:
        return

    now = datetime.now(tz=timezone.utc)
    priya = students_by_email.get("priya@campus.edu")
    rohit = students_by_email.get("rohit@campus.edu")
    alex = students_by_email.get("alex@campus.edu")

    entries = []
    if priya:
        entries.append(models.NotificationLog(
            student_id=priya.id,
            type="fine_started",
            channel="both",
            message="🚨 Overstay Penalty Active: Fine of ₹400 issued for exceeding departure buffer on Lot B - B01.",
            created_at=now - timedelta(days=1, hours=1),
        ))
    if rohit:
        entries.append(models.NotificationLog(
            student_id=rohit.id,
            type="fine_started",
            channel="both",
            message="🚨 Overstay Penalty Active: Fine of ₹1,200 issued for exceeding departure buffer on Lot C - C01.",
            created_at=now - timedelta(days=3),
        ))
        entries.append(models.NotificationLog(
            student_id=rohit.id,
            type="authority_flag",
            channel="both",
            message="⚠️ URGENT: Outstanding fine of ₹1,200 escalated to Campus Authorities.",
            created_at=now - timedelta(days=3),
        ))
    if alex:
        entries.append(models.NotificationLog(
            student_id=alex.id,
            type="booking_confirmed",
            channel="in_app",
            message="System initialized — demo environment ready.",
            created_at=now - timedelta(hours=2),
        ))

    for e in entries:
        db.add(e)
