"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { EffectBadge } from "@/components/Badges";
import { useAuth } from "@/lib/auth";
import type { ActionType, Effect, PolicyRead, ResourceType, RuleRead, SubjectType } from "@/types";

const ACTIONS: ActionType[] = ["read", "write", "execute", "share", "call_api", "access_url", "delete"];
const RESOURCE_TYPES: ResourceType[] = ["filesystem", "api", "url", "database", "secret", "tool"];
const SUBJECT_TYPES: SubjectType[] = ["agent", "role", "team", "user"];

export default function PolicyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();
  const [policy, setPolicy] = useState<PolicyRead | null>(null);
  const [rules, setRules] = useState<RuleRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

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
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    await api.del(`/rules/${rule.id}`);
    refresh();
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
              {isAdmin && (
                <button
                  onClick={() => setShowForm((s) => !s)}
                  className="rounded-lg bg-ink-700 border border-ink-500 text-mist-100 text-sm px-4 py-2 hover:bg-ink-600 transition-colors"
                >
                  + Add rule
                </button>
              )}
            </header>

            {showForm && (
              <RuleForm
                policyId={policy.id}
                onCreated={() => {
                  setShowForm(false);
                  refresh();
                }}
              />
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
    </AppShell>
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
