"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { EffectBadge } from "@/components/Badges";
import type { EvaluationResponse } from "@/types";

const EXAMPLE = {
  agent_id: "agent_sales_001",
  user_id: "user_123",
  action: "read",
  resource_type: "filesystem",
  resource: "/data/customers/export.csv",
  metadata: { classification: "confidential", location: "production" },
};

export default function SimulatorPage() {
  const [payload, setPayload] = useState(JSON.stringify(EXAMPLE, null, 2));
  const [result, setResult] = useState<EvaluationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      <div className="p-8 max-w-[1000px]">
        <header className="mb-6">
          <h1 className="font-display text-2xl text-mist-100">Policy simulator</h1>
          <p className="text-sm text-mist-500 mt-1">
            Evaluate a hypothetical agent action against live policies without executing it. Every simulation is
            logged like a real evaluation.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="panel p-5">
            <p className="text-xs font-mono text-mist-500 uppercase tracking-wide mb-2">Request</p>
            <textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
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
    </AppShell>
  );
}
