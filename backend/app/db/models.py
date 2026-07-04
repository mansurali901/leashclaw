"""
Core persistent entities for the Agent Guardrail Engine.

Design notes
------------
- Every table uses a UUID primary key (string form) for safe distributed
  generation and to avoid leaking sequential IDs in audit trails.
- `Rule` is the atomic policy-evaluation unit; `Policy` is a named,
  versioned bundle of rules assigned to subjects (agents/roles/teams/users).
- `AccessDecision` is the immutable record produced by the enforcement
  engine for *every* evaluated action (allow or deny).
- `AuditLog` is a superset append-only log used for compliance exports;
  `AccessDecision` rows are also written into AuditLog for a unified trail.
- `Violation` is raised whenever a `deny` decision is recorded, or when a
  rule explicitly marked `alert_on_match` is hit — this feeds the
  dashboard's "recent violations" / "top violating agents" views.
"""
import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Column, String, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


def gen_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.utcnow()


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    AUDITOR = "auditor"
    VIEWER = "viewer"


class SubjectType(str, enum.Enum):
    AGENT = "agent"
    ROLE = "role"
    TEAM = "team"
    USER = "user"


class ActionType(str, enum.Enum):
    READ = "read"
    WRITE = "write"
    EXECUTE = "execute"
    SHARE = "share"
    CALL_API = "call_api"
    ACCESS_URL = "access_url"
    DELETE = "delete"


class ResourceType(str, enum.Enum):
    FILESYSTEM = "filesystem"
    API = "api"
    URL = "url"
    DATABASE = "database"
    SECRET = "secret"
    TOOL = "tool"


class DataClassification(str, enum.Enum):
    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    PII = "pii"
    SECRET = "secret"


class Effect(str, enum.Enum):
    ALLOW = "allow"
    DENY = "deny"


class AgentStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DECOMMISSIONED = "decommissioned"


# ---------------------------------------------------------------------------
# User & Auth
# ---------------------------------------------------------------------------

class User(SQLModel, table=True):
    __tablename__ = "users"

    id: str = Field(default_factory=gen_uuid, primary_key=True)
    email: str = Field(index=True, unique=True, nullable=False)
    hashed_password: str
    full_name: str
    role: UserRole = Field(default=UserRole.VIEWER)
    team: Optional[str] = Field(default=None, index=True)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------

class Agent(SQLModel, table=True):
    __tablename__ = "agents"

    id: str = Field(default_factory=gen_uuid, primary_key=True)
    slug: str = Field(index=True, unique=True, nullable=False, description="Stable machine identifier, e.g. agent_sales_001")
    name: str
    description: Optional[str] = None
    owner_team: Optional[str] = Field(default=None, index=True)
    status: AgentStatus = Field(default=AgentStatus.ACTIVE)
    api_key_hash: str = Field(description="Hashed service-to-service credential for this agent")
    api_key_prefix: str = Field(index=True, description="First 12 chars of raw key, for O(1) lookup without exposing the full key")
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    metadata_json: dict = Field(default_factory=dict, sa_column=Column(JSON))
    sandbox_profile_id: Optional[str] = Field(default=None, foreign_key="sandbox_profiles.id")
    created_by: Optional[str] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    sandbox_profile: Optional["SandboxProfile"] = Relationship(back_populates="agents")


class AgentPolicyLink(SQLModel, table=True):
    """Many-to-many assignment of policies to agents."""
    __tablename__ = "agent_policy_links"
    __table_args__ = (UniqueConstraint("agent_id", "policy_id", name="uq_agent_policy"),)

    id: str = Field(default_factory=gen_uuid, primary_key=True)
    agent_id: str = Field(foreign_key="agents.id", index=True)
    policy_id: str = Field(foreign_key="policies.id", index=True)
    assigned_at: datetime = Field(default_factory=utcnow)


# ---------------------------------------------------------------------------
# Sandbox Profiles
# ---------------------------------------------------------------------------

class SandboxProfile(SQLModel, table=True):
    __tablename__ = "sandbox_profiles"

    id: str = Field(default_factory=gen_uuid, primary_key=True)
    name: str = Field(index=True, unique=True)
    description: Optional[str] = None
    cpu_limit_cores: float = Field(default=1.0)
    memory_limit_mb: int = Field(default=512)
    timeout_seconds: int = Field(default=30)
    network_access: bool = Field(default=False)
    allowed_locations: list[str] = Field(default_factory=list, sa_column=Column(JSON), description="Allowed directories/paths")
    max_concurrent_executions: int = Field(default=1)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    agents: list[Agent] = Relationship(back_populates="sandbox_profile")


# ---------------------------------------------------------------------------
# Policies & Rules
# ---------------------------------------------------------------------------

class Policy(SQLModel, table=True):
    __tablename__ = "policies"

    id: str = Field(default_factory=gen_uuid, primary_key=True)
    name: str = Field(index=True, unique=True)
    description: Optional[str] = None
    version: int = Field(default=1)
    enabled: bool = Field(default=True)
    created_by: Optional[str] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    rules: list["Rule"] = Relationship(back_populates="policy")


