"""
The Policy Evaluation Engine.

This is the single choke point every agent action must pass through before
execution. It is intentionally framework-agnostic (pure Python, DB-session
in, decision out) so it can be called from the HTTP API, from a CLI, or
from a background worker identically.

Evaluation algorithm
---------------------
1. Resolve the agent by slug; suspended/decommissioned agents are denied
   outright.
2. Gather all *enabled* rules belonging to *enabled* policies assigned to
   the agent, plus any rules targeting the agent's team, the acting user,
   the acting user's role, or the wildcard subject ("*").
3. Sort candidate rules by priority descending (ties broken by more
   specific resource_pattern first, then rule creation order).
4. Walk rules in order; the first rule whose action/resource_type/
   resource_pattern/condition all match the request is the "matched rule".
   Its `effect` becomes the decision ("first-match-wins").
5. If a rate limit is attached to the matched rule (or the agent has no
   matching rule but a policy-level default applies), the request may be
   denied for being rate-limited even if the rule's effect is `allow`.
6. If no rule matches at all, the engine fails closed using
   `settings.POLICY_DEFAULT_EFFECT` (default: deny).
7. Every evaluation produces an AccessDecision row. Deny decisions (and
   allow decisions on rules flagged `alert_on_match`) also produce a
   Violation row for the dashboard.

This module intentionally does not import FastAPI so that a future OPA/Rego
backend can be swapped in behind the same `evaluate()` signature
(see POLICY_ENGINE_BACKEND setting).
"""
import time
from dataclasses import dataclass
from typing import Optional

from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.core.config import get_settings
from app.db.models import (
    AccessDecision,
    Agent,
    AgentPolicyLink,
    AgentStatus,
    Effect,
    Policy,
    Rule,
    User,
    Violation,
    ViolationSeverity,
)
from app.modules.enforcement.matcher import condition_matches, resource_matches, subject_matches
from app.modules.enforcement.rate_limiter import check_rate_limit
from app.modules.enforcement.schemas import EvaluationRequest

settings = get_settings()


@dataclass
class EngineResult:
    decision: Effect
    reason: str
    matched_rule_id: Optional[str]
    rate_limited: bool
    latency_ms: float


async def _gather_candidate_rules(session: AsyncSession, agent: Agent, user: Optional[User]) -> list[Rule]:
    # Rules from policies explicitly assigned to this agent
    assigned_policy_ids_result = await session.exec(
        select(AgentPolicyLink.policy_id).where(AgentPolicyLink.agent_id == agent.id)
    )
    assigned_policy_ids = list(assigned_policy_ids_result.all())

    rules: list[Rule] = []

    if assigned_policy_ids:
        result = await session.exec(
            select(Rule)
            .join(Policy, Policy.id == Rule.policy_id)
            .where(
                Rule.policy_id.in_(assigned_policy_ids),
                Rule.enabled == True,  # noqa: E712
                Policy.enabled == True,  # noqa: E712
            )
        )
        rules.extend(result.all())

    # Additionally include any enabled rule (from an enabled policy) whose
    # subject targets this agent's team / the acting user / role / wildcard,
    # even if that policy isn't explicitly assigned — this supports
    # org-wide guardrails (e.g. "deny secrets for team=growth" applied once).
    result = await session.exec(
        select(Rule)
        .join(Policy, Policy.id == Rule.policy_id)
        .where(Rule.enabled == True, Policy.enabled == True)  # noqa: E712
    )
    for rule in result.all():
        if rule.id in {r.id for r in rules}:
            continue
        if rule.subject_type.value == "team" and agent.owner_team and rule.subject_value == agent.owner_team:
            rules.append(rule)
        elif rule.subject_type.value == "user" and user and rule.subject_value == user.id:
            rules.append(rule)
        elif rule.subject_type.value == "role" and user and rule.subject_value == user.role.value:
            rules.append(rule)
        elif rule.subject_value == "*":
            rules.append(rule)

    # Priority desc, then longer (more specific) resource_pattern first
    rules.sort(key=lambda r: (r.priority, len(r.resource_pattern)), reverse=True)
    return rules


