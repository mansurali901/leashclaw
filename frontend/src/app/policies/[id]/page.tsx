"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import DocsDrawer, { DocSection, DocP, DocCode, DocNote, DocTable } from "@/components/DocsDrawer";
import { api, ApiError } from "@/lib/api";
import { EffectBadge } from "@/components/Badges";
import { useAuth } from "@/lib/auth";
import type { ActionType, Effect, PolicyRead, ResourceType, RuleRead, SubjectType } from "@/types";

const ACTIONS: ActionType[] = ["read", "write", "create", "delete", "list", "move", "rename", "append", "execute", "share", "call_api", "access_url", "invoke"];
const RESOURCE_TYPES: ResourceType[] = ["filesystem", "api", "url", "database", "secret", "tool", "command"];
const SUBJECT_TYPES: SubjectType[] = ["agent", "role", "team", "user"];

const RULE_EXAMPLES: Record<string, string> = {
  filesystem: JSON.stringify({
    name: "deny-pii-reads",
    description: "Block agents from reading PII files",
    subject_type: "agent",
    subject_value: "*",
    action: "read",
    resource_type: "filesystem",
    resource_pattern: "/data/pii/**",
    condition: { classification: { in: ["pii", "secret"] } },
    effect: "deny",
    priority: 1000,
    enabled: true,
    alert_on_match: true,
    rate_limit_per_minute: null,
  }, null, 2),
  url: JSON.stringify({
    name: "deny-external-urls",
    description: "Block external URL access",
    subject_type: "agent",
    subject_value: "*",
    action: "access_url",
    resource_type: "url",
    resource_pattern: "*",
    condition: {},
    effect: "deny",
    priority: 500,
    enabled: true,
    alert_on_match: true,
    rate_limit_per_minute: null,
  }, null, 2),
  api: JSON.stringify({
    name: "rate-limit-payments",
    description: "Rate-limit payment API calls",
    subject_type: "agent",
    subject_value: "*",
    action: "call_api",
    resource_type: "api",
    resource_pattern: "POST /v1/payments/**",
    condition: {},
    effect: "allow",
    priority: 800,
    enabled: true,
    alert_on_match: false,
    rate_limit_per_minute: 10,
  }, null, 2),
  tool: JSON.stringify({
    name: "deny-rm-command",
    description: "Block execution of the rm command",
    subject_type: "agent",
    subject_value: "*",
    action: "execute",
    resource_type: "tool",
    resource_pattern: "exec:rm",
    condition: {},
    effect: "deny",
    priority: 2000,
    enabled: true,
    alert_on_match: true,
    rate_limit_per_minute: null,
  }, null, 2),
  secret: JSON.stringify({
    name: "deny-prod-secret-reads",
    description: "Block agents from reading production secrets",
    subject_type: "agent",
    subject_value: "*",
    action: "read",
    resource_type: "secret",
    resource_pattern: "prod/**",
    condition: { classification: { eq: "secret" } },
    effect: "deny",
    priority: 1500,
    enabled: true,
    alert_on_match: true,
    rate_limit_per_minute: null,
  }, null, 2),
  database: JSON.stringify({
    name: "deny-prod-db-deletes",
    description: "Block DELETE operations on production databases",
    subject_type: "agent",
    subject_value: "*",
    action: "delete",
    resource_type: "database",
    resource_pattern: "postgres://prod/**",
    condition: {},
    effect: "deny",
    priority: 2000,
    enabled: true,
    alert_on_match: true,
    rate_limit_per_minute: null,
  }, null, 2),
};

const BLANK_RULE_JSON = JSON.stringify({
  name: "my-rule",
  description: "",
  subject_type: "agent",
  subject_value: "*",
  action: "read",
  resource_type: "filesystem",
  resource_pattern: "/data/**",
  condition: {},
  effect: "deny",
  priority: 500,
  enabled: true,
  alert_on_match: false,
  rate_limit_per_minute: null,
}, null, 2);

