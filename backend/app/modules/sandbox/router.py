from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.models import User
from app.db.session import get_session
from app.modules.auth.deps import require_admin, require_auditor_or_above
from app.modules.sandbox import service
from app.modules.sandbox.schemas import SandboxProfileCreate, SandboxProfileRead, SandboxProfileUpdate

router = APIRouter(prefix="/sandbox-profiles", tags=["sandbox"])


@router.post("", response_model=SandboxProfileRead, status_code=201)
async def create_profile(
    payload: SandboxProfileCreate,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    return await service.create_profile(session, payload)


@router.get("", response_model=list[SandboxProfileRead])
async def list_profiles(
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.list_profiles(session)


@router.get("/{profile_id}", response_model=SandboxProfileRead)
async def get_profile(
    profile_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.get_profile(session, profile_id)


@router.patch("/{profile_id}", response_model=SandboxProfileRead)
async def update_profile(
    profile_id: str,
    payload: SandboxProfileUpdate,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    return await service.update_profile(session, profile_id, payload)


@router.delete("/{profile_id}", status_code=204)
async def delete_profile(
    profile_id: str,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    await service.delete_profile(session, profile_id)
