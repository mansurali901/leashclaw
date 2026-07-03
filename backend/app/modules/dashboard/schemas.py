from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SummaryStats(BaseModel):
    total_requests: int
    allowed_count: int
    denied_count: int
    allow_rate: float
    deny_rate: float
    rate_limited_count: int
    total_agents: int
    active_agents: int
    total_policies: int
    total_rules: int
    open_violations: int


class TopViolatingAgent(BaseModel):
    agent_id: str
    agent_slug: str
    agent_name: str
    violation_count: int


class ResourceAccessSummary(BaseModel):
    resource_type: str
    resource_identifier: str
    access_count: int
    deny_count: int
    last_accessed_at: datetime


class PolicyHitRate(BaseModel):
    rule_id: str
    rule_name: str
    policy_id: str
    hit_count: int
    allow_count: int
    deny_count: int


class RecentViolation(BaseModel):
    id: str
    agent_id: Optional[str]
    agent_slug: Optional[str]
    severity: str
    summary: str
    acknowledged: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TimeSeriesPoint(BaseModel):
    bucket: str
    allowed: int
    denied: int
