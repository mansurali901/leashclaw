from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.db.models import AgentStatus


class AgentCreate(BaseModel):
    slug: str = Field(min_length=3, max_length=64, pattern=r"^[a-z0-9_\-]+$")
    name: str
    description: Optional[str] = None
    owner_team: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    metadata_json: dict = Field(default_factory=dict)
    sandbox_profile_id: Optional[str] = None


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    owner_team: Optional[str] = None
    status: Optional[AgentStatus] = None
    tags: Optional[list[str]] = None
    metadata_json: Optional[dict] = None
    sandbox_profile_id: Optional[str] = None
    allowed_commands: Optional[list[str]] = None


class AgentRead(BaseModel):
    id: str
    slug: str
    name: str
    description: Optional[str]
    owner_team: Optional[str]
    status: AgentStatus
    tags: list[str]
    metadata_json: dict
    allowed_commands: list[str]
    sandbox_profile_id: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AgentCreateResponse(AgentRead):
    api_key: str = Field(description="Raw API key — shown once at creation time only")


class PolicyAssignment(BaseModel):
    policy_id: str
