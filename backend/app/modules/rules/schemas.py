from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.db.models import ActionType, Effect, ResourceType, SubjectType


class RuleCondition(BaseModel):
    """
    Small metadata-condition DSL. Each key maps to a request-metadata field;
    each value is an operator object, e.g.:
      {"classification": {"in": ["confidential", "pii", "secret"]},
       "location": {"eq": "production"}}
    Supported operators: eq, ne, in, not_in, gt, gte, lt, lte, contains
    """
    pass  # validated dynamically as dict — see engine for operator handling


class RuleCreate(BaseModel):
    policy_id: str
    name: str
    description: Optional[str] = None
    subject_type: SubjectType = SubjectType.AGENT
    subject_value: str = Field(description="agent slug, role, team, user id, or '*'")
    action: ActionType
    resource_type: ResourceType
    resource_pattern: str
    condition: dict = Field(default_factory=dict)
    effect: Effect = Effect.DENY
    priority: int = Field(default=100, ge=0, le=10000)
    enabled: bool = True
    alert_on_match: bool = False
    rate_limit_per_minute: Optional[int] = Field(default=None, ge=1)

    @field_validator("resource_pattern")
    @classmethod
    def _non_empty_pattern(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("resource_pattern must not be empty")
        return v


class RuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    subject_type: Optional[SubjectType] = None
    subject_value: Optional[str] = None
    action: Optional[ActionType] = None
    resource_type: Optional[ResourceType] = None
    resource_pattern: Optional[str] = None
    condition: Optional[dict] = None
    effect: Optional[Effect] = None
    priority: Optional[int] = Field(default=None, ge=0, le=10000)
    enabled: Optional[bool] = None
    alert_on_match: Optional[bool] = None
    rate_limit_per_minute: Optional[int] = Field(default=None, ge=1)


class RuleRead(BaseModel):
    id: str
    policy_id: str
    name: str
    description: Optional[str]
    subject_type: SubjectType
    subject_value: str
    action: ActionType
    resource_type: ResourceType
    resource_pattern: str
    condition: dict
    effect: Effect
    priority: int
    enabled: bool
    alert_on_match: bool
    rate_limit_per_minute: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
