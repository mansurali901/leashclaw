# Testing the Agent Guardrail Engine with OpenClaw

This wires OpenClaw's `before_tool_call` plugin hook to the Guardrail
Engine's `/enforcement/evaluate` API, so every `exec`, `browser`,
`web_fetch`, file, or messaging tool call OpenClaw's agent tries to make
gets an allow/deny decision from your policies first.

## 0. Prerequisites

- The Guardrail Engine running (`docker compose up -d` from the project
  root, plus `docker compose --profile seed run --rm seed`).
- An OpenClaw install with the Gateway running (`openclaw gateway status`
  should report healthy). This guide targets OpenClaw's plugin hook API as
  of the 2026.x releases — confirm your version's exact hook payload shape
  against `docs.openclaw.ai/plugins/hooks` before relying on this in
  anything beyond a test environment, since hook signatures have changed
  release to release.

## 1. Register an OpenClaw-facing agent in the Guardrail Engine

Use the dashboard (`/agents` → "Register agent") or the API:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@guardrail.example.com","password":"ChangeMe123!"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s -X POST http://localhost:8000/api/v1/agents \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"slug":"agent_hermes_support_001","name":"OpenClaw Hermes Support Agent","owner_team":"support"}'
```

Copy the `api_key` from the response (`agk_...`) — this is
`GUARDRAIL_AGENT_API_KEY` below. It's shown once.

Assign a policy so there's something to enforce — the demo seed data
already includes `baseline-data-governance` with a rule denying
`resource_type=secret` org-wide and a rule allowing `POST /v1/crm/*`
calls, rate-limited. Assign it:

```bash
POLICY_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/policies \
  | python3 -c "import sys,json; print([p['id'] for p in json.load(sys.stdin) if p['name']=='baseline-data-governance'][0])")

AGENT_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/agents \
  | python3 -c "import sys,json; print([a['id'] for a in json.load(sys.stdin) if a['slug']=='agent_hermes_support_001'][0])")

curl -s -X POST "http://localhost:8000/api/v1/agents/$AGENT_ID/policies" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"policy_id\": \"$POLICY_ID\"}"
```

## 2. Install the plugin into OpenClaw

```bash
mkdir -p ~/.openclaw/extensions/guardrail-enforcement
cp examples/integrations/openclaw-guardrail-plugin/* ~/.openclaw/extensions/guardrail-enforcement/
openclaw plugins install ~/.openclaw/extensions/guardrail-enforcement
```

## 3. Configure it

Edit `~/.openclaw/openclaw.json`:

```json5
{
  plugins: {
    enabled: true,
    allow: ["guardrail-enforcement"],
    entries: {
      "guardrail-enforcement": {
        enabled: true,
        config: {
          guardrailUrl: "http://localhost:8000/api/v1",
          agentSlug: "agent_hermes_support_001",
          failOpenOnNetworkError: false,
        },
        env: {
          GUARDRAIL_AGENT_API_KEY: "agk_...", // the key from step 1
        },
      },
    },
  },
}
```

Restart the Gateway so the new hook loads:

```bash
openclaw gateway restart   # or restart the systemd/launchd service
openclaw hooks list        # confirm guardrail-enforcement shows as plugin-managed
```

## 4. Test it

Trigger a tool call that should be **denied**. If you've loaded the demo
seed data, asking the agent to read something classified as `secret`
should be blocked (deny-all-secret-classification, priority 1000,
`alert_on_match: true`). Since OpenClaw's built-in tools don't send a
`classification` metadata field on their own, the simplest first test is
to point the agent at a tool name your policies deny outright, or add a
quick test rule via the simulator/dashboard scoped to a real OpenClaw tool
name, e.g.:

```bash
curl -s -X POST http://localhost:8000/api/v1/rules \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{
    \"policy_id\": \"$POLICY_ID\",
    \"name\": \"deny-exec-rm\",
    \"subject_type\": \"agent\",
    \"subject_value\": \"agent_hermes_support_001\",
    \"action\": \"execute\",
    \"resource_type\": \"tool\",
    \"resource_pattern\": \"exec:rm\",
    \"effect\": \"deny\",
    \"priority\": 800
  }"
```

Then, in an OpenClaw session:

```bash
openclaw agent --agent agent_hermes_support_001 "run: rm -rf /tmp/test"
```

Expected: the tool call is blocked before execution, and OpenClaw surfaces
the `blockReason` string from the plugin (which is the Guardrail Engine's
`reason` field) back to the session. Meanwhile:

- **Guardrail dashboard** (`http://localhost:3000/dashboard`) shows the
  request in the decision pulse and traffic chart within seconds.
- **`/audit`** shows the full `AccessDecision` row: matched rule, reason,
  latency.
- **`/violations`** shows a new entry (deny always raises a violation).

Now try something the policy allows (e.g. a `web_search` call, or an
`exec` command that isn't `rm`) and confirm it passes through normally —
the dashboard's allow/deny ratio should reflect both.

## 5. Iterate

- Adjust `TOOL_MAP` in `index.ts` as you enable more OpenClaw tools/skills
  — anything not in the map falls back to a generic `execute`/`tool`
  classification, which the Guardrail Engine denies by default (fail
  closed) until you add a matching rule.
- To pass richer `metadata` (e.g. data classification for `read_file`
  calls), extend the `body.metadata` object in `index.ts` — the Guardrail
  Engine's `condition` DSL can match on any key you send.
- For read-only visibility without blocking (e.g. while first rolling
  this out), temporarily set every rule's `effect` to `allow` with
  `alert_on_match: true` — you'll get full audit trail and violation
  entries for what *would* have been denied, without breaking the agent.
