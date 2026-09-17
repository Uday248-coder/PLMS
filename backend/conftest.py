"""Test isolation: override DATABASE_URL before app modules load,
reset between tests, clean up after session."""
import os
import pathlib

os.environ["DATABASE_URL"] = "sqlite:///./test_demo.db"

import pytest
from app.database import Base, engine, SessionLocal
from app.seed import seed_database
from app.clock import reset_to_realtime


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
    reset_to_realtime()
    engine.dispose()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db)
        db.commit()
    finally:
        db.close()
    yield
    reset_to_realtime()
    engine.dispose()
    Base.metadata.drop_all(bind=engine)
