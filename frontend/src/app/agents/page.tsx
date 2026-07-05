"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import DocsDrawer, { DocSection, DocP, DocCode, DocNote, DocTable } from "@/components/DocsDrawer";
import { api, ApiError } from "@/lib/api";
import { StatusBadge } from "@/components/Badges";
import { useAuth } from "@/lib/auth";
import type { AgentCreateResponse, AgentRead, PolicyRead } from "@/types";

export default function AgentsPage() {
  const { isAdmin } = useAuth();
  const [agents, setAgents] = useState<AgentRead[]>([]);
  const [policies, setPolicies] = useState<PolicyRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newAgentKey, setNewAgentKey] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentRead | null>(null);
  const [agentPolicies, setAgentPolicies] = useState<PolicyRead[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Command restrictions state
  const [newCommand, setNewCommand] = useState("");
  const [cmdSaving, setCmdSaving] = useState(false);
  const [cmdError, setCmdError] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);

  async function refresh() {
    const [a, p] = await Promise.all([api.get<AgentRead[]>("/agents"), api.get<PolicyRead[]>("/policies")]);
    setAgents(a);
    setPolicies(p);
    setLoading(false);
  }

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);

  async function openAgent(agent: AgentRead) {
    setSelectedAgent(agent);
    setNewCommand("");
    setCmdError(null);
    const ap = await api.get<PolicyRead[]>(`/agents/${agent.id}/policies`);
    setAgentPolicies(ap);
  }

  async function assignPolicy(policyId: string) {
    if (!selectedAgent) return;
    await api.post(`/agents/${selectedAgent.id}/policies`, { policy_id: policyId });
    openAgent(selectedAgent);
  }

  async function unassignPolicy(policyId: string) {
    if (!selectedAgent) return;
    await api.del(`/agents/${selectedAgent.id}/policies/${policyId}`);
    openAgent(selectedAgent);
  }

  async function toggleStatus(agent: AgentRead) {
    const next = agent.status === "active" ? "suspended" : "active";
    await api.patch(`/agents/${agent.id}`, { status: next });
    refresh();
  }

  async function updateCommands(commands: string[]) {
    if (!selectedAgent) return;
    setCmdSaving(true);
    setCmdError(null);
    try {
      const updated = await api.patch<AgentRead>(`/agents/${selectedAgent.id}`, { allowed_commands: commands });
      setSelectedAgent(updated);
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err) {
      setCmdError(err instanceof ApiError ? err.message : "Failed to update");
    } finally {
      setCmdSaving(false);
    }
  }

  async function addCommand() {
    if (!selectedAgent || !newCommand.trim()) return;
    const cmd = newCommand.trim().split(/\s+/)[0] ?? newCommand.trim();
    if (selectedAgent.allowed_commands.includes(cmd)) {
      setCmdError("Command already in the list");
      return;
    }
    setNewCommand("");
    await updateCommands([...selectedAgent.allowed_commands, cmd]);
  }

  async function removeCommand(cmd: string) {
    if (!selectedAgent) return;
    await updateCommands(selectedAgent.allowed_commands.filter((c) => c !== cmd));
  }

  async function clearAllCommands() {
    await updateCommands([]);
  }

  return (
    <AppShell>
      <div className="p-8 max-w-[1400px]">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl text-mist-100">Agents</h1>
            <p className="text-sm text-mist-500 mt-1">Registered agent identities, sandboxing, and policy assignment.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDocs(true)}
              className="rounded-lg border border-ink-600 text-mist-500 text-sm px-4 py-2 hover:text-mist-100 hover:border-ink-500 transition-colors"
            >
              Onboarding guide
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowCreate(true)}
                className="rounded-lg bg-ink-700 border border-ink-500 text-mist-100 text-sm px-4 py-2 hover:bg-ink-600 transition-colors"
              >
                + Register agent
              </button>
            )}
          </div>
        </header>

        {loading ? (
          <p className="text-mist-700 font-mono text-sm">loading agents…</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 panel overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-mono text-mist-700 uppercase tracking-wide border-b border-ink-700 bg-ink-800/50">
                    <th className="px-4 py-3 font-normal">Agent</th>
                    <th className="px-4 py-3 font-normal">Team</th>
                    <th className="px-4 py-3 font-normal">Status</th>
                    <th className="px-4 py-3 font-normal"></th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr
                      key={a.id}
                      className={`border-b border-ink-800 last:border-0 cursor-pointer hover:bg-ink-800/40 ${
                        selectedAgent?.id === a.id ? "bg-ink-800/60" : ""
                      }`}
                      onClick={() => openAgent(a)}
                    >
                      <td className="px-4 py-3">
                        <p className="text-mist-100">{a.name}</p>
                        <p className="font-mono text-xs text-mist-700">{a.slug}</p>
                      </td>
                      <td className="px-4 py-3 text-mist-500">{a.owner_team ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStatus(a);
                            }}
                            className="text-xs font-mono text-mist-500 hover:text-mist-100"
                          >
                            {a.status === "active" ? "suspend" : "activate"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {agents.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-mist-700">
                        No agents registered yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="panel p-5 space-y-6 overflow-y-auto max-h-[80vh]">
              {!selectedAgent ? (
                <p className="text-sm text-mist-700">Select an agent to view details.</p>
              ) : (
                <>
                  <div>
                    <h2 className="font-display text-base text-mist-100">{selectedAgent.name}</h2>
                    <p className="font-mono text-xs text-mist-700">{selectedAgent.slug}</p>
                  </div>

                  {/* ── Command restrictions ── */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-mono text-mist-700 uppercase tracking-wide">Command restrictions</p>
                      {isAdmin && selectedAgent.allowed_commands.length > 0 && (
                        <button
                          onClick={clearAllCommands}
                          disabled={cmdSaving}
                          className="text-xs font-mono text-signal-deny hover:text-signal-deny/70 disabled:opacity-40"
                        >
                          clear all
                        </button>
                      )}
                    </div>

                    {selectedAgent.allowed_commands.length === 0 ? (
                      <div className="rounded-lg bg-ink-900 border border-ink-700 px-3 py-2.5 mb-3">
                        <p className="text-xs text-mist-700">
                          <span className="font-mono text-signal-allow">unrestricted</span> — all exec commands pass through policy rules
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5 mb-3">
                        {selectedAgent.allowed_commands.map((cmd) => (
                          <div
                            key={cmd}
                            className="flex items-center justify-between rounded-lg bg-ink-900 border border-ink-700 px-3 py-1.5"
                          >
                            <span className="font-mono text-sm text-mist-100">{cmd}</span>
                            {isAdmin && (
                              <button
                                onClick={() => removeCommand(cmd)}
                                disabled={cmdSaving}
                                className="text-xs font-mono text-signal-deny hover:text-signal-deny/70 disabled:opacity-40"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                        <p className="text-[11px] font-mono text-mist-700 pt-1">
                          Commands not on this list are denied before policy evaluation.
                        </p>
                      </div>
                    )}

                    {isAdmin && (
                      <div className="flex gap-2">
                        <input
                          value={newCommand}
                          onChange={(e) => { setNewCommand(e.target.value); setCmdError(null); }}
                          onKeyDown={(e) => e.key === "Enter" && addCommand()}
                          placeholder="e.g. git"
                          className="flex-1 rounded-lg bg-ink-900 border border-ink-600 px-3 py-1.5 text-sm font-mono text-mist-100 outline-none focus:border-signal-info"
                        />
                        <button
                          onClick={addCommand}
                          disabled={cmdSaving || !newCommand.trim()}
                          className="rounded-lg bg-ink-700 border border-ink-500 text-mist-100 text-sm px-3 py-1.5 hover:bg-ink-600 disabled:opacity-40"
                        >
                          {cmdSaving ? "…" : "Add"}
                        </button>
                      </div>
                    )}
                    {cmdError && <p className="text-xs font-mono text-signal-deny mt-1.5">{cmdError}</p>}
                  </div>

                  {/* ── Assigned policies ── */}
                  <div>
                    <p className="text-xs font-mono text-mist-700 uppercase tracking-wide mb-2">Assigned policies</p>
                    <div className="space-y-2 mb-3">
                      {agentPolicies.length === 0 && (
                        <p className="text-sm text-mist-700">None assigned — default effect applies.</p>
                      )}
                      {agentPolicies.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded-lg bg-ink-800 border border-ink-700 px-3 py-2"
                        >
                          <span className="text-sm text-mist-100">{p.name}</span>
                          {isAdmin && (
                            <button
                              onClick={() => unassignPolicy(p.id)}
                              className="text-xs text-signal-deny font-mono"
                            >
                              remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {isAdmin && (
                      <select
                        onChange={(e) => e.target.value && assignPolicy(e.target.value)}
                        value=""
                        className="w-full rounded-lg bg-ink-900 border border-ink-600 px-3 py-2 text-sm text-mist-100 outline-none"
                      >
                        <option value="" disabled>
                          Assign a policy…
                        </option>
                        {policies
                          .filter((p) => !agentPolicies.find((ap) => ap.id === p.id))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateAgentModal
          onClose={() => {
            setShowCreate(false);
            setNewAgentKey(null);
            setError(null);
          }}
          onCreated={(res) => {
            setNewAgentKey(res.api_key);
            refresh();
          }}
          newAgentKey={newAgentKey}
          error={error}
          setError={setError}
        />
      )}

      <DocsDrawer open={showDocs} onClose={() => setShowDocs(false)} title="Agent onboarding guide">
        <DocSection title="Step 1 — Register the agent">
          <DocP>
            Click <strong className="text-mist-200">+ Register agent</strong> and fill in the fields:
          </DocP>
          <DocTable
            headers={["Field", "Description"]}
            rows={[
              ["Slug", "Stable machine identifier used in policy rules and API calls. e.g. agent_billing_001. Lowercase, numbers, hyphens and underscores only. Cannot be changed after creation."],
              ["Name", "Human-readable display name shown in the dashboard."],
              ["Owner team", "Optional team grouping. Team-level policies apply to all agents with this team value."],
              ["Description", "Optional context about what this agent does."],
            ]}
          />
        </DocSection>

        <DocSection title="Step 2 — Save the API key">
          <DocP>
            The raw API key is shown <strong className="text-mist-200">once</strong> at registration time. Copy it immediately — it cannot be retrieved again. Store it in your agent runtime&apos;s secrets manager (e.g. AWS Secrets Manager, Vault, or an environment variable injected at runtime).
          </DocP>
          <DocNote>
            The key format is <code className="font-mono">agk_&lt;random&gt;</code>. If the key is lost, use <strong>Rotate key</strong> to generate a new one — the old key is invalidated immediately.
          </DocNote>
        </DocSection>

        <DocSection title="Step 3 — Create and assign a policy">
          <DocP>
            Go to <strong className="text-mist-200">Policies → + New policy</strong> (or import from JSON) to create a policy. Add rules for the resources your agent should access. Then return to the Agents page, select the agent, and assign the policy via the <strong className="text-mist-200">Assigned policies</strong> panel on the right.
          </DocP>
          <DocNote>
            An agent with no assigned policy is evaluated against org-wide rules only. If none match, the default effect (deny) applies.
          </DocNote>
        </DocSection>

        <DocSection title="Step 4 — Send evaluation requests">
          <DocP>
            From your agent runtime, call the enforcement endpoint before every action the agent wants to take:
          </DocP>
          <DocCode label="HTTP request">
            {`POST /api/v1/enforcement/evaluate
X-Agent-Api-Key: agk_your_key_here
Content-Type: application/json

{
  "agent_id": "your-agent-slug",
  "action": "read",
  "resource_type": "filesystem",
  "resource": "/data/report.csv",
  "metadata": {}
}`}
          </DocCode>
          <DocCode label="Response — allowed">
            {`{
  "decision": "allow",
  "reason": "Matched rule 'allow-reports' -> allow",
  "matched_rule_id": "...",
  "access_decision_id": "...",
  "rate_limited": false,
  "latency_ms": 4.2
}`}
          </DocCode>
          <DocCode label="Response — denied">
            {`{
  "decision": "deny",
  "reason": "No matching rule — default policy is deny",
  "matched_rule_id": null,
  "access_decision_id": "...",
  "rate_limited": false,
  "latency_ms": 1.1
}`}
          </DocCode>
          <DocP>
            If <code className="font-mono text-mist-300">decision</code> is <code className="font-mono text-signal-deny">deny</code>, block the action. If it is <code className="font-mono text-signal-allow">allow</code>, proceed.
          </DocP>
        </DocSection>

        <DocSection title="Step 5 — Command restrictions (optional)">
          <DocP>
            For agents that execute shell commands, use the <strong className="text-mist-200">Command restrictions</strong> panel to set an explicit allowlist. When set, any <code className="font-mono text-mist-300">exec:&lt;cmd&gt;</code> request not on the list is denied before policy rules are even checked.
          </DocP>
          <DocNote>
            Leave the allowlist empty to apply no restriction at this level — policy rules still apply.
          </DocNote>
        </DocSection>

        <DocSection title="Step 6 — Test with the simulator">
          <DocP>
            Use the <strong className="text-mist-200">Simulator</strong> page to test your policy rules before deploying your agent. Each simulation is logged and visible in the Audit trail. Use a test agent slug to keep simulation traffic separate.
          </DocP>
        </DocSection>

        <DocSection title="OpenClaw integration">
          <DocP>
            If your agent runs inside OpenClaw, install the guardrail enforcement plugin. Add this to your <code className="font-mono text-mist-300">~/.openclaw/openclaw.json</code>:
          </DocP>
          <DocCode label="openclaw.json">
            {`{
  "plugins": {
    "entries": {
      "guardrail-enforcement": {
        "config": {
          "guardrailUrl": "http://localhost:8000/api/v1",
          "agentSlug": "your-agent-slug",
          "agentApiKey": "agk_your_key_here",
          "failOpenOnNetworkError": false
        }
      }
    }
  }
}`}
          </DocCode>
          <DocP>
            With the plugin active, every tool call OpenClaw attempts is evaluated against your policy before execution. A denied tool call is blocked and the agent receives the deny reason.
          </DocP>
          <DocNote>
            Set <code className="font-mono">failOpenOnNetworkError: false</code> (the default) to fail closed — if the guardrail engine is unreachable, the tool call is blocked. Set to <code className="font-mono">true</code> only in development environments.
          </DocNote>
        </DocSection>

        <DocSection title="Rotate the API key">
          <DocP>
            If a key is compromised or lost, click the agent row to open the detail panel, then use the <strong className="text-mist-200">Rotate key</strong> option (available to admins). The old key is invalidated immediately — update the key in your agent runtime before rotating.
          </DocP>
        </DocSection>
      </DocsDrawer>
    </AppShell>
  );
}

function CreateAgentModal({
  onClose,
  onCreated,
  newAgentKey,
  error,
  setError,
}: {
  onClose: () => void;
  onCreated: (res: AgentCreateResponse) => void;
  newAgentKey: string | null;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<AgentCreateResponse>("/agents", {
        slug,
        name,
        owner_team: team || undefined,
        description: description || undefined,
      });
      onCreated(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create agent");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="panel bg-ink-900 p-6 w-full max-w-md">
        {newAgentKey ? (
          <>
            <h2 className="font-display text-lg text-mist-100 mb-2">Agent registered</h2>
            <p className="text-sm text-mist-500 mb-4">
              Copy this API key now — it will not be shown again. Store it in the agent runtime&apos;s secrets manager.
            </p>
            <div className="rounded-lg bg-ink-950 border border-signal-allow/30 px-3 py-2.5 font-mono text-xs text-signal-allow break-all mb-4">
              {newAgentKey}
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-ink-700 border border-ink-500 text-mist-100 text-sm py-2.5 hover:bg-ink-600 transition-colors"
            >
              Done
            </button>
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <h2 className="font-display text-lg text-mist-100">Register a new agent</h2>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-mist-500 uppercase tracking-wide">Slug</label>
              <input
                required
                pattern="^[a-z0-9_\-]+$"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="agent_sales_002"
                className="w-full rounded-lg bg-ink-900 border border-ink-600 px-3 py-2 text-sm text-mist-100 outline-none focus:border-signal-info"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-mist-500 uppercase tracking-wide">Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sales Outreach Agent"
                className="w-full rounded-lg bg-ink-900 border border-ink-600 px-3 py-2 text-sm text-mist-100 outline-none focus:border-signal-info"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-mist-500 uppercase tracking-wide">Owner team</label>
              <input
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                placeholder="sales"
                className="w-full rounded-lg bg-ink-900 border border-ink-600 px-3 py-2 text-sm text-mist-100 outline-none focus:border-signal-info"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-mist-500 uppercase tracking-wide">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg bg-ink-900 border border-ink-600 px-3 py-2 text-sm text-mist-100 outline-none focus:border-signal-info"
              />
            </div>

            {error && <div className="rounded-lg border border-signal-deny/30 bg-signal-deny/10 px-3 py-2 text-sm text-signal-deny">{error}</div>}

            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-ink-800 border border-ink-600 text-mist-300 text-sm py-2.5">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-lg bg-ink-700 border border-ink-500 text-mist-100 text-sm py-2.5 disabled:opacity-50"
              >
                {submitting ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
