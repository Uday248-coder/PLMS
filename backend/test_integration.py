import urllib.request
import urllib.error
import json
import sys

BASE_URL = "http://127.0.0.1:8000"

def post(path, data=None, token=None):
    url = f"{BASE_URL}{path}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def get(path, token=None):
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def main():
    print("=== PLMS LIVE INTEGRATION TEST SUITE ===")

    # 1. Lots & Slots check
    lots = get("/api/lots")
    print(f"[PASS] Lots count: {len(lots)} ({', '.join(l['name'] for l in lots)})")
    assert len(lots) == 3, f"Expected 3 lots, got {len(lots)}"

    slots = get("/api/slots")
    print(f"[PASS] Total slots count: {len(slots)}")
    assert len(slots) == 60, f"Expected 60 slots, got {len(slots)}"

    # 2. Alex Rivera (Good standing student)
    alex = post("/api/auth/demo-login", {"email": "alex@campus.edu"})
    token_alex = alex["token"]
    user_alex = alex["user"]
    if user_alex["unpaid_fine_total"] > 0:
        post("/api/student/pay-all", {}, token_alex)
        alex = post("/api/auth/demo-login", {"email": "alex@campus.edu"})
        token_alex = alex["token"]
        user_alex = alex["user"]

    print(f"[PASS] Alex logged in: {user_alex['name']}, fines: {user_alex['unpaid_fine_total']}")
    assert user_alex["unpaid_fine_total"] == 0
    assert not user_alex["is_flagged"]

    # Clean up any existing active booking for Alex
    active = get("/api/student/active-booking", token_alex)
    if active:
        try:
            post("/api/student/cancel", {"booking_id": active["id"]}, token_alex)
            print(f"[INFO] Cleared previous active booking {active['id']}")
        except urllib.error.HTTPError:
            try:
                post("/api/student/leave", {"booking_id": active["id"]}, token_alex)
                print(f"[INFO] Vacated previous active booking {active['id']}")
            except urllib.error.HTTPError:
                pass

    slots = get("/api/slots")
    avail_slot = next(s for s in slots if s["status"] == "AVAILABLE")
    print(f"[PASS] Selected available slot: {avail_slot['slot_number']}")

    # Reserve slot
    res = post("/api/student/reserve", {"slot_id": avail_slot["id"]}, token_alex)
    booking_id = res["id"]
    print(f"[PASS] Slot {avail_slot['slot_number']} reserved by Alex: booking_id={booking_id}, status={res['status']}")
    assert res["status"] == "booked"

    # Active booking check
    active = get("/api/student/active-booking", token_alex)
    assert active["id"] == booking_id
    print(f"[PASS] Active booking verified: {active['id']}")

    # Park vehicle
    parked = post("/api/student/park", {"booking_id": booking_id}, token_alex)
    print(f"[PASS] Park vehicle: status={parked['status']}")
    assert parked["status"] == "parked"

    # Vacate bay
    left = post("/api/student/leave", {"booking_id": booking_id}, token_alex)
    print(f"[PASS] Vacate bay: status={left['status']}")
    assert left["status"] == "completed"

    # Slot back to available
    slots_after = get("/api/slots")
    slot_after = next(s for s in slots_after if s["id"] == avail_slot["id"])
    print(f"[PASS] Slot {avail_slot['slot_number']} restored to status: {slot_after['status']}")
    assert slot_after["status"] == "AVAILABLE"

    # 3. Rohit Verma (Flagged student with ₹1200 fines -> Hard Block test)
    admin_auth = post("/api/auth/demo-login", {"email": "admin@campus.edu"})
    rohit = post("/api/auth/demo-login", {"email": "rohit@campus.edu"})
    token_rohit = rohit["token"]
    user_rohit = rohit["user"]
    if user_rohit["unpaid_fine_total"] == 0:
        post("/api/admin/reset-demo", {}, admin_auth["token"])
        rohit = post("/api/auth/demo-login", {"email": "rohit@campus.edu"})
        token_rohit = rohit["token"]
        user_rohit = rohit["user"]

    print(f"[PASS] Rohit logged in: {user_rohit['name']}, fines: INR {user_rohit['unpaid_fine_total']}, flagged: {user_rohit['is_flagged']}")
    assert user_rohit["unpaid_fine_total"] == 1200
    assert user_rohit["is_flagged"] is True

    # Try reserving while having fines -> must receive 403
    try:
        post("/api/student/reserve", {"slot_id": avail_slot["id"]}, token_rohit)
        print("[FAIL] Reservation should have failed with 403 HARD_BLOCK!")
        sys.exit(1)
    except urllib.error.HTTPError as e:
        print(f"[PASS] Hard block successfully triggered: HTTP {e.code} ({e.reason})")
        assert e.code == 403

    # Pay all fines
    pay_res = post("/api/student/pay-all", {}, token_rohit)
    print(f"[PASS] Rohit paid all fines: amount=INR {pay_res['total_paid']}, new_fine_total=INR {pay_res['user']['unpaid_fine_total']}, flagged={pay_res['user']['is_flagged']}")
    assert pay_res["user"]["unpaid_fine_total"] == 0
    assert pay_res["user"]["is_flagged"] is False

    # Reserve now succeeds
    rohit_booking = post("/api/student/reserve", {"slot_id": avail_slot["id"]}, token_rohit)
    print(f"[PASS] Rohit can now reserve: booking_id={rohit_booking['id']}")
    assert rohit_booking["status"] == "booked"

    # Cancel booking
    post("/api/student/cancel", {"booking_id": rohit_booking["id"]}, token_rohit)
    print("[PASS] Rohit booking cancelled cleanly")

    # 5. Security Guard
    guard = post("/api/auth/demo-login", {"email": "guard@campus.edu"})
    token_guard = guard["token"]
    print(f"[PASS] Security Guard logged in: role={guard['user']['role']}")
    assert guard["user"]["role"] == "guard"

    # Plate lookup
    lookup = get("/api/guard/lookup?plate=KA-01-AB-1234", token_guard)
    print(f"[PASS] Plate lookup: found={lookup is not None}")

    # 6. Admin
    admin = post("/api/auth/demo-login", {"email": "admin@campus.edu"})
    token_admin = admin["token"]
    metrics = get("/api/admin/metrics", token_admin)
    print(f"[PASS] Admin metrics: totalSlots={metrics['totalSlots']}, occupied={metrics['occupied']}, available={metrics['available']}")
    assert metrics["totalSlots"] == 60

    # Maintenance toggle
    slot_maint = post(f"/api/admin/slots/{avail_slot['id']}/maintenance", {"on": True}, token_admin)
    print(f"[PASS] Slot {avail_slot['slot_number']} set to MAINTENANCE: status={slot_maint['status']}")
    assert slot_maint["status"] == "MAINTENANCE"

    slot_restored = post(f"/api/admin/slots/{avail_slot['id']}/maintenance", {"on": False}, token_admin)
    print(f"[PASS] Slot {avail_slot['slot_number']} restored to AVAILABLE: status={slot_restored['status']}")
    assert slot_restored["status"] == "AVAILABLE"

    # Clock checks
    clock = get("/api/clock", token_admin)
    print(f"[PASS] Virtual clock time: {clock['virtual_time']}, speed: {clock['speed']}x")

    print("\n>>> ALL 18 INTEGRATION CHECKS PASSED PERFECTLY! <<<")

if __name__ == "__main__":
    main()
