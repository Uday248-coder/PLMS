import os
import pathlib
import pytest
from datetime import datetime, timezone, timedelta
from sqlalchemy import select

os.environ["DATABASE_URL"] = "sqlite:///./test_demo.db"

from app.database import Base, engine, SessionLocal
from app import models
from app.seed import seed_database
from app.auth import hash_password
from app.clock import set_simulated_time, reset_to_realtime, get_current_time
from app.fine_engine import run_fine_engine_tick, FINE_PER_HOUR, BUFFER_MINUTES
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_teardown():
    reset_to_realtime()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    seed_database(db)
    db.close()
    yield
    reset_to_realtime()
    Base.metadata.drop_all(bind=engine)

def get_auth_header(email: str):
    r = client.post("/api/auth/quick-login", json={"email": email})
    assert r.status_code == 200
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}"}

def test_seeded_data():
    db = SessionLocal()
    lots = db.execute(select(models.Lot)).scalars().all()
    assert len(lots) == 3
    for lot in lots:
        slots = db.execute(select(models.ParkingSlot).where(models.ParkingSlot.lot_id == lot.id)).scalars().all()
        assert len(slots) == 20
    db.close()

def test_movie_ticket_slot_reservation_flow():
    h = get_auth_header("alex@campus.edu")
    
    # 1. Get lots and slots for Shift 1
    r = client.get("/api/admin/overview?shift=shift_1")
    assert r.status_code == 200
    data = r.json()
    lot1 = data["lots"][0]
    slot_a1 = lot1["slots"][0]
    assert slot_a1["slot_name"] == "A01"
    assert slot_a1["display_status"] == "available"

    # 2. Student reserves Bay A1
    r_book = client.post(
        "/api/booking/reserve",
        headers=h,
        json={"slot_id": slot_a1["id"], "shift": "shift_1", "vehicle_plate": "KA-01-AB-1234"}
    )
    assert r_book.status_code == 200
    booking_id = r_book.json()["booking_id"]
    assert r_book.json()["status"] == "booked"

    # 3. Active booking query
    r_active = client.get("/api/booking/active", headers=h)
    assert r_active.status_code == 200
    assert r_active.json()["has_active"] is True
    assert r_active.json()["booking"]["slot_name"] == "A01"
    assert r_active.json()["booking"]["status"] in ("booked", "overstay")

    # 4. Concurrency / double booking protection: Another student (clean standing) tries to book A1
    h_ananya = get_auth_header("ananya@campus.edu")
    r_conflict = client.post(
        "/api/booking/reserve",
        headers=h_ananya,
        json={"slot_id": slot_a1["id"], "shift": "shift_1"}
    )
    assert r_conflict.status_code == 409

    # 5. Same student cannot book another slot while holding an active one
    slot_a2 = lot1["slots"][1]
    r_double = client.post(
        "/api/booking/reserve",
        headers=h,
        json={"slot_id": slot_a2["id"], "shift": "shift_1"}
    )
    assert r_double.status_code in (403, 409)

    # 6. Student taps 'Parked'
    r_park = client.post("/api/booking/park", headers=h, json={"booking_id": booking_id})
    assert r_park.status_code == 200
    assert r_park.json()["status"] == "parked"

    # 7. Guard verifies vehicle
    h_guard = get_auth_header("guard@campus.edu")
    r_guard = client.post("/api/admin/guard/verify", headers=h_guard, json={"booking_id": booking_id})
    assert r_guard.status_code == 200

    # 8. Student leaves early -> slot instantly becomes available
    r_leave = client.post("/api/booking/leave", headers=h, json={"booking_id": booking_id})
    assert r_leave.status_code == 200

    # Verify slot A1 is now immediately available again for Ananya
    r_ananya_book = client.post(
        "/api/booking/reserve",
        headers=h_ananya,
        json={"slot_id": slot_a1["id"], "shift": "shift_1"}
    )
    assert r_ananya_book.status_code == 200
    assert r_ananya_book.json()["status"] == "booked"

