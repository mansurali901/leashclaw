"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  type: "agent" | "resource_type" | "resource" | "policy_resource";
  allow_count: number;
  deny_count: number;
  total_count: number;
  actions: string[];
  last_seen: string | null;
  children: GraphNode[];
}

interface AccessGraphResponse {
  nodes: GraphNode[];
  total_decisions: number;
  agents_count: number;
}

// ── Layout constants ──────────────────────────────────────────────────────────

const NODE_W = 160;
const NODE_H = 52;
const H_GAP = 80;   // horizontal gap between levels
const V_GAP = 14;   // vertical gap between siblings

// ── Node colour helpers ───────────────────────────────────────────────────────

function nodeColor(node: GraphNode): { fill: string; stroke: string; text: string } {
  if (node.type === "policy_resource") {
    return { fill: "#1e293b", stroke: "#334155", text: "#94a3b8" };
  }
  if (node.total_count === 0) {
    return { fill: "#1e293b", stroke: "#334155", text: "#94a3b8" };
  }
  const ratio = node.allow_count / node.total_count;
  if (ratio >= 0.85) return { fill: "#052e16", stroke: "#16a34a", text: "#86efac" };
  if (ratio >= 0.5)  return { fill: "#422006", stroke: "#d97706", text: "#fcd34d" };
  return { fill: "#2d0a0a", stroke: "#dc2626", text: "#fca5a5" };
}

function typeIcon(rtype: string): string {
  const icons: Record<string, string> = {
    filesystem: "💾", api: "🔌", url: "🌐",
    database: "🗄️", secret: "🔑", tool: "🔧", command: "⚡",
  };
  return icons[rtype] ?? "📦";
}

// ── Tree layout (top-down positions) ─────────────────────────────────────────

interface LayoutNode {
  node: GraphNode;
  x: number;
  y: number;
  depth: number;
  parentId: string | null;
}

