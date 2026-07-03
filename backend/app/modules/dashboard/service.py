from datetime import datetime, timedelta

from sqlalchemy import case, func
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.db.models import (
    AccessDecision,
    Agent,
    AgentStatus,
    Effect,
    Policy,
    Rule,
    Violation,
)


async def get_summary(session: AsyncSession, since: datetime | None = None) -> dict:
    query = select(AccessDecision)
    if since:
        query = query.where(AccessDecision.created_at >= since)
    result = await session.exec(query)
    decisions = result.all()

    total = len(decisions)
    allowed = sum(1 for d in decisions if d.decision == Effect.ALLOW)
    denied = sum(1 for d in decisions if d.decision == Effect.DENY)

    rate_limited = sum(1 for d in decisions if "rate limit" in (d.reason or "").lower())

    total_agents_result = await session.exec(select(func.count(Agent.id)))
    total_agents = total_agents_result.one()

    active_agents_result = await session.exec(
        select(func.count(Agent.id)).where(Agent.status == AgentStatus.ACTIVE)
    )
    active_agents = active_agents_result.one()

    total_policies_result = await session.exec(select(func.count(Policy.id)))
    total_policies = total_policies_result.one()

    total_rules_result = await session.exec(select(func.count(Rule.id)))
    total_rules = total_rules_result.one()

    open_violations_result = await session.exec(
        select(func.count(Violation.id)).where(Violation.acknowledged == False)  # noqa: E712
    )
    open_violations = open_violations_result.one()

    return {
        "total_requests": total,
        "allowed_count": allowed,
        "denied_count": denied,
        "allow_rate": round(allowed / total, 4) if total else 0.0,
        "deny_rate": round(denied / total, 4) if total else 0.0,
        "rate_limited_count": rate_limited,
        "total_agents": total_agents,
        "active_agents": active_agents,
        "total_policies": total_policies,
        "total_rules": total_rules,
        "open_violations": open_violations,
    }


async def get_top_violating_agents(session: AsyncSession, limit: int = 10) -> list[dict]:
    query = (
        select(
            Agent.id,
            Agent.slug,
            Agent.name,
            func.count(Violation.id).label("violation_count"),
        )
        .join(Violation, Violation.agent_id == Agent.id)
        .group_by(Agent.id, Agent.slug, Agent.name)
        .order_by(func.count(Violation.id).desc())
        .limit(limit)
    )
    result = await session.exec(query)
    rows = result.all()
    return [
        {"agent_id": r[0], "agent_slug": r[1], "agent_name": r[2], "violation_count": r[3]}
        for r in rows
    ]


async def get_resource_access_history(session: AsyncSession, limit: int = 20) -> list[dict]:
    query = (
        select(
            AccessDecision.resource_type,
            AccessDecision.resource_identifier,
            func.count(AccessDecision.id).label("access_count"),
            func.sum(case((AccessDecision.decision == Effect.DENY, 1), else_=0)).label("deny_count"),
            func.max(AccessDecision.created_at).label("last_accessed_at"),
        )
        .group_by(AccessDecision.resource_type, AccessDecision.resource_identifier)
        .order_by(func.count(AccessDecision.id).desc())
        .limit(limit)
    )
    result = await session.exec(query)
    rows = result.all()
    return [
        {
            "resource_type": r[0],
            "resource_identifier": r[1],
            "access_count": r[2],
            "deny_count": r[3] or 0,
            "last_accessed_at": r[4],
        }
        for r in rows
    ]


async def get_policy_hit_rates(session: AsyncSession, limit: int = 20) -> list[dict]:
    query = (
        select(
            Rule.id,
            Rule.name,
            Rule.policy_id,
            func.count(AccessDecision.id).label("hit_count"),
            func.sum(case((AccessDecision.decision == Effect.ALLOW, 1), else_=0)).label("allow_count"),
            func.sum(case((AccessDecision.decision == Effect.DENY, 1), else_=0)).label("deny_count"),
        )
        .join(AccessDecision, AccessDecision.matched_rule_id == Rule.id)
        .group_by(Rule.id, Rule.name, Rule.policy_id)
        .order_by(func.count(AccessDecision.id).desc())
        .limit(limit)
    )
    result = await session.exec(query)
    rows = result.all()
    return [
        {
            "rule_id": r[0],
            "rule_name": r[1],
            "policy_id": r[2],
            "hit_count": r[3],
            "allow_count": r[4] or 0,
            "deny_count": r[5] or 0,
        }
        for r in rows
    ]


async def get_recent_violations(session: AsyncSession, limit: int = 25) -> list[dict]:
    query = (
        select(Violation, Agent.slug)
        .outerjoin(Agent, Agent.id == Violation.agent_id)
        .order_by(Violation.created_at.desc())
        .limit(limit)
    )
    result = await session.exec(query)
    rows = result.all()
    out = []
    for violation, agent_slug in rows:
        out.append(
            {
                "id": violation.id,
                "agent_id": violation.agent_id,
                "agent_slug": agent_slug,
                "severity": violation.severity.value,
                "summary": violation.summary,
                "acknowledged": violation.acknowledged,
                "created_at": violation.created_at,
            }
        )
    return out


async def get_time_series(session: AsyncSession, hours: int = 24) -> list[dict]:
    since = datetime.utcnow() - timedelta(hours=hours)
    query = select(AccessDecision).where(AccessDecision.created_at >= since)
    result = await session.exec(query)
    decisions = result.all()

    buckets: dict[str, dict[str, int]] = {}
    for d in decisions:
        bucket = d.created_at.strftime("%Y-%m-%dT%H:00")
        buckets.setdefault(bucket, {"allowed": 0, "denied": 0})
        if d.decision == Effect.ALLOW:
            buckets[bucket]["allowed"] += 1
        else:
            buckets[bucket]["denied"] += 1

    return [
        {"bucket": bucket, "allowed": v["allowed"], "denied": v["denied"]}
        for bucket, v in sorted(buckets.items())
    ]