def test_slot_extension_to_shift_2():
    # Use Alex (clean standing) instead of Rohit (who now has pre-seeded fines)
    h = get_auth_header("alex@campus.edu")

    # Reserve slot in Shift 1
    r_overview = client.get("/api/admin/overview?shift=shift_1")
    lot1 = r_overview.json()["lots"][0]
    target_slot = lot1["slots"][4]

    r_book = client.post(
        "/api/booking/reserve",
        headers=h,
        json={"slot_id": target_slot["id"], "shift": "shift_1"}
    )
    assert r_book.status_code == 200
    booking_id = r_book.json()["booking_id"]

    # Student requests extension into Shift 2
    r_ext = client.post("/api/booking/extend", headers=h, json={"booking_id": booking_id})
    assert r_ext.status_code == 200
    ext_data = r_ext.json()
    assert ext_data["shift"] == "shift_2"
    assert "Assigned to" in ext_data["message"]

    # Active booking is now the new Shift 2 booking
    r_active = client.get("/api/booking/active", headers=h)
    assert r_active.status_code == 200
    assert r_active.json()["booking"]["shift"] == "shift_2"

def test_virtual_time_simulator_and_fine_reckoning():
    h = get_auth_header("ananya@campus.edu")
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Set virtual clock to 10:00 AM on today's date
    sim_time_10am = datetime.fromisoformat(f"{today_str}T10:00:00+00:00")
    client.post("/api/admin/simulator/set", json={"datetime": sim_time_10am.isoformat()})

    # Ananya books A10 for Shift 1
    r_overview = client.get("/api/admin/overview?shift=shift_1")
    slot = r_overview.json()["lots"][0]["slots"][9]
    r_book = client.post("/api/booking/reserve", headers=h, json={"slot_id": slot["id"], "shift": "shift_1"})
    assert r_book.status_code == 200
    booking_id = r_book.json()["booking_id"]

    client.post("/api/booking/park", headers=h, json={"booking_id": booking_id})

    # Fast forward time to 12:40 PM (Within 15-min grace buffer: shift ends 12:30, buffer ends 12:45)
    sim_time_1240 = datetime.fromisoformat(f"{today_str}T12:40:00+00:00")
    client.post("/api/admin/simulator/set", json={"datetime": sim_time_1240.isoformat()})

    r_active = client.get("/api/booking/active", headers=h)
    assert r_active.json()["booking"]["fine_amount"] == 0

    # Fast forward time to 01:15 PM (Exceeded buffer by 30 mins)
    sim_time_1315 = datetime.fromisoformat(f"{today_str}T13:15:00+00:00")
    client.post("/api/admin/simulator/set", json={"datetime": sim_time_1315.isoformat()})

    r_active = client.get("/api/booking/active", headers=h)
    assert r_active.json()["booking"]["status"] == "overstay"
    assert r_active.json()["booking"]["fine_amount"] == 200

    # Ananya vacates vehicle
    client.post("/api/booking/leave", headers=h, json={"booking_id": booking_id})

    # Ananya now has an unpaid fine of 200 -> Future bookings must be blocked!
    slot_a2 = r_overview.json()["lots"][0]["slots"][1]
    r_blocked_book = client.post(
        "/api/booking/reserve",
        headers=h,
        json={"slot_id": slot_a2["id"], "shift": "shift_1"}
    )
    assert r_blocked_book.status_code == 403

    # Admin settles fine
    r_fines = client.get("/api/admin/fines")
    fine_id = r_fines.json()["fines"][0]["fine_id"]
    r_settle = client.post(f"/api/admin/fines/{fine_id}/settle")
    assert r_settle.status_code == 200

    # Now Ananya can book again!
    r_unblocked_book = client.post(
        "/api/booking/reserve",
        headers=h,
        json={"slot_id": slot_a2["id"], "shift": "shift_1"}
    )
    assert r_unblocked_book.status_code == 200

