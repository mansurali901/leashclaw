"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { getToken } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import Logo from "@/components/Logo";

const NAV = [
  { href: "/dashboard", label: "Overview", glyph: "◈" },
  { href: "/agents", label: "Agents", glyph: "⌁" },
  { href: "/policies", label: "Policies", glyph: "▤" },
  { href: "/violations", label: "Violations", glyph: "▲" },
  { href: "/audit", label: "Audit trail", glyph: "≣" },
  { href: "/simulator", label: "Simulator", glyph: "▷" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, loading } = useAuth();
  const { theme, toggle } = useTheme();

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
      <aside className="w-60 shrink-0 border-r border-ink-600 bg-ink-950/80 flex flex-col">
        <div className="px-5 py-6 border-b border-ink-600">
          <Logo size="sm" />
          <p className="mt-1.5 text-[11px] text-mist-700 font-mono">agent governance console</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
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
          <div className="rounded-lg bg-ink-800 border border-ink-600 px-3 py-2.5">
            <p className="text-sm text-mist-100 truncate">{user?.full_name}</p>
            <p className="text-xs text-mist-700 font-mono truncate">{user?.role}</p>
          </div>
          <div className="mt-2 flex items-center justify-between px-1">
            <button
              onClick={logout}
              className="text-xs text-mist-500 hover:text-signal-deny px-2 py-2 transition-colors"
            >
              Sign out
            </button>
            <button
              onClick={toggle}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="text-mist-500 hover:text-mist-100 px-2 py-2 transition-colors text-base leading-none"
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
