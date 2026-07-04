"""
Append-only audit logging service. Every write here is immutable in
practice: no update/delete endpoints are exposed for AuditLog or
AccessDecision rows, satisfying compliance/tamper-evidence requirements.
"""
from typing import Optional

from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.db.models import AccessDecision, AuditLog


async def write_audit_log(
    session: AsyncSession,
    event_type: str,
    actor_id: Optional[str],
    actor_type: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    payload: Optional[dict] = None,
    ip_address: Optional[str] = None,
) -> AuditLog:
    entry = AuditLog(
        event_type=event_type,
        actor_id=actor_id,
        actor_type=actor_type,
        target_type=target_type,
        target_id=target_id,
        payload=payload or {},
        ip_address=ip_address,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


async def list_audit_logs(
    session: AsyncSession,
    event_type: Optional[str] = None,
    target_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[AuditLog]:
    query = select(AuditLog)
    if event_type:
        query = query.where(AuditLog.event_type == event_type)
    if target_id:
        query = query.where(AuditLog.target_id == target_id)
    query = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
    result = await session.exec(query)
    return result.all()


async def list_access_decisions(
    session: AsyncSession,
    agent_id: Optional[str] = None,
    decision: Optional[str] = None,
    resource_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[AccessDecision]:
    query = select(AccessDecision)
    if agent_id:
        query = query.where(AccessDecision.agent_id == agent_id)
    if decision:
        query = query.where(AccessDecision.decision == decision)
    if resource_type:
        query = query.where(AccessDecision.resource_type == resource_type)
    query = query.order_by(AccessDecision.created_at.desc()).offset(skip).limit(limit)
    result = await session.exec(query)
    return result.all()
