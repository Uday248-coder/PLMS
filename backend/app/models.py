"""Data model: Lot, Slot, Session, Guard, Admin, AuditLog, GuardLot. Matches build-plan §1."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship
from .database import Base


def new_id() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Lot(Base):
    __tablename__ = "lots"
    id = Column(String, primary_key=True, default=new_id)
    name = Column(String, nullable=False, unique=True)
    location = Column(String, default="")
    slots = relationship("Slot", back_populates="lot", cascade="all, delete-orphan")


class Slot(Base):
    __tablename__ = "slots"
    id = Column(String, primary_key=True, default=new_id)
    lot_id = Column(String, ForeignKey("lots.id"), nullable=False, index=True)
    zone = Column(String, nullable=False)          # letter e.g. "A"
    number = Column(String, nullable=False)        # e.g. "01"
    vehicle_type = Column(String, nullable=False)  # car | bike | truck
    status = Column(String, nullable=False, default="free")
    current_session_id = Column(String, ForeignKey("sessions.id",
                                                   use_alter=True,
                                                   name="fk_slot_current_session"),
                                nullable=True)
    # Timestamp set once when a reservation/assign event fires; cleared on free.
    reserved_at = Column(DateTime(timezone=True), nullable=True)
    lot = relationship("Lot", back_populates="slots")


class ParkingSession(Base):
    __tablename__ = "sessions"
    id = Column(String, primary_key=True, default=new_id)
    slot_id = Column(String, ForeignKey("slots.id"), nullable=False, index=True)
    lot_id = Column(String, ForeignKey("lots.id"), nullable=False, index=True)
    driver_id = Column(String, ForeignKey("drivers.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    start_time = Column(DateTime(timezone=True), nullable=True)   # actual arrival confirm
    estimated_end_time = Column(DateTime(timezone=True), nullable=True)
    actual_end_time = Column(DateTime(timezone=True), nullable=True)
    flow_type = Column(String, nullable=False)  # guard_managed | self_report
    verified_by_guard_id = Column(String, nullable=True)
    status = Column(String, nullable=False)
    vehicle_ref = Column(String, default="")  # free-text plate, unverified (§6.1)
    overdue_notified_at = Column(DateTime(timezone=True), nullable=True)  # set by sweeper, cleared on extend


class GuardLot(Base):
    """Many-to-many: which guards can manage which lots."""
    __tablename__ = "guard_lots"
    guard_id = Column(String, ForeignKey("guards.id"), primary_key=True)
    lot_id = Column(String, ForeignKey("lots.id"), primary_key=True)
    __table_args__ = (UniqueConstraint("guard_id", "lot_id"),)


class Guard(Base):
    __tablename__ = "guards"
    id = Column(String, primary_key=True, default=new_id)
    name = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=False)
    guard_lots = relationship("GuardLot", cascade="all, delete-orphan")


class Admin(Base):
    __tablename__ = "admins"
    id = Column(String, primary_key=True, default=new_id)
    name = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=False)


class Driver(Base):
    __tablename__ = "drivers"
    id = Column(String, primary_key=True, default=new_id)
    email = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    actor_id = Column(String, default="")
    actor_type = Column(String, default="")  # guard | admin | system
    action = Column(String, nullable=False)
    session_id = Column(String, nullable=True)
    slot_id = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=_now)
