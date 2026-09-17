"""Global Virtual Time Service.
Allows simulating time shifts, buffer expirations, and fine reckoning for testing and demo.
"""
from datetime import datetime, timezone, timedelta, time
import logging

log = logging.getLogger(__name__)

# Configured Shift Timings
SHIFT_1_START = time(9, 0)
SHIFT_1_END = time(12, 30)
SHIFT_1_BUFFER_END = time(12, 45) # 15 min internal grace period

SHIFT_2_START = time(14, 0)
SHIFT_2_END = time(17, 30)
SHIFT_2_BUFFER_END = time(17, 45) # 15 min internal grace period

_simulated_time: datetime | None = None

# Speed-aware virtual clock (frontend compat layer).
# When _simulated_time is set (legacy simulator/tests), it wins.
# Otherwise virtual time = _base_virtual + _manual_offset + (now - _base_real) * _speed.
_speed: float = 1.0
_base_real: datetime | None = None
_base_virtual: datetime | None = None
_manual_offset: timedelta = timedelta(0)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def get_current_time() -> datetime:
    """Returns the current simulated time if active, else speed-adjusted real time."""
    if _simulated_time is not None:
        return _simulated_time
    if _speed == 1.0 and _manual_offset == timedelta(0) and _base_virtual is None:
        return _utcnow()
    base_real = _base_real or _utcnow()
    base_virtual = _base_virtual or base_real
    elapsed = (_utcnow() - base_real).total_seconds()
    return base_virtual + _manual_offset + timedelta(seconds=elapsed * _speed)


def get_speed() -> float:
    return _speed


def set_speed(speed: float) -> float:
    """Set speed multiplier, anchoring base so visible clock doesn't jump."""
    global _speed, _base_real, _base_virtual, _manual_offset
    cur = get_current_time()
    _speed = float(speed) if float(speed) > 0 else 1.0
    _base_real = _utcnow()
    _base_virtual = cur
    _manual_offset = timedelta(0)
    log.info("Clock speed set to %sx", _speed)
    return _speed


def jump_clock(delta: timedelta) -> datetime:
    """Shift virtual clock by a timedelta, preserving speed."""
    global _manual_offset
    _manual_offset = _manual_offset + delta
    log.info("Clock jumped by %s", delta)
    return get_current_time()


def set_virtual_time(dt: datetime) -> datetime:
    """Hard-set virtual clock (clears simulated-time legacy path too)."""
    global _base_real, _base_virtual, _manual_offset, _simulated_time
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    _simulated_time = None
    _base_real = _utcnow()
    _base_virtual = dt
    _manual_offset = timedelta(0)
    log.info("Virtual time set to: %s", dt.isoformat())
    return dt

def set_simulated_time(dt: datetime):
    global _simulated_time
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    _simulated_time = dt
    log.info("Simulated time set to: %s", _simulated_time.isoformat())

def advance_simulated_minutes(minutes: int):
    global _simulated_time
    current = get_current_time()
    _simulated_time = current + timedelta(minutes=minutes)
    log.info("Simulated time advanced by %d mins to: %s", minutes, _simulated_time.isoformat())

def reset_to_realtime():
    global _simulated_time, _speed, _base_real, _base_virtual, _manual_offset
    _simulated_time = None
    _speed = 1.0
    _base_real = None
    _base_virtual = None
    _manual_offset = timedelta(0)
    log.info("Simulated time reset to real-time clock")

def is_simulated() -> bool:
    return _simulated_time is not None

def get_current_shift(now: datetime | None = None) -> tuple[str | None, str]:
    """
    Returns (shift_key, status_description).
    shift_key: 'shift_1' | 'shift_2' | None
    """
    dt = now or get_current_time()
    current_minutes = dt.hour * 60 + dt.minute

    s1_start = 9 * 60
    s1_end = 12 * 60 + 30
    s2_start = 14 * 60
    s2_end = 17 * 60 + 30

    if s1_start <= current_minutes < s1_end:
        return "shift_1", "Shift 1 Active (09:00 - 12:30)"
    elif s1_end <= current_minutes < s2_start:
        return None, "Midday Break (12:30 - 14:00)"
    elif s2_start <= current_minutes < s2_end:
        return "shift_2", "Shift 2 Active (14:00 - 17:30)"
    else:
        return None, "Campus Parking Closed"
