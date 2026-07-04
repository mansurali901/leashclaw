"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { getToken } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Overview", glyph: "◈" },
  { href: "/agents", label: "Agents", glyph: "⌁" },
  { href: "/policies", label: "Policies", glyph: "▤" },
  { href: "/violations", label: "Violations", glyph: "▲" },
  { href: "/audit", label: "Audit trail", glyph: "≣" },
  { href: "/simulator", label: "Simulator", glyph: "▷" },
  { href: "/settings", label: "Settings", glyph: "⚙" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, loading } = useAuth();

  useEffect(() => {
    if (!loading && !getToken()) {
      router.replace("/login");
    }
  }, [loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist-500 font-mono text-sm">
        initializing console…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r border-ink-600 bg-ink-950/80 flex flex-col h-screen sticky top-0">
        <div className="px-5 py-6 border-b border-ink-600">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-signal-allow/15 border border-signal-allow/40 flex items-center justify-center text-signal-allow font-mono text-xs">
              G
            </div>
            <span className="font-display text-lg text-mist-100 tracking-tight">Guardrail</span>
          </div>
          <p className="mt-1 text-[11px] text-mist-700 font-mono">agent governance console</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-ink-700 text-mist-100 border border-ink-500"
                    : "text-mist-500 hover:text-mist-100 hover:bg-ink-800 border border-transparent"
                }`}
              >
                <span className="font-mono text-signal-info/80 w-4 text-center">{item.glyph}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-ink-600">
          <Link
            href="/settings"
            className="block rounded-lg bg-ink-800 border border-ink-600 px-3 py-2.5 hover:border-ink-500 transition-colors"
          >
            <p className="text-sm text-mist-100 truncate">{user?.full_name}</p>
            <p className="text-xs text-mist-700 font-mono truncate">{user?.role} · settings</p>
          </Link>
          <button
            onClick={logout}
            className="mt-2 w-full text-left text-xs text-mist-500 hover:text-signal-deny px-3 py-2 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