function layoutTree(nodes: GraphNode[], collapsed: Set<string>): LayoutNode[] {
  const result: LayoutNode[] = [];

  function measureHeight(node: GraphNode, depth: number): number {
    const isCollapsed = collapsed.has(node.id);
    if (isCollapsed || !node.children.length) return NODE_H + V_GAP;
    return Math.max(
      NODE_H + V_GAP,
      node.children.reduce((sum, c) => sum + measureHeight(c, depth + 1), 0)
    );
  }

  function place(node: GraphNode, depth: number, yTop: number, parentId: string | null) {
    const isCollapsed = collapsed.has(node.id);
    const childHeight = isCollapsed
      ? 0
      : node.children.reduce((sum, c) => sum + measureHeight(c, depth + 1), 0);

    const selfY = yTop + childHeight / 2;
    result.push({
      node,
      x: depth * (NODE_W + H_GAP),
      y: selfY,
      depth,
      parentId,
    });

    if (!isCollapsed) {
      let cursor = yTop;
      for (const child of node.children) {
        const h = measureHeight(child, depth + 1);
        place(child, depth + 1, cursor, node.id);
        cursor += h;
      }
    }
  }

  // Place each top-level agent, stacking vertically
  let cursor = 0;
  for (const n of nodes) {
    const h = measureHeight(n, 0);
    place(n, 0, cursor, null);
    cursor += h + V_GAP * 2;
  }

  return result;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipState {
  node: GraphNode;
  x: number;
  y: number;
}

function Tooltip({ state }: { state: TooltipState }) {
  const { node, x, y } = state;
  const allow = node.allow_count;
  const deny = node.deny_count;
  const total = node.total_count;
  const ratio = total > 0 ? Math.round((allow / total) * 100) : null;

  return (
    <div
      className="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-ink-600 bg-ink-900 p-3 shadow-xl text-xs font-mono"
      style={{ left: x + 12, top: y - 8 }}
    >
      <p className="text-mist-100 font-semibold text-sm mb-1.5 font-display">{node.label}</p>
      <p className="text-mist-600 mb-1.5 capitalize">{node.type.replace("_", " ")}</p>

      {total > 0 && (
        <>
          <div className="flex gap-4 mb-1.5">
            <span className="text-signal-allow">✓ {allow.toLocaleString()} allow</span>
            <span className="text-signal-deny">✗ {deny.toLocaleString()} deny</span>
          </div>
          {ratio !== null && (
            <div className="mb-1.5">
              <div className="h-1.5 w-full rounded bg-ink-700 overflow-hidden">
                <div
                  className="h-full rounded bg-signal-allow"
                  style={{ width: `${ratio}%` }}
                />
              </div>
              <span className="text-mist-600">{ratio}% allow rate</span>
            </div>
          )}
        </>
      )}

      {node.type === "policy_resource" && (
        <p className="text-signal-info mb-1">Policy-defined (no decisions yet)</p>
      )}

      {node.actions.length > 0 && (
        <div className="mt-1">
          <span className="text-mist-600">Actions: </span>
          <span className="text-mist-400">{node.actions.join(", ")}</span>
        </div>
      )}

      {node.last_seen && (
        <div className="mt-1">
          <span className="text-mist-600">Last seen: </span>
          <span className="text-mist-400">{new Date(node.last_seen).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

// ── SVG Graph ────────────────────────────────────────────────────────────────

function KnowledgeGraph({ data }: { data: AccessGraphResponse }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [scale, setScale] = useState(1);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const layout = layoutTree(data.nodes, collapsed);
  const byId = Object.fromEntries(layout.map(l => [l.node.id, l]));

  // Compute SVG canvas size
  const maxX = Math.max(...layout.map(l => l.x + NODE_W), 600);
  const maxY = Math.max(...layout.map(l => l.y + NODE_H), 400);

  // Edges
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const item of layout) {
    if (!item.parentId) continue;
    const parent = byId[item.parentId];
    if (!parent) continue;
    edges.push({
      x1: parent.x + NODE_W,
      y1: parent.y + NODE_H / 2,
      x2: item.x,
      y2: item.y + NODE_H / 2,
    });
  }

  // Pan handlers
  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as SVGElement).closest("[data-node]")) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }, [pan]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!isPanning.current) return;
    setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
  }, []);

  const onMouseUp = useCallback(() => { isPanning.current = false; }, []);

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setScale(s => Math.max(0.3, Math.min(2.5, s - e.deltaY * 0.001)));
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl border border-ink-600 bg-ink-950 cursor-grab active:cursor-grabbing">
      {/* Controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        <button
          onClick={() => setScale(s => Math.min(2.5, s + 0.15))}
          className="w-8 h-8 rounded bg-ink-800 border border-ink-600 text-mist-300 hover:bg-ink-700 flex items-center justify-center text-lg font-bold"
        >+</button>
        <button
          onClick={() => setScale(s => Math.max(0.3, s - 0.15))}
          className="w-8 h-8 rounded bg-ink-800 border border-ink-600 text-mist-300 hover:bg-ink-700 flex items-center justify-center text-lg font-bold"
        >−</button>
        <button
          onClick={() => { setPan({ x: 40, y: 40 }); setScale(1); }}
          className="w-8 h-8 rounded bg-ink-800 border border-ink-600 text-mist-500 hover:bg-ink-700 flex items-center justify-center text-xs"
          title="Reset view"
        >⊙</button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex gap-3 text-xs font-mono bg-ink-900/80 backdrop-blur px-3 py-2 rounded-lg border border-ink-700">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#16a34a]" /> Allow-heavy</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#d97706]" /> Mixed</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#dc2626]" /> Deny-heavy</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#334155]" /> Policy-only</span>
      </div>

      <svg
        ref={svgRef}
        className="w-full h-full select-none"
        viewBox={`0 0 ${maxX + 60} ${maxY + 60}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
          {/* Edges */}
          {edges.map((e, i) => {
            const mx = (e.x1 + e.x2) / 2;
            return (
              <path
                key={i}
                d={`M ${e.x1} ${e.y1} C ${mx} ${e.y1}, ${mx} ${e.y2}, ${e.x2} ${e.y2}`}
                fill="none"
                stroke="#334155"
                strokeWidth={1.5}
              />
            );
          })}

          {/* Nodes */}
          {layout.map(({ node, x, y }) => {
            const colors = nodeColor(node);
            const hasChildren = node.children.length > 0;
            const isCollapsed = collapsed.has(node.id);
            const isAgent = node.type === "agent";
            const isType = node.type === "resource_type";

            return (
              <g
                key={node.id}
                data-node="1"
                transform={`translate(${x}, ${y})`}
                onClick={() => hasChildren && toggleCollapse(node.id)}
                onMouseEnter={e => setTooltip({ node, x: e.clientX, y: e.clientY })}
                onMouseMove={e => setTooltip({ node, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: hasChildren ? "pointer" : "default" }}
              >
                {/* Node box */}
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={isAgent ? 10 : isType ? 8 : 6}
                  fill={colors.fill}
                  stroke={colors.stroke}
                  strokeWidth={isAgent ? 2 : 1.5}
                />

                {/* Allow/deny bar at bottom */}
                {node.total_count > 0 && (
                  <>
                    <rect
                      x={2} y={NODE_H - 5}
                      width={NODE_W - 4} height={3}
                      rx={2} fill="#1e293b"
                    />
                    <rect
                      x={2} y={NODE_H - 5}
                      width={Math.max(4, ((NODE_W - 4) * node.allow_count) / node.total_count)}
                      height={3}
                      rx={2}
                      fill="#16a34a"
                    />
                  </>
                )}

                {/* Icon (resource_type only) */}
                {isType && (
                  <text x={10} y={23} fontSize={14} dominantBaseline="middle">
                    {typeIcon(node.label)}
                  </text>
                )}

                {/* Label */}
                <text
                  x={isType ? 30 : 12}
                  y={NODE_H / 2 - (node.total_count > 0 ? 4 : 0)}
                  fontSize={isAgent ? 13 : 11}
                  fontWeight={isAgent ? "600" : "400"}
                  fill={colors.text}
                  dominantBaseline="middle"
                  fontFamily="ui-monospace, monospace"
                >
                  {node.label.length > 18 ? node.label.slice(0, 16) + "…" : node.label}
                </text>

                {/* Count badge */}
                {node.total_count > 0 && (
                  <text
                    x={NODE_W - 10}
                    y={NODE_H / 2 - 4}
                    fontSize={9}
                    fill={colors.text}
                    dominantBaseline="middle"
                    textAnchor="end"
                    opacity={0.7}
                  >
                    {node.total_count >= 1000
                      ? `${(node.total_count / 1000).toFixed(1)}k`
                      : node.total_count}
                  </text>
                )}

                {/* Expand/collapse indicator */}
                {hasChildren && (
                  <text
                    x={NODE_W - 8}
                    y={NODE_H - 10}
                    fontSize={9}
                    fill={colors.stroke}
                    dominantBaseline="middle"
                    textAnchor="end"
                  >
                    {isCollapsed ? `▶ ${node.children.length}` : "▼"}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {tooltip && <Tooltip state={tooltip} />}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AccessGraphPage() {
  const [data, setData] = useState<AccessGraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState("");
  const [appliedFilter, setAppliedFilter] = useState<string | undefined>(undefined);

  useEffect(() => {
    setLoading(true);
    const qs = appliedFilter ? `?agent_slug=${encodeURIComponent(appliedFilter)}` : "";
    api.get<AccessGraphResponse>(`/access-graph${qs}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [appliedFilter]);

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-64px)] gap-4 p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 shrink-0">
          <div>
            <h1 className="font-display text-2xl text-mist-100">Access Graph</h1>
            <p className="text-sm text-mist-600 font-mono mt-0.5">
              Interactive knowledge graph of agent resource access. Click nodes to expand/collapse. Hover for details.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              type="text"
              placeholder="Filter by agent slug…"
              value={agentFilter}
              onChange={e => setAgentFilter(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") setAppliedFilter(agentFilter || undefined);
                if (e.key === "Escape") { setAgentFilter(""); setAppliedFilter(undefined); }
              }}
              className="bg-ink-800 border border-ink-600 rounded-lg px-3 py-1.5 text-sm text-mist-100 placeholder-mist-700 focus:outline-none focus:border-ink-400 w-52"
            />
            <button
              onClick={() => setAppliedFilter(agentFilter || undefined)}
              className="px-3 py-1.5 text-sm rounded-lg bg-ink-700 hover:bg-ink-600 text-mist-200 border border-ink-600"
            >
              Filter
            </button>
            {appliedFilter && (
              <button
                onClick={() => { setAgentFilter(""); setAppliedFilter(undefined); }}
                className="px-3 py-1.5 text-sm rounded-lg bg-ink-800 hover:bg-ink-700 text-mist-400 border border-ink-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Stats bar */}
        {data && (
          <div className="flex gap-6 text-xs font-mono text-mist-600 shrink-0">
            <span><span className="text-mist-300">{data.agents_count}</span> agents</span>
            <span><span className="text-mist-300">{data.total_decisions.toLocaleString()}</span> total decisions</span>
            {appliedFilter && (
              <span className="text-signal-info">Filtered: {appliedFilter}</span>
            )}
          </div>
        )}

        {/* Graph canvas */}
        <div className="flex-1 min-h-0">
          {loading ? (
            <div className="flex h-full items-center justify-center text-mist-600 font-mono text-sm">
              Loading graph…
            </div>
          ) : !data || data.nodes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-mist-600 font-mono">
              <p className="text-lg">No data yet</p>
              <p className="text-sm text-mist-700">
                Agents need to make access decisions or have policies assigned before they appear here.
              </p>
            </div>
          ) : (
            <KnowledgeGraph data={data} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
