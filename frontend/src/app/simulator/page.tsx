"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import DocsDrawer, { DocSection, DocP, DocCode, DocNote, DocTable } from "@/components/DocsDrawer";
import { EffectBadge } from "@/components/Badges";
import { api, ApiError } from "@/lib/api";
import type { EvaluationResponse } from "@/types";

const EXAMPLES: Record<string, object> = {
  filesystem: {
    agent_id: "agent_sales_001",
    action: "read",
    resource_type: "filesystem",
    resource: "/data/customers/export.csv",
    metadata: { classification: "confidential", location: "production" },
  },
  url: {
    agent_id: "my-agent",
    action: "access_url",
    resource_type: "url",
    resource: "https://api.stripe.com/v1/charges",
    metadata: {},
  },
  api: {
    agent_id: "my-agent",
    action: "call_api",
    resource_type: "api",
    resource: "POST /v1/payments/charge",
    metadata: { amount: 5000, currency: "usd" },
  },
  tool: {
    agent_id: "my-agent",
    action: "execute",
    resource_type: "tool",
    resource: "exec:rm",
    metadata: { args: ["-rf", "/var/data"] },
  },
  secret: {
    agent_id: "my-agent",
    action: "read",
    resource_type: "secret",
    resource: "prod/database_password",
    metadata: { classification: "secret" },
  },
  database: {
    agent_id: "my-agent",
    action: "write",
    resource_type: "database",
    resource: "postgres://prod/users",
    metadata: { table: "users", operation: "UPDATE" },
  },
  command: {
    agent_id: "my-agent",
    action: "execute",
    resource_type: "command",
    resource: "git",
    metadata: { args: ["commit", "-m", "update"] },
  },
};

