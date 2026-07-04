# Agent Guardrail Engine

A production-grade security and governance platform for AI agents.
Admins define guardrail policies once; every agent action — file reads,
API calls, tool invocations, URL fetches, data sharing — is evaluated by
a central policy engine **before** it executes, logged immutably, and
surfaced on a live dashboard.

Built to sit in front of any agent runtime, including OpenClaw/Hermes-style
agent executors: the agent (or its host process) calls
`POST /api/v1/enforcement/evaluate` before doing anything sensitive, and
only proceeds if `decision == "allow"`.

---

## 1. Architecture

```
┌──────────────────────┐        ┌────────────────────────────────────────────┐
│   Agent Runtime       │  HTTP  │              Agent Guardrail Engine          │
│ (OpenClaw / Hermes /   ├───────►│                                              │
│  custom agent host)   │ X-Agent-Api-Key   ┌────────────┐   ┌────────────────┐ │
└──────────────────────┘        │            │  FastAPI    │   │  Policy Engine  │ │
                                 │            │  Routers    ├──►│  (internal)     │ │
┌──────────────────────┐  HTTP  │            └─────┬──────┘   └───────┬────────┘ │
│  Admin / Auditor       │  JWT  │                  │                  │          │
│  (Next.js dashboard)  ├───────►│            ┌─────▼──────┐   ┌───────▼────────┐ │
└──────────────────────┘        │            │  Postgres   │   │  Redis          │ │
                                 │            │  (SQLModel) │   │  (rate limits)  │ │
                                 │            └────────────┘   └────────────────┘ │
                                 └────────────────────────────────────────────────┘
```

**Clean architecture, module-per-domain.** Each business capability is a
self-contained module under `backend/app/modules/<name>/` with its own
`schemas.py` (Pydantic I/O contracts), `service.py` (business logic,
framework-agnostic), and `router.py` (thin FastAPI HTTP layer). Modules
depend downward on `app/core` (config, security) and `app/db` (models,
session) but never on each other's routers — cross-module calls go
through service functions (e.g. every module calls
`audit_logs.service.write_audit_log` to record admin actions).

**The policy engine is the choke point.** `app/modules/enforcement/engine.py`
contains the entire evaluation algorithm as pure Python (no FastAPI
imports), so it can be called from the HTTP API, a CLI, or a background
worker identically, and so it can be swapped for an OPA/Rego backend later
behind the same `evaluate()` signature — see §7.

**Fail-closed by default.** If an agent is unknown, suspended, has no
matching rule, or Redis is unreachable for its rate-limit rule, the
default is **deny** (`POLICY_DEFAULT_EFFECT=deny`). This is the standard
posture for enterprise security software: absence of an explicit allow is
not an allow.

