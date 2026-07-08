# LeashClaw — Agentic Framework Integrations

Drop-in guardrail enforcement for the most popular Python agent frameworks. Every integration calls the same LeashClaw enforcement API — `POST /api/v1/enforcement/evaluate` — before any tool executes.

## Available integrations

| Framework | Mechanism | Directory |
|---|---|---|
| **OpenClaw** | `before_tool_call` plugin hook | [`openclaw-guardrail-plugin/`](openclaw-guardrail-plugin/) |
| **CrewAI** | `BaseTool` wrapper | [`crewai/`](crewai/) |
| **Agno** | `tool_call_hooks` + tool wrapper | [`agno/`](agno/) |
| **LangChain / LangGraph** | `BaseCallbackHandler` + tool wrapper | [`langchain/`](langchain/) |
| **AutoGen** | Function decorator + `FunctionTool` wrapper | [`autogen/`](autogen/) |

## Prerequisites

1. A running LeashClaw instance (see repo root `docker-compose.yml`)
2. An agent registered in LeashClaw (`/agents` → Register agent)
3. The agent's API key (`agk_...`) from the registration step
4. At least one policy assigned to the agent

## Shared API contract

Every integration maps tool calls to this request body:

```json
{
  "agent_id": "your-agent-slug",
  "action": "read | write | execute | call_api | access_url | ...",
  "resource_type": "filesystem | api | url | database | secret | tool | command",
  "resource": "/path/to/file  OR  https://example.com  OR  exec:rm  ...",
  "metadata": { "tool_name": "...", "framework": "..." }
}
```

The engine returns:

```json
{
  "decision": "allow | deny",
  "reason": "Matched rule 'deny-pii' -> deny",
  "matched_rule_id": "...",
  "latency_ms": 0.4
}
```

## fail_open vs fail_closed

All integrations support a `fail_open` flag:

| `fail_open` | Engine unreachable | Default |
|---|---|---|
| `False` (fail-closed) | Tool call **blocked** | ✓ recommended for production |
| `True` (fail-open) | Tool call **allowed** | development / non-critical agents |

## Quick policy recipe

Deny all filesystem writes except to `/reports/`:

```json
{
  "name": "restrict-writes",
  "rules": [
    {
      "name": "allow-reports-write",
      "subject_type": "agent", "subject_value": "*",
      "action": "write", "resource_type": "filesystem",
      "resource_pattern": "/reports/**",
      "effect": "allow", "priority": 200
    },
    {
      "name": "deny-all-writes",
      "subject_type": "agent", "subject_value": "*",
      "action": "write", "resource_type": "filesystem",
      "resource_pattern": "**",
      "effect": "deny", "priority": 100
    }
  ]
}
```