export default function PolicyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [policy, setPolicy] = useState<PolicyRead | null>(null);
  const [rules, setRules] = useState<RuleRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [ruleMode, setRuleMode] = useState<"form" | "json">("form");
  const [showDocs, setShowDocs] = useState(false);
  const [confirmDeletePolicy, setConfirmDeletePolicy] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<RuleRead | null>(null);

  async function refresh() {
    const [p, r] = await Promise.all([
      api.get<PolicyRead>(`/policies/${id}`),
      api.get<RuleRead[]>(`/rules?policy_id=${id}`),
    ]);
    setPolicy(p);
    setRules(r);
    setLoading(false);
  }

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [id]);

  async function toggleRule(rule: RuleRead) {
    await api.patch(`/rules/${rule.id}`, { enabled: !rule.enabled });
    refresh();
  }

  async function deleteRule(rule: RuleRead) {
    setRuleToDelete(rule);
  }

  async function confirmDeleteRule() {
    if (!ruleToDelete) return;
    await api.del(`/rules/${ruleToDelete.id}`);
    setRuleToDelete(null);
    refresh();
  }

  async function deletePolicy() {
    await api.del(`/policies/${id}`);
    router.push("/policies");
  }

  async function togglePolicy() {
    if (!policy) return;
    const updated = await api.patch<PolicyRead>(`/policies/${id}`, { enabled: !policy.enabled });
    setPolicy(updated);
  }

  return (
    <AppShell>
      <div className="p-8 max-w-[1100px]">
        {loading || !policy ? (
          <p className="text-mist-700 font-mono text-sm">loading policy…</p>
        ) : (
          <>
            <header className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="font-display text-2xl text-mist-100">{policy.name}</h1>
                <p className="text-sm text-mist-500 mt-1">{policy.description ?? "No description"}</p>
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
                      onClick={togglePolicy}
                      className={`rounded-lg border text-sm px-4 py-2 transition-colors ${
                        policy.enabled
                          ? "border-ink-600 text-mist-500 hover:text-mist-100 hover:border-ink-500"
                          : "border-signal-allow/40 text-signal-allow hover:border-signal-allow"
                      }`}
                    >
                      {policy.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => setConfirmDeletePolicy(true)}
                      className="rounded-lg border border-signal-deny/40 text-signal-deny text-sm px-4 py-2 hover:border-signal-deny hover:bg-signal-deny/10 transition-colors"
                    >
                      Delete policy
                    </button>
                    <button
                      onClick={() => setShowForm((s) => !s)}
                      className="rounded-lg bg-ink-700 border border-ink-500 text-mist-100 text-sm px-4 py-2 hover:bg-ink-600 transition-colors"
                    >
                      + Add rule
                    </button>
                  </>
                )}
              </div>
            </header>

            {showForm && (
              <div className="mb-6">
                <div className="flex items-center gap-1 mb-3">
                  <button
                    onClick={() => setRuleMode("form")}
                    className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${
                      ruleMode === "form"
                        ? "bg-ink-700 border-ink-500 text-mist-100"
                        : "border-ink-700 text-mist-600 hover:text-mist-300"
                    }`}
                  >
                    Form
                  </button>
                  <button
                    onClick={() => setRuleMode("json")}
                    className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${
                      ruleMode === "json"
                        ? "bg-ink-700 border-ink-500 text-mist-100"
                        : "border-ink-700 text-mist-600 hover:text-mist-300"
                    }`}
                  >
                    JSON import
                  </button>
                  <span className="text-xs text-mist-700 ml-2">— click Docs for examples</span>
                </div>
                {ruleMode === "form" ? (
                  <RuleForm
                    policyId={policy.id}
                    onCreated={() => {
                      setShowForm(false);
                      refresh();
                    }}
                  />
                ) : (
                  <JsonRuleForm
                    policyId={policy.id}
                    onCreated={() => {
                      setShowForm(false);
                      refresh();
                    }}
                  />
                )}
              </div>
            )}

            <div className="space-y-3 mt-4">
              {rules
                .slice()
                .sort((a, b) => b.priority - a.priority)
                .map((rule) => (
                  <div key={rule.id} className="panel p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-mist-100">{rule.name}</p>
                          <EffectBadge effect={rule.effect as Effect} />
                          <span className="text-xs font-mono text-mist-700">priority {rule.priority}</span>
                          {!rule.enabled && <span className="text-xs font-mono text-mist-700">(disabled)</span>}
                          {rule.alert_on_match && <span className="text-xs font-mono text-signal-warn">alerts</span>}
                        </div>
                        {rule.description && <p className="text-sm text-mist-500 mt-1">{rule.description}</p>}
                        <p className="text-xs font-mono text-mist-700 mt-2">
                          subject: {rule.subject_type}={rule.subject_value} · action: {rule.action} · resource_type: {rule.resource_type}
                        </p>
                        <p className="text-xs font-mono text-mist-500 mt-1 truncate">pattern: {rule.resource_pattern}</p>
                        {Object.keys(rule.condition).length > 0 && (
                          <p className="text-xs font-mono text-mist-700 mt-1 truncate">
                            condition: {JSON.stringify(rule.condition)}
                          </p>
                        )}
                        {rule.rate_limit_per_minute && (
                          <p className="text-xs font-mono text-signal-warn mt-1">rate limit: {rule.rate_limit_per_minute}/min</p>
                        )}
                      </div>
                      {isAdmin && (
                        <div className="flex flex-col gap-1 shrink-0 text-xs font-mono">
                          <button onClick={() => toggleRule(rule)} className="text-mist-500 hover:text-mist-100">
                            {rule.enabled ? "disable" : "enable"}
                          </button>
                          <button onClick={() => deleteRule(rule)} className="text-signal-deny">
                            delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              {rules.length === 0 && <p className="text-mist-700 text-sm">No rules yet — this policy has no effect until rules are added.</p>}
            </div>
          </>
        )}
      </div>

      <DocsDrawer open={showDocs} onClose={() => setShowDocs(false)} title="Rule documentation">
        <DocSection title="How rules work">
          <DocP>
            Rules are the atomic units of the policy engine. Each rule matches on a <strong className="text-mist-200">subject</strong> (who), an <strong className="text-mist-200">action</strong> (what operation), a <strong className="text-mist-200">resource type + pattern</strong> (what resource), and an optional <strong className="text-mist-200">condition</strong> (metadata filter). The first matching rule&apos;s <code className="font-mono text-mist-300">effect</code> wins.
          </DocP>
          <DocNote>
            Rules are evaluated highest <code className="font-mono">priority</code> first. Use priority 2000+ for hard security blocks, 500–999 for business logic, 100 for defaults.
          </DocNote>
        </DocSection>

        <DocSection title="Rule fields reference">
          <DocTable
            headers={["Field", "Type", "Description"]}
            rows={[
              ["name", "string", "Unique display name"],
              ["description", "string?", "Shown as the deny reason in access decisions"],
              ["subject_type", "agent|role|team|user", "What kind of subject this rule targets"],
              ["subject_value", "string", "Slug / role name / team / user id, or * for all"],
              ["action", "ActionType", "The operation being performed (see table below)"],
              ["resource_type", "ResourceType", "Category of resource (filesystem, url, secret…)"],
              ["resource_pattern", "string", "Glob or re: pattern matched against the resource"],
              ["condition", "object", "JSON DSL filter on request metadata (optional)"],
              ["effect", "allow|deny", "Decision when this rule matches"],
              ["priority", "number", "Evaluation order — higher is evaluated first"],
              ["enabled", "boolean", "Disabled rules are skipped entirely"],
              ["alert_on_match", "boolean", "Raise a violation even on allow (for auditing)"],
              ["rate_limit_per_minute", "number?", "Cap requests per minute; excess = deny"],
            ]}
          />
        </DocSection>

        <DocSection title="Actions by resource type">
          <DocTable
            headers={["Resource type", "Relevant actions"]}
            rows={[
              ["filesystem", "read, write, create, delete, list, append, move, rename"],
              ["url", "access_url"],
              ["api", "call_api"],
              ["tool", "execute, invoke"],
              ["command", "execute"],
              ["secret", "read, write"],
              ["database", "read, write, create, delete"],
            ]}
          />
        </DocSection>

        <DocSection title="Resource pattern syntax">
          <DocTable
            headers={["Pattern", "Matches"]}
            rows={[
              ["*", "Any single segment (no slashes)"],
              ["**", "Any path at any depth"],
              ["/data/*.csv", "CSV files directly under /data"],
              ["/data/**", "All files under /data recursively"],
              ["exec:rm", "Exact tool name (tool resource type)"],
              ["re:^prod-.*", "Regex match (prefix with re:)"],
            ]}
          />
        </DocSection>

        <DocSection title="Condition DSL">
          <DocCode label="All conditions must match (AND logic)">
            {`{
  "classification": { "in": ["pii", "secret"] },
  "location": { "eq": "production" }
}`}
          </DocCode>
          <DocTable
            headers={["Operator", "Example value"]}
            rows={[
              ["eq", '{"eq": "production"}'],
              ["in", '{"in": ["pii","secret","confidential"]}'],
              ["not_in", '{"not_in": ["development"]}'],
              ["regex", '{"regex": "^prod-.*"}'],
            ]}
          />
        </DocSection>

        <DocSection title="JSON import examples">
          <DocP>
            Switch to <strong className="text-mist-200">JSON import</strong> mode above and paste any of these templates. Adjust the values and click Import rule.
          </DocP>
        </DocSection>

        <DocSection title="Filesystem rule">
          <DocCode label="Deny PII reads">
            {RULE_EXAMPLES.filesystem}
          </DocCode>
        </DocSection>

        <DocSection title="URL rule">
          <DocCode label="Deny external URL access">
            {RULE_EXAMPLES.url}
          </DocCode>
        </DocSection>

        <DocSection title="API rule">
          <DocCode label="Rate-limit API calls (10/min)">
            {RULE_EXAMPLES.api}
          </DocCode>
        </DocSection>

        <DocSection title="Tool / exec rule">
          <DocCode label="Deny the rm command">
            {RULE_EXAMPLES.tool}
          </DocCode>
          <DocNote>
            Resource pattern for tool rules uses the prefix <code className="font-mono">exec:</code> followed by the command name. Use <code className="font-mono">exec:*</code> to match all commands.
          </DocNote>
        </DocSection>

        <DocSection title="Secret rule">
          <DocCode label="Deny reading production secrets">
            {RULE_EXAMPLES.secret}
          </DocCode>
        </DocSection>

        <DocSection title="Database rule">
          <DocCode label="Deny DELETE on production databases">
            {RULE_EXAMPLES.database}
          </DocCode>
        </DocSection>
      </DocsDrawer>

      <ConfirmDialog
        open={confirmDeletePolicy}
        title="Delete policy"
        message={`Delete "${policy?.name}" and all its rules? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => { setConfirmDeletePolicy(false); deletePolicy(); }}
        onCancel={() => setConfirmDeletePolicy(false)}
      />

      <ConfirmDialog
        open={!!ruleToDelete}
        title="Delete rule"
        message={`Delete rule "${ruleToDelete?.name}"?`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDeleteRule}
        onCancel={() => setRuleToDelete(null)}
      />
    </AppShell>
  );
}

function JsonRuleForm({ policyId, onCreated }: { policyId: string; onCreated: () => void }) {
  const [json, setJson] = useState(BLANK_RULE_JSON);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function loadExample(type: string) {
    if (RULE_EXAMPLES[type]) {
      setJson(RULE_EXAMPLES[type]);
      setSelected(type);
      setError(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json);
    } catch {
      setError("Invalid JSON — check syntax and try again.");
      return;
    }
    if (!parsed.name) {
      setError('Rule JSON must have a "name" field.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/rules", { ...parsed, policy_id: policyId });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to import rule");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="panel p-5 space-y-4">
      <div>
        <p className="text-xs text-mist-600 mb-2">Load a template:</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(RULE_EXAMPLES).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => loadExample(type)}
              className={`text-xs font-mono px-2.5 py-1 rounded border transition-colors ${
                selected === type
                  ? "bg-ink-700 border-ink-500 text-mist-100"
                  : "border-ink-700 text-mist-600 hover:text-mist-300 hover:border-ink-600"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-mist-600 mb-1.5">
          Rule JSON — <code className="font-mono">policy_id</code> is added automatically.
        </p>
        <textarea
          value={json}
          onChange={(e) => { setJson(e.target.value); setError(null); }}
          rows={22}
          spellCheck={false}
          className="w-full rounded-lg bg-ink-950 border border-ink-600 px-3 py-2.5 text-xs font-mono text-mist-100 outline-none focus:border-signal-info"
        />
      </div>
      {error && (
        <div className="rounded-lg border border-signal-deny/30 bg-signal-deny/10 px-3 py-2 text-sm text-signal-deny">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-ink-700 border border-ink-500 text-mist-100 text-sm px-4 py-2 disabled:opacity-50"
      >
        {submitting ? "Importing…" : "Import rule"}
      </button>
    </form>
  );
}

function RuleForm({ policyId, onCreated }: { policyId: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [subjectType, setSubjectType] = useState<SubjectType>("agent");
  const [subjectValue, setSubjectValue] = useState("*");
  const [action, setAction] = useState<ActionType>("read");
  const [resourceType, setResourceType] = useState<ResourceType>("filesystem");
  const [resourcePattern, setResourcePattern] = useState("/data/**");
  const [conditionText, setConditionText] = useState("{}");
  const [effect, setEffect] = useState<Effect>("deny");
  const [priority, setPriority] = useState(500);
  const [alertOnMatch, setAlertOnMatch] = useState(false);
  const [rateLimit, setRateLimit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let condition: Record<string, unknown> = {};
    try {
      condition = conditionText.trim() ? JSON.parse(conditionText) : {};
    } catch {
      setError("Condition must be valid JSON, e.g. {\"classification\": {\"in\": [\"pii\"]}}");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/rules", {
        policy_id: policyId,
        name,
        description: description || undefined,
        subject_type: subjectType,
        subject_value: subjectValue,
        action,
        resource_type: resourceType,
        resource_pattern: resourcePattern,
        condition,
        effect,
        priority,
        alert_on_match: alertOnMatch,
        rate_limit_per_minute: rateLimit ? Number(rateLimit) : undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create rule");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="panel p-5 space-y-4">
      <h2 className="font-display text-base text-mist-100">New rule</h2>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="deny-confidential-prod" />
        </Field>
        <Field label="Priority (higher wins)">
          <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} className={inputCls} />
        </Field>
      </div>

      <Field label="Description">
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="Human-readable reason shown in decisions" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Subject type">
          <select value={subjectType} onChange={(e) => setSubjectType(e.target.value as SubjectType)} className={inputCls}>
            {SUBJECT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Subject value ('*' for any)">
          <input value={subjectValue} onChange={(e) => setSubjectValue(e.target.value)} className={inputCls} placeholder="agent_sales_001 or *" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Action">
          <select value={action} onChange={(e) => setAction(e.target.value as ActionType)} className={inputCls}>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field label="Resource type">
          <select value={resourceType} onChange={(e) => setResourceType(e.target.value as ResourceType)} className={inputCls}>
            {RESOURCE_TYPES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Resource pattern (glob, re:, or *)">
        <input required value={resourcePattern} onChange={(e) => setResourcePattern(e.target.value)} className={`${inputCls} font-mono`} />
      </Field>

      <Field label="Condition (JSON DSL)">
        <textarea
          value={conditionText}
          onChange={(e) => setConditionText(e.target.value)}
          rows={2}
          className={`${inputCls} font-mono`}
          placeholder='{"classification": {"in": ["confidential","pii","secret"]}, "location": {"eq": "production"}}'
        />
      </Field>

      <div className="grid grid-cols-3 gap-3 items-end">
        <Field label="Effect">
          <select value={effect} onChange={(e) => setEffect(e.target.value as Effect)} className={inputCls}>
            <option value="deny">deny</option>
            <option value="allow">allow</option>
          </select>
        </Field>
        <Field label="Rate limit /min (optional)">
          <input value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} className={inputCls} placeholder="e.g. 30" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-mist-300 pb-2">
          <input type="checkbox" checked={alertOnMatch} onChange={(e) => setAlertOnMatch(e.target.checked)} />
          Raise violation on match
        </label>
      </div>

      {error && <div className="rounded-lg border border-signal-deny/30 bg-signal-deny/10 px-3 py-2 text-sm text-signal-deny">{error}</div>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-ink-700 border border-ink-500 text-mist-100 text-sm px-4 py-2 disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create rule"}
      </button>
    </form>
  );
}

const inputCls = "w-full rounded-lg bg-ink-900 border border-ink-600 px-3 py-2 text-sm text-mist-100 outline-none focus:border-signal-info";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-mono text-mist-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}
