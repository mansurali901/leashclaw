from typing import Optional
from pydantic import BaseModel, Field


class EngineSettingsRead(BaseModel):
    # Writable — stored in system_settings table
    default_effect: str = Field(description="'allow' or 'deny' when no rule matches")
    # Read-only — from environment / config
    policy_engine_backend: str
    default_rate_limit_per_minute: int
    opa_url: Optional[str]


class EngineSettingsUpdate(BaseModel):
    default_effect: Optional[str] = Field(
        default=None,
        description="Override the fallback effect when no rule matches: 'allow' or 'deny'",
    )

    def validate_effect(self) -> None:
        if self.default_effect is not None and self.default_effect not in ("allow", "deny"):
            raise ValueError("default_effect must be 'allow' or 'deny'")
