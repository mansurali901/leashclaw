"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { getToken } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import Logo from "@/components/Logo";
import {
  LayoutDashboard,
  Bot,
  Shield,
  AlertTriangle,
  ScrollText,
  FlaskConical,
  Settings,
  Sun,
  Moon,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Overview",    Icon: LayoutDashboard },
  { href: "/agents",    label: "Agents",      Icon: Bot             },
  { href: "/policies",  label: "Policies",    Icon: Shield          },
  { href: "/violations",label: "Violations",  Icon: AlertTriangle   },
  { href: "/audit",     label: "Audit trail", Icon: ScrollText      },
  { href: "/simulator", label: "Simulator",   Icon: FlaskConical    },
  { href: "/settings",  label: "Settings",    Icon: Settings        },
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
        <div className="px-4 py-5 border-b border-ink-600 flex items-center justify-between gap-2">
          <Logo variant="horizontal" size="nav" />
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            className="rounded-md p-1.5 text-mist-700 hover:text-mist-500 hover:bg-ink-700 transition-colors shrink-0"
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-ink-700 text-mist-100 border border-ink-500"
                    : "text-mist-500 hover:text-mist-100 hover:bg-ink-800 border border-transparent"
                }`}
              >
                <Icon
                  size={17}
                  className={active ? "text-signal-info" : "text-mist-700"}
                />
                {label}
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
