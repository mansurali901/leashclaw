from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.models import User, Violation
from app.db.session import get_session
from app.modules.auth.deps import require_admin, require_auditor_or_above
from app.modules.dashboard import service
from app.modules.dashboard.schemas import (
    PolicyHitRate,
    RecentViolation,
    ResourceAccessSummary,
    SummaryStats,
    TimeSeriesPoint,
    TopViolatingAgent,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=SummaryStats)
async def summary(
    hours: int | None = Query(default=None, description="Restrict to the last N hours; omit for all-time"),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    since = datetime.utcnow() - timedelta(hours=hours) if hours else None
    return await service.get_summary(session, since)


@router.get("/top-violating-agents", response_model=list[TopViolatingAgent])
async def top_violating_agents(
    limit: int = Query(default=10, le=100),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.get_top_violating_agents(session, limit)


@router.get("/resource-access-history", response_model=list[ResourceAccessSummary])
async def resource_access_history(
    limit: int = Query(default=20, le=200),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.get_resource_access_history(session, limit)


@router.get("/policy-hit-rate", response_model=list[PolicyHitRate])
async def policy_hit_rate(
    limit: int = Query(default=20, le=200),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.get_policy_hit_rates(session, limit)


@router.get("/recent-violations", response_model=list[RecentViolation])
async def recent_violations(
    limit: int = Query(default=25, le=200),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.get_recent_violations(session, limit)


@router.get("/timeseries", response_model=list[TimeSeriesPoint])
async def timeseries(
    hours: int = Query(default=24, le=24 * 30),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_auditor_or_above),
):
    return await service.get_time_series(session, hours)


@router.patch("/violations/{violation_id}/acknowledge", status_code=204)
async def acknowledge_violation(
    violation_id: str,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    violation = await session.get(Violation, violation_id)
    if not violation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Violation not found")
    violation.acknowledged = True
    violation.acknowledged_by = admin.id
    session.add(violation)
    await session.commit()
