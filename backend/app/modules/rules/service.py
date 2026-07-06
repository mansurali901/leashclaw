from fastapi import HTTPException, status
from sqlalchemy import update as sa_update, delete as sa_delete
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.db.models import AccessDecision, Policy, Rule, Violation
from app.modules.audit_logs.service import write_audit_log
from app.modules.rules.schemas import RuleCreate, RuleUpdate


async def create_rule(session: AsyncSession, payload: RuleCreate, actor_id: str) -> Rule:
    policy = await session.get(Policy, payload.policy_id)
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")

    rule = Rule(**payload.model_dump())
    session.add(rule)
    await session.commit()
    await session.refresh(rule)

    await write_audit_log(
        session, event_type="rule_created", actor_id=actor_id, actor_type="user",
        target_type="rule", target_id=rule.id, payload=payload.model_dump(mode="json"),
    )
    return rule


async def list_rules(
    session: AsyncSession, policy_id: str | None = None, skip: int = 0, limit: int = 200
) -> list[Rule]:
    query = select(Rule)
    if policy_id:
        query = query.where(Rule.policy_id == policy_id)
    query = query.order_by(Rule.priority.desc()).offset(skip).limit(limit)
    result = await session.exec(query)
    return result.all()


async def get_rule(session: AsyncSession, rule_id: str) -> Rule:
    rule = await session.get(Rule, rule_id)
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return rule


async def update_rule(session: AsyncSession, rule_id: str, payload: RuleUpdate, actor_id: str) -> Rule:
    rule = await get_rule(session, rule_id)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(rule, field, value)
    session.add(rule)
    await session.commit()
    await session.refresh(rule)

    await write_audit_log(
        session, event_type="rule_updated", actor_id=actor_id, actor_type="user",
        target_type="rule", target_id=rule.id, payload=update_data,
    )
    return rule


async def delete_rule(session: AsyncSession, rule_id: str, actor_id: str) -> None:
    # Verify the rule exists; raises 404 if not.
    await get_rule(session, rule_id)

    # Nullify FK references in audit rows before deleting.
    # Audit history is preserved; only the FK pointer is cleared.
    await session.execute(
        sa_update(AccessDecision)
        .where(AccessDecision.matched_rule_id == rule_id)
        .values(matched_rule_id=None)
    )
    await session.execute(
        sa_update(Violation)
        .where(Violation.rule_id == rule_id)
        .values(rule_id=None)
    )

    # Use Core-level delete to bypass ORM cascade handling (which would try
    # to NULL out rule.policy_id via the back-reference, hitting NOT NULL).
    await session.execute(sa_delete(Rule).where(Rule.id == rule_id))
    await session.commit()

    await write_audit_log(
        session, event_type="rule_deleted", actor_id=actor_id, actor_type="user",
        target_type="rule", target_id=rule_id, payload={},
    )
