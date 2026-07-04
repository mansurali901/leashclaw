"""
Central application configuration.

All secrets and environment-specific values are sourced from environment
variables (via .env in local dev). Nothing sensitive is hardcoded.
"""
from functools import lru_cache
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- App ---
    APP_NAME: str = "Agent Guardrail Engine"
    ENV: str = Field(default="development")
    DEBUG: bool = Field(default=False)
    API_V1_PREFIX: str = "/api/v1"

    # --- Database ---
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://guardrail:guardrail@localhost:5432/guardrail",
        description="Async SQLAlchemy DSN for Postgres",
    )
    SYNC_DATABASE_URL: str = Field(
        default="postgresql+psycopg2://guardrail:guardrail@localhost:5432/guardrail",
        description="Sync DSN used by Alembic migrations",
    )

    # --- Redis (cache + rate limiting + queue) ---
    REDIS_URL: str = Field(default="redis://localhost:6379/0")

    # --- Auth / JWT ---
    JWT_SECRET_KEY: str = Field(..., description="Must be set via environment, no default in prod")
    JWT_ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30)
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7)
    SERVICE_API_KEY_HEADER: str = Field(default="X-Agent-Api-Key")

    # --- CORS ---
    CORS_ORIGINS: List[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    # --- Rate limiting defaults ---
    DEFAULT_RATE_LIMIT_PER_MINUTE: int = Field(default=60)

    # --- Policy engine ---
    POLICY_DEFAULT_EFFECT: str = Field(default="deny", description="Fail-closed by default")
    POLICY_ENGINE_BACKEND: str = Field(default="internal", description="'internal' or 'opa'")
    OPA_URL: str | None = Field(default=None, description="Only used when POLICY_ENGINE_BACKEND=opa")

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @field_validator("POLICY_DEFAULT_EFFECT")
    @classmethod
    def _validate_default_effect(cls, v: str) -> str:
        if v not in ("allow", "deny"):
            raise ValueError("POLICY_DEFAULT_EFFECT must be 'allow' or 'deny'")
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