export default function SimulatorPage() {
  const [payload, setPayload] = useState(JSON.stringify(EXAMPLES.filesystem, null, 2));
  const [result, setResult] = useState<EvaluationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeExample, setActiveExample] = useState("filesystem");
  const [showDocs, setShowDocs] = useState(false);

  function loadExample(key: string) {
    setActiveExample(key);
    setPayload(JSON.stringify(EXAMPLES[key], null, 2));
    setError(null);
    setResult(null);
  }

  async function onRun() {
    setError(null);
    setResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      setError("Request must be valid JSON.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<EvaluationResponse>("/enforcement/simulate", parsed);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Simulation failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="p-8 max-w-[1100px]">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl text-mist-100">Policy simulator</h1>
            <p className="text-sm text-mist-500 mt-1">
              Evaluate a hypothetical agent action against live policies without executing it. Every simulation is logged like a real evaluation.
            </p>
          </div>
          <button
            onClick={() => setShowDocs(true)}
            className="rounded-lg border border-ink-600 text-mist-500 text-sm px-4 py-2 hover:text-mist-100 hover:border-ink-500 transition-colors"
          >
            Docs
          </button>
        </header>

        <div className="mb-4">
          <p className="text-xs font-mono text-mist-600 mb-2 uppercase tracking-wide">Load example:</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(EXAMPLES).map((key) => (
              <button
                key={key}
                onClick={() => loadExample(key)}
                className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${
                  activeExample === key
                    ? "bg-ink-700 border-ink-500 text-mist-100"
                    : "border-ink-700 text-mist-600 hover:text-mist-300 hover:border-ink-600"
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="panel p-5">
            <p className="text-xs font-mono text-mist-500 uppercase tracking-wide mb-2">Request</p>
            <textarea
              value={payload}
              onChange={(e) => { setPayload(e.target.value); setError(null); }}
              rows={16}
              className="w-full rounded-lg bg-ink-950 border border-ink-600 px-3 py-2.5 text-xs font-mono text-mist-100 outline-none focus:border-signal-info"
              spellCheck={false}
            />
            {error && <p className="text-sm text-signal-deny mt-2">{error}</p>}
            <button
              onClick={onRun}
              disabled={submitting}
              className="mt-3 w-full rounded-lg bg-ink-700 border border-ink-500 text-mist-100 text-sm py-2.5 hover:bg-ink-600 transition-colors disabled:opacity-50"
            >
              {submitting ? "Evaluating…" : "Run evaluation"}
            </button>
          </div>

          <div className="panel p-5">
            <p className="text-xs font-mono text-mist-500 uppercase tracking-wide mb-2">Response</p>
            {!result ? (
              <p className="text-sm text-mist-700">Run an evaluation to see the policy engine&apos;s decision.</p>
            ) : (
              <div className="space-y-3">
                <EffectBadge effect={result.decision} />
                <p className="text-sm text-mist-100">{result.reason}</p>
                <dl className="text-xs font-mono space-y-1.5 pt-2 border-t border-ink-700">
                  <div className="flex justify-between">
                    <dt className="text-mist-700">matched_rule_id</dt>
                    <dd className="text-mist-300">{result.matched_rule_id ?? "null"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-mist-700">access_decision_id</dt>
                    <dd className="text-mist-300">{result.access_decision_id}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-mist-700">rate_limited</dt>
                    <dd className={result.rate_limited ? "text-signal-warn" : "text-mist-300"}>{String(result.rate_limited)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-mist-700">latency_ms</dt>
                    <dd className="text-mist-300">{result.latency_ms}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </div>
      </div>

      <DocsDrawer open={showDocs} onClose={() => setShowDocs(false)} title="Simulator documentation">
        <DocSection title="What the simulator does">
          <DocP>
            The simulator sends a hypothetical request to the live policy engine and returns the decision that would be made for a real agent action. It is evaluated against the exact same rules as real traffic — the only difference is no real action is executed.
          </DocP>
          <DocNote>
            Every simulation is recorded as a real <code className="font-mono">AccessDecision</code> row and appears in the Audit trail. Use a dedicated test agent slug to avoid polluting production audit logs.
          </DocNote>
        </DocSection>

        <DocSection title="Request fields">
          <DocTable
            headers={["Field", "Required", "Description"]}
            rows={[
              ["agent_id", "yes", "Agent slug (e.g. agent_sales_001)"],
              ["action", "yes", "The operation: read, write, execute, call_api, access_url, …"],
              ["resource_type", "yes", "filesystem | url | api | tool | command | secret | database"],
              ["resource", "yes", "The specific resource: path, URL, exec:cmd, API pattern"],
              ["user_id", "no", "UUID of the user acting on behalf of the agent"],
              ["metadata", "no", "Extra context used by condition filters in rules"],
            ]}
          />
        </DocSection>

        <DocSection title="How decisions are made">
          <DocP>
            The engine loads all rules from all policies assigned to the agent (plus org-wide rules for the agent&apos;s team, role, or <code className="font-mono text-mist-300">*</code>). Rules are sorted by priority (highest first). The <strong className="text-mist-200">first rule that matches all of: action, resource_type, resource_pattern, and condition</strong> wins.
          </DocP>
          <DocP>
            If no rule matches, the <strong className="text-mist-200">default effect</strong> applies (Settings → Engine, default: deny). If a matched rule has a <code className="font-mono text-mist-300">rate_limit_per_minute</code>, an allow can still become a deny when the limit is exceeded.
          </DocP>
        </DocSection>

        <DocSection title="Filesystem example">
          <DocCode
            label="Read a confidential file in production"
            onLoad={() => { loadExample("filesystem"); setShowDocs(false); }}
          >
            {JSON.stringify(EXAMPLES.filesystem, null, 2)}
          </DocCode>
          <DocP>
            Use the <code className="font-mono text-mist-300">metadata.classification</code> key to trigger condition-based rules. Set it to <code className="font-mono text-mist-300">pii</code>, <code className="font-mono text-mist-300">secret</code>, or <code className="font-mono text-mist-300">confidential</code> to test classification-aware policies.
          </DocP>
        </DocSection>

        <DocSection title="URL access example">
          <DocCode
            label="Access an external URL"
            onLoad={() => { loadExample("url"); setShowDocs(false); }}
          >
            {JSON.stringify(EXAMPLES.url, null, 2)}
          </DocCode>
          <DocP>
            The <code className="font-mono text-mist-300">resource</code> field for URL rules is the full URL or domain. Rules use glob patterns to match — e.g. <code className="font-mono text-mist-300">*.stripe.com</code> matches any Stripe subdomain.
          </DocP>
        </DocSection>

        <DocSection title="API call example">
          <DocCode
            label="Call a payment API endpoint"
            onLoad={() => { loadExample("api"); setShowDocs(false); }}
          >
            {JSON.stringify(EXAMPLES.api, null, 2)}
          </DocCode>
          <DocP>
            Format the <code className="font-mono text-mist-300">resource</code> as <code className="font-mono text-mist-300">METHOD /path</code>. Rules match on the full string, so <code className="font-mono text-mist-300">POST /v1/payments/**</code> matches all POST endpoints under that prefix.
          </DocP>
        </DocSection>

        <DocSection title="Tool / exec example">
          <DocCode
            label="Execute a shell command via a tool"
            onLoad={() => { loadExample("tool"); setShowDocs(false); }}
          >
            {JSON.stringify(EXAMPLES.tool, null, 2)}
          </DocCode>
          <DocP>
            Use <code className="font-mono text-mist-300">exec:&lt;command&gt;</code> as the resource. Rules with pattern <code className="font-mono text-mist-300">exec:rm</code> match exactly that command; <code className="font-mono text-mist-300">exec:*</code> matches all. The agent&apos;s <code className="font-mono text-mist-300">allowed_commands</code> list (set in the Agents page) is checked <em>before</em> policy rules.
          </DocP>
        </DocSection>

        <DocSection title="Secret access example">
          <DocCode
            label="Read a secret from the secrets store"
            onLoad={() => { loadExample("secret"); setShowDocs(false); }}
          >
            {JSON.stringify(EXAMPLES.secret, null, 2)}
          </DocCode>
          <DocP>
            Include <code className="font-mono text-mist-300">metadata.classification: &quot;secret&quot;</code> to trigger classification-based conditions. Secret rules commonly use <code className="font-mono text-mist-300">alert_on_match: true</code> to record violations even when access is allowed.
          </DocP>
        </DocSection>

        <DocSection title="Database write example">
          <DocCode
            label="Write to a production database table"
            onLoad={() => { loadExample("database"); setShowDocs(false); }}
          >
            {JSON.stringify(EXAMPLES.database, null, 2)}
          </DocCode>
        </DocSection>

        <DocSection title="Command example">
          <DocCode
            label="Execute a bare command (command resource type)"
            onLoad={() => { loadExample("command"); setShowDocs(false); }}
          >
            {JSON.stringify(EXAMPLES.command, null, 2)}
          </DocCode>
          <DocNote>
            <strong>tool vs command:</strong> Use <code className="font-mono">tool</code> with <code className="font-mono">exec:cmd</code> when the agent invokes commands through its tool interface. Use <code className="font-mono">command</code> with the bare name for policy rules that target the command directly without the exec: wrapper.
          </DocNote>
        </DocSection>

        <DocSection title="Reading the response">
          <DocTable
            headers={["Field", "Description"]}
            rows={[
              ["decision", "allow or deny — the engine's verdict"],
              ["reason", "Human-readable explanation: matched rule description or default-deny message"],
              ["matched_rule_id", "UUID of the rule that matched, or null if no rule matched"],
              ["access_decision_id", "UUID of the persisted AccessDecision row (visible in Audit trail)"],
              ["rate_limited", "true if the request was denied due to a rate limit on the matched rule"],
              ["latency_ms", "Time spent evaluating rules (excludes network round-trip)"],
            ]}
          />
        </DocSection>
      </DocsDrawer>
    </AppShell>
  );
}
