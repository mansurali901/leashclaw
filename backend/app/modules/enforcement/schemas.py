from typing import Any, Optional

from pydantic import BaseModel, Field

from app.db.models import Effect


class EvaluationRequest(BaseModel):
    agent_id: str = Field(description="Agent slug, e.g. agent_sales_001")
    user_id: Optional[str] = Field(default=None, description="Human user on whose behalf the agent acts, if any")
    action: str = Field(description="read, write, create, delete, list, move, rename, append, execute, share, call_api, access_url, invoke")
    resource_type: str = Field(description="filesystem, api, url, database, secret, tool, command")
    resource: str = Field(description="path/domain/API pattern/tool name being accessed")
    metadata: dict[str, Any] = Field(default_factory=dict, description="classification, location, and any other context")

    class Config:
        json_schema_extra = {
            "example": {
                "agent_id": "agent_sales_001",
                "user_id": "user_123",
                "action": "read_file".replace("_file", ""),
                "resource_type": "filesystem",
                "resource": "/data/customers/export.csv",
                "metadata": {"classification": "confidential", "location": "production"},
            }
        }


class EvaluationResponse(BaseModel):
    decision: Effect
    reason: str
    matched_rule_id: Optional[str] = None
    access_decision_id: Optional[str] = None
    rate_limited: bool = False
    latency_ms: float
