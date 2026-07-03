from fastapi import APIRouter, Depends, Query
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.models import User
from app.db.session import get_session
from app.modules.agents import service
from app.modules.agents.schemas import AgentCreate, AgentCreateResponse, AgentRead, AgentUpdate, PolicyAssignment
from app.modules.auth.deps import require_admin, require_auditor_or_above
from app.modules.policies.schemas import PolicyRead

router = APIRouter(prefix="/agents", tags=["agents"])


@router.post("", response_model=AgentCreateResponse, status_code=201)
async def create_agent(
    payload: AgentCreate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    agent, raw_key = await service.create_agent(session, payload, created_by=admin.id)
    return AgentCreateResponse(**agent.model_dump(), api_key=raw_key)


@router.get("", response_model=list[AgentRead])
async def list_agents(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, le=500),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.list_agents(session, skip, limit)


@router.get("/{agent_id}", response_model=AgentRead)
async def get_agent(
    agent_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.get_agent(session, agent_id)


@router.patch("/{agent_id}", response_model=AgentRead)
async def update_agent(
    agent_id: str,
    payload: AgentUpdate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    return await service.update_agent(session, agent_id, payload, actor_id=admin.id)


@router.post("/{agent_id}/rotate-key", response_model=AgentCreateResponse)
async def rotate_key(
    agent_id: str,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    agent, raw_key = await service.rotate_agent_key(session, agent_id, actor_id=admin.id)
    return AgentCreateResponse(**agent.model_dump(), api_key=raw_key)


@router.post("/{agent_id}/policies", status_code=201)
async def assign_policy(
    agent_id: str,
    payload: PolicyAssignment,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    link = await service.assign_policy(session, agent_id, payload.policy_id, actor_id=admin.id)
    return {"id": link.id, "agent_id": link.agent_id, "policy_id": link.policy_id}


@router.delete("/{agent_id}/policies/{policy_id}", status_code=204)
async def unassign_policy(
    agent_id: str,
    policy_id: str,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    await service.unassign_policy(session, agent_id, policy_id, actor_id=admin.id)


@router.get("/{agent_id}/policies", response_model=list[PolicyRead])
async def list_agent_policies(
    agent_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.list_agent_policies(session, agent_id)
