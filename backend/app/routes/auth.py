"""Authentication endpoints for the new Native app (Driver signup, Guard login)."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models
from ..auth import hash_password, verify_password, create_token

router = APIRouter(prefix="/api/auth", tags=["auth"])

class AuthRequest(BaseModel):
    username_or_email: str
    password: str

class AuthResponse(BaseModel):
    token: str
    role: str
    id: str


def _mint(user_id: str, role: str) -> dict:
    return {"token": create_token(user_id, role), "role": role, "id": user_id}


def _get_or_401(query, password: str) -> tuple:
    user = query.first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return user

@router.post("/driver/register", response_model=AuthResponse)
def register_driver(req: AuthRequest, db: Session = Depends(get_db)):
    # Check if driver already exists
    existing = db.query(models.Driver).filter(models.Driver.email == req.username_or_email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered.")
    
    new_driver = models.Driver(
        email=req.username_or_email,
        password_hash=hash_password(req.password)
    )
    db.add(new_driver)
    db.commit()
    db.refresh(new_driver)
    return _mint(new_driver.id, "driver")

@router.post("/driver/login", response_model=AuthResponse)
def login_driver(req: AuthRequest, db: Session = Depends(get_db)):
    driver = _get_or_401(
        db.query(models.Driver).filter(models.Driver.email == req.username_or_email),
        req.password,
    )
    return _mint(driver.id, "driver")

@router.post("/guard/login", response_model=AuthResponse)
def login_guard(req: AuthRequest, db: Session = Depends(get_db)):
    guard = _get_or_401(
        db.query(models.Guard).filter(models.Guard.name == req.username_or_email),
        req.password,
    )
    return _mint(guard.id, "guard")

@router.post("/admin/login", response_model=AuthResponse)
def login_admin(req: AuthRequest, db: Session = Depends(get_db)):
    admin = _get_or_401(
        db.query(models.Admin).filter(models.Admin.name == req.username_or_email),
        req.password,
    )
    return _mint(admin.id, "admin")
