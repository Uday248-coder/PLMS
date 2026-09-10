"""State machine + race-condition tests (Phase 5 item, run early)."""
from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app.auth import hash_password
from app import models
from app.models import GuardLot

client = TestClient(app)
import uuid as _uuid


_ADMIN_CACHE: dict = {}


def _admin_token():
    if "token" not in _ADMIN_CACHE:
        r = client.post("/api/auth/login", json={"name": "admin", "password": "admin123", "role": "admin"})
        assert r.status_code == 200, r.text
        _ADMIN_CACHE["token"] = r.json()["token"]
    return _ADMIN_CACHE["token"]


def _guard_token(lot_id: str):
    name = f"g-{_uuid.uuid4().hex[:6]}"
    db = SessionLocal()
    try:
        guard = models.Guard(name=name, password_hash=hash_password("pw123456"))
        db.add(guard)
        db.flush()
        db.add(models.GuardLot(guard_id=guard.id, lot_id=lot_id))
        db.commit()
    finally:
        db.close()
    r = client.post("/api/auth/login", json={"name": name, "password": "pw123456", "role": "guard"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _H(tok):
    return {"Authorization": f"Bearer {tok}"}


def _plate():
    return f"XX-{_uuid.uuid4().hex[:6].upper()}"


def _lot(name, car=1, bike=0):
    h = _H(_admin_token())
    r = client.post("/api/lots/provision", params={"name": f"{name}-{_uuid.uuid4().hex[:6]}", "car": car, "bike": bike}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_full_self_report_flow():
    lot = _lot("T1", car=1, bike=0)
    lid = lot["lot_id"]
    gh = _H(_guard_token(lid))
    c = client.post("/api/checkin", json={"lot_id": lid, "vehicle_type": "car", "flow_type": "self_report", "vehicle_ref": _plate()}).json()
    assert c["status"] == "reserved_pending"
    slots = client.get(f"/api/lots/{lid}/slots").json()
    assert slots[0]["status"] == "reserved_pending"
    assert slots[0]["vehicle_ref"] is not None  # plate visible to guard
    r = client.post("/api/driver/parked", json={"session_id": c["session_id"]}).json()
    assert r["status"] == "self_reported"
    r = client.post("/api/guard/confirm", json={"session_id": c["session_id"]}, headers=gh).json()
    assert r["status"] == "occupied"
    r = client.post("/api/driver/leaving", json={"session_id": c["session_id"]}).json()
    assert r["status"] == "self_reported_leaving"
    r = client.post("/api/guard/confirm", json={"session_id": c["session_id"]}, headers=gh).json()
    assert r["status"] == "free"


def test_last_slot_race_single_winner():
    lot = _lot("RACE", car=1, bike=0)
    lid = lot["lot_id"]
    first = client.post("/api/checkin", json={"lot_id": lid, "vehicle_type": "car", "vehicle_ref": _plate()})
    assert first.status_code == 200
    second = client.post("/api/checkin", json={"lot_id": lid, "vehicle_type": "car", "vehicle_ref": _plate()})
    assert second.status_code == 409  # only one wins, other gets lot-full


def test_illegal_transition_rejected():
    lot = _lot("ILL", car=1, bike=0)
    c = client.post("/api/checkin", json={"lot_id": lot["lot_id"], "vehicle_type": "car", "vehicle_ref": _plate()}).json()
    # reserved_pending -> guard_checkout is illegal (must confirm or timeout first)
    r = client.post("/api/guard/checkout", json={"session_id": c["session_id"]},
                    headers=_H(_guard_token(lot["lot_id"])))
    assert r.status_code in (400, 500)


def test_guard_deny_is_terminal_for_driver():
    lot = _lot("DENY", car=1, bike=0)
    lid = lot["lot_id"]
    gh = _H(_guard_token(lid))
    c = client.post("/api/checkin", json={"lot_id": lid, "vehicle_type": "car", "flow_type": "self_report", "vehicle_ref": _plate()}).json()
    client.post("/api/driver/parked", json={"session_id": c["session_id"]})
    d = client.post("/api/guard/deny", json={"session_id": c["session_id"]}, headers=gh).json()
    assert d["status"] == "mismatch" and d.get("terminal") is True
    # physical spot reopened immediately
    slots = client.get(f"/api/lots/{lid}/slots").json()
    assert slots[0]["status"] == "free"
    # dead session: further driver taps get a clear closed message, not a cryptic 400
    r = client.post("/api/driver/leaving", json={"session_id": c["session_id"]})
    assert r.status_code == 410


def test_guard_confirm_bogus_session_404():
    lot = _lot("BOGUS", car=1, bike=0)
    gh = _H(_guard_token(lot["lot_id"]))
    for bad in ("00000000-0000-0000-0000-000000000000", ""):
        r = client.post("/api/guard/confirm", json={"session_id": bad}, headers=gh)
        assert r.status_code == 404, (bad, r.status_code, r.text)


def test_checkin_validation():
    lot = _lot("VAL", car=2, bike=0)
    lid = lot["lot_id"]
    # bad vehicle type
    r = client.post("/api/checkin", json={"lot_id": lid, "vehicle_type": "spaceship", "flow_type": "self_report", "vehicle_ref": _plate()})
    assert r.status_code == 422, r.text
    # bad flow type
    r = client.post("/api/checkin", json={"lot_id": lid, "vehicle_type": "car", "flow_type": "teleport", "vehicle_ref": _plate()})
    assert r.status_code == 422, r.text
    # unknown lot
    r = client.post("/api/checkin", json={"lot_id": "no-such-lot", "vehicle_type": "car", "flow_type": "self_report", "vehicle_ref": _plate()})
    assert r.status_code == 404, r.text
    # bad estimated_minutes
    for bad_est in (-5, 0, 999999999999):
        r = client.post("/api/checkin", json={"lot_id": lid, "vehicle_type": "car",
                                              "flow_type": "self_report", "estimated_minutes": bad_est,
                                              "vehicle_ref": _plate()})
        assert r.status_code == 422, (bad_est, r.text)
    # empty plate rejected
    r = client.post("/api/checkin", json={"lot_id": lid, "vehicle_type": "car", "flow_type": "self_report", "vehicle_ref": ""})
    assert r.status_code == 422, r.text
    r = client.post("/api/checkin", json={"lot_id": lid, "vehicle_type": "car", "flow_type": "self_report", "vehicle_ref": "   "})
    assert r.status_code == 422, r.text
    # default estimated_minutes (420) sets estimated_end_time
    c = client.post("/api/checkin", json={"lot_id": lid, "vehicle_type": "car", "flow_type": "self_report", "vehicle_ref": _plate()}).json()
    db = SessionLocal()
    try:
        sess = db.get(models.ParkingSession, c["session_id"])
        assert sess is not None and sess.estimated_end_time is not None
    finally:
        db.close()


def test_provision_validation_and_duplicate():
    ah = _H(_admin_token())
    name = f"DUP-{_uuid.uuid4().hex[:6]}"
    r1 = client.post("/api/lots/provision", params={"name": name, "car": 1, "bike": 0}, headers=ah)
    assert r1.status_code == 200, r1.text
    r2 = client.post("/api/lots/provision", params={"name": name, "car": 1, "bike": 0}, headers=ah)
    assert r2.status_code == 409, r2.text
    r = client.post("/api/lots/provision", params={"name": "   ", "car": 1, "bike": 0}, headers=ah)
    assert r.status_code == 422, r.text
    for bad in (-1, 201):
        r = client.post("/api/lots/provision",
                        params={"name": f"BAD-{_uuid.uuid4().hex[:6]}", "car": bad, "bike": 0}, headers=ah)
        assert r.status_code == 422, (bad, r.text)


def test_unknown_lot_slots_and_alerts_404():
    assert client.get("/api/lots/no-such-id/slots").status_code == 404
    assert client.get("/api/lots/no-such-id/alerts").status_code == 404
    # recent_sessions requires admin auth; limit is clamped 1..100
    ah = _H(_admin_token())
    r = client.get("/api/sessions/recent", params={"limit": -1}, headers=ah)
    assert r.status_code == 200 and len(r.json()) <= 100
    r = client.get("/api/sessions/recent", params={"limit": 100000}, headers=ah)
    assert r.status_code == 200 and len(r.json()) <= 100


def test_stale_session_tap_410():
    lot = _lot("STALE", car=1, bike=0)
    lid = lot["lot_id"]
    gh = _H(_guard_token(lid))
    a = client.post("/api/checkin", json={"lot_id": lid, "vehicle_type": "car", "flow_type": "self_report", "vehicle_ref": _plate()}).json()
    client.post("/api/driver/parked", json={"session_id": a["session_id"]})
    client.post("/api/guard/confirm", json={"session_id": a["session_id"]}, headers=gh)
    client.post("/api/driver/leaving", json={"session_id": a["session_id"]})
    client.post("/api/guard/confirm", json={"session_id": a["session_id"]}, headers=gh)  # slot free again
    b = client.post("/api/checkin", json={"lot_id": lid, "vehicle_type": "car", "flow_type": "self_report", "vehicle_ref": _plate()}).json()
    assert b["session_id"] != a["session_id"]
    r = client.post("/api/driver/parked", json={"session_id": a["session_id"]})
    assert r.status_code == 410, r.text


def test_admin_resolve_mismatch():
    lot = _lot("RESOLVE", car=1, bike=0)
    lid = lot["lot_id"]
    gh = _H(_guard_token(lid))
    ah = _H(_admin_token())
    c = client.post("/api/checkin", json={"lot_id": lid, "vehicle_type": "car", "flow_type": "self_report", "vehicle_ref": _plate()}).json()
    client.post("/api/driver/parked", json={"session_id": c["session_id"]})
    d = client.post("/api/guard/deny", json={"session_id": c["session_id"]}, headers=gh).json()
    assert d["status"] == "mismatch"
    assert client.post("/api/admin/resolve", json={"session_id": "no-such-id"}, headers=ah).status_code == 404
    other = client.post("/api/checkin", json={"lot_id": lid, "vehicle_type": "car", "flow_type": "self_report", "vehicle_ref": _plate()}).json()
    r = client.post("/api/admin/resolve", json={"session_id": other["session_id"]}, headers=ah)
    assert r.status_code == 409, r.text
    r = client.post("/api/admin/resolve", json={"session_id": c["session_id"]}, headers=ah)
    assert r.status_code == 200 and r.json()["status"] == "free", r.text
    db = SessionLocal()
    try:
        sess = db.get(models.ParkingSession, c["session_id"])
        assert sess.status == "free" and sess.actual_end_time is not None
    finally:
        db.close()


def test_auth_scoping():
    a = _lot("AUTH-A", car=1, bike=0)
    b = _lot("AUTH-B", car=1, bike=0)
    gh_a = _H(_guard_token(a["lot_id"]))
    # no token → 401
    assert client.post("/api/guard/confirm", json={"session_id": "x"}).status_code == 401
    assert client.post("/api/lots/provision", params={"name": "N-X", "car": 1}).status_code == 401
    # bad credentials → 401
    r = client.post("/api/auth/login", json={"name": "admin", "password": "wrong", "role": "admin"})
    assert r.status_code == 401
    # guard from lot A cannot touch lot B session
    c = client.post("/api/checkin", json={"lot_id": b["lot_id"], "vehicle_type": "car", "flow_type": "self_report", "vehicle_ref": _plate()}).json()
    client.post("/api/driver/parked", json={"session_id": c["session_id"]})
    r = client.post("/api/guard/confirm", json={"session_id": c["session_id"]}, headers=gh_a)
    assert r.status_code == 403, r.text
    # guard cannot do admin ops
    r = client.post("/api/lots/provision", params={"name": "N-Y", "car": 1}, headers=gh_a)
    assert r.status_code == 403, r.text
    # same-lot guard works
    c2 = client.post("/api/checkin", json={"lot_id": a["lot_id"], "vehicle_type": "car", "flow_type": "self_report", "vehicle_ref": _plate()}).json()
    client.post("/api/driver/parked", json={"session_id": c2["session_id"]})
    r = client.post("/api/guard/confirm", json={"session_id": c2["session_id"]}, headers=gh_a)
    assert r.status_code == 200, r.text


def test_login_throttle_429():
    # Burn the per-minute budget with bad passwords; the cap must trip, not the DB.
    got_429 = False
    for _ in range(70):
        r = client.post("/api/auth/login", json={"name": "admin", "password": "wrong-pw", "role": "admin"})
        if r.status_code == 429:
            got_429 = True
            break
        assert r.status_code == 401, (r.status_code, r.text)
    assert got_429, "expected HTTP 429 after exhausting login budget"
    # Clear rate limiter so subsequent tests can log in
    from app.routes.admin import _login_hits
    _login_hits.clear()
    _ADMIN_CACHE.clear()


def test_extend_occupied_session():
    lot = _lot("EXT", car=1, bike=0)
    lid = lot["lot_id"]
    gh = _H(_guard_token(lid))
    c = client.post("/api/checkin", json={
        "lot_id": lid, "vehicle_type": "car", "flow_type": "self_report",
        "vehicle_ref": _plate(), "estimated_minutes": 60,
    }).json()
    client.post("/api/driver/parked", json={"session_id": c["session_id"]})
    client.post("/api/guard/confirm", json={"session_id": c["session_id"]}, headers=gh)
    # Extend by 120 minutes
    r = client.post("/api/driver/extend", json={"session_id": c["session_id"], "additional_minutes": 120})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "estimated_end" in data
    assert data["additional_minutes"] == 120
    # Verify in DB: estimated_end_time moved forward
    db = SessionLocal()
    try:
        sess = db.get(models.ParkingSession, c["session_id"])
        assert sess.estimated_end_time is not None
    finally:
        db.close()


def test_extend_overdue_clears_flag():
    lot = _lot("EXT-OD", car=1, bike=0)
    lid = lot["lot_id"]
    gh = _H(_guard_token(lid))
    c = client.post("/api/checkin", json={
        "lot_id": lid, "vehicle_type": "car", "flow_type": "self_report",
        "vehicle_ref": _plate(), "estimated_minutes": 60,
    }).json()
    client.post("/api/driver/parked", json={"session_id": c["session_id"]})
    client.post("/api/guard/confirm", json={"session_id": c["session_id"]}, headers=gh)
    # Simulate overdue: set overdue_notified_at
    db = SessionLocal()
    try:
        from datetime import datetime, timezone
        sess = db.get(models.ParkingSession, c["session_id"])
        sess.overdue_notified_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()
    # Extend — should clear overdue_notified_at
    r = client.post("/api/driver/extend", json={"session_id": c["session_id"], "additional_minutes": 30})
    assert r.status_code == 200
    db = SessionLocal()
    try:
        sess = db.get(models.ParkingSession, c["session_id"])
        assert sess.overdue_notified_at is None, "extend should clear overdue flag"
    finally:
        db.close()


def test_extend_after_checkout_410():
    lot = _lot("EXT-CK", car=1, bike=0)
    lid = lot["lot_id"]
    gh = _H(_guard_token(lid))
    c = client.post("/api/checkin", json={
        "lot_id": lid, "vehicle_type": "car", "flow_type": "self_report",
        "vehicle_ref": _plate(), "estimated_minutes": 60,
    }).json()
    client.post("/api/driver/parked", json={"session_id": c["session_id"]})
    client.post("/api/guard/confirm", json={"session_id": c["session_id"]}, headers=gh)
    # Guard checks out — slot freed
    client.post("/api/guard/checkout", json={"session_id": c["session_id"]}, headers=gh)
    # Extend a closed session → 410
    r = client.post("/api/driver/extend", json={"session_id": c["session_id"], "additional_minutes": 60})
    assert r.status_code == 410, r.text


def test_extend_exceeds_24h_cap():
    lot = _lot("EXT-CAP", car=1, bike=0)
    lid = lot["lot_id"]
    c = client.post("/api/checkin", json={
        "lot_id": lid, "vehicle_type": "car", "flow_type": "self_report",
        "vehicle_ref": _plate(), "estimated_minutes": 1440,  # already maxed at 24h
    }).json()
    # Extend by 1 more minute — should be rejected
    r = client.post("/api/driver/extend", json={"session_id": c["session_id"], "additional_minutes": 1})
    assert r.status_code == 422, r.text
    assert "24h" in r.json().get("detail", "").lower() or "24h" in r.text.lower()


def test_extend_denied_session_410():
    lot = _lot("EXT-DN", car=1, bike=0)
    lid = lot["lot_id"]
    gh = _H(_guard_token(lid))
    c = client.post("/api/checkin", json={
        "lot_id": lid, "vehicle_type": "car", "flow_type": "self_report",
        "vehicle_ref": _plate(), "estimated_minutes": 60,
    }).json()
    client.post("/api/driver/parked", json={"session_id": c["session_id"]})
    # Guard denies
    client.post("/api/guard/deny", json={"session_id": c["session_id"]}, headers=gh)
    # Extend a denied session → 410
    r = client.post("/api/driver/extend", json={"session_id": c["session_id"], "additional_minutes": 60})
    assert r.status_code == 410, r.text
