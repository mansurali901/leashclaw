"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { PolicyRead } from "@/types";

export default function PoliciesPage() {
  const { isAdmin } = useAuth();
  const [policies, setPolicies] = useState<PolicyRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    setPolicies(await api.get<PolicyRead[]>("/policies"));
    setLoading(false);
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

  return (
    <AppShell>
      <div className="p-8 max-w-[1000px]">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl text-mist-100">Policies</h1>
            <p className="text-sm text-mist-500 mt-1">Named, versioned rule bundles assigned to agents, teams, or roles.</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowCreate((s) => !s)}
              className="rounded-lg bg-ink-700 border border-ink-500 text-mist-100 text-sm px-4 py-2 hover:bg-ink-600 transition-colors"
            >
              + New policy
            </button>
          )}
        </header>

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
                <div className="flex items-center gap-3 text-xs font-mono text-mist-700">
                  <span>v{p.version}</span>
                  <span className={p.enabled ? "text-signal-allow" : "text-mist-700"}>
                    {p.enabled ? "enabled" : "disabled"}
                  </span>
                </div>
              </Link>
            ))}
            {policies.length === 0 && <p className="text-mist-700 text-sm">No policies yet.</p>}
          </div>
        )}
      </div>
    </AppShell>
  );
}
