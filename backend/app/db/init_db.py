"""
Dev/test convenience for schema creation. In production, Alembic
migrations (see /backend/alembic) are the source of truth for schema
changes — this is only invoked directly in local dev / CI / seed scripts.
"""
from sqlmodel import SQLModel

from app.db.session import engine


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