def test_admin_slot_state_override():
    # Admin forces Slot A3 in Lot 1 to 'blocked'
    r_overview = client.get("/api/admin/overview?shift=shift_1")
    slot = r_overview.json()["lots"][0]["slots"][2]

    r_override = client.post(
        f"/api/admin/slots/{slot['id']}/override",
        json={"override_status": "blocked"}
    )
    assert r_override.status_code == 200

    # Student attempts to book blocked slot -> 409
    h = get_auth_header("alex@campus.edu")
    r_fail = client.post(
        "/api/booking/reserve",
        headers=h,
        json={"slot_id": slot["id"], "shift": "shift_1"}
    )
    assert r_fail.status_code == 409

    # Admin reverts override back to 'available'
    client.post(
        f"/api/admin/slots/{slot['id']}/override",
        json={"override_status": "available"}
    )
    r_success = client.post(
        "/api/booking/reserve",
        headers=h,
        json={"slot_id": slot["id"], "shift": "shift_1"}
    )
    assert r_success.status_code == 200

def test_admin_slot_status_manual_override():
    admin_h = get_auth_header("admin@campus.edu")
    student_h = get_auth_header("ananya@campus.edu")

    # Fetch slots
    slots_res = client.get("/api/slots")
    assert slots_res.status_code == 200
    slot = slots_res.json()[0]
    slot_id = slot["id"]

    # 1. Admin sets slot to MAINTENANCE
    r_maint = client.post(
        f"/api/admin/slots/{slot_id}/status",
        headers=admin_h,
        json={"status": "MAINTENANCE"}
    )
    assert r_maint.status_code == 200
    assert r_maint.json()["status"] == "MAINTENANCE"

    # 2. Student cannot book MAINTENANCE slot
    r_fail = client.post(
        "/api/student/reserve",
        headers=student_h,
        json={"slot_id": slot_id, "shift": "shift_1"}
    )
    assert r_fail.status_code == 409

    # 3. Admin sets slot back to AVAILABLE
    r_avail = client.post(
        f"/api/admin/slots/{slot_id}/status",
        headers=admin_h,
        json={"status": "AVAILABLE"}
    )
    assert r_avail.status_code == 200
    assert r_avail.json()["status"] == "AVAILABLE"

    # Set virtual time to 10:00 AM (Shift 1 in session)
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sim_time_10am = datetime.fromisoformat(f"{today_str}T10:00:00+00:00")
    client.post("/api/clock/set", headers=admin_h, json={"virtual_time": sim_time_10am.isoformat()})

    # 4. Student books slot -> status is BOOKED
    r_book = client.post(
        "/api/student/reserve",
        headers=student_h,
        json={"slot_id": slot_id, "shift": "shift_1"}
    )
    assert r_book.status_code == 200

    slots_after_book = client.get("/api/slots").json()
    booked_slot = next(s for s in slots_after_book if s["id"] == slot_id)
    assert booked_slot["status"] == "BOOKED"

    # 5. Admin force overrides slot to AVAILABLE (evict / release active booking)
    r_force_avail = client.post(
        f"/api/admin/slots/{slot_id}/status",
        headers=admin_h,
        json={"status": "AVAILABLE"}
    )
    assert r_force_avail.status_code == 200
    assert r_force_avail.json()["status"] == "AVAILABLE"

    # Verify slot is indeed AVAILABLE now
    slots_after_clear = client.get("/api/slots").json()
    cleared_slot = next(s for s in slots_after_clear if s["id"] == slot_id)
    assert cleared_slot["status"] == "AVAILABLE"
    assert cleared_slot["current_booking_id"] is None

    # 6. Admin sets slot to CLOSED / BLOCKED
    r_closed = client.post(
        f"/api/admin/slots/{slot_id}/status",
        headers=admin_h,
        json={"status": "CLOSED"}
    )
    assert r_closed.status_code == 200
    assert r_closed.json()["status"] == "CLOSED"
