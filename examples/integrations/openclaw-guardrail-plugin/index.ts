/**
 * Agent Guardrail Enforcement plugin for OpenClaw.
 *
 * Registers a `before_tool_call` hook (priority 100, so it runs before
 * other plugins that might mutate params) that:
 *   1. Maps the OpenClaw tool call to a Guardrail EvaluationRequest
 *   2. Calls POST /api/v1/enforcement/evaluate on the Guardrail Engine
 *   3. Blocks the tool call if the decision is "deny"
 *
 * Install:
 *   cp -r openclaw-guardrail-plugin ~/.openclaw/extensions/guardrail-enforcement
 *   openclaw plugins install ~/.openclaw/extensions/guardrail-enforcement
 *
 * Configure (~/.openclaw/openclaw.json):
 *   {
 *     "plugins": {
 *       "enabled": true,
 *       "allow": ["guardrail-enforcement"],
 *       "entries": {
 *         "guardrail-enforcement": {
 *           "enabled": true,
 *           "config": {
 *             "guardrailUrl": "http://localhost:8000/api/v1",
 *             "agentSlug": "agent_hermes_support_001",
 *             "failOpenOnNetworkError": false
 *           },
 *           "env": {
 *             "GUARDRAIL_AGENT_API_KEY": "agk_..."
 *           }
 *         }
 *       }
 *     }
 *   }
 *
 * NOTE ON HOOK PAYLOAD SHAPE: `before_tool_call` event fields (toolName,
 * toolCallId, params, sessionKey, agentId) have evolved across OpenClaw
 * releases. Before relying on this in production, log the raw `event`
 * once (see the commented console.log below) and confirm field names
 * against your installed OpenClaw version's Plugin hooks reference
 * (docs.openclaw.ai/plugins/hooks).
 */

// If your OpenClaw version ships typed SDK exports, prefer importing
// PluginEntry/HookEvent types from "openclaw/plugin-sdk" instead of `any`.
type AnyEvent = Record<string, any>;

interface GuardrailConfig {
  guardrailUrl: string;
  agentSlug: string;
  failOpenOnNetworkError: boolean;
}

// Maps OpenClaw tool names to the Guardrail Engine's (action, resource_type) taxonomy.
// Extend this table as you enable more OpenClaw tools/skills.
const TOOL_MAP: Record<string, { action: string; resourceType: string; resourceOf: (params: AnyEvent) => string }> = {
  exec: {
    action: "execute",
    resourceType: "tool",
    resourceOf: (p) => `exec:${String(p.command ?? "").split(/\s+/)[0] || "unknown"}`,
  },
  browser: {
    action: "access_url",
    resourceType: "url",
    resourceOf: (p) => String(p.url ?? p.href ?? "unknown"),
  },
  web_fetch: {
    action: "access_url",
    resourceType: "url",
    resourceOf: (p) => String(p.url ?? "unknown"),
  },
  web_search: {
    action: "call_api",
    resourceType: "api",
    resourceOf: () => "GET /web_search",
  },
  read_file: {
    action: "read",
    resourceType: "filesystem",
    resourceOf: (p) => String(p.path ?? p.file ?? "unknown"),
  },
  write_file: {
    action: "write",
    resourceType: "filesystem",
    resourceOf: (p) => String(p.path ?? p.file ?? "unknown"),
  },
  message: {
    action: "share",
    resourceType: "database",
    resourceOf: (p) => String(p.to ?? p.channel ?? "unknown"),
  },
};

function classify(toolName: string, params: AnyEvent) {
  const mapping = TOOL_MAP[toolName];
  if (mapping) {
    return { action: mapping.action, resourceType: mapping.resourceType, resource: mapping.resourceOf(params) };
  }
  // Unmapped tools default to a generic "execute a tool" classification.
  // The Guardrail Engine fails closed (deny) on anything with no matching
  // rule, so unmapped/unknown tools are blocked by default unless an
  // admin adds an explicit allow rule for resource_type=tool, pattern=<name>.
  return { action: "execute", resourceType: "tool", resource: toolName };
}

export default function definePluginEntry(entry: { id: string; name: string; register: (api: AnyEvent) => void }) {
  return entry;
}

module.exports = definePluginEntry({
  id: "guardrail-enforcement",
  name: "Agent Guardrail Enforcement",
  register(api: AnyEvent) {
    const cfg: GuardrailConfig = {
      guardrailUrl: api.config?.guardrailUrl ?? "http://localhost:8000/api/v1",
      agentSlug: api.config?.agentSlug ?? process.env.GUARDRAIL_AGENT_SLUG ?? "unknown_agent",
      failOpenOnNetworkError: api.config?.failOpenOnNetworkError ?? false,
    };
    const apiKey = process.env.GUARDRAIL_AGENT_API_KEY;
    if (!apiKey) {
      console.warn("[guardrail-enforcement] GUARDRAIL_AGENT_API_KEY is not set — every evaluation call will be rejected by the Guardrail Engine (401).");
    }

    api.on(
      "before_tool_call",
      async (event: AnyEvent) => {
        // console.log("[guardrail-enforcement] raw event:", JSON.stringify(event));

        const toolName: string = event.toolName ?? event.tool ?? "unknown";
        const params: AnyEvent = event.params ?? event.arguments ?? {};
        const { action, resourceType, resource } = classify(toolName, params);

        const body = {
          agent_id: cfg.agentSlug,
          user_id: event.sessionKey ?? event.userId ?? undefined,
          action,
          resource_type: resourceType,
          resource,
          metadata: {
            tool_name: toolName,
            openclaw_session: event.sessionKey ?? null,
          },
        };

        try {
          const res = await fetch(`${cfg.guardrailUrl}/enforcement/evaluate`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(apiKey ? { "X-Agent-Api-Key": apiKey } : {}),
            },
            body: JSON.stringify(body),
            // Keep this tight — the guardrail call sits on the critical
            // path of every tool invocation.
            signal: AbortSignal.timeout(3000),
          });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error(`[guardrail-enforcement] evaluation call failed (${res.status}): ${text}`);
            if (cfg.failOpenOnNetworkError) return {};
            return { block: true, blockReason: `Guardrail Engine unreachable (${res.status}) — failing closed` };
          }

          const decision = await res.json();

          if (decision.decision === "deny") {
            return {
              block: true,
              blockReason: decision.reason ?? `Blocked by guardrail policy (rule: ${decision.matched_rule_id ?? "default-deny"})`,
            };
          }

          return {}; // allow — no params rewrite
        } catch (err) {
          console.error("[guardrail-enforcement] evaluation call threw:", err);
          if (cfg.failOpenOnNetworkError) return {};
          return { block: true, blockReason: "Guardrail Engine unreachable — failing closed" };
        }
      },
      { priority: 100 },
    );
  },
});
