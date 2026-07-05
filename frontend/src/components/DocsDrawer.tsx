"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface DocsDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function DocsDrawer({ open, onClose, title, children }: DocsDrawerProps) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-ink-950 border-l border-ink-600 z-50 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-700 shrink-0 bg-ink-900/60">
          <h2 className="font-display text-base text-mist-100">{title}</h2>
          <button onClick={onClose} className="text-mist-700 hover:text-mist-100 transition-colors p-1 rounded">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {children}
        </div>
      </div>
    </>
  );
}

export function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-mono text-mist-500 uppercase tracking-widest mb-3 pb-2 border-b border-ink-800">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function DocP({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-mist-400 leading-relaxed">{children}</p>;
}

export function DocCode({ children, label, onLoad }: { children: React.ReactNode; label?: string; onLoad?: () => void }) {
  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-mono text-mist-600">{label}</span>
          {onLoad && (
            <button
              onClick={onLoad}
              className="text-xs font-mono text-signal-info hover:text-signal-info/70 transition-colors"
            >
              load →
            </button>
          )}
        </div>
      )}
      <pre className="rounded-lg bg-ink-900 border border-ink-700 px-4 py-3 text-xs font-mono text-mist-100 overflow-x-auto leading-relaxed whitespace-pre">
        {children}
      </pre>
    </div>
  );
}

export function DocNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-signal-info/5 border border-signal-info/20 px-4 py-3">
      <p className="text-xs text-mist-300 leading-relaxed">{children}</p>
    </div>
  );
}

export function DocTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-ink-700">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-ink-700 bg-ink-900/60">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-left text-mist-600 font-normal uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/30">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-mist-300 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
