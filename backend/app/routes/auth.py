"""Authentication routes: quick-student 1-click login, password login, registration."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models
from ..auth import hash_password, verify_password, create_token
from ..deps import current_user

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

class LoginRequest(BaseModel):
    email: str = ""
    identifier: str = ""
    password: str = "pass123"

class QuickLoginRequest(BaseModel):
    email: str

def _lookup_student(db, identity: str):
    ident = (identity or "").strip()
    if not ident:
        return None
    student = db.execute(select(models.Student).where(models.Student.email == ident)).scalar_one_or_none()
    if student:
        return student
    # Fall back to case-insensitive email or roll_number match (frontend sends roll no too)
    lowered = ident.lower()
    for s in db.execute(select(models.Student)).scalars().all():
        if (s.email or "").lower() == lowered or (s.roll_number or "").lower() == lowered:
            return s
    return None


def _latest_plate(db, student_id: str) -> str:
    b = db.execute(
        select(models.Booking)
        .where(models.Booking.student_id == student_id)
        .order_by(models.Booking.booked_at.desc())
    ).scalars().first()
    return (b.vehicle_plate if b and b.vehicle_plate else "") or ""


def _user_payload(db, student) -> dict:
    plate = _latest_plate(db, student.id)
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
@router.post("/quick-login")
def quick_login(req: QuickLoginRequest, db: Session = Depends(get_db)):
    """Zero-typing 1-click authentication for students/staff."""
    student = db.execute(select(models.Student).where(models.Student.email == req.email)).scalar_one_or_none()
    if not student:
        raise HTTPException(404, f"No student account found for {req.email}")

    token = create_token(student.id, student.role)
    return {
        "token": token,
        "role": student.role,
        "student_id": student.id,
        "name": student.name,
        "email": student.email,
        "roll_number": student.roll_number,
        "phone": student.phone,
        "unpaid_fine_total": student.unpaid_fine_total,
        "is_flagged": student.is_flagged,
        "user": _user_payload(db, student),
    }


@router.post("/demo-login")
def demo_login(req: QuickLoginRequest, db: Session = Depends(get_db)):
    """Frontend compat: one-click demo login returning {token, user}."""
    student = db.execute(select(models.Student).where(models.Student.email == req.email)).scalar_one_or_none()
    if not student:
        raise HTTPException(404, f"No student account found for {req.email}")
    token = create_token(student.id, student.role)
    return {"token": token, "user": _user_payload(db, student)}


@router.post("/logout")
def logout():
    return {"ok": True}

@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    identity = req.identifier or req.email
    student = _lookup_student(db, identity)
    if not student or not verify_password(req.password or "", student.password_hash):
        raise HTTPException(401, "Invalid email or credentials")

    token = create_token(student.id, student.role)
    return {
        "token": token,
        "role": student.role,
        "student_id": student.id,
        "name": student.name,
        "email": student.email,
        "roll_number": student.roll_number,
        "phone": student.phone,
        "unpaid_fine_total": student.unpaid_fine_total,
        "is_flagged": student.is_flagged,
        "user": _user_payload(db, student),
    }

@router.post("/admin/login")
def admin_login(req: LoginRequest, db: Session = Depends(get_db)):
    identity = req.identifier or req.email
    user = _lookup_student(db, identity)
    if not user or not verify_password(req.password or "", user.password_hash):
        raise HTTPException(401, "Invalid administrator credentials")
    if user.role not in ("admin", "guard"):
        raise HTTPException(403, "Access restricted to administrators and gate staff")

    token = create_token(user.id, user.role)
    return {
        "token": token,
        "role": user.role,
        "name": user.name,
        "email": user.email
    }

@router.get("/me")
def me(who=Depends(current_user), db: Session = Depends(get_db)):
    role, user = who
    student = db.get(models.Student, user.id)
    payload = _user_payload(db, student)
    # Keep legacy flat keys AND nested user for frontend compat
    return {**payload, "user": payload}
