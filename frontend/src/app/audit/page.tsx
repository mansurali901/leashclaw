"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import { EffectBadge } from "@/components/Badges";
import type { AccessDecisionRead, AuditLogRead, Effect } from "@/types";

export default function AuditPage() {
  const [tab, setTab] = useState<"decisions" | "logs">("decisions");
  const [decisions, setDecisions] = useState<AccessDecisionRead[]>([]);
  const [logs, setLogs] = useState<AuditLogRead[]>([]);
  const [decisionFilter, setDecisionFilter] = useState<"" | "allow" | "deny">("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    if (tab === "decisions") {
      api
        .get<AccessDecisionRead[]>(`/audit/decisions?limit=200${decisionFilter ? `&decision=${decisionFilter}` : ""}`)
        .then(setDecisions)
        .finally(() => setLoading(false));
    } else {
      api
        .get<AuditLogRead[]>("/audit/logs?limit=200")
        .then(setLogs)
        .finally(() => setLoading(false));
    }
  }, [tab, decisionFilter]);

  return (
    <AppShell>
      <div className="p-8 max-w-[1300px]">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl text-mist-100">Audit trail</h1>
            <p className="text-sm text-mist-500 mt-1">Immutable record of every policy decision and admin action.</p>
          </div>
          <div className="flex gap-1 rounded-lg bg-ink-800 border border-ink-600 p-1 text-xs font-mono">
            <button onClick={() => setTab("decisions")} className={`px-3 py-1.5 rounded-md ${tab === "decisions" ? "bg-ink-600 text-mist-100" : "text-mist-500"}`}>
              Access decisions
            </button>
            <button onClick={() => setTab("logs")} className={`px-3 py-1.5 rounded-md ${tab === "logs" ? "bg-ink-600 text-mist-100" : "text-mist-500"}`}>
              Admin actions
            </button>
          </div>
        </header>

        {tab === "decisions" && (
          <div className="flex gap-1 mb-4 text-xs font-mono">
            {(["", "allow", "deny"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setDecisionFilter(f)}
                className={`px-3 py-1.5 rounded-md border ${
                  decisionFilter === f ? "bg-ink-700 border-ink-500 text-mist-100" : "border-ink-700 text-mist-500"
                }`}
              >
                {f || "all"}
              </button>
            ))}
          </div>
        )}

        <div className="panel overflow-x-auto">
          {loading ? (
            <p className="p-6 text-mist-700 font-mono text-sm">loading…</p>
          ) : tab === "decisions" ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-mono text-mist-700 uppercase tracking-wide border-b border-ink-700 bg-ink-800/50">
                  <th className="px-4 py-3 font-normal">Decision</th>
                  <th className="px-4 py-3 font-normal">Action</th>
                  <th className="px-4 py-3 font-normal">Resource</th>
                  <th className="px-4 py-3 font-normal">Reason</th>
                  <th className="px-4 py-3 font-normal">Latency</th>
                  <th className="px-4 py-3 font-normal">Time</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d) => (
                  <tr key={d.id} className="border-b border-ink-800 last:border-0 align-top">
                    <td className="px-4 py-3">
                      <EffectBadge effect={d.decision as Effect} />
                    </td>
                    <td className="px-4 py-3 font-mono text-mist-300">
                      {d.action_type} <span className="text-mist-700">/{d.resource_type}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-mist-100 max-w-xs truncate">{d.resource_identifier}</td>
                    <td className="px-4 py-3 text-mist-500 max-w-sm">{d.reason}</td>
                    <td className="px-4 py-3 font-mono text-mist-700">{d.latency_ms?.toFixed(2)}ms</td>
                    <td className="px-4 py-3 text-mist-700 text-xs whitespace-nowrap">{new Date(d.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {decisions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-mist-700">
                      No access decisions recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-mono text-mist-700 uppercase tracking-wide border-b border-ink-700 bg-ink-800/50">
                  <th className="px-4 py-3 font-normal">Event</th>
                  <th className="px-4 py-3 font-normal">Actor</th>
                  <th className="px-4 py-3 font-normal">Target</th>
                  <th className="px-4 py-3 font-normal">Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-ink-800 last:border-0">
                    <td className="px-4 py-3 font-mono text-mist-100">{l.event_type}</td>
                    <td className="px-4 py-3 font-mono text-mist-500">{l.actor_id ?? "system"}</td>
                    <td className="px-4 py-3 font-mono text-mist-500">
                      {l.target_type ? `${l.target_type}:${l.target_id}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-mist-700 text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-mist-700">
                      No admin actions recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
