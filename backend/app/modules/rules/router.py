from fastapi import APIRouter, Depends, Query
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.models import User
from app.db.session import get_session
from app.modules.auth.deps import require_admin, require_auditor_or_above
from app.modules.rules import service
from app.modules.rules.schemas import RuleCreate, RuleRead, RuleUpdate

router = APIRouter(prefix="/rules", tags=["rules"])


@router.post("", response_model=RuleRead, status_code=201)
async def create_rule(
    payload: RuleCreate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    return await service.create_rule(session, payload, actor_id=admin.id)


@router.get("", response_model=list[RuleRead])
async def list_rules(
    policy_id: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=200, le=1000),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.list_rules(session, policy_id, skip, limit)


@router.get("/{rule_id}", response_model=RuleRead)
async def get_rule(
    rule_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.get_rule(session, rule_id)


@router.patch("/{rule_id}", response_model=RuleRead)
async def update_rule(
    rule_id: str,
    payload: RuleUpdate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    return await service.update_rule(session, rule_id, payload, actor_id=admin.id)


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: str,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    await service.delete_rule(session, rule_id, actor_id=admin.id)
