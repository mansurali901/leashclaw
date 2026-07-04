from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.db.models import Effect


class AuditLogRead(BaseModel):
    id: str
    event_type: str
    actor_id: Optional[str]
    actor_type: str
    target_type: Optional[str]
    target_id: Optional[str]
    payload: dict
    ip_address: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class AccessDecisionRead(BaseModel):
    id: str
    agent_id: Optional[str]
    user_id: Optional[str]
    action_type: str
    resource_type: str
    resource_identifier: str
    decision: Effect
    matched_rule_id: Optional[str]
    reason: str
    request_metadata: dict
    latency_ms: Optional[float]
    created_at: datetime

    class Config:
        from_attributes = True
