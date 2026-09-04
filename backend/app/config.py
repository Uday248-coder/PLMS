"""Central config. SQLite for demo, Postgres via DATABASE_URL for institute deploy."""
import secrets
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET = "demo-secret-change-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    DATABASE_URL: str = "sqlite:///./parking_demo.db"
    JWT_SECRET: str = DEFAULT_SECRET
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480  # 8h guard shift
    RESERVED_PENDING_TIMEOUT_MIN: int = 4
    SELF_REPORT_GRACE_MIN: int = 8
    LOGIN_ATTEMPTS_PER_MINUTE: int = 30  # brute-force throttle window


settings = Settings()
if settings.JWT_SECRET == DEFAULT_SECRET:
    # Never commit a real secret: set JWT_SECRET in .env (gitignored) or environment.
    # Ephemeral per-process secret keeps a leaked-default-secret deploy from minting
    # forever-valid tokens; restarts invalidate old tokens (documented trade-off).
    settings.JWT_SECRET = secrets.token_hex(32)
