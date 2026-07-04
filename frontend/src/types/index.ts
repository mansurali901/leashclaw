export type UserRole = "super_admin" | "admin" | "auditor" | "viewer";
export type AgentStatus = "active" | "suspended" | "decommissioned";
export type Effect = "allow" | "deny";
export type SubjectType = "agent" | "role" | "team" | "user";
export type ActionType = "read" | "write" | "execute" | "share" | "call_api" | "access_url" | "delete";
export type ResourceType = "filesystem" | "api" | "url" | "database" | "secret" | "tool";
export type ViolationSeverity = "low" | "medium" | "high" | "critical";

export interface UserRead {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  team: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AgentRead {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  owner_team: string | null;
  status: AgentStatus;
  tags: string[];
  metadata_json: Record<string, unknown>;
  sandbox_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentCreateResponse extends AgentRead {
  api_key: string;
}

export interface PolicyRead {
  id: string;
  name: string;
  description: string | null;
  version: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface RuleRead {
  id: string;
  policy_id: string;
  name: string;
  description: string | null;
  subject_type: SubjectType;
  subject_value: string;
  action: ActionType;
  resource_type: ResourceType;
  resource_pattern: string;
  condition: Record<string, unknown>;
  effect: Effect;
  priority: number;
  enabled: boolean;
  alert_on_match: boolean;
  rate_limit_per_minute: number | null;
  created_at: string;
  updated_at: string;
}

export interface SandboxProfileRead {
  id: string;
  name: string;
  description: string | null;
  cpu_limit_cores: number;
  memory_limit_mb: number;
  timeout_seconds: number;
  network_access: boolean;
  allowed_locations: string[];
  max_concurrent_executions: number;
  created_at: string;
  updated_at: string;
}

export interface SummaryStats {
  total_requests: number;
  allowed_count: number;
  denied_count: number;
  allow_rate: number;
  deny_rate: number;
  rate_limited_count: number;
  total_agents: number;
  active_agents: number;
  total_policies: number;
  total_rules: number;
  open_violations: number;
}

export interface TopViolatingAgent {
  agent_id: string;
  agent_slug: string;
  agent_name: string;
  violation_count: number;
}

export interface RecentViolation {
  id: string;
  agent_id: string | null;
  agent_slug: string | null;
  severity: ViolationSeverity;
  summary: string;
  acknowledged: boolean;
  created_at: string;
}

export interface TimeSeriesPoint {
  bucket: string;
  allowed: number;
  denied: number;
}

export interface ResourceAccessSummary {
  resource_type: string;
  resource_identifier: string;
  access_count: number;
  deny_count: number;
  last_accessed_at: string;
}

export interface PolicyHitRate {
  rule_id: string;
  rule_name: string;
  policy_id: string;
  hit_count: number;
  allow_count: number;
  deny_count: number;
}

export interface AccessDecisionRead {
  id: string;
  agent_id: string | null;
  user_id: string | null;
  action_type: string;
  resource_type: string;
  resource_identifier: string;
  decision: Effect;
  matched_rule_id: string | null;
  reason: string;
  request_metadata: Record<string, unknown>;
  latency_ms: number | null;
  created_at: string;
}

export interface AuditLogRead {
  id: string;
  event_type: string;
  actor_id: string | null;
  actor_type: string;
  target_type: string | null;
  target_id: string | null;
  payload: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface EngineSettingsRead {
  default_effect: "allow" | "deny";
  policy_engine_backend: string;
  default_rate_limit_per_minute: number;
  opa_url: string | null;
}

export interface EvaluationRequest {
  agent_id: string;
  user_id?: string;
  action: string;
  resource_type: string;
  resource: string;
  metadata: Record<string, unknown>;
}

export interface EvaluationResponse {
  decision: Effect;
  reason: string;
  matched_rule_id: string | null;
  access_decision_id: string | null;
  rate_limited: boolean;
  latency_ms: number;
}
