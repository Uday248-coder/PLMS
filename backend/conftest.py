"""Test isolation: override DATABASE_URL before app modules load,
reset between tests, clean up after session."""
import os
import pathlib

os.environ["DATABASE_URL"] = "sqlite:///./test_demo.db"

import pytest
from app.database import Base, engine, SessionLocal
from app.seed import ensure_demo_lots, ensure_seed_users


@pytest.fixture(scope="session", autouse=True)
def _test_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    for f in ("test_demo.db", "test_demo.db-journal"):
        p = pathlib.Path(f)
        if p.exists():
            p.unlink()


@pytest.fixture(autouse=True)
def _reset_tables():
    """Wipe and reseed tables before every test."""
    engine.dispose()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        lots = ensure_demo_lots(db)
        ensure_seed_users(db, ",".join(l.id for l in lots))
        db.commit()
    finally:
        db.close()
    yield
    engine.dispose()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _clear_caches():
    """Reset module-level caches so stale tokens don't leak across tests."""
    import test_state
    test_state._ADMIN_CACHE.clear()
    yield