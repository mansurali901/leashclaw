"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import Logo from "@/components/Logo";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed. Check the API is running.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Logo variant="stacked" size="md" />
        </div>

        <form onSubmit={onSubmit} className="panel p-6 space-y-4">
          <div>
            <h1 className="font-display text-lg text-mist-100">Sign in to the console</h1>
            <p className="text-sm text-mist-500 mt-1">Admins, auditors, and viewers authenticate here.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-mist-500 uppercase tracking-wide">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-ink-900 border border-ink-600 px-3 py-2 text-sm text-mist-100 outline-none focus:border-signal-info transition-colors"
              placeholder="admin@guardrail.example.com"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-mist-500 uppercase tracking-wide">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-ink-900 border border-ink-600 px-3 py-2 text-sm text-mist-100 outline-none focus:border-signal-info transition-colors"
              placeholder="••••••••"
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
            className="w-full rounded-lg bg-ink-700 border border-ink-500 text-mist-100 font-medium text-sm py-2.5 hover:bg-ink-600 transition-colors disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-xs text-mist-700 font-mono mt-4">
          Default seed: admin@guardrail.example.com
        </p>
      </div>
    </div>
  );
}
