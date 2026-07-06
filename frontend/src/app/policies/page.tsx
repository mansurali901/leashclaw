"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import DocsDrawer, { DocSection, DocP, DocCode, DocNote, DocTable } from "@/components/DocsDrawer";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { PolicyRead, RuleRead } from "@/types";

const POLICY_IMPORT_EXAMPLE = JSON.stringify(
  {
    name: "deny-secrets-prod",
    description: "Block all secret and PII access in production",
    rules: [
      {
        name: "deny-secret-reads",
        description: "Agents may not read secrets",
        subject_type: "agent",
        subject_value: "*",
        action: "read",
        resource_type: "secret",
        resource_pattern: "**",
        condition: {},
        effect: "deny",
        priority: 1000,
        enabled: true,
        alert_on_match: true,
        rate_limit_per_minute: null,
      },
      {
        name: "deny-pii-filesystem",
        description: "Block reading PII files",
        subject_type: "agent",
        subject_value: "*",
        action: "read",
        resource_type: "filesystem",
        resource_pattern: "/data/pii/**",
        condition: { classification: { in: ["pii", "secret"] } },
        effect: "deny",
        priority: 900,
        enabled: true,
        alert_on_match: true,
        rate_limit_per_minute: null,
      },
    ],
  },
  null,
  2,
);

