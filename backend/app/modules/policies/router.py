from fastapi import APIRouter, Depends, Query
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.models import User
from app.db.session import get_session
from app.modules.auth.deps import require_admin, require_auditor_or_above
from app.modules.policies import service
from app.modules.policies.schemas import PolicyCreate, PolicyRead, PolicyUpdate

router = APIRouter(prefix="/policies", tags=["policies"])


@router.post("", response_model=PolicyRead, status_code=201)
async def create_policy(
    payload: PolicyCreate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    return await service.create_policy(session, payload, actor_id=admin.id)


@router.get("", response_model=list[PolicyRead])
async def list_policies(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, le=500),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.list_policies(session, skip, limit)


@router.get("/{policy_id}", response_model=PolicyRead)
async def get_policy(
    policy_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.get_policy(session, policy_id)


@router.patch("/{policy_id}", response_model=PolicyRead)
async def update_policy(
    policy_id: str,
    payload: PolicyUpdate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    return await service.update_policy(session, policy_id, payload, actor_id=admin.id)


@router.delete("/{policy_id}", status_code=204)
async def delete_policy(
    policy_id: str,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    await service.delete_policy(session, policy_id, actor_id=admin.id)
