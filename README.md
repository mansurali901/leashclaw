<div align="center">

# Agent Guardrail Engine

**Production-grade security and governance for AI agents.**
Every agent action — file reads, API calls, tool invocations, URL fetches, secret access — is evaluated against your policies *before* it executes, logged immutably, and surfaced on a live dashboard.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker)](https://docs.docker.com/compose)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

</div>

---

## Demo

> **Replace the placeholders below with your recorded GIFs.**
> Recommended tool: [Kap](https://getkap.co) (macOS) or [ScreenToGif](https://www.screentogif.com) (Windows). Export at ≤ 800px wide, 15 fps for GitHub rendering.

<table>
<tr>
<td width="50%">

**Dashboard — live decision pulse**

![Dashboard overview showing real-time policy decisions, violation counts, and traffic chart](docs/demo-dashboard.gif)

</td>
<td width="50%">

**Policy + rule authoring**

![Creating a deny rule for confidential filesystem access in production](docs/demo-policy-authoring.gif)

</td>
</tr>
<tr>
<td width="50%">

**Policy simulator**

![Running a hypothetical agent action through the live engine and seeing deny/allow with matched rule](docs/demo-simulator.gif)

</td>
<td width="50%">

**OpenClaw — blocked tool call**

![OpenClaw agent attempting a file read that is blocked by guardrail policy, with reason shown inline](docs/demo-openclaw-block.gif)

</td>
</tr>
</table>

---

## Table of contents

1. [How it works](#1-how-it-works)
2. [Quick start — Docker](#2-quick-start--docker)
3. [OpenClaw integration](#3-openclaw-integration)
4. [Architecture](#4-architecture)
5. [Data model](#5-data-model)
6. [Policy evaluation algorithm](#6-policy-evaluation-algorithm)
7. [API surface](#7-api-surface)
8. [Configuration reference](#8-configuration-reference)
9. [Local development](#9-local-development)
10. [Tests](#10-tests)
11. [Migrations](#11-migrations)
12. [Extending to OPA/Rego](#12-extending-to-oparego)
13. [Security defaults](#13-security-defaults)
14. [Folder structure](#14-folder-structure)

---

## 1. How it works

```
Agent runtime                  Agent Guardrail Engine
──────────────                 ──────────────────────────────────────────
Before every sensitive    ───► POST /enforcement/evaluate
tool call or action            ├── Resolve agent identity (API key)
                               ├── Match action against policy rules
                               ├── Check rate limits (Redis)
                               ├── Persist AccessDecision (always)
                               └── Return { decision: "allow" | "deny" }

                               If denied → persist Violation
                               If allow + alert_on_match → persist Violation
```

The agent (or its host process, like OpenClaw) calls the enforcement API **before** executing anything sensitive. Only a `decision: "allow"` lets it proceed. Every evaluation — allow or deny — is written to an immutable `AccessDecision` log.

**Fail-closed by default.** Unknown agents, suspended agents, and actions with no matching rule all result in `deny`. This means misconfiguration and missing rules are safe by construction.

---

## 2. Quick start — Docker

### Prerequisites

- Docker Desktop ≥ 4.25 (with Compose V2)
- Ports `3000`, `8000`, `5432`, `6379` available locally

### Steps

```bash
# 1. Clone and configure
git clone <repo-url> agent-guardrail
cd agent-guardrail
cp .env.example .env
```

Open `.env` and set a strong `JWT_SECRET_KEY`:

```bash
# Generate one — paste the output into .env
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

```bash
# 2. Build and start all services
docker compose up --build -d

# 3. Seed demo data (admin user + example policies + two agents)
docker compose --profile seed run --rm seed
```

The seed script prints your credentials to stdout — **copy them immediately**:

```
[seed] Created admin user: admin@guardrail.example.com / ChangeMe123! (CHANGE THIS PASSWORD)
[seed] Agent: agent_sales_001     API key: agk_xxxxxxxxxxxx  (shown once)
[seed] Agent: agent_hermes_support_001   API key: agk_xxxxxxxxxxxx  (shown once)
```

```bash
# 4. Open the dashboard
open http://localhost:3000
# API docs (dev only)
open http://localhost:8000/api/docs
```

### Stopping and restarting

```bash
docker compose down          # stop, keep data volumes
docker compose down -v       # stop + wipe database (full reset)
docker compose up -d         # restart without rebuilding
docker compose up --build -d # rebuild images and restart
```

---

## 3. OpenClaw integration

The repository ships a ready-to-use OpenClaw enforcement plugin (`docker/openclaw/plugin/`) and a Docker Compose profile that wires it all together automatically.

### How the plugin works

The plugin registers a `before_tool_call` hook (priority 100) in OpenClaw. Before every tool execution, it:

1. Maps the OpenClaw tool name to the Guardrail `(action, resource_type)` taxonomy
2. Calls `POST /api/v1/enforcement/evaluate` with the agent's API key
3. Returns `{ block: true, blockReason: "..." }` if the decision is `deny`
4. Passes through transparently on `allow`

**Tool → action mapping (built-in):**

| OpenClaw tool | Guardrail action | resource_type |
|---|---|---|
| `read_file` | `read` | `filesystem` |
| `write_file` | `write` | `filesystem` |
| `exec` | `execute` | `tool` |
| `browser` / `web_fetch` | `access_url` | `url` |
| `web_search` | `call_api` | `api` |
| `message` | `share` | `database` |
| *(unmapped)* | `execute` | `tool` |

Unmapped tools fail closed (denied) unless you add an explicit allow rule for `resource_type=tool, pattern=<name>`.

---

### Option A — Run OpenClaw via Docker Compose (recommended)

This is the fastest path. The guardrail engine, OpenClaw, and all supporting services start together.

**Step 1 — Register an OpenClaw agent in the dashboard**

Start the stack first (no OpenClaw yet):

```bash
docker compose up --build -d
docker compose --profile seed run --rm seed
```

Log in at `http://localhost:3000`, go to **Agents → New agent**, and create:

| Field | Value |
|---|---|
| Name | `OpenClaw Agent` |
| Slug | `openclaw-agent` |
| Owner team | *(your team name)* |

Copy the `agk_...` API key shown after creation — you won't see it again.

**Step 2 — Set credentials in `.env`**

```bash
# .env
GUARDRAIL_AGENT_SLUG=openclaw-agent
GUARDRAIL_AGENT_API_KEY=agk_your_key_here
ANTHROPIC_API_KEY=sk-ant-...
OPENCLAW_GATEWAY_TOKEN=guardrail-local-token   # any string, used by clients to auth to the gateway
```

**Step 3 — Assign a policy to the agent**

In the dashboard, go to **Policies**, open a policy (e.g. `baseline-data-governance`), and click the agent's name to assign it. Or use the API:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@guardrail.example.com","password":"ChangeMe123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# List policies to find the policy ID
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/policies | python3 -m json.tool

# Assign policy to agent (replace IDs)
curl -s -X POST http://localhost:8000/api/v1/agents/<agent-id>/policies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"policy_id": "<policy-id>"}'
```

**Step 4 — Start OpenClaw**

```bash
docker compose --profile openclaw up -d openclaw
docker compose logs -f openclaw   # watch for "Config written" then "Gateway ready"
```

The gateway listens on `http://localhost:19000`. Point your OpenClaw client at it:

```bash
export OPENCLAW_GATEWAY_URL=http://localhost:19000
export OPENCLAW_GATEWAY_TOKEN=guardrail-local-token
```

Every tool call now flows through the guardrail engine. Test it by asking the agent to read a file that your policy blocks — the tool call will be intercepted and the block reason surfaced to the model.

---

### Option B — Install the plugin manually in an existing OpenClaw setup

**Step 1 — Copy the plugin**

```bash
cp -r docker/openclaw/plugin ~/.openclaw/extensions/guardrail-enforcement
```

**Step 2 — Add to `~/.openclaw/openclaw.json`**

```json
{
  "gateway": {
    "mode": "local"
  },
  "plugins": {
    "enabled": true,
    "allow": ["guardrail-enforcement"],
    "entries": {
      "guardrail-enforcement": {
        "enabled": true,
        "config": {
          "guardrailUrl": "http://localhost:8000/api/v1",
          "agentSlug": "openclaw-agent",
          "failOpenOnNetworkError": false
        },
        "env": {
          "GUARDRAIL_AGENT_API_KEY": "agk_your_key_here"
        }
      }
    }
  }
}
```

> **`failOpenOnNetworkError`** — when `false` (default), tool calls are blocked if the guardrail engine is unreachable. Set to `true` only in development to avoid blocking work when the engine is stopped.

**Step 3 — Install and restart**

```bash
openclaw plugins install ~/.openclaw/extensions/guardrail-enforcement
openclaw gateway restart
```

---

### Verifying the integration

**From the OpenClaw side** — ask the agent to read a file your policy blocks:

```
"Read the file /data/customers/export.csv and summarize it"
```

Expected result: the tool call is intercepted, the model sees a `block` response with the policy reason, and the conversation continues without the file being read.

**From the guardrail side** — check the dashboard:

- **Overview** → Decision Pulse shows a new `deny` bar
- **Violations** → a new entry with the blocked tool call details
- **Audit trail** → the raw `AccessDecision` record with latency and matched rule ID

**Via the simulator** — test policies without OpenClaw running:

```bash
curl -s -X POST http://localhost:8000/api/v1/enforcement/simulate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "openclaw-agent",
    "action": "read",
    "resource_type": "filesystem",
    "resource": "/data/customers/export.csv",
    "metadata": {"classification": "confidential", "location": "production"}
  }' | python3 -m json.tool
```

---

### Adding guardrail rules for OpenClaw tools

Go to **Policies → [policy name] → Add rule**. Examples:

**Block all shell execution:**

| Field | Value |
|---|---|
| Action | `execute` |
| Resource type | `tool` |
| Resource pattern | `exec:*` |
| Effect | `deny` |
| Priority | `900` |

**Allow web search, deny all other API calls:**

```
Rule 1: action=call_api  resource_type=api  pattern=GET /web_search  effect=allow  priority=200
Rule 2: action=call_api  resource_type=api  pattern=*               effect=deny   priority=100
```

**Block file writes to sensitive paths:**

| Field | Value |
|---|---|
| Action | `write` |
| Resource type | `filesystem` |
| Resource pattern | `/etc/**` |
| Effect | `deny` |
| Priority | `1000` |

---

## 4. Architecture

```
┌─────────────────────────────────┐      ┌──────────────────────────────────────────────────┐
│        Agent runtimes           │      │               Agent Guardrail Engine              │
│                                 │      │                                                    │
│  ┌──────────────────────────┐   │      │  ┌─────────────┐    ┌──────────────────────────┐  │
│  │  OpenClaw (plugin hook)  │   │ HTTP │  │   FastAPI    │    │      Policy Engine        │  │
│  │  before_tool_call        ├───┼─────►│  │   Routers   ├───►│  engine.py (pure Python)  │  │
│  └──────────────────────────┘   │      │  └──────┬──────┘    └──────────┬───────────────┘  │
│                                 │  X-Agent-Api-Key  │                   │                  │
│  ┌──────────────────────────┐   │      │         │              ┌───────┴──────┐            │
│  │  Custom agent / script   ├───┘      │         │              │ Redis         │            │
│  │  (direct HTTP call)      │          │  ┌──────▼──────┐      │ Rate limits   │            │
│  └──────────────────────────┘          │  │ PostgreSQL   │      └──────────────┘            │
│                                        │  │ AccessDecision│                                 │
│  ┌──────────────────────────┐          │  │ Violation     │                                 │
│  │  Admin / Auditor          │  JWT     │  │ AuditLog      │                                 │
│  │  (Next.js dashboard)     ├──────────►  │ Policy/Rule   │                                 │
│  └──────────────────────────┘          │  └─────────────┘                                  │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Module-per-domain.** Each capability lives in `backend/app/modules/<name>/` with its own `schemas.py`, `service.py`, and `router.py`. Modules depend downward on `app/core` and `app/db` — never sideways on each other's routers.

**The enforcement engine is the single choke point.** `enforcement/engine.py` contains the entire evaluation algorithm as pure Python (zero FastAPI imports), so it can be called from the HTTP API, a CLI, or a background worker identically. It can be swapped for an OPA backend behind the same `evaluate()` signature.

**Two auth modes run in parallel:**
- **Human/dashboard** — `Authorization: Bearer <JWT>`, RBAC enforced per endpoint
- **Agent-to-platform** — `X-Agent-Api-Key: agk_...`, HMAC-SHA256-hashed at rest (indexed by 12-char prefix for O(1) lookup); raw key shown once at creation/rotation

---

## 5. Data model

| Entity | Purpose |
|---|---|
| `User` | Dashboard users — `super_admin / admin / auditor / viewer`, bcrypt passwords, JWT auth |
| `Agent` | Registered AI agent — slug, owner team, status, hashed API key, optional sandbox profile |
| `AgentPolicyLink` | Many-to-many: which policies are assigned to which agents |
| `Policy` | Named, versioned, enable/disable-able bundle of rules |
| `Rule` | The atomic guardrail unit — see field table below |
| `SandboxProfile` | CPU / memory / timeout / network / path limits, referenced by agents |
| `Resource` | Optional catalog of known sensitive resources and their data classification |
| `AccessDecision` | Immutable record of every evaluation — action, decision, matched rule, reason, latency |
| `AuditLog` | Append-only compliance log — access decisions *and* admin actions (policy created, agent suspended, key rotated…) |
| `Violation` | Raised on every `deny` and on `allow + alert_on_match`; severity-graded, acknowledgeable |
| `SystemSettings` | Runtime-overridable engine config (e.g. `default_effect`) — editable from the Settings page |

**`Rule` fields — the guardrail DSL:**

| Field | Meaning |
|---|---|
| `subject_type` / `subject_value` | `agent` \| `role` \| `team` \| `user` — value is a slug/name, or `*` for any |
| `action` | `read` \| `write` \| `create` \| `delete` \| `list` \| `move` \| `rename` \| `append` \| `execute` \| `share` \| `call_api` \| `access_url` \| `invoke` |
| `resource_type` | `filesystem` \| `api` \| `url` \| `database` \| `secret` \| `tool` \| `command` |
| `resource_pattern` | Glob (`/data/**`, `*.example.com`), exact string, or `re:<regex>` |
| `condition` | JSON DSL evaluated against request metadata, e.g. `{"classification": {"in": ["pii","secret"]}, "location": {"eq": "production"}}`. Operators: `eq` `ne` `in` `not_in` `gt` `gte` `lt` `lte` `contains` |
| `effect` | `allow` \| `deny` |
| `priority` | Higher = evaluated first; first full match wins |
| `enabled` | Soft-disable without deleting |
| `alert_on_match` | Raise a `Violation` even when the effect is `allow` — use for sensitive-but-permitted access |
| `rate_limit_per_minute` | Optional per-agent-per-rule limit (Redis fixed-window) |

Full definitions: `backend/app/db/models.py`

---

## 6. Policy evaluation algorithm

Source: `backend/app/modules/enforcement/engine.py` (heavily commented)

```
1. Resolve agent by slug
   └── Unknown or non-active → deny immediately

2. Gather candidate rules
   ├── All enabled rules in enabled policies assigned to this agent
   └── Any enabled rule whose subject targets:
       ├── agent's owner_team
       ├── acting user's ID
       ├── acting user's role
       └── wildcard "*" (org-wide guardrails)

3. Sort by priority desc, then pattern specificity desc

4. Walk rules — first rule where ALL of these match wins:
   ├── action  matches rule.action
   ├── resource_type  matches rule.resource_type
   ├── resource  matches rule.resource_pattern (glob / regex)
   └── metadata  satisfies rule.condition (JSON DSL)

5. If matched rule has rate_limit_per_minute:
   └── Exceeded → force deny (Redis fixed-window counter)

6. No match → default_effect (deny unless overridden in Settings)

7. Persist AccessDecision (always)
   └── If deny, or allow + alert_on_match → persist Violation
```

**Example — the product brief scenario:**

```jsonc
// Request
{
  "agent_id": "agent_sales_001",
  "action": "read",
  "resource_type": "filesystem",
  "resource": "/data/customers/export.csv",
  "metadata": { "classification": "confidential", "location": "production" }
}

// Response
{
  "decision": "deny",
  "reason": "Agent is not allowed to access confidential filesystem resources in production",
  "matched_rule_id": "<uuid>",
  "rate_limited": false,
  "latency_ms": 1.42
}
```

More scenarios (rate limiting, PII sharing denial, unknown agent, fail-closed default): `examples/test_cases.md`

---

## 7. API surface

All endpoints under `/api/v1`. Interactive docs at `/api/docs` (disabled in `ENV=production`).

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` (admin-only) · `POST /auth/login` · `POST /auth/refresh` · `GET /auth/me` |
| Agents | `POST /agents` · `GET /agents` · `GET/PATCH /agents/{id}` · `POST /agents/{id}/rotate-key` · `POST/DELETE/GET /agents/{id}/policies` |
| Policies | `POST/GET /policies` · `GET/PATCH/DELETE /policies/{id}` |
| Rules | `POST/GET /rules` (filter by `policy_id`) · `GET/PATCH/DELETE /rules/{id}` |
| Resources | `POST/GET /resources` · `GET/DELETE /resources/{id}` |
| Sandbox | `POST/GET /sandbox-profiles` · `GET/PATCH/DELETE /sandbox-profiles/{id}` |
| **Enforcement** | `POST /enforcement/evaluate` *(agent API key)* · `POST /enforcement/simulate` *(admin JWT)* |
| Audit | `GET /audit/logs` · `GET /audit/decisions` |
| Dashboard | `GET /dashboard/summary` · `/top-violating-agents` · `/resource-access-history` · `/policy-hit-rate` · `/recent-violations` · `/timeseries` · `PATCH /dashboard/violations/{id}/acknowledge` |
| **Settings** | `GET /settings/engine` *(any auth)* · `PATCH /settings/engine` *(admin only)* |

---

## 8. Configuration reference

Copy `.env.example` to `.env` and set the values below.

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET_KEY` | **required** | No default — app refuses to start without it. Generate: `python3 -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `ENV` | `development` | `development` auto-creates DB tables; `production` disables `/api/docs` and hides internal errors |
| `POLICY_DEFAULT_EFFECT` | `deny` | `allow` or `deny` — what happens when no rule matches. Can be overridden at runtime from the **Settings** page |
| `POLICY_ENGINE_BACKEND` | `internal` | `internal` or `opa` (see §12) |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated list of allowed frontend origins |
| `DATABASE_URL` | postgres @ `db:5432` | Async SQLAlchemy DSN (`postgresql+asyncpg://...`) |
| `REDIS_URL` | `redis://redis:6379/0` | Used for rate limiting |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | JWT access token lifetime |
| `GUARDRAIL_AGENT_SLUG` | — | OpenClaw profile only — slug of the registered OpenClaw agent |
| `GUARDRAIL_AGENT_API_KEY` | — | OpenClaw profile only — `agk_...` key for the OpenClaw agent |
| `ANTHROPIC_API_KEY` | — | OpenClaw profile only — Anthropic key for the LLM provider |
| `OPENCLAW_GATEWAY_TOKEN` | `guardrail-local-token` | OpenClaw profile only — token clients use to authenticate to the gateway |

---

## 9. Local development

### Backend

```bash
cd backend

python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Spin up Postgres + Redis only (or use full local installs)
docker compose up -d db redis

export JWT_SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(64))")
export DATABASE_URL=postgresql+asyncpg://guardrail:guardrail@localhost:5432/guardrail
export SYNC_DATABASE_URL=postgresql+psycopg2://guardrail:guardrail@localhost:5432/guardrail
export REDIS_URL=redis://localhost:6379/0

python -m app.db.seed          # creates schema + inserts demo data
uvicorn app.main:app --reload  # http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
npm run dev                         # http://localhost:3000
```

---

## 10. Tests

```bash
cd backend
JWT_SECRET_KEY=test-secret python -m pytest -q
```

24 tests covering:

- Pattern matcher (glob, regex, exact, wildcard)
- Condition DSL (all operators: `eq`, `ne`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `contains`)
- Exact product-brief evaluation scenario (deny confidential filesystem in production)
- Rate-limit enforcement and fail-closed default
- RBAC on agent / policy / rule endpoints
- Suspended and decommissioned agent handling

All tests run against an in-memory SQLite database — no external services required.

---

## 11. Migrations

In `ENV=development`, tables are auto-created on startup via `SQLModel.metadata.create_all` (convenient for local iteration). In production, use Alembic:

```bash
cd backend

# Generate a migration from current model state
alembic revision --autogenerate -m "add system_settings"

# Apply all pending migrations
alembic upgrade head

# Roll back one step
alembic downgrade -1
```

---

## 12. Extending to OPA/Rego

`POLICY_ENGINE_BACKEND=opa` is a placeholder switch. To wire in an OPA sidecar:

1. Implement `evaluate_opa(session, request) -> EngineResult` in a new `app/modules/enforcement/opa_engine.py`, translating the `EvaluationRequest` to Rego input and calling `OPA_URL`.

2. In `enforcement/service.py`, branch on `get_settings().POLICY_ENGINE_BACKEND`:

   ```python
   if settings.POLICY_ENGINE_BACKEND == "opa":
       result = await opa_engine.evaluate_opa(session, request)
   else:
       result = await engine.evaluate(session, request)
   ```

3. Both paths return the same `EngineResult` dataclass — nothing else in the codebase changes.

4. Optionally, compile rules authored in the dashboard to Rego at write-time in `rules/service.py` for a single source of truth, or maintain OPA policies independently via GitOps and treat the dashboard as read-only.

---

## 13. Security defaults

| Property | Behaviour |
|---|---|
| **Fail-closed evaluation** | Unknown agent, suspended agent, or no matching rule → `deny`. Absence of an explicit allow is never an allow. |
| **Fail-closed on errors** | If Redis is unreachable for a rate-limit check, the default is `deny`. If the OpenClaw plugin can't reach the engine (`failOpenOnNetworkError: false`), the tool call is blocked. |
| **Hashed credentials** | Passwords: bcrypt via passlib. Agent API keys: HMAC-SHA256, stored as hash + 12-char prefix. Raw key shown exactly once. |
| **RBAC on every endpoint** | Mutating endpoints require `admin` or `super_admin`. Read endpoints require `auditor` or above. The enforcement API uses agent API keys — no JWT path. |
| **Immutable audit trail** | `AccessDecision` and `AuditLog` have no update or delete endpoints. |
| **No secrets in source** | `JWT_SECRET_KEY` has no default and the app refuses to start without it. `.env` is gitignored. |
| **Non-root containers** | Docker images run as a dedicated non-root `appuser` / `nextjs` user. |
| **Docs disabled in production** | `/api/docs` and `/api/redoc` return 404 when `ENV=production`. |
| **CORS locked** | Only origins in `CORS_ORIGINS` are allowed; defaults to `localhost:3000` only. |

---

## 14. Folder structure

```
agent-guardrail/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py          # Pydantic Settings, all env vars
│   │   │   └── security.py        # JWT encode/decode, bcrypt, API key HMAC
│   │   ├── db/
│   │   │   ├── models.py          # SQLModel entities (all tables)
│   │   │   ├── session.py         # Async session factory + get_session dep
│   │   │   ├── init_db.py         # create_all for dev
│   │   │   └── seed.py            # Demo data seeder
│   │   ├── modules/
│   │   │   ├── auth/              # login, register, JWT + RBAC deps, agent API-key auth
│   │   │   ├── agents/            # agent CRUD, key rotation, policy assignment
│   │   │   ├── policies/          # policy CRUD
│   │   │   ├── rules/             # rule CRUD (the guardrail DSL)
│   │   │   ├── resources/         # resource catalog CRUD
│   │   │   ├── sandbox/           # sandbox profile CRUD
│   │   │   ├── enforcement/
│   │   │   │   ├── engine.py      # pure-Python policy evaluation algorithm
│   │   │   │   ├── matcher.py     # glob/regex/condition matchers
│   │   │   │   ├── rate_limiter.py# Redis fixed-window counters
│   │   │   │   └── router.py      # /evaluate + /simulate endpoints
│   │   │   ├── settings/          # runtime engine config (GET/PATCH /settings/engine)
│   │   │   ├── audit_logs/        # immutable log queries
│   │   │   └── dashboard/         # aggregation endpoints
│   │   ├── tests/                 # 24 pytest tests (unit + integration, SQLite in-memory)
│   │   └── main.py                # FastAPI app, CORS, middleware, router wiring
│   ├── alembic/                   # migration scaffolding
│   ├── requirements.txt
│   ├── Dockerfile
│   └── pytest.ini
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── dashboard/         # Live telemetry, decision pulse, traffic chart
│       │   ├── agents/            # Agent registry + key management
│       │   ├── policies/          # Policy list + rule authoring per policy
│       │   ├── violations/        # Violation feed + acknowledgement
│       │   ├── audit/             # Access decision log
│       │   ├── simulator/         # Interactive policy evaluation tester
│       │   └── settings/          # Account info + runtime engine settings
│       ├── components/
│       │   ├── AppShell.tsx       # Sidebar nav + user card
│       │   ├── Badges.tsx         # Effect / severity badges
│       │   └── Logo.tsx
│       ├── lib/
│       │   ├── api.ts             # Typed fetch client with JWT injection
│       │   ├── auth.tsx           # AuthContext + useAuth hook
│       │   └── theme.tsx          # Dark/light theme context
│       └── types/                 # TypeScript types mirroring backend schemas
├── docker/
│   └── openclaw/
│       ├── Dockerfile             # Extends openclaw/openclaw:latest + guardrail plugin
│       ├── entrypoint.sh          # Writes openclaw.json from env vars at startup
│       └── plugin/
│           ├── index.ts           # before_tool_call enforcement hook
│           └── openclaw.plugin.json
├── examples/
│   ├── example_policies.json      # Importable reference policy bundle
│   ├── test_cases.md              # Worked evaluation examples with curl commands
│   └── integrations/
│       └── openclaw-guardrail-plugin/  # Standalone plugin copy for manual installs
├── docker-compose.yml
├── .env.example
└── README.md
```