export default function PoliciesPage() {
  const { isAdmin } = useAuth();
  const [policies, setPolicies] = useState<PolicyRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [importJson, setImportJson] = useState(POLICY_IMPORT_EXAMPLE);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [policyToDelete, setPolicyToDelete] = useState<PolicyRead | null>(null);

  async function refresh() {
    setPolicies(await api.get<PolicyRead[]>("/policies"));
    setLoading(false);
  }

  async function deletePolicy(p: PolicyRead, e: React.MouseEvent) {
    e.preventDefault();
    setPolicyToDelete(p);
  }

  async function confirmDeletePolicy() {
    if (!policyToDelete) return;
    await api.del(`/policies/${policyToDelete.id}`);
    setPolicyToDelete(null);
    refresh();
  }

  async function togglePolicy(p: PolicyRead, e: React.MouseEvent) {
    e.preventDefault();
    await api.patch(`/policies/${p.id}`, { enabled: !p.enabled });
    refresh();
  }

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/policies", { name, description: description || undefined });
      setShowCreate(false);
      setName("");
      setDescription("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create policy");
    } finally {
      setSubmitting(false);
    }
  }

  async function onImport(e: React.FormEvent) {
    e.preventDefault();
    setImportError(null);
    let parsed: { name: string; description?: string; rules?: Partial<RuleRead>[] };
    try {
      parsed = JSON.parse(importJson);
    } catch {
      setImportError("Invalid JSON — check the format and try again.");
      return;
    }
    if (!parsed.name) {
      setImportError('JSON must have a "name" field.');
      return;
    }
    setImporting(true);
    try {
      const policy = await api.post<PolicyRead>("/policies", {
        name: parsed.name,
        description: parsed.description,
      });
      const rules = parsed.rules ?? [];
      for (const rule of rules) {
        await api.post("/rules", { ...rule, policy_id: policy.id });
      }
      setShowImport(false);
      setImportJson(POLICY_IMPORT_EXAMPLE);
      refresh();
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <AppShell>
      <div className="p-8 max-w-[1000px]">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl text-mist-100">Policies</h1>
            <p className="text-sm text-mist-500 mt-1">Named, versioned rule bundles assigned to agents, teams, or roles.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDocs(true)}
              className="rounded-lg border border-ink-600 text-mist-500 text-sm px-4 py-2 hover:text-mist-100 hover:border-ink-500 transition-colors"
            >
              Docs
            </button>
            {isAdmin && (
              <>
                <button
                  onClick={() => { setShowImport((s) => !s); setShowCreate(false); }}
                  className="rounded-lg border border-ink-600 text-mist-500 text-sm px-4 py-2 hover:text-mist-100 hover:border-ink-500 transition-colors"
                >
                  Import JSON
                </button>
                <button
                  onClick={() => { setShowCreate((s) => !s); setShowImport(false); }}
                  className="rounded-lg bg-ink-700 border border-ink-500 text-mist-100 text-sm px-4 py-2 hover:bg-ink-600 transition-colors"
                >
                  + New policy
                </button>
              </>
            )}
          </div>
        </header>

        {showImport && (
          <form onSubmit={onImport} className="panel p-5 mb-6 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display text-sm text-mist-100">Import policy from JSON</h2>
              <span className="text-xs text-mist-600 font-mono">policy + rules in one shot</span>
            </div>
            <p className="text-xs text-mist-600">
              Paste a JSON object with <code className="font-mono">name</code>, optional <code className="font-mono">description</code>, and an optional <code className="font-mono">rules</code> array. Click <strong>Docs</strong> for the exact schema and examples.
            </p>
            <textarea
              value={importJson}
              onChange={(e) => { setImportJson(e.target.value); setImportError(null); }}
              rows={18}
              spellCheck={false}
              className="w-full rounded-lg bg-ink-950 border border-ink-600 px-3 py-2.5 text-xs font-mono text-mist-100 outline-none focus:border-signal-info"
            />
            {importError && (
              <div className="rounded-lg border border-signal-deny/30 bg-signal-deny/10 px-3 py-2 text-sm text-signal-deny">
                {importError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={importing}
                className="rounded-lg bg-ink-700 border border-ink-500 text-mist-100 text-sm px-4 py-2 disabled:opacity-50"
              >
                {importing ? "Importing…" : "Import policy"}
              </button>
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="rounded-lg border border-ink-700 text-mist-500 text-sm px-4 py-2 hover:text-mist-100"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {showCreate && (
          <form onSubmit={onSubmit} className="panel p-5 mb-6 space-y-3">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="policy-name"
              className="w-full rounded-lg bg-ink-900 border border-ink-600 px-3 py-2 text-sm text-mist-100 outline-none focus:border-signal-info"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this policy govern?"
              rows={2}
              className="w-full rounded-lg bg-ink-900 border border-ink-600 px-3 py-2 text-sm text-mist-100 outline-none focus:border-signal-info"
            />
            {error && <p className="text-sm text-signal-deny">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-ink-700 border border-ink-500 text-mist-100 text-sm px-4 py-2 disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create policy"}
            </button>
          </form>
        )}

        {loading ? (
          <p className="text-mist-700 font-mono text-sm">loading policies…</p>
        ) : (
          <div className="space-y-3">
            {policies.map((p) => (
              <Link
                key={p.id}
                href={`/policies/${p.id}`}
                className="panel p-4 flex items-center justify-between hover:border-ink-500 transition-colors block"
              >
                <div>
                  <p className="text-mist-100">{p.name}</p>
                  <p className="text-sm text-mist-500">{p.description ?? "No description"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs font-mono text-mist-700">
                    <span>v{p.version}</span>
                    <span className={p.enabled ? "text-signal-allow" : "text-mist-700"}>
                      {p.enabled ? "enabled" : "disabled"}
                    </span>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.preventDefault()}>
                      <button
                        onClick={(e) => togglePolicy(p, e)}
                        className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                          p.enabled
                            ? "border-ink-600 text-mist-600 hover:text-mist-300 hover:border-ink-500"
                            : "border-signal-allow/40 text-signal-allow hover:border-signal-allow"
                        }`}
                      >
                        {p.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        onClick={(e) => deletePolicy(p, e)}
                        className="text-xs px-2.5 py-1 rounded border border-signal-deny/30 text-signal-deny hover:border-signal-deny hover:bg-signal-deny/10 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </Link>
            ))}
            {policies.length === 0 && <p className="text-mist-700 text-sm">No policies yet.</p>}
          </div>
        )}
      </div>

      <DocsDrawer open={showDocs} onClose={() => setShowDocs(false)} title="Policy documentation">
        <DocSection title="How policies work">
          <DocP>
            A <strong className="text-mist-200">policy</strong> is a named, versioned bundle of <strong className="text-mist-200">rules</strong>. Policies are assigned to agents, teams, or roles. When an agent makes a request, the engine collects all rules from every assigned policy (plus any org-wide rules targeting the agent&apos;s team, role, or <code className="font-mono text-mist-300">*</code>), sorts them by priority, and evaluates each rule until one matches.
          </DocP>
          <DocP>
            The first matching rule&apos;s <code className="font-mono text-mist-300">effect</code> wins (<strong className="text-mist-200">allow</strong> or <strong className="text-mist-200">deny</strong>). If no rule matches, the <strong className="text-mist-200">default effect</strong> applies — configurable in Settings → Engine (default: deny).
          </DocP>
          <DocNote>
            Rules with higher <code className="font-mono">priority</code> values are evaluated first. Ties are broken by longer (more specific) resource patterns.
          </DocNote>
        </DocSection>

        <DocSection title="Resource types">
          <DocTable
            headers={["Type", "Actions", "Pattern format"]}
            rows={[
              ["filesystem", "read, write, create, delete, list, append", "/data/**, /tmp/*.csv"],
              ["url", "access_url", "*.internal.co, https://api.stripe.com/**"],
              ["api", "call_api", "POST /v1/payments/**, GET /v1/**"],
              ["tool", "execute, invoke", "exec:rm, exec:git, exec:curl"],
              ["command", "execute", "rm, git, curl (bare name)"],
              ["secret", "read", "prod/**, aws/*/key, **"],
              ["database", "read, write, create, delete", "postgres://prod/users, *"],
            ]}
          />
        </DocSection>

        <DocSection title="Resource pattern syntax">
          <DocP>Patterns are matched using glob syntax. Supported wildcards:</DocP>
          <DocTable
            headers={["Pattern", "Matches"]}
            rows={[
              ["*", "Any single path segment (no slashes)"],
              ["**", "Any path including slashes (recursive)"],
              ["/data/*.csv", "CSV files directly under /data"],
              ["/data/**", "Everything under /data at any depth"],
              ["re:^prod-.*", "Regex match (prefix with re:)"],
            ]}
          />
        </DocSection>

        <DocSection title="Condition DSL">
          <DocP>
            The <code className="font-mono text-mist-300">condition</code> field filters on the request&apos;s <code className="font-mono text-mist-300">metadata</code> object. Supported operators:
          </DocP>
          <DocTable
            headers={["Operator", "Example"]}
            rows={[
              ["eq", '{"classification": {"eq": "secret"}}'],
              ["in", '{"classification": {"in": ["pii","secret"]}}'],
              ["not_in", '{"env": {"not_in": ["production"]}}'],
              ["regex", '{"path": {"regex": "^/prod/.*"}}'],
            ]}
          />
          <DocCode label="Combine multiple conditions (all must match)">
            {`{
  "classification": { "in": ["confidential", "pii", "secret"] },
  "location": { "eq": "production" }
}`}
          </DocCode>
        </DocSection>

        <DocSection title="JSON import schema">
          <DocP>
            Click <strong className="text-mist-200">Import JSON</strong> to create a policy with rules in one shot. The JSON format:
          </DocP>
          <DocCode label="Full schema">
            {`{
  "name": "string (required)",
  "description": "string (optional)",
  "rules": [
    {
      "name": "string (required)",
      "description": "string (optional)",
      "subject_type": "agent | role | team | user",
      "subject_value": "slug / role / team name / user id / *",
      "action": "read | write | create | delete | list | append
               | execute | invoke | call_api | access_url | share",
      "resource_type": "filesystem | url | api | tool | command | secret | database",
      "resource_pattern": "glob or re: pattern",
      "condition": {},
      "effect": "deny | allow",
      "priority": 500,
      "enabled": true,
      "alert_on_match": false,
      "rate_limit_per_minute": null
    }
  ]
}`}
          </DocCode>
        </DocSection>

        <DocSection title="Example: filesystem policy">
          <DocCode label="Deny reading PII and secrets from the filesystem">
            {`{
  "name": "deny-pii-filesystem",
  "description": "Block agents from reading PII and secret files",
  "rules": [
    {
      "name": "deny-pii-reads",
      "subject_type": "agent",
      "subject_value": "*",
      "action": "read",
      "resource_type": "filesystem",
      "resource_pattern": "/data/pii/**",
      "condition": { "classification": { "in": ["pii","secret"] } },
      "effect": "deny",
      "priority": 1000,
      "enabled": true,
      "alert_on_match": true,
      "rate_limit_per_minute": null
    }
  ]
}`}
          </DocCode>
        </DocSection>

        <DocSection title="Example: URL policy">
          <DocCode label="Allow internal URLs, deny everything external">
            {`{
  "name": "url-access-control",
  "description": "Restrict URL access to internal domains only",
  "rules": [
    {
      "name": "allow-internal-urls",
      "subject_type": "agent",
      "subject_value": "*",
      "action": "access_url",
      "resource_type": "url",
      "resource_pattern": "*.internal.example.com",
      "condition": {},
      "effect": "allow",
      "priority": 1000,
      "enabled": true,
      "alert_on_match": false,
      "rate_limit_per_minute": null
    },
    {
      "name": "deny-all-other-urls",
      "subject_type": "agent",
      "subject_value": "*",
      "action": "access_url",
      "resource_type": "url",
      "resource_pattern": "*",
      "condition": {},
      "effect": "deny",
      "priority": 100,
      "enabled": true,
      "alert_on_match": true,
      "rate_limit_per_minute": null
    }
  ]
}`}
          </DocCode>
        </DocSection>

        <DocSection title="Example: API rate-limiting policy">
          <DocCode label="Allow payment API calls up to 10/min per agent">
            {`{
  "name": "payments-rate-limit",
  "description": "Rate-limit payment API calls to 10/min",
  "rules": [
    {
      "name": "rate-limit-payments",
      "subject_type": "agent",
      "subject_value": "*",
      "action": "call_api",
      "resource_type": "api",
      "resource_pattern": "POST /v1/payments/**",
      "condition": {},
      "effect": "allow",
      "priority": 800,
      "enabled": true,
      "alert_on_match": false,
      "rate_limit_per_minute": 10
    }
  ]
}`}
          </DocCode>
        </DocSection>

        <DocSection title="Example: tool / command policy">
          <DocCode label="Block dangerous exec commands, allow safe ones">
            {`{
  "name": "command-safety-policy",
  "description": "Deny dangerous shell commands",
  "rules": [
    {
      "name": "deny-rm",
      "subject_type": "agent",
      "subject_value": "*",
      "action": "execute",
      "resource_type": "tool",
      "resource_pattern": "exec:rm",
      "condition": {},
      "effect": "deny",
      "priority": 2000,
      "enabled": true,
      "alert_on_match": true,
      "rate_limit_per_minute": null
    },
    {
      "name": "deny-curl",
      "subject_type": "agent",
      "subject_value": "*",
      "action": "execute",
      "resource_type": "tool",
      "resource_pattern": "exec:curl",
      "condition": {},
      "effect": "deny",
      "priority": 2000,
      "enabled": true,
      "alert_on_match": true,
      "rate_limit_per_minute": null
    }
  ]
}`}
          </DocCode>
          <DocNote>
            <strong>Tool vs Command resource type:</strong> Use <code className="font-mono">tool</code> with pattern <code className="font-mono">exec:&lt;cmd&gt;</code> for commands invoked through the agent&apos;s tool interface. The <code className="font-mono">command</code> resource type matches bare command names without the <code className="font-mono">exec:</code> prefix.
          </DocNote>
        </DocSection>

        <DocSection title="Example: secret policy">
          <DocCode label="Block secret reads, raise critical violation on access attempt">
            {`{
  "name": "secrets-protection",
  "description": "Prevent agents from reading production secrets",
  "rules": [
    {
      "name": "deny-prod-secrets",
      "subject_type": "agent",
      "subject_value": "*",
      "action": "read",
      "resource_type": "secret",
      "resource_pattern": "prod/**",
      "condition": { "classification": { "eq": "secret" } },
      "effect": "deny",
      "priority": 1500,
      "enabled": true,
      "alert_on_match": true,
      "rate_limit_per_minute": null
    }
  ]
}`}
          </DocCode>
          <DocNote>
            Set <code className="font-mono">alert_on_match: true</code> on secret rules so every access attempt — even denied — appears as a violation in the dashboard.
          </DocNote>
        </DocSection>

        <DocSection title="Example: database policy">
          <DocCode label="Deny destructive database operations in production">
            {`{
  "name": "db-safety",
  "description": "Block DELETE on production databases",
  "rules": [
    {
      "name": "deny-prod-db-delete",
      "subject_type": "agent",
      "subject_value": "*",
      "action": "delete",
      "resource_type": "database",
      "resource_pattern": "postgres://prod/**",
      "condition": {},
      "effect": "deny",
      "priority": 2000,
      "enabled": true,
      "alert_on_match": true,
      "rate_limit_per_minute": null
    }
  ]
}`}
          </DocCode>
        </DocSection>
      </DocsDrawer>

      <ConfirmDialog
        open={!!policyToDelete}
        title="Delete policy"
        message={`Delete "${policyToDelete?.name}" and all its rules? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDeletePolicy}
        onCancel={() => setPolicyToDelete(null)}
      />
    </AppShell>
  );
}