class Rule(SQLModel, table=True):
    """
    Atomic guardrail rule. Evaluated by the enforcement engine in priority
    order (higher priority evaluated first); first matching enabled rule
    wins ("first-match-wins", deny-overrides available via priority).
    """
    __tablename__ = "rules"

    id: str = Field(default_factory=gen_uuid, primary_key=True)
    policy_id: str = Field(foreign_key="policies.id", index=True)

    name: str
    description: Optional[str] = None

    subject_type: SubjectType = Field(default=SubjectType.AGENT)
    subject_value: str = Field(index=True, description="agent slug / role name / team name / user id, or '*' for any")

    action: ActionType
    resource_type: ResourceType
    resource_pattern: str = Field(description="glob/regex-capable pattern, e.g. /data/**, *.internal.example.com, POST /v1/payments/*")

    # condition is a small JSON DSL evaluated against request metadata, e.g.
    # {"classification": {"in": ["confidential", "pii", "secret"]}, "location": {"eq": "production"}}
    condition: dict = Field(default_factory=dict, sa_column=Column(JSON))

    effect: Effect = Field(default=Effect.DENY)
    priority: int = Field(default=100, index=True, description="Higher = evaluated first")
    enabled: bool = Field(default=True)
    alert_on_match: bool = Field(default=False, description="Raise a Violation even on allow, e.g. for sensitive-but-permitted access")

    rate_limit_per_minute: Optional[int] = Field(default=None)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    policy: Optional[Policy] = Relationship(back_populates="rules")


# ---------------------------------------------------------------------------
# Resources (catalog, optional inventory of known sensitive resources)
# ---------------------------------------------------------------------------

class Resource(SQLModel, table=True):
    __tablename__ = "resources"

    id: str = Field(default_factory=gen_uuid, primary_key=True)
    resource_type: ResourceType
    identifier: str = Field(index=True, description="path/domain/API/tool identifier")
    classification: DataClassification = Field(default=DataClassification.INTERNAL)
    owner_team: Optional[str] = None
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


# ---------------------------------------------------------------------------
# Access Decisions, Audit Logs, Violations
# ---------------------------------------------------------------------------

class AccessDecision(SQLModel, table=True):
    __tablename__ = "access_decisions"

    id: str = Field(default_factory=gen_uuid, primary_key=True)
    agent_id: Optional[str] = Field(default=None, foreign_key="agents.id", index=True)
    user_id: Optional[str] = Field(default=None, index=True)

    action_type: str = Field(index=True)
    resource_type: str = Field(index=True)
    resource_identifier: str = Field(index=True)

    decision: Effect = Field(index=True)
    matched_rule_id: Optional[str] = Field(default=None, foreign_key="rules.id")
    reason: str

    request_metadata: dict = Field(default_factory=dict, sa_column=Column(JSON))
    latency_ms: Optional[float] = Field(default=None)

    created_at: datetime = Field(default_factory=utcnow, index=True)


class AuditLog(SQLModel, table=True):
    """Append-only compliance log. Superset of AccessDecision plus admin actions."""
    __tablename__ = "audit_logs"

    id: str = Field(default_factory=gen_uuid, primary_key=True)
    event_type: str = Field(index=True, description="e.g. access_decision, policy_created, rule_updated, agent_suspended")
    actor_id: Optional[str] = Field(default=None, index=True, description="user_id or agent_id performing the action")
    actor_type: str = Field(default="system")
    target_type: Optional[str] = None
    target_id: Optional[str] = Field(default=None, index=True)
    payload: dict = Field(default_factory=dict, sa_column=Column(JSON))
    ip_address: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow, index=True)


class ViolationSeverity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Violation(SQLModel, table=True):
    __tablename__ = "violations"

    id: str = Field(default_factory=gen_uuid, primary_key=True)
    agent_id: Optional[str] = Field(default=None, foreign_key="agents.id", index=True)
    access_decision_id: Optional[str] = Field(default=None, foreign_key="access_decisions.id")
    rule_id: Optional[str] = Field(default=None, foreign_key="rules.id")
    severity: ViolationSeverity = Field(default=ViolationSeverity.MEDIUM, index=True)
    summary: str
    details: dict = Field(default_factory=dict, sa_column=Column(JSON))
    acknowledged: bool = Field(default=False, index=True)
    acknowledged_by: Optional[str] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=utcnow, index=True)


# ---------------------------------------------------------------------------
# System Settings (runtime-overridable engine configuration)
# ---------------------------------------------------------------------------

class SystemSettings(SQLModel, table=True):
    """
    Key-value store for runtime-overridable engine settings.
    Admins can change these via the /settings/engine API without restarting.

    Supported keys:
      default_effect  — "allow" | "deny" (overrides POLICY_DEFAULT_EFFECT)
    """
    __tablename__ = "system_settings"

    key: str = Field(primary_key=True)
    value: str
    updated_by: Optional[str] = Field(default=None, foreign_key="users.id")
    updated_at: datetime = Field(default_factory=utcnow)
