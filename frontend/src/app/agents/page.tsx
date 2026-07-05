"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
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
    const cmd = newCommand.trim().split(/\s+/)[0]; // take only the base command name
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
          {isAdmin && (
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-ink-700 border border-ink-500 text-mist-100 text-sm px-4 py-2 hover:bg-ink-600 transition-colors"
            >
              + Register agent
            </button>
          )}
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
