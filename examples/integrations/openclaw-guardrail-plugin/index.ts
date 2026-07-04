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
 * Configure (~/.openclaw/openclaw.json — under plugins.entries.guardrail-enforcement.config):
 *   {
 *     "plugins": {
 *       "enabled": true,
 *       "allow": ["guardrail-enforcement"],
 *       "entries": {
 *         "guardrail-enforcement": {
 *           "enabled": true,
 *           "config": {
 *             "guardrailUrl": "http://localhost:8000/api/v1",
 *             "agentSlug": "openclaw",
 *             "agentApiKey": "agk_...",
 *             "failOpenOnNetworkError": false
 *           }
 *         }
 *       }
 *     }
 *   }
 *
 * Config notes (OpenClaw 2026.x):
 *   - Plugin-specific config is injected via api.pluginConfig (not api.config).
 *   - api.config is the full openclaw.json root.
 *   - api.on() maps to registerTypedHook — the correct API for before_tool_call.
 *   - The default export must be a callable function (hook loader requirement).
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
  agentApiKey: string;
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
  // Unmapped tools fall back to a generic classification. The Guardrail Engine
  // applies the default policy (deny unless an explicit allow rule matches).
  return { action: "execute", resourceType: "tool", resource: toolName };
}

// The default export must be a callable function so the hook loader accepts it.
// api.pluginConfig holds plugin-specific config from plugins.entries.<id>.config.
// api.on() is the correct registration method — it maps to registerTypedHook
// which adds the handler to registry.typedHooks (read by the hook runner).
function setup(api: AnyEvent) {
  const pc: AnyEvent = api.pluginConfig ?? {};
  const cfg: GuardrailConfig = {
    guardrailUrl: pc.guardrailUrl ?? "http://localhost:8000/api/v1",
    agentSlug: pc.agentSlug ?? process.env["GUARDRAIL_AGENT_SLUG"] ?? "unknown_agent",
    agentApiKey: pc.agentApiKey ?? process.env["GUARDRAIL_AGENT_API_KEY"] ?? "",
    failOpenOnNetworkError: pc.failOpenOnNetworkError ?? false,
  };

  if (!cfg.agentApiKey) {
    console.warn("[guardrail-enforcement] agentApiKey is not set — evaluation calls will be rejected (401).");
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
            ...(cfg.agentApiKey ? { "X-Agent-Api-Key": cfg.agentApiKey } : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(3000),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error(`[guardrail-enforcement] evaluation failed (${res.status}): ${text}`);
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

        return {};
      } catch (err) {
        console.error("[guardrail-enforcement] evaluation threw:", err);
        if (cfg.failOpenOnNetworkError) return {};
        return { block: true, blockReason: "Guardrail Engine unreachable — failing closed" };
      }
    },
    { priority: 100 },
  );
}

// .name is read-only on named functions; OpenClaw reads display name from openclaw.plugin.json.
setup.id = "guardrail-enforcement";
// Plugin loader calls .register(api); alias it to the same setup function.
setup.register = setup;

export default setup;
