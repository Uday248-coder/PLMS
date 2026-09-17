"""SMS & Notification service."""
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from .clock import get_current_time
from . import models

log = logging.getLogger(__name__)

recent_sms_log: list[dict] = []

def send_sms(phone: str, message: str) -> dict:
    """Logs/Dispatches SMS to recipient phone number."""
    entry = {
        "to": phone,
        "message": message,
        "timestamp": get_current_time().isoformat(),
        "status": "delivered"
    }
    recent_sms_log.insert(0, entry)
    if len(recent_sms_log) > 50:
        recent_sms_log.pop()
    log.info("[SMS -> %s]: %s", phone, message)
    return entry

def notify_student(db: Session, student: models.Student, notif_type: str, channel: str, message: str):
    """Creates a notification record and sends SMS if channel is 'sms' or 'both'."""
    notif = models.NotificationLog(
        student_id=student.id,
        type=notif_type,
        channel=channel,
        message=message,
        is_read=False,
        created_at=get_current_time()
    )
    db.add(notif)
    db.flush()

    if channel in ("sms", "both") and student.phone:
        send_sms(student.phone, message)

def get_recent_sms(limit: int = 25) -> list[dict]:
    return recent_sms_log[:limit]
