"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import { SeverityBadge } from "@/components/Badges";
import type {
  AccessDecisionRead,
  PolicyHitRate,
  RecentViolation,
  ResourceAccessSummary,
  SummaryStats,
  TimeSeriesPoint,
  TopViolatingAgent,
} from "@/types";

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: "allow" | "deny" | "warn" | "info" }) {
  const toneClass = {
    allow: "text-signal-allow",
    deny: "text-signal-deny",
    warn: "text-signal-warn",
    info: "text-signal-info",
  }[tone ?? "info"];
  return (
    <div className="panel px-5 py-4">
      <p className="text-xs font-mono text-mist-700 uppercase tracking-wide">{label}</p>
      <p className={`font-display text-3xl mt-1.5 ${toneClass ?? "text-mist-100"}`}>{value}</p>
    </div>
  );
}

function DecisionPulse({ decisions }: { decisions: AccessDecisionRead[] }) {
  const recent = [...decisions].reverse().slice(-72);
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-base text-mist-100">Decision pulse</h2>
          <p className="text-xs text-mist-700 font-mono mt-0.5">most recent evaluated actions, oldest → newest</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-mist-500">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-signal-allow" /> allow</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-signal-deny" /> deny</span>
        </div>
      </div>
      <div className="flex items-end gap-[3px] h-16">
        {recent.length === 0 && <p className="text-sm text-mist-700">No decisions recorded yet.</p>}
        {recent.map((d, i) => (
          <div
            key={d.id}
            title={`${d.action_type} ${d.resource_identifier} — ${d.decision}`}
            style={{ animationDelay: `${i * 6}ms` }}
            className={`pulse-tick flex-1 rounded-sm ${
              d.decision === "allow" ? "bg-signal-allow/70 h-8" : "bg-signal-deny/80 h-14"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [decisions, setDecisions] = useState<AccessDecisionRead[]>([]);
  const [topAgents, setTopAgents] = useState<TopViolatingAgent[]>([]);
  const [violations, setViolations] = useState<RecentViolation[]>([]);
  const [resources, setResources] = useState<ResourceAccessSummary[]>([]);
  const [hitRates, setHitRates] = useState<PolicyHitRate[]>([]);
  const [series, setSeries] = useState<TimeSeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [s, d, t, v, r, h, ts] = await Promise.all([
        api.get<SummaryStats>("/dashboard/summary"),
        api.get<AccessDecisionRead[]>("/audit/decisions?limit=72"),
        api.get<TopViolatingAgent[]>("/dashboard/top-violating-agents?limit=5"),
        api.get<RecentViolation[]>("/dashboard/recent-violations?limit=8"),
        api.get<ResourceAccessSummary[]>("/dashboard/resource-access-history?limit=8"),
        api.get<PolicyHitRate[]>("/dashboard/policy-hit-rate?limit=6"),
        api.get<TimeSeriesPoint[]>("/dashboard/timeseries?hours=24"),
      ]);
      setSummary(s);
      setDecisions(d);
      setTopAgents(t);
      setViolations(v);
      setResources(r);
      setHitRates(h);
      setSeries(ts);
      setLoading(false);
    }
    load().catch(() => setLoading(false));
  }, []);

  const maxSeries = Math.max(1, ...series.map((p) => p.allowed + p.denied));

  return (
    <AppShell>
      <div className="p-8 max-w-[1400px]">
        <header className="mb-6">
          <h1 className="font-display text-2xl text-mist-100">Overview</h1>
          <p className="text-sm text-mist-500 mt-1">Real-time posture of every agent evaluated by the guardrail engine.</p>
        </header>

        {loading || !summary ? (
          <p className="text-mist-700 font-mono text-sm">loading telemetry…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard label="Total requests" value={summary.total_requests} />
              <StatCard label="Allowed" value={summary.allowed_count} tone="allow" />
              <StatCard label="Denied" value={summary.denied_count} tone="deny" />
              <StatCard label="Open violations" value={summary.open_violations} tone="warn" />
              <StatCard label="Allow rate" value={`${(summary.allow_rate * 100).toFixed(1)}%`} tone="allow" />
              <StatCard label="Deny rate" value={`${(summary.deny_rate * 100).toFixed(1)}%`} tone="deny" />
              <StatCard label="Active agents" value={`${summary.active_agents}/${summary.total_agents}`} tone="info" />
              <StatCard label="Rules in force" value={summary.total_rules} tone="info" />
            </div>

            <div className="mb-6">
              <DecisionPulse decisions={decisions} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              <div className="panel p-5 lg:col-span-2">
                <h2 className="font-display text-base text-mist-100 mb-4">Traffic — last 24h</h2>
                <div className="flex items-end gap-1.5 h-40">
                  {series.length === 0 && <p className="text-sm text-mist-700">No traffic in the last 24 hours.</p>}
                  {series.map((p) => (
                    <div key={p.bucket} className="flex-1 flex flex-col justify-end gap-0.5 group relative">
                      <div
                        className="bg-signal-deny/70 rounded-t-sm"
                        style={{ height: `${(p.denied / maxSeries) * 140}px` }}
                      />
                      <div
                        className="bg-signal-allow/70 rounded-b-sm"
                        style={{ height: `${(p.allowed / maxSeries) * 140}px` }}
                      />
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block text-[10px] font-mono text-mist-300 bg-ink-800 border border-ink-600 rounded px-1.5 py-0.5 whitespace-nowrap">
                        {p.bucket.slice(11)}: {p.allowed}a / {p.denied}d
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel p-5">
                <h2 className="font-display text-base text-mist-100 mb-4">Top violating agents</h2>
                <div className="space-y-3">
                  {topAgents.length === 0 && <p className="text-sm text-mist-700">No violations yet.</p>}
                  {topAgents.map((a) => (
                    <div key={a.agent_id} className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm text-mist-100 truncate">{a.agent_name}</p>
                        <p className="text-xs font-mono text-mist-700 truncate">{a.agent_slug}</p>
                      </div>
                      <span className="font-mono text-sm text-signal-deny shrink-0 ml-2">{a.violation_count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="panel p-5 lg:col-span-2">
                <h2 className="font-display text-base text-mist-100 mb-4">Recent violations</h2>
                <div className="space-y-2">
                  {violations.length === 0 && <p className="text-sm text-mist-700">Nothing flagged recently.</p>}
                  {violations.map((v) => (
                    <div key={v.id} className="flex items-start justify-between gap-3 border-b border-ink-700 pb-2 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm text-mist-100 truncate">{v.summary}</p>
                        <p className="text-xs font-mono text-mist-700 mt-0.5">
                          {v.agent_slug ?? "unknown agent"} · {new Date(v.created_at).toLocaleString()}
                        </p>
                      </div>
                      <SeverityBadge severity={v.severity} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel p-5">
                <h2 className="font-display text-base text-mist-100 mb-4">Policy hit rate</h2>
                <div className="space-y-3">
                  {hitRates.length === 0 && <p className="text-sm text-mist-700">No rule hits yet.</p>}
                  {hitRates.map((h) => (
                    <div key={h.rule_id}>
                      <div className="flex justify-between text-sm">
                        <span className="text-mist-100 truncate">{h.rule_name}</span>
                        <span className="font-mono text-mist-500">{h.hit_count}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-ink-700 overflow-hidden flex">
                        <div className="bg-signal-allow" style={{ width: `${(h.allow_count / h.hit_count) * 100}%` }} />
                        <div className="bg-signal-deny" style={{ width: `${(h.deny_count / h.hit_count) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel p-5 mt-4">
              <h2 className="font-display text-base text-mist-100 mb-4">Resource access history</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-mono text-mist-700 uppercase tracking-wide border-b border-ink-700">
                    <th className="pb-2 font-normal">Resource</th>
                    <th className="pb-2 font-normal">Type</th>
                    <th className="pb-2 font-normal">Accesses</th>
                    <th className="pb-2 font-normal">Denials</th>
                    <th className="pb-2 font-normal">Last accessed</th>
                  </tr>
                </thead>
                <tbody>
                  {resources.map((r) => (
                    <tr key={r.resource_identifier} className="border-b border-ink-800 last:border-0">
                      <td className="py-2 font-mono text-mist-100 truncate max-w-xs">{r.resource_identifier}</td>
                      <td className="py-2 text-mist-500">{r.resource_type}</td>
                      <td className="py-2 font-mono text-mist-300">{r.access_count}</td>
                      <td className="py-2 font-mono text-signal-deny">{r.deny_count}</td>
                      <td className="py-2 text-mist-700 text-xs">{new Date(r.last_accessed_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
