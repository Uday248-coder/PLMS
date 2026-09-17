"""Data model: Student, Lot, ParkingSlot, Booking, Fine, NotificationLog."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Boolean, Date
from sqlalchemy.orm import relationship
from .database import Base
from .clock import get_current_time


def new_id() -> str:
    return str(uuid.uuid4())

def _now() -> datetime:
    return get_current_time()


class Lot(Base):
    __tablename__ = "lots"
    id = Column(String, primary_key=True, default=new_id)
    name = Column(String, nullable=False, unique=True)  # Lot 1, Lot 2, Lot 3
    location = Column(String, default="")
    total_slots = Column(Integer, default=20)
    slots = relationship("ParkingSlot", back_populates="lot", cascade="all, delete-orphan")


class ParkingSlot(Base):
    __tablename__ = "parking_slots"
    id = Column(String, primary_key=True, default=new_id)
    lot_id = Column(String, ForeignKey("lots.id"), nullable=False, index=True)
    slot_name = Column(String, nullable=False)  # A1, A2, ... A20
    override_status = Column(String, nullable=False, default="available")  # available, occupied, blocked, reserved
    lot = relationship("Lot", back_populates="slots")
    bookings = relationship("Booking", back_populates="slot", cascade="all, delete-orphan")


class Student(Base):
    __tablename__ = "students"
    id = Column(String, primary_key=True, default=new_id)
    email = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=False)
    roll_number = Column(String, default="")
    phone = Column(String, default="")
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="student")  # student, admin, guard
    unpaid_fine_total = Column(Integer, default=0)
    is_flagged = Column(Boolean, default=False)
    bookings = relationship("Booking", back_populates="student", cascade="all, delete-orphan")
    fines = relationship("Fine", back_populates="student", cascade="all, delete-orphan")
    notifications = relationship("NotificationLog", back_populates="student", cascade="all, delete-orphan")


class Booking(Base):
    __tablename__ = "bookings"
    id = Column(String, primary_key=True, default=new_id)
    student_id = Column(String, ForeignKey("students.id"), nullable=False, index=True)
    slot_id = Column(String, ForeignKey("parking_slots.id"), nullable=False, index=True)
    booking_date = Column(String, nullable=False)  # YYYY-MM-DD
    shift = Column(String, nullable=False)  # shift_1 (09:00 - 12:30) or shift_2 (14:00 - 17:30)
    vehicle_plate = Column(String, default="CAMPUS-STUDENT")
    status = Column(String, nullable=False, default="booked")  # booked, parked, completed, cancelled, overstay
    booked_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    parked_at = Column(DateTime(timezone=True), nullable=True)
    left_at = Column(DateTime(timezone=True), nullable=True)
    overtime_minutes = Column(Integer, default=0)
    fine_amount = Column(Integer, default=0)
    guard_verified = Column(Boolean, default=False)
    guard_verified_at = Column(DateTime(timezone=True), nullable=True)
    verified_by_guard_name = Column(String, nullable=True)

    student = relationship("Student", back_populates="bookings")
    slot = relationship("ParkingSlot", back_populates="bookings")
    fines = relationship("Fine", back_populates="booking", cascade="all, delete-orphan")


class Fine(Base):
    __tablename__ = "fines"
    id = Column(String, primary_key=True, default=new_id)
    booking_id = Column(String, ForeignKey("bookings.id"), nullable=False, index=True)
    student_id = Column(String, ForeignKey("students.id"), nullable=False, index=True)
    base_amount = Column(Integer, nullable=False, default=0)
    late_fee = Column(Integer, nullable=False, default=0)
    total_amount = Column(Integer, nullable=False, default=0)
    reason = Column(String, default="")
    status = Column(String, nullable=False, default="unpaid")  # unpaid, paid, waived
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    paid_at = Column(DateTime(timezone=True), nullable=True)

    booking = relationship("Booking", back_populates="fines")
    student = relationship("Student", back_populates="fines")


class NotificationLog(Base):
    __tablename__ = "notifications"
    id = Column(String, primary_key=True, default=new_id)
    student_id = Column(String, ForeignKey("students.id"), nullable=False, index=True)
    type = Column(String, nullable=False)  # booking_confirmed, parked, warning_15min, shift_ended, fine_started, fine_daily_accrual, slot_override, extension
    channel = Column(String, nullable=False, default="in_app")  # in_app, sms, both
    message = Column(String, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)

    student = relationship("Student", back_populates="notifications")
