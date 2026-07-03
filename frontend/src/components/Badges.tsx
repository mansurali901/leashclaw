export function EffectBadge({ effect }: { effect: "allow" | "deny" }) {
  const isAllow = effect === "allow";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-mono uppercase tracking-wide ${
        isAllow ? "bg-signal-allow/10 text-signal-allow" : "bg-signal-deny/10 text-signal-deny"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isAllow ? "bg-signal-allow" : "bg-signal-deny"}`} />
      {effect}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    low: "text-mist-500 bg-mist-500/10",
    medium: "text-signal-warn bg-signal-warn/10",
    high: "text-signal-deny bg-signal-deny/10",
    critical: "text-signal-deny bg-signal-deny/20",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-mono uppercase tracking-wide ${colors[severity] || colors.low}`}>
      {severity}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "text-signal-allow bg-signal-allow/10",
    suspended: "text-signal-warn bg-signal-warn/10",
    decommissioned: "text-mist-500 bg-mist-500/10",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-mono uppercase tracking-wide ${colors[status] || colors.active}`}>
      {status}
    </span>
  );
}
