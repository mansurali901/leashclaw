"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm">
        <div className="bg-ink-900 border border-ink-600 rounded-xl shadow-2xl p-6">
          <div className="flex items-start gap-4 mb-5">
            <div className={`shrink-0 rounded-lg p-2 ${danger ? "bg-signal-deny/10" : "bg-ink-700"}`}>
              <AlertTriangle size={18} className={danger ? "text-signal-deny" : "text-mist-400"} />
            </div>
            <div>
              <h3 className="font-display text-mist-100 text-base leading-snug">{title}</h3>
              <p className="text-sm text-mist-500 mt-1 leading-relaxed">{message}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              autoFocus
              className="px-4 py-2 text-sm rounded-lg border border-ink-600 text-mist-500 hover:text-mist-100 hover:border-ink-500 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                danger
                  ? "border-signal-deny/50 bg-signal-deny/10 text-signal-deny hover:bg-signal-deny/20 hover:border-signal-deny"
                  : "border-ink-500 bg-ink-700 text-mist-100 hover:bg-ink-600"
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
