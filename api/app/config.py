from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]
REQUIRED_GEMINI_MODEL = "gemini-3.5-flash-lite"


class Settings(BaseSettings):
    """Loaded from real environment variables first, then the repo-root .env (if present)."""

    model_config = SettingsConfigDict(env_file=ROOT / ".env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str
    supabase_secret_key: str = ""
    supabase_jwt_issuer: str
    database_url: str

    gemini_api_key: str = ""
    gemini_model: str = REQUIRED_GEMINI_MODEL

    allowed_origins: str = "http://localhost:5173"

    demo_payment_mode: bool = True
    demo_payment_challenge_ttl_seconds: int = 300
    demo_payment_max_attempts: int = 5

    hold_duration_seconds: int = 300
    max_seats_per_order: int = 6
    max_active_holds_per_user: int = 2
    fee_percent: int = 3

    challenge_pepper: str
    ip_hash_pepper: str

    rl_holds_per_min: int = 10
    rl_confirm_per_min: int = 10
    rl_seatmap_per_min: int = 240
    rl_catalog_per_min: int = 600
    rl_ai_per_hour: int = 5

    log_level: str = "INFO"
    trust_proxy: bool = False

    @field_validator("gemini_model")
    @classmethod
    def _model_locked(cls, v: str) -> str:
        if v != REQUIRED_GEMINI_MODEL:
            raise ValueError(f"GEMINI_MODEL must be exactly '{REQUIRED_GEMINI_MODEL}'")
        return v

    @field_validator("supabase_url", "supabase_jwt_issuer", "database_url", "challenge_pepper", "ip_hash_pepper")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("must not be blank")
        return v.strip()

    @property
    def origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def jwks_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
