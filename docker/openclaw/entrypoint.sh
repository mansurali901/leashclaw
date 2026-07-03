#!/bin/sh
# Writes ~/.openclaw/openclaw.json from environment variables, then starts OpenClaw.
#
# Required env vars:
#   GUARDRAIL_AGENT_API_KEY  — the agk_... key from the guardrail engine
#   GUARDRAIL_AGENT_SLUG     — slug of the registered agent (e.g. openclaw-agent)
#   GUARDRAIL_URL            — guardrail backend URL (default: http://backend:8000/api/v1)
#   ANTHROPIC_API_KEY        — Anthropic key for the LLM provider

set -e

CONFIG_DIR="${HOME}/.openclaw"
CONFIG_FILE="${CONFIG_DIR}/openclaw.json"
GUARDRAIL_URL="${GUARDRAIL_URL:-http://backend:8000/api/v1}"

if [ -z "${GUARDRAIL_AGENT_API_KEY}" ]; then
  echo "[openclaw-entrypoint] ERROR: GUARDRAIL_AGENT_API_KEY is not set." >&2
  echo "[openclaw-entrypoint] Register an agent first and set GUARDRAIL_AGENT_API_KEY=agk_..." >&2
  exit 1
fi

if [ -z "${GUARDRAIL_AGENT_SLUG}" ]; then
  echo "[openclaw-entrypoint] ERROR: GUARDRAIL_AGENT_SLUG is not set." >&2
  exit 1
fi

mkdir -p "${CONFIG_DIR}"

# Write openclaw.json — merges existing file if present so manual config isn't lost
PLUGIN_BLOCK=$(cat <<EOF
{
  "guardrail-enforcement": {
    "enabled": true,
    "config": {
      "guardrailUrl": "${GUARDRAIL_URL}",
      "agentSlug": "${GUARDRAIL_AGENT_SLUG}",
      "failOpenOnNetworkError": false
    },
    "env": {
      "GUARDRAIL_AGENT_API_KEY": "${GUARDRAIL_AGENT_API_KEY}"
    }
  }
}
EOF
)

# Write a minimal valid config (gateway.mode required; plugins wired separately)
cat > "${CONFIG_FILE}" <<EOF
{
  "gateway": {
    "mode": "local"
  }
}
EOF

echo "[openclaw-entrypoint] Config written to ${CONFIG_FILE}"
echo "[openclaw-entrypoint] Agent slug : ${GUARDRAIL_AGENT_SLUG}"
echo "[openclaw-entrypoint] Guardrail  : ${GUARDRAIL_URL}"

exec tini -s -- "$@"
