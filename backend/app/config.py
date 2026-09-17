"""Central config. SQLite for demo, Postgres via DATABASE_URL for institute deploy."""
import logging
import secrets
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Anchor to the backend directory so the DB path is consistent regardless of CWD
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_DB_PATH = _BACKEND_DIR / "parking_demo.db"

DEFAULT_SECRET = "demo-secret-change-in-production"
# Deterministic dev-mode secret so browser sessions survive server restarts
DEV_FALLBACK_SECRET = "plms-dev-jwt-secret-do-not-use-in-prod-2024"
DEFAULT_BUFFER_MIN = 15
DEFAULT_SLOT1_START = "09:00"
DEFAULT_SLOT1_END = "12:30"
DEFAULT_SLOT2_START = "12:30"
DEFAULT_SLOT2_END = "17:00"
DEFAULT_SMS_MOCK = True
DEFAULT_FINE_PER_MINUTE = 5
DEFAULT_BUFFER_TIME = 15

log = logging.getLogger(__name__)

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    DATABASE_URL: str = f"sqlite:///{_DEFAULT_DB_PATH.as_posix()}"
    JWT_SECRET: str = DEFAULT_SECRET
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:8000"
    BUFFER_TIME_MIN: int = DEFAULT_BUFFER_TIME
    FINE_PER_MINUTE: int = DEFAULT_FINE_PER_MINUTE
    SLOT1_START: str = DEFAULT_SLOT1_START
    SLOT1_END: str = DEFAULT_SLOT1_END
    SLOT2_START: str = DEFAULT_SLOT2_START
    SLOT2_END: str = DEFAULT_SLOT2_END
    SMS_MOCK: bool = DEFAULT_SMS_MOCK
    SMS_API_KEY: str = ""
    SMS_PHONE_PREFIX: str = "+91"
    OVERDUE_ALERT_ENABLED: bool = True
    MAX_BOOKINGS_PER_STUDENT: int = 1

settings = Settings()
if settings.JWT_SECRET == DEFAULT_SECRET:
    # Use a deterministic dev secret so sessions survive restarts
    settings.JWT_SECRET = DEV_FALLBACK_SECRET
    log.warning("JWT_SECRET not set — using deterministic dev fallback. Set JWT_SECRET in .env for production.")

def get_cors_origins() -> list[str]:
    return [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]