**Every evaluation is logged, allow or deny.** `AccessDecision` is written
for 100% of calls to `/enforcement/evaluate`. `Violation` rows are written
for every `deny` and for any `allow` where the matched rule has
`alert_on_match=true` (e.g. "allowed, but this is sensitive enough that a
human should know it happened").

---

## 2. Data model

| Entity | Purpose |
|---|---|
| `User` | Dashboard users (super_admin / admin / auditor / viewer), bcrypt-hashed passwords, JWT auth |
| `Agent` | A registered AI agent identity: slug, owner team, status, hashed service API key, optional sandbox profile |
| `AgentPolicyLink` | Many-to-many: which policies are assigned to which agents |
| `Policy` | Named, versioned, enable/disable-able bundle of rules |
| `Rule` | The atomic guardrail unit — see field table below |
| `SandboxProfile` | CPU/memory/timeout/network/location limits, referenced by agents |
| `Resource` | Optional catalog of known sensitive resources and their classification |
| `AccessDecision` | Immutable record of every evaluation (allow/deny, matched rule, reason, latency) |
| `AuditLog` | Superset append-only log: access decisions *and* admin actions (policy created, agent suspended, key rotated, ...) |
| `Violation` | Raised on every deny (and flagged allows); severity, acknowledgeable by admins |

**`Rule` fields** (the guardrail DSL):

| Field | Meaning |
|---|---|
| `subject_type` / `subject_value` | Who the rule applies to: `agent` \| `role` \| `team` \| `user`, value is the slug/name or `*` for any |
| `action` | `read` \| `write` \| `execute` \| `share` \| `call_api` \| `access_url` \| `delete` |
| `resource_type` | `filesystem` \| `api` \| `url` \| `database` \| `secret` \| `tool` |
| `resource_pattern` | Glob (`/data/**`, `*.example.com`), exact string, or `re:<regex>` |
| `condition` | Small JSON DSL evaluated against request metadata, e.g. `{"classification": {"in": ["pii","secret"]}, "location": {"eq": "production"}}`. Operators: `eq, ne, in, not_in, gt, gte, lt, lte, contains` |
| `effect` | `allow` \| `deny` |
| `priority` | Higher evaluated first; first full match wins |
| `enabled` | Soft-disable without deleting |
| `alert_on_match` | Raise a `Violation` even when the effect is `allow` |
| `rate_limit_per_minute` | Optional per-agent-per-rule limit (Redis fixed-window) |

Full SQLModel definitions: `backend/app/db/models.py`.

---

## 3. Policy evaluation algorithm

See `backend/app/modules/enforcement/engine.py` (heavily commented) and
`backend/app/modules/enforcement/matcher.py`. Summary:

1. Resolve the agent by slug. Unknown or non-active agents → deny.
2. Gather candidate rules: all enabled rules in enabled policies
   **assigned** to the agent, plus any enabled rule whose subject targets
   the agent's team, the acting user, the acting user's role, or the
   wildcard `*` (org-wide guardrails that don't need per-agent assignment).
3. Sort by `priority` descending, then by pattern specificity.
4. Walk in order; the first rule whose `action`, `resource_type`,
   `resource_pattern`, and `condition` all match is the **matched rule**.
   Its `effect` becomes the decision.
5. If the matched rule has a `rate_limit_per_minute` and the agent has
   exceeded it this minute, the decision is forced to `deny` regardless of
   the rule's configured effect.
6. No match at all → `POLICY_DEFAULT_EFFECT` (deny by default).
7. Persist an `AccessDecision`; persist a `Violation` if denied or
   flagged.

**Example (from the product brief):**

Input:
```json
{
  "agent_id": "agent_sales_001",
  "user_id": "user_123",
  "action": "read_file",
  "resource_type": "filesystem",
  "resource": "/data/customers/export.csv",
  "metadata": { "classification": "confidential", "location": "production" }
}
```
> Note: the engine's `action` enum uses `read` (not `read_file`) to stay
> consistent across filesystem/API/tool actions — see `examples/test_cases.md`
> for the exact working request/response pair.

Output:
```json
{
  "decision": "deny",
  "reason": "Agent is not allowed to access confidential filesystem resources in production",
  "matched_rule_id": "rule_001"
}
```

More scenarios, including rate limiting and PII-sharing denial, are in
`examples/test_cases.md`, backed by `examples/example_policies.json`.

---

## 4. Folder structure

```
agent-guardrail/
├── backend/
│   ├── app/
│   │   ├── core/                # config.py, security.py (JWT, hashing, API keys)
│   │   ├── db/                  # models.py, session.py, init_db.py, seed.py
│   │   ├── modules/
│   │   │   ├── auth/            # login, register, JWT + RBAC deps, agent API-key auth
│   │   │   ├── agents/          # agent CRUD, key rotation, policy assignment
│   │   │   ├── policies/        # policy CRUD
│   │   │   ├── rules/           # rule CRUD (the guardrail DSL)
│   │   │   ├── resources/       # resource catalog CRUD
│   │   │   ├── sandbox/         # sandbox profile CRUD
│   │   │   ├── enforcement/     # matcher.py, rate_limiter.py, engine.py, evaluate API
│   │   │   ├── audit_logs/      # immutable audit log + access decision queries
│   │   │   └── dashboard/       # aggregation endpoints for the UI
│   │   ├── tests/                # pytest suite (unit + integration, sqlite in-memory)
│   │   └── main.py               # FastAPI app, middleware, router wiring
│   ├── alembic/                  # migration scaffolding (see §6)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── pytest.ini
├── frontend/
│   └── src/
│       ├── app/                  # Next.js App Router pages: login, dashboard, agents,
│       │                         # policies, policies/[id], violations, audit, simulator
│       ├── components/           # AppShell (nav), Badges
│       ├── lib/                  # api.ts (fetch client), auth.tsx (JWT context)
│       └── types/                # shared TS types mirroring backend schemas
├── examples/
│   ├── example_policies.json     # importable reference policy bundle
│   └── test_cases.md             # worked evaluation examples incl. the brief's example
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 5. API surface

All endpoints are under `/api/v1`. Interactive docs at `/api/docs` (disabled
in `ENV=production`).

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` (admin-only), `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me` |
| Agents | `POST/GET /agents`, `GET/PATCH /agents/{id}`, `POST /agents/{id}/rotate-key`, `POST/DELETE/GET /agents/{id}/policies` |
| Policies | `POST/GET /policies`, `GET/PATCH/DELETE /policies/{id}` |
| Rules | `POST/GET /rules` (filter by `policy_id`), `GET/PATCH/DELETE /rules/{id}` |
| Resources | `POST/GET /resources`, `GET/DELETE /resources/{id}` |
| Sandbox | `POST/GET /sandbox-profiles`, `GET/PATCH/DELETE /sandbox-profiles/{id}` |
| **Enforcement** | `POST /enforcement/evaluate` (agent API key), `POST /enforcement/simulate` (admin JWT) |
| Audit | `GET /audit/logs`, `GET /audit/decisions` |
| Dashboard | `GET /dashboard/summary`, `/top-violating-agents`, `/resource-access-history`, `/policy-hit-rate`, `/recent-violations`, `/timeseries`, `PATCH /dashboard/violations/{id}/acknowledge` |

**Two auth modes:**
- **Human/dashboard**: `Authorization: Bearer <JWT>`, RBAC via
  `require_admin` / `require_auditor_or_above` dependencies.
- **Agent-to-platform**: `X-Agent-Api-Key: agk_...` header. Keys are
  HMAC-SHA256-hashed at rest (indexed by a 12-char prefix for O(1)
  lookup); the raw key is shown exactly once, at creation/rotation time.

---

## 6. Running it

### Docker Compose (recommended)

```bash
cp .env.example .env
# Edit .env: set a strong JWT_SECRET_KEY (python -c "import secrets; print(secrets.token_urlsafe(64))")

docker compose up --build -d          # starts db, redis, backend, frontend
docker compose --profile seed run --rm seed   # loads demo admin/agents/policies

# Backend:  http://localhost:8000/api/docs
# Frontend: http://localhost:3000
```

The seed script prints the admin login and the two demo agents' API keys
to stdout — copy them immediately, they are not stored anywhere in
retrievable form.

### Local dev (no Docker)

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export JWT_SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(64))")
export DATABASE_URL=postgresql+asyncpg://guardrail:guardrail@localhost:5432/guardrail
# (spin up Postgres + Redis locally however you prefer, or use `docker compose up db redis`)
python -m app.db.seed          # creates schema + demo data
uvicorn app.main:app --reload  # http://localhost:8000

# Frontend
cd frontend
npm install
cp .env.local.example .env.local
npm run dev                    # http://localhost:3000
```

### Tests

```bash
cd backend
pip install -r requirements.txt
JWT_SECRET_KEY=test-secret python -m pytest -q
```
24 tests covering the pattern matcher, condition DSL, the exact
product-brief evaluation example, rate-limit/deny fallbacks, and RBAC on
agent/policy/rule endpoints — all passing against an in-memory SQLite DB
(no external services required for the test suite).

### Migrations

Alembic is scaffolded (`backend/alembic/`) for production schema changes.
In dev, `ENV=development` auto-creates tables on startup via
`SQLModel.metadata.create_all` for convenience. For a real deployment:
```bash
cd backend
alembic revision --autogenerate -m "init"
alembic upgrade head
```

---

## 7. Extending to OPA/Rego

`POLICY_ENGINE_BACKEND` in `Settings` is a placeholder switch
(`internal` | `opa`). To add an OPA backend:

1. Implement `evaluate_opa(session, request) -> EngineResult` in a new
   `app/modules/enforcement/opa_engine.py`, calling out to an OPA sidecar
   (`OPA_URL`) with the request translated to Rego input.
2. In `enforcement/service.py`, branch on
   `get_settings().POLICY_ENGINE_BACKEND` to call either `engine.evaluate`
   or `opa_engine.evaluate_opa` — both return the same `EngineResult`
   shape, so nothing else in the codebase changes.
3. Rules authored in the dashboard can be compiled to Rego at write-time
   (in `rules/service.py`) if you want a single source of truth, or
   maintained independently if OPA policies are managed via GitOps.

---

## 8. Security defaults

- No secrets are hardcoded; `JWT_SECRET_KEY` has no default and the app
  refuses to start without it (`Settings(...)` required field).
- Passwords: bcrypt via `passlib`. Agent API keys: HMAC-SHA256, shown once.
- Fail-closed policy evaluation and fail-closed unknown/suspended agents.
- RBAC on every mutating endpoint (`require_admin`) and every read
  endpoint that exposes governance data (`require_auditor_or_above`).
- CORS restricted to configured origins only (`CORS_ORIGINS`).
- `AccessDecision` / `AuditLog` have no update or delete endpoints —
  tamper-evident by construction.
- Docker images run as non-root users; `/api/docs` disabled in
  `ENV=production`.
