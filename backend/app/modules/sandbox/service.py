from fastapi import HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.db.models import SandboxProfile
from app.modules.sandbox.schemas import SandboxProfileCreate, SandboxProfileUpdate


async def create_profile(session: AsyncSession, payload: SandboxProfileCreate) -> SandboxProfile:
    existing = await session.exec(select(SandboxProfile).where(SandboxProfile.name == payload.name))
    if existing.first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sandbox profile name already exists")
    profile = SandboxProfile(**payload.model_dump())
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return profile


async def list_profiles(session: AsyncSession) -> list[SandboxProfile]:
    result = await session.exec(select(SandboxProfile).order_by(SandboxProfile.created_at.desc()))
    return result.all()


async def get_profile(session: AsyncSession, profile_id: str) -> SandboxProfile:
    profile = await session.get(SandboxProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sandbox profile not found")
    return profile


async def update_profile(session: AsyncSession, profile_id: str, payload: SandboxProfileUpdate) -> SandboxProfile:
    profile = await get_profile(session, profile_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return profile


async def delete_profile(session: AsyncSession, profile_id: str) -> None:
    profile = await get_profile(session, profile_id)
    await session.delete(profile)
    await session.commit()
