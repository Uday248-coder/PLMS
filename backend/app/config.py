"""Central config. SQLite for demo, Postgres via DATABASE_URL for institute deploy."""
import logging
import secrets
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET = "demo-secret-change-in-production"

log = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    DATABASE_URL: str = "sqlite:///./parking_demo.db"
    JWT_SECRET: str = DEFAULT_SECRET
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480  # 8h guard shift
    RESERVED_PENDING_TIMEOUT_MIN: int = 4
    SELF_REPORT_GRACE_MIN: int = 8
    LOGIN_ATTEMPTS_PER_MINUTE: int = 30
    # Comma-separated allowed origins. Set to your real domain in production.
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:8000"


settings = Settings()
if settings.JWT_SECRET == DEFAULT_SECRET:
    settings.JWT_SECRET = secrets.token_hex(32)
    log.warning(
        "JWT_SECRET not set — generated an ephemeral secret. "
        "Tokens will be invalidated on every restart. "
        "Set JWT_SECRET in backend/.env for a stable secret."
    )


def get_cors_origins() -> list[str]:
    return [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
