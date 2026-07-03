from fastapi import APIRouter, Depends, Query
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.models import User
from app.db.session import get_session
from app.modules.audit_logs import service
from app.modules.audit_logs.schemas import AccessDecisionRead, AuditLogRead
from app.modules.auth.deps import require_auditor_or_above

router = APIRouter(prefix="/audit", tags=["audit_logs"])


@router.get("/logs", response_model=list[AuditLogRead])
async def list_audit_logs(
    event_type: str | None = Query(default=None),
    target_id: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, le=1000),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.list_audit_logs(session, event_type, target_id, skip, limit)


@router.get("/decisions", response_model=list[AccessDecisionRead])
async def list_access_decisions(
    agent_id: str | None = Query(default=None),
    decision: str | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, le=1000),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.list_access_decisions(session, agent_id, decision, resource_type, skip, limit)
