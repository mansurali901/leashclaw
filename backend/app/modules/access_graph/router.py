from fastapi import APIRouter, Depends, Query
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.models import User
from app.db.session import get_session
from app.modules.auth.deps import require_auditor_or_above
from app.modules.access_graph import service
from app.modules.access_graph.schemas import AccessGraphResponse

router = APIRouter(prefix="/access-graph", tags=["access-graph"])


@router.get("", response_model=AccessGraphResponse)
async def get_access_graph(
    agent_slug: str | None = Query(default=None, description="Filter to a specific agent slug"),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.get_access_graph(session, agent_slug)
