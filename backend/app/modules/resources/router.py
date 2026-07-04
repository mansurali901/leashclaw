from fastapi import APIRouter, Depends, Query
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.models import User
from app.db.session import get_session
from app.modules.auth.deps import require_admin, require_auditor_or_above
from app.modules.resources import service
from app.modules.resources.schemas import ResourceCreate, ResourceRead

router = APIRouter(prefix="/resources", tags=["resources"])


@router.post("", response_model=ResourceRead, status_code=201)
async def create_resource(
    payload: ResourceCreate,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    return await service.create_resource(session, payload)


@router.get("", response_model=list[ResourceRead])
async def list_resources(
    resource_type: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=200, le=1000),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.list_resources(session, resource_type, skip, limit)


@router.get("/{resource_id}", response_model=ResourceRead)
async def get_resource(
    resource_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.get_resource(session, resource_id)


@router.delete("/{resource_id}", status_code=204)
async def delete_resource(
    resource_id: str,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    await service.delete_resource(session, resource_id)