async def evaluate(session: AsyncSession, request: EvaluationRequest) -> EngineResult:
    start = time.perf_counter()

    agent_result = await session.exec(select(Agent).where(Agent.slug == request.agent_id))
    agent = agent_result.first()

    if agent is None:
        latency = (time.perf_counter() - start) * 1000
        return EngineResult(
            decision=Effect.DENY,
            reason=f"Unknown agent '{request.agent_id}'",
            matched_rule_id=None,
            rate_limited=False,
            latency_ms=latency,
        )

    if agent.status != AgentStatus.ACTIVE:
        latency = (time.perf_counter() - start) * 1000
        return EngineResult(
            decision=Effect.DENY,
            reason=f"Agent '{agent.slug}' is {agent.status.value}",
            matched_rule_id=None,
            rate_limited=False,
            latency_ms=latency,
        )

    user: Optional[User] = None
    if request.user_id:
        user = await session.get(User, request.user_id)

    candidate_rules = await _gather_candidate_rules(session, agent, user)

    matched_rule: Optional[Rule] = None
    for rule in candidate_rules:
        if rule.action.value != request.action:
            continue
        if rule.resource_type.value != request.resource_type:
            continue
        if not subject_matches(
            rule.subject_type.value, rule.subject_value, agent.slug, agent.owner_team,
            user.id if user else None, user.role.value if user else None,
        ):
            continue
        if not resource_matches(rule.resource_pattern, request.resource):
            continue
        if not condition_matches(rule.condition, request.metadata):
            continue
        matched_rule = rule
        break

    rate_limited = False
    if matched_rule and matched_rule.rate_limit_per_minute:
        rl_key = f"{agent.slug}:{matched_rule.id}"
        within_limit, _count = await check_rate_limit(rl_key, matched_rule.rate_limit_per_minute)
        if not within_limit:
            rate_limited = True

    if matched_rule is None:
        decision = Effect(settings.POLICY_DEFAULT_EFFECT)
        reason = (
            f"No matching rule for action='{request.action}' resource_type='{request.resource_type}' "
            f"resource='{request.resource}' — default policy is {settings.POLICY_DEFAULT_EFFECT}"
        )
        matched_rule_id = None
    elif rate_limited:
        decision = Effect.DENY
        reason = f"Rate limit exceeded for rule '{matched_rule.name}' ({matched_rule.rate_limit_per_minute}/min)"
        matched_rule_id = matched_rule.id
    else:
        decision = matched_rule.effect
        reason = matched_rule.description or f"Matched rule '{matched_rule.name}' -> {matched_rule.effect.value}"
        matched_rule_id = matched_rule.id

    latency_ms = (time.perf_counter() - start) * 1000
    return EngineResult(
        decision=decision,
        reason=reason,
        matched_rule_id=matched_rule_id,
        rate_limited=rate_limited,
        latency_ms=latency_ms,
    )


async def persist_decision(
    session: AsyncSession, request: EvaluationRequest, result: EngineResult
) -> AccessDecision:
    agent_result = await session.exec(select(Agent).where(Agent.slug == request.agent_id))
    agent = agent_result.first()

    access_decision = AccessDecision(
        agent_id=agent.id if agent else None,
        user_id=request.user_id,
        action_type=request.action,
        resource_type=request.resource_type,
        resource_identifier=request.resource,
        decision=result.decision,
        matched_rule_id=result.matched_rule_id,
        reason=result.reason,
        request_metadata=request.metadata,
        latency_ms=result.latency_ms,
    )
    session.add(access_decision)
    await session.commit()
    await session.refresh(access_decision)

    matched_rule_alerts = False
    if result.matched_rule_id:
        rule = await session.get(Rule, result.matched_rule_id)
        matched_rule_alerts = bool(rule and rule.alert_on_match)

    if result.decision == Effect.DENY or matched_rule_alerts:
        severity = ViolationSeverity.HIGH if result.decision == Effect.DENY else ViolationSeverity.LOW
        classification = (request.metadata or {}).get("classification")
        if classification in ("secret", "pii"):
            severity = ViolationSeverity.CRITICAL
        violation = Violation(
            agent_id=agent.id if agent else None,
            access_decision_id=access_decision.id,
            rule_id=result.matched_rule_id,
            severity=severity,
            summary=result.reason,
            details={
                "action": request.action,
                "resource_type": request.resource_type,
                "resource": request.resource,
                "metadata": request.metadata,
            },
        )
        session.add(violation)
        await session.commit()

    return access_decision
