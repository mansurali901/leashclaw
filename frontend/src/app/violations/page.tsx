"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import { SeverityBadge } from "@/components/Badges";
import { useAuth } from "@/lib/auth";
import type { RecentViolation } from "@/types";

export default function ViolationsPage() {
  const { isAdmin } = useAuth();
  const [violations, setViolations] = useState<RecentViolation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open">("open");

  async function refresh() {
    setViolations(await api.get<RecentViolation[]>("/dashboard/recent-violations?limit=100"));
    setLoading(false);
  }

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);

  async function acknowledge(id: string) {
    await api.patch(`/dashboard/violations/${id}/acknowledge`);
    refresh();
  }

  const visible = filter === "open" ? violations.filter((v) => !v.acknowledged) : violations;

  return (
    <AppShell>
      <div className="p-8 max-w-[1100px]">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl text-mist-100">Violations</h1>
            <p className="text-sm text-mist-500 mt-1">Denied actions and flagged allow-matches across all agents.</p>
          </div>
          <div className="flex gap-1 rounded-lg bg-ink-800 border border-ink-600 p-1 text-xs font-mono">
            <button
              onClick={() => setFilter("open")}
              className={`px-3 py-1.5 rounded-md ${filter === "open" ? "bg-ink-600 text-mist-100" : "text-mist-500"}`}
            >
              Open
            </button>
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded-md ${filter === "all" ? "bg-ink-600 text-mist-100" : "text-mist-500"}`}
            >
              All
            </button>
          </div>
        </header>

        {loading ? (
          <p className="text-mist-700 font-mono text-sm">loading violations…</p>
        ) : (
          <div className="space-y-3">
            {visible.map((v) => (
              <div key={v.id} className="panel p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SeverityBadge severity={v.severity} />
                    {v.acknowledged && <span className="text-xs font-mono text-mist-700">acknowledged</span>}
                  </div>
                  <p className="text-sm text-mist-100 mt-2">{v.summary}</p>
                  <p className="text-xs font-mono text-mist-700 mt-1">
                    {v.agent_slug ?? "unknown agent"} · {new Date(v.created_at).toLocaleString()}
                  </p>
                </div>
                {isAdmin && !v.acknowledged && (
                  <button
                    onClick={() => acknowledge(v.id)}
                    className="shrink-0 rounded-lg bg-ink-800 border border-ink-600 text-mist-300 text-xs font-mono px-3 py-1.5 hover:bg-ink-700"
                  >
                    acknowledge
                  </button>
                )}
              </div>
            ))}
            {visible.length === 0 && <p className="text-mist-700 text-sm">No {filter === "open" ? "open " : ""}violations.</p>}
          </div>
        )}
      </div>
    </AppShell>
  );
}
