"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { getToken } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import Logo from "@/components/Logo";
import { LayoutDashboard, Bot, ShieldCheck, AlertTriangle, ScrollText, FlaskConical, Settings } from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Overview",    Icon: LayoutDashboard },
  { href: "/agents",    label: "Agents",      Icon: Bot              },
  { href: "/policies",  label: "Policies",    Icon: ShieldCheck      },
  { href: "/violations",label: "Violations",  Icon: AlertTriangle    },
  { href: "/audit",     label: "Audit trail", Icon: ScrollText       },
  { href: "/simulator", label: "Simulator",   Icon: FlaskConical     },
  { href: "/settings",  label: "Settings",    Icon: Settings         },
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
      <aside className="w-60 shrink-0 border-r border-ink-600 bg-ink-950/80 flex flex-col h-screen sticky top-0">
        <div className="px-5 py-6 border-b border-ink-600">
          <Logo size="sm" />
          <p className="mt-1.5 text-[11px] text-mist-700 font-mono">agent governance console</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-1">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3.5 rounded-lg px-3.5 py-2.5 text-base transition-colors ${
                  active
                    ? "bg-ink-700 text-mist-100 border border-ink-500"
                    : "text-mist-500 hover:text-mist-100 hover:bg-ink-800 border border-transparent"
                }`}
              >
                <item.Icon size={20} className="shrink-0 text-signal-info/80" />
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
