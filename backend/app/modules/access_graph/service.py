from collections import defaultdict
from sqlalchemy import text
from sqlmodel.ext.asyncio.session import AsyncSession

from app.modules.access_graph.schemas import AccessGraphResponse, GraphNode

# Resource types in preferred display order
RESOURCE_TYPE_ORDER = [
    "filesystem", "api", "url", "database", "secret", "tool", "command"
]


async def get_access_graph(
    session: AsyncSession,
    agent_slug: str | None = None,
) -> AccessGraphResponse:
    """
    Aggregate access_decisions into a 3-level tree:
      agent → resource_type → resource_identifier

    Also pulls policy rules (even if never exercised) so the graph
    shows permitted resources, not just historically accessed ones.
    """
    # ── 1. Actual access decisions ─────────────────────────────────────────
    decision_sql = text("""
        SELECT
            a.slug          AS agent_slug,
            a.name          AS agent_name,
            ad.resource_type,
            ad.resource_identifier,
            ad.action_type,
            ad.decision,
            COUNT(*)        AS cnt,
            MAX(ad.created_at) AS last_seen
        FROM access_decisions ad
        JOIN agents a ON a.id = ad.agent_id
        WHERE (CAST(:slug AS TEXT) IS NULL OR a.slug = :slug)
          AND ad.agent_id IS NOT NULL
        GROUP BY a.slug, a.name, ad.resource_type, ad.resource_identifier,
                 ad.action_type, ad.decision
        ORDER BY cnt DESC
    """)
    rows = (await session.execute(decision_sql, {"slug": agent_slug})).mappings().all()

    # ── 2. Policy rules (permitted/denied by configuration) ────────────────
    rules_sql = text("""
        SELECT DISTINCT
            a.slug          AS agent_slug,
            r.resource_type,
            r.resource_pattern,
            r.action,
            r.effect
        FROM rules r
        JOIN policies p ON p.id = r.policy_id AND p.enabled = true
        JOIN agent_policy_links apl ON apl.policy_id = p.id
        JOIN agents a ON a.id = apl.agent_id
        WHERE r.enabled = true
          AND (CAST(:slug AS TEXT) IS NULL OR a.slug = :slug)
    """)
    rule_rows = (await session.execute(rules_sql, {"slug": agent_slug})).mappings().all()

    # ── 3. Build nested dicts ──────────────────────────────────────────────
    # Structure: agent_slug → resource_type → resource_id → stats
    tree: dict[str, dict] = {}  # agent_slug → {name, types: {rtype → {rid → stats}}}

    for row in rows:
        slug = row["agent_slug"]
        if slug not in tree:
            tree[slug] = {"name": row["agent_name"], "types": defaultdict(lambda: defaultdict(lambda: {
                "allow": 0, "deny": 0, "actions": set(), "last_seen": None
            }))}
        stats = tree[slug]["types"][row["resource_type"]][row["resource_identifier"]]
        if row["decision"] == "allow":
            stats["allow"] += row["cnt"]
        else:
            stats["deny"] += row["cnt"]
        stats["actions"].add(row["action_type"])
        last = str(row["last_seen"]) if row["last_seen"] else None
        if last and (stats["last_seen"] is None or last > stats["last_seen"]):
            stats["last_seen"] = last

    # Inject rule-derived nodes (pattern only, zero actual counts)
    for row in rule_rows:
        slug = row["agent_slug"]
        if slug not in tree:
            tree[slug] = {"name": slug, "types": defaultdict(lambda: defaultdict(lambda: {
                "allow": 0, "deny": 0, "actions": set(), "last_seen": None
            }))}
        rtype = row["resource_type"]
        pattern = row["resource_pattern"]
        rid = f"policy:{pattern}"
        if rid not in tree[slug]["types"][rtype]:
            tree[slug]["types"][rtype][rid] = {
                "allow": 0, "deny": 0,
                "actions": {row["action"]},
                "last_seen": None,
                "policy_effect": row["effect"],
            }
        else:
            tree[slug]["types"][rtype][rid]["actions"].add(row["action"])

    # ── 4. Convert to GraphNode tree ───────────────────────────────────────
    total_decisions = sum(
        v["allow"] + v["deny"]
        for agent in tree.values()
        for rtype in agent["types"].values()
        for v in rtype.values()
        if not v.get("policy_effect")  # only actual decisions
    )

    agent_nodes: list[GraphNode] = []

    for slug, agent_data in sorted(tree.items()):
        type_nodes: list[GraphNode] = []
        agent_allow = agent_deny = 0

        types = agent_data["types"]
        for rtype in RESOURCE_TYPE_ORDER:
            if rtype not in types:
                continue
            resources = types[rtype]
            resource_nodes: list[GraphNode] = []
            rtype_allow = rtype_deny = 0

            for rid, stats in sorted(
                resources.items(),
                key=lambda x: -(x[1]["allow"] + x[1]["deny"])
            ):
                is_policy_only = bool(stats.get("policy_effect"))
                a, d = stats["allow"], stats["deny"]
                rtype_allow += a
                rtype_deny += d

                label = rid.replace("policy:", "")
                resource_nodes.append(GraphNode(
                    id=f"{slug}:{rtype}:{rid}",
                    label=label,
                    type="resource" if not is_policy_only else "policy_resource",
                    allow_count=a,
                    deny_count=d,
                    total_count=a + d,
                    actions=sorted(stats["actions"]),
                    last_seen=stats.get("last_seen"),
                ))

            agent_allow += rtype_allow
            agent_deny += rtype_deny

            type_nodes.append(GraphNode(
                id=f"{slug}:{rtype}",
                label=rtype,
                type="resource_type",
                allow_count=rtype_allow,
                deny_count=rtype_deny,
                total_count=rtype_allow + rtype_deny,
                children=resource_nodes,
            ))

        agent_nodes.append(GraphNode(
            id=slug,
            label=agent_data["name"] or slug,
            type="agent",
            allow_count=agent_allow,
            deny_count=agent_deny,
            total_count=agent_allow + agent_deny,
            children=type_nodes,
        ))

    return AccessGraphResponse(
        nodes=agent_nodes,
        total_decisions=total_decisions,
        agents_count=len(agent_nodes),
    )
