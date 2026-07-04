from fastapi import HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.core.security import generate_agent_api_key
from app.db.models import Agent, AgentPolicyLink, AgentStatus, Policy
from app.modules.agents.schemas import AgentCreate, AgentUpdate
from app.modules.audit_logs.service import write_audit_log


async def create_agent(session: AsyncSession, payload: AgentCreate, created_by: str) -> tuple[Agent, str]:
    existing = await session.exec(select(Agent).where(Agent.slug == payload.slug))
    if existing.first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Agent slug already exists")

    raw_key, key_hash = generate_agent_api_key()
    agent = Agent(
        slug=payload.slug,
        name=payload.name,
        description=payload.description,
        owner_team=payload.owner_team,
        tags=payload.tags,
        metadata_json=payload.metadata_json,
        sandbox_profile_id=payload.sandbox_profile_id,
        api_key_hash=key_hash,
        api_key_prefix=raw_key[:12],
        created_by=created_by,
    )
    session.add(agent)
    await session.commit()
    await session.refresh(agent)

    await write_audit_log(
        session, event_type="agent_created", actor_id=created_by, actor_type="user",
        target_type="agent", target_id=agent.id, payload={"slug": agent.slug},
    )
    return agent, raw_key


async def list_agents(session: AsyncSession, skip: int = 0, limit: int = 100) -> list[Agent]:
    result = await session.exec(select(Agent).offset(skip).limit(limit).order_by(Agent.created_at.desc()))
    return result.all()


async def get_agent(session: AsyncSession, agent_id: str) -> Agent:
    agent = await session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent


async def update_agent(session: AsyncSession, agent_id: str, payload: AgentUpdate, actor_id: str) -> Agent:
    agent = await get_agent(session, agent_id)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(agent, field, value)
    session.add(agent)
    await session.commit()
    await session.refresh(agent)

    await write_audit_log(
        session, event_type="agent_updated", actor_id=actor_id, actor_type="user",
        target_type="agent", target_id=agent.id, payload=update_data,
    )
    return agent


async def rotate_agent_key(session: AsyncSession, agent_id: str, actor_id: str) -> tuple[Agent, str]:
    agent = await get_agent(session, agent_id)
    raw_key, key_hash = generate_agent_api_key()
    agent.api_key_hash = key_hash
    agent.api_key_prefix = raw_key[:12]
    session.add(agent)
    await session.commit()
    await session.refresh(agent)

    await write_audit_log(
        session, event_type="agent_key_rotated", actor_id=actor_id, actor_type="user",
        target_type="agent", target_id=agent.id, payload={},
    )
    return agent, raw_key


async def assign_policy(session: AsyncSession, agent_id: str, policy_id: str, actor_id: str) -> AgentPolicyLink:
    agent = await get_agent(session, agent_id)
    policy = await session.get(Policy, policy_id)
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")

    existing = await session.exec(
        select(AgentPolicyLink).where(
            AgentPolicyLink.agent_id == agent.id, AgentPolicyLink.policy_id == policy.id
        )
    )
    if existing.first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Policy already assigned to agent")

    link = AgentPolicyLink(agent_id=agent.id, policy_id=policy.id)
    session.add(link)
    await session.commit()
    await session.refresh(link)

    await write_audit_log(
        session, event_type="policy_assigned", actor_id=actor_id, actor_type="user",
        target_type="agent", target_id=agent.id, payload={"policy_id": policy.id},
    )
    return link


async def unassign_policy(session: AsyncSession, agent_id: str, policy_id: str, actor_id: str) -> None:
    result = await session.exec(
        select(AgentPolicyLink).where(
            AgentPolicyLink.agent_id == agent_id, AgentPolicyLink.policy_id == policy_id
        )
    )
    link = result.first()
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    await session.delete(link)
    await session.commit()

    await write_audit_log(
        session, event_type="policy_unassigned", actor_id=actor_id, actor_type="user",
        target_type="agent", target_id=agent_id, payload={"policy_id": policy_id},
    )


async def list_agent_policies(session: AsyncSession, agent_id: str) -> list[Policy]:
    result = await session.exec(
        select(Policy)
        .join(AgentPolicyLink, AgentPolicyLink.policy_id == Policy.id)
        .where(AgentPolicyLink.agent_id == agent_id)
    )
    return result.all()
