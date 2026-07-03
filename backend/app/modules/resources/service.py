from fastapi import HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.db.models import Resource
from app.modules.resources.schemas import ResourceCreate


async def create_resource(session: AsyncSession, payload: ResourceCreate) -> Resource:
    resource = Resource(**payload.model_dump())
    session.add(resource)
    await session.commit()
    await session.refresh(resource)
    return resource


async def list_resources(
    session: AsyncSession, resource_type: str | None = None, skip: int = 0, limit: int = 200
) -> list[Resource]:
    query = select(Resource)
    if resource_type:
        query = query.where(Resource.resource_type == resource_type)
    query = query.offset(skip).limit(limit).order_by(Resource.created_at.desc())
    result = await session.exec(query)
    return result.all()


async def get_resource(session: AsyncSession, resource_id: str) -> Resource:
    resource = await session.get(Resource, resource_id)
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
    return resource


async def delete_resource(session: AsyncSession, resource_id: str) -> None:
    resource = await get_resource(session, resource_id)
    await session.delete(resource)
    await session.commit()
