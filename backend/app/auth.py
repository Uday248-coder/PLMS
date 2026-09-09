"""JWT auth, two roles (guard, admin). No driver accounts (walk-in)."""
from datetime import datetime, timedelta, timezone
from jose import jwt
from passlib.context import CryptContext
from .config import settings

pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")  # stdlib, no 72-byte limit unlike bcrypt


def hash_password(raw: str) -> str:
    return pwd.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    return pwd.verify(raw, hashed)


def create_token(sub: str, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    return jwt.encode({"sub": sub, "role": role, "exp": exp},
                      settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
