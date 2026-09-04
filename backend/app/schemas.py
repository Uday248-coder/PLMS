"""Request schemas + validation vocab shared by route modules."""
from pydantic import BaseModel

VALID_VEHICLE_TYPES = {"car", "bike", "truck"}
VALID_FLOW_TYPES = {"guard_managed", "self_report"}


class Login(BaseModel):
    name: str
    password: str
    role: str  # guard | admin


class Checkin(BaseModel):
    lot_id: str
    vehicle_type: str = "car"
    vehicle_ref: str = ""
    flow_type: str = "self_report"
    estimated_minutes: int | None = None


class Tap(BaseModel):
    session_id: str
