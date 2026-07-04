# guardrail-enforcement

Routes every OpenClaw tool call through the LeashClaw Agent Guardrail Engine's
`/enforcement/evaluate` API before execution. Tool calls are allowed or denied
based on your configured policies.

## Hook: before_tool_call

Intercepts every tool invocation and sends an evaluation request to the
Guardrail Engine. If the decision is `deny`, the tool call is blocked and the
reason is surfaced to the session.

## Config

| Key | Required | Description |
|---|---|---|
| `guardrailUrl` | yes | Base URL of the Guardrail Engine API (e.g. `http://localhost:8000/api/v1`) |
| `agentSlug` | yes | Agent slug registered in the Guardrail Engine |
| `agentApiKey` | yes | `X-Agent-Api-Key` for the agent (`agk_...`) |
| `failOpenOnNetworkError` | no | Allow tool calls when the engine is unreachable (default: `false`) |
