from fastapi import HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.db.models import Policy
from app.modules.audit_logs.service import write_audit_log
from app.modules.policies.schemas import PolicyCreate, PolicyUpdate


async def create_policy(session: AsyncSession, payload: PolicyCreate, actor_id: str) -> Policy:
    existing = await session.exec(select(Policy).where(Policy.name == payload.name))
    if existing.first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Policy name already exists")

    policy = Policy(name=payload.name, description=payload.description, enabled=payload.enabled, created_by=actor_id)
    session.add(policy)
    await session.commit()
    await session.refresh(policy)

    await write_audit_log(
        session, event_type="policy_created", actor_id=actor_id, actor_type="user",
        target_type="policy", target_id=policy.id, payload={"name": policy.name},
    )
    return policy


async def list_policies(session: AsyncSession, skip: int = 0, limit: int = 100) -> list[Policy]:
    result = await session.exec(select(Policy).offset(skip).limit(limit).order_by(Policy.created_at.desc()))
    return result.all()


async def get_policy(session: AsyncSession, policy_id: str) -> Policy:
    policy = await session.get(Policy, policy_id)
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")
    return policy


async def update_policy(session: AsyncSession, policy_id: str, payload: PolicyUpdate, actor_id: str) -> Policy:
    policy = await get_policy(session, policy_id)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(policy, field, value)
    policy.version += 1
    session.add(policy)
    await session.commit()
    await session.refresh(policy)

    await write_audit_log(
        session, event_type="policy_updated", actor_id=actor_id, actor_type="user",
        target_type="policy", target_id=policy.id, payload=update_data,
    )
    return policy


async def delete_policy(session: AsyncSession, policy_id: str, actor_id: str) -> None:
    policy = await get_policy(session, policy_id)
    await session.delete(policy)
    await session.commit()

    await write_audit_log(
        session, event_type="policy_deleted", actor_id=actor_id, actor_type="user",
        target_type="policy", target_id=policy_id, payload={},
    )
