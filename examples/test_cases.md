# Example Evaluation Requests & Test Cases

These mirror the rules in `example_policies.json` and the acceptance
contract from the product brief. All examples assume `agent_sales_001`
has `baseline-data-governance` assigned.

## 1. Exact product-brief example — deny

**Request** (`POST /api/v1/enforcement/evaluate`, header `X-Agent-Api-Key: <agent's key>`):
```json
{
  "agent_id": "agent_sales_001",
  "user_id": "user_123",
  "action": "read",
  "resource_type": "filesystem",
  "resource": "/data/customers/export.csv",
  "metadata": { "classification": "confidential", "location": "production" }
}
```

**Response:**
```json
{
  "decision": "deny",
  "reason": "Agent is not allowed to access confidential filesystem resources in production",
  "matched_rule_id": "<uuid of deny-confidential-filesystem-production>",
  "access_decision_id": "<uuid>",
  "rate_limited": false,
  "latency_ms": 1.42
}
```

## 2. Same resource, public classification — allow

```json
{
  "agent_id": "agent_sales_001",
  "action": "read",
  "resource_type": "filesystem",
  "resource": "/data/reports/q1-summary.csv",
  "metadata": { "classification": "public" }
}
```
→ `decision: allow`, matched by `allow-public-internal-filesystem`.

## 3. Secret classification, any agent — deny + violation raised

```json
{
  "agent_id": "agent_hermes_support_001",
  "action": "read",
  "resource_type": "filesystem",
  "resource": "/vault/prod/db-password",
  "metadata": { "classification": "secret" }
}
```
→ `decision: deny`, matched by `deny-all-secret-classification` (wildcard
subject, priority 1000). Because `alert_on_match` is true, a `Violation`
row with severity `critical` is also created (classification=secret).

## 4. Rate-limited API call

Call `POST /v1/crm/contacts` as `agent_sales_001` more than 30 times in
one minute. The 31st call within the same 60-second window returns:
```json
{
  "decision": "deny",
  "reason": "Rate limit exceeded for rule 'allow-crm-api' (30/min)",
  "matched_rule_id": "<uuid>",
  "rate_limited": true
}
```

## 5. Sharing PII externally — deny

```json
{
  "agent_id": "agent_sales_001",
  "action": "share",
  "resource_type": "database",
  "resource": "customers_table",
  "metadata": { "classification": "pii", "destination": "external_webhook" }
}
```
→ `decision: deny`, matched by `deny-share-pii-external`.

## 6. Unknown agent — fail closed

```json
{
  "agent_id": "agent_does_not_exist",
  "action": "read",
  "resource_type": "filesystem",
  "resource": "/data/x.csv",
  "metadata": {}
}
```
→ `decision: deny`, reason: `"Unknown agent 'agent_does_not_exist'"`. No
API key can pass for a nonexistent agent, so this path is only reachable
via `/enforcement/simulate` (admin-authenticated) or a spoofed `agent_id`
in the body while authenticating as a different agent — the enforcement
router always overwrites `agent_id` with the authenticated agent's own
slug for defense in depth.

## 7. No matching rule at all — fail closed by default

```json
{
  "agent_id": "agent_sales_001",
  "action": "execute",
  "resource_type": "tool",
  "resource": "unregistered_tool_xyz",
  "metadata": {}
}
```
→ `decision: deny`, reason references "default policy is deny"
(`POLICY_DEFAULT_EFFECT=deny`). Change this setting to `allow` only in
non-production/dev environments if you intentionally want a fail-open
default — not recommended for production.

## Running these with curl

```bash
# 1. Log in as admin, capture the JWT
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@guardrail.example.com","password":"ChangeMe123!"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# 2. Run a simulation (admin-authenticated, no agent key needed)
curl -s -X POST http://localhost:8000/api/v1/enforcement/simulate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<'EOF'
{
  "agent_id": "agent_sales_001",
  "user_id": "user_123",
  "action": "read",
  "resource_type": "filesystem",
  "resource": "/data/customers/export.csv",
  "metadata": {"classification": "confidential", "location": "production"}
}
EOF

# 3. Or call as the agent itself, using its API key from the seed script output
curl -s -X POST http://localhost:8000/api/v1/enforcement/evaluate \
  -H "X-Agent-Api-Key: agk_..." \
  -H "Content-Type: application/json" \
  -d @- <<'EOF'
{
  "agent_id": "agent_sales_001",
  "action": "read",
  "resource_type": "filesystem",
  "resource": "/data/customers/export.csv",
  "metadata": {"classification": "confidential", "location": "production"}
}
EOF
```
