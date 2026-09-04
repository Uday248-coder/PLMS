"""Demo seed: S1/S2/S3 lots + default users. Idempotent, zero-cost."""
from sqlalchemy import select
from sqlalchemy.orm import Session
from . import models
from .auth import hash_password, verify_password


def _make_slots(db: Session, lot_id: str, car: int, bike: int):
    for i in range(1, car + 1):
        db.add(models.Slot(lot_id=lot_id, zone="A", number=f"{i:02d}", vehicle_type="car", status="free"))
    for i in range(1, bike + 1):
        db.add(models.Slot(lot_id=lot_id, zone="B", number=f"{i:02d}", vehicle_type="bike", status="free"))


def ensure_demo_lots(db: Session) -> list[models.Lot]:
    """Demo lots S1/S2/S3, 10 slots each (6 car + 4 bike). Idempotent."""
    # Legacy rename: original "Demo Lot" becomes S1.
    legacy = db.execute(select(models.Lot).where(models.Lot.name == "Demo Lot")).scalars().first()
    if legacy and not db.execute(select(models.Lot).where(models.Lot.name == "S1")).scalars().first():
        legacy.name = "S1"
        legacy.location = "Gate 1"
        db.commit()
    lots = []
    for name, loc in (("S1", "Gate 1"), ("S2", "Gate 2"), ("S3", "Gate 3")):
        lot = db.execute(select(models.Lot).where(models.Lot.name == name)).scalars().first()
        if lot is None:
            lot = models.Lot(name=name, location=loc)
            db.add(lot)
            db.flush()
            _make_slots(db, lot.id, car=6, bike=4)
            db.commit()
            db.refresh(lot)
        lots.append(lot)
    return lots


def ensure_demo_lot(db: Session) -> models.Lot:
    return ensure_demo_lots(db)[0]


def _seed_ok(user, raw: str) -> bool:
    try:
        return verify_password(raw, user.password_hash)
    except Exception:
        return False  # legacy/broken hash (e.g. old bcrypt) → reset below


def ensure_seed_users(db: Session, demo_lot_ids: str | None = None):
    """Default demo credentials (change in production via env/DB). Idempotent."""
    admin = db.execute(select(models.Admin).where(models.Admin.name == "admin")).scalars().first()
    if admin is None:
        db.add(models.Admin(name="admin", password_hash=hash_password("admin123")))
    elif not _seed_ok(admin, "admin123"):
        admin.password_hash = hash_password("admin123")
    g = db.execute(select(models.Guard).where(models.Guard.name == "guard1")).scalars().first()
    want = [x for x in (demo_lot_ids or "").split(",") if x]
    if g is None:
        db.add(models.Guard(name="guard1", password_hash=hash_password("guard123"),
                            lot_ids=",".join(want)))
    else:
        if not _seed_ok(g, "guard123"):
            g.password_hash = hash_password("guard123")
        have = [x for x in (g.lot_ids or "").split(",") if x]
        for lid in want:
            if lid not in have:
                have.append(lid)
        g.lot_ids = ",".join(have)
    db.commit()
