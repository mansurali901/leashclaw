from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import get_settings
from app.db.models import SystemSettings, User, utcnow
from app.db.session import get_session
from app.modules.auth.deps import get_current_user, require_admin
from app.modules.settings.schemas import EngineSettingsRead, EngineSettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])

_cfg = get_settings()


async def _get_db_setting(session: AsyncSession, key: str) -> str | None:
    row = await session.get(SystemSettings, key)
    return row.value if row else None


@router.get("/engine", response_model=EngineSettingsRead)
async def get_engine_settings(
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
):
    """Return current engine settings (DB overrides merged with env defaults)."""
    default_effect = await _get_db_setting(session, "default_effect") or _cfg.POLICY_DEFAULT_EFFECT
    return EngineSettingsRead(
        default_effect=default_effect,
        policy_engine_backend=_cfg.POLICY_ENGINE_BACKEND,
        default_rate_limit_per_minute=_cfg.DEFAULT_RATE_LIMIT_PER_MINUTE,
        opa_url=_cfg.OPA_URL,
    )


@router.patch("/engine", response_model=EngineSettingsRead)
async def update_engine_settings(
    payload: EngineSettingsUpdate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Update runtime engine settings. Requires admin role."""
    try:
        payload.validate_effect()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    if payload.default_effect is not None:
        existing = await session.get(SystemSettings, "default_effect")
        if existing:
            existing.value = payload.default_effect
            existing.updated_by = admin.id
            existing.updated_at = utcnow()
            session.add(existing)
        else:
            session.add(SystemSettings(key="default_effect", value=payload.default_effect, updated_by=admin.id))
        await session.commit()

    default_effect = await _get_db_setting(session, "default_effect") or _cfg.POLICY_DEFAULT_EFFECT
    return EngineSettingsRead(
        default_effect=default_effect,
        policy_engine_backend=_cfg.POLICY_ENGINE_BACKEND,
        default_rate_limit_per_minute=_cfg.DEFAULT_RATE_LIMIT_PER_MINUTE,
        opa_url=_cfg.OPA_URL,
    )
