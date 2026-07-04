"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { EngineSettingsRead } from "@/types";

const ROLE_COLOR: Record<string, string> = {
  super_admin: "bg-signal-deny/20 text-signal-deny border-signal-deny/40",
  admin: "bg-signal-warn/20 text-signal-warn border-signal-warn/40",
  auditor: "bg-signal-info/20 text-signal-info border-signal-info/40",
  viewer: "bg-ink-600 text-mist-500 border-ink-500",
};

const ROLE_AVATAR: Record<string, string> = {
  super_admin: "bg-signal-deny/15 text-signal-deny",
  admin: "bg-signal-warn/15 text-signal-warn",
  auditor: "bg-signal-info/15 text-signal-info",
  viewer: "bg-ink-700 text-mist-500",
};

export default function SettingsPage() {
  const { user, isAdmin } = useAuth();
  const [settings, setSettings] = useState<EngineSettingsRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [defaultEffect, setDefaultEffect] = useState<"allow" | "deny">("deny");

  async function load() {
    try {
      const data = await api.get<EngineSettingsRead>("/settings/engine");
      setSettings(data);
      setDefaultEffect(data.default_effect);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await api.patch<EngineSettingsRead>("/settings/engine", { default_effect: defaultEffect });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  const dirty = settings && defaultEffect !== settings.default_effect;
  const role = user?.role ?? "viewer";
  const initials = user?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "?";

  return (
    <AppShell>
      <div className="p-8 max-w-[1000px]">
        {/* Page header */}
        <header className="mb-8">
          <div className="flex items-center gap-2 text-xs font-mono text-mist-700 mb-2">
            <span>console</span>
            <span>/</span>
            <span className="text-mist-500">settings</span>
          </div>
          <h1 className="font-display text-2xl text-mist-100">Settings</h1>
          <p className="text-sm text-mist-500 mt-1">
            Manage your account and configure the enforcement engine at runtime.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* ── Left column: Account ── */}
          <div className="space-y-4">
            {/* Avatar card */}
            <div className="panel p-5">
              <p className="text-xs font-mono text-mist-700 uppercase tracking-wide mb-4">Account</p>

              <div className="flex flex-col items-center text-center mb-5">
                <div
                  className={`h-16 w-16 rounded-2xl flex items-center justify-center font-display text-2xl mb-3 border ${
                    ROLE_AVATAR[role] ?? ROLE_AVATAR.viewer
                  }`}
                >
                  {initials}
                </div>
                <p className="text-base text-mist-100 font-medium">{user?.full_name ?? "—"}</p>
                <p className="text-xs text-mist-700 font-mono mt-0.5">{user?.email ?? "—"}</p>
                <span
                  className={`mt-2.5 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-mono ${
                    ROLE_COLOR[role] ?? ROLE_COLOR.viewer
                  }`}
                >
                  {role}
                </span>
              </div>

              <div className="space-y-2 pt-4 border-t border-ink-700">
                <InfoRow label="Team" value={user?.team ?? "—"} />
                <InfoRow label="Status" value={user?.is_active ? "active" : "inactive"} valueColor={user?.is_active ? "text-signal-allow" : "text-signal-deny"} />
              </div>
            </div>

            {/* Permissions note */}
            <div className="rounded-lg border border-ink-600 bg-ink-900 px-4 py-3">
              <p className="text-xs font-mono text-mist-700 uppercase tracking-wide mb-1.5">Permissions</p>
              {isAdmin ? (
                <p className="text-xs text-mist-500">
                  You have <span className="text-signal-allow font-mono">admin</span> access — you can modify engine settings.
                </p>
              ) : (
                <p className="text-xs text-mist-500">
                  Engine settings are <span className="text-mist-300 font-mono">read-only</span> for your role. Contact an admin to make changes.
                </p>
              )}
            </div>
          </div>

          {/* ── Right column: Engine settings ── */}
          <div className="space-y-4">
            {/* Engine status bar */}
            <div className="panel px-5 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-signal-info/10 border border-signal-info/30 flex items-center justify-center font-mono text-signal-info text-sm">
                  ▣
                </div>
                <div>
                  <p className="text-sm text-mist-100">Policy engine</p>
                  <p className="text-xs font-mono text-mist-700">
                    {loading ? "loading…" : settings?.policy_engine_backend ?? "internal"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-signal-allow animate-pulse" />
                <span className="text-xs font-mono text-signal-allow">running</span>
              </div>
            </div>

            {/* Default effect control */}
            <div className="panel p-5">
              <div className="flex items-start justify-between gap-4 mb-1">
                <div>
                  <p className="text-sm text-mist-100 font-medium">Default effect</p>
                  <p className="text-xs text-mist-700 mt-0.5">
                    Applied when no policy rule matches an agent action.
                  </p>
                </div>
                {!loading && settings && (
                  <span className={`shrink-0 text-[11px] font-mono rounded-full px-2.5 py-0.5 border ${
                    settings.default_effect === "deny"
                      ? "bg-signal-deny/10 text-signal-deny border-signal-deny/30"
                      : "bg-signal-allow/10 text-signal-allow border-signal-allow/30"
                  }`}>
                    live: {settings.default_effect}
                  </span>
                )}
              </div>

              {loading ? (
                <div className="mt-4 h-16 rounded-lg bg-ink-900 border border-ink-700 animate-pulse" />
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {(["deny", "allow"] as const).map((val) => {
                      const selected = defaultEffect === val;
                      const isDeny = val === "deny";
                      return (
                        <button
                          key={val}
                          onClick={() => isAdmin && setDefaultEffect(val)}
                          disabled={!isAdmin}
                          className={`relative rounded-xl border p-4 text-left transition-all duration-150 ${
                            !isAdmin ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                          } ${
                            selected
                              ? isDeny
                                ? "border-signal-deny/50 bg-signal-deny/8"
                                : "border-signal-allow/50 bg-signal-allow/8"
                              : "border-ink-600 bg-ink-900 hover:border-ink-500"
                          }`}
                        >
                          {selected && (
                            <span className={`absolute top-3 right-3 h-2 w-2 rounded-full ${isDeny ? "bg-signal-deny" : "bg-signal-allow"}`} />
                          )}
                          <p className={`font-mono text-base font-semibold ${
                            selected
                              ? isDeny ? "text-signal-deny" : "text-signal-allow"
                              : "text-mist-500"
                          }`}>
                            {val}
                          </p>
                          <p className="text-xs text-mist-700 mt-1">
                            {isDeny
                              ? "Fail-closed — blocked unless a rule explicitly allows"
                              : "Fail-open — permitted unless a rule explicitly denies"}
                          </p>
                          {isDeny && (
                            <span className="mt-2 inline-block text-[10px] font-mono text-mist-700 border border-ink-600 rounded px-1.5 py-0.5">
                              recommended
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Security warning when allow is selected */}
                  {defaultEffect === "allow" && (
                    <div className="mt-3 flex gap-2.5 rounded-lg border border-signal-warn/30 bg-signal-warn/8 px-3.5 py-3">
                      <span className="text-signal-warn font-mono text-sm shrink-0">▲</span>
                      <p className="text-xs text-signal-warn/80">
                        <span className="font-medium text-signal-warn">Security risk.</span>{" "}
                        Setting the default to <span className="font-mono">allow</span> means unmatched agent actions
                        will pass through without explicit approval. Ensure comprehensive deny rules are in place.
                      </p>
                    </div>
                  )}

                  {isAdmin && (
                    <div className="mt-4 flex items-center gap-3 pt-4 border-t border-ink-700">
                      <button
                        onClick={save}
                        disabled={saving || !dirty}
                        className="rounded-lg bg-signal-info/15 border border-signal-info/40 text-signal-info text-sm px-5 py-2 hover:bg-signal-info/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {saving ? "Saving…" : "Save changes"}
                      </button>
                      {saved && (
                        <span className="flex items-center gap-1.5 text-xs font-mono text-signal-allow">
                          <span className="h-1.5 w-1.5 rounded-full bg-signal-allow" />
                          Saved
                        </span>
                      )}
                      {error && <span className="text-xs font-mono text-signal-deny">{error}</span>}
                      {dirty && !saving && !saved && (
                        <span className="text-xs font-mono text-mist-700">Unsaved changes</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Environment info */}
            <div className="panel p-5">
              <p className="text-xs font-mono text-mist-700 uppercase tracking-wide mb-4">
                Environment — read only
              </p>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-5 rounded bg-ink-800 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <EnvRow
                    label="Engine backend"
                    value={settings?.policy_engine_backend ?? "—"}
                    chip
                  />
                  <EnvRow
                    label="Default rate limit"
                    value={`${settings?.default_rate_limit_per_minute ?? "—"} req / min`}
                  />
                  {settings?.opa_url ? (
                    <EnvRow label="OPA endpoint" value={settings.opa_url} />
                  ) : (
                    <EnvRow label="OPA endpoint" value="not configured" muted />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-mono text-mist-700">{label}</span>
      <span className={`text-xs font-mono truncate ${valueColor ?? "text-mist-500"}`}>{value}</span>
    </div>
  );
}

function EnvRow({
  label,
  value,
  chip,
  muted,
}: {
  label: string;
  value: string;
  chip?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-mono text-mist-700 shrink-0">{label}</span>
      {chip ? (
        <span className="text-[11px] font-mono rounded-full bg-signal-info/10 border border-signal-info/25 text-signal-info px-2.5 py-0.5">
          {value}
        </span>
      ) : (
        <span className={`text-xs font-mono ${muted ? "text-mist-700" : "text-mist-300"}`}>{value}</span>
      )}
    </div>
  );
}
