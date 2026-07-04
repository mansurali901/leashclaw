from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.models import User
from app.db.session import get_session
from app.modules.auth.deps import get_current_user, require_admin
from app.modules.auth.schemas import LoginRequest, RefreshRequest, TokenResponse, UserCreate, UserRead
from app.modules.auth.service import authenticate_user, refresh_access_token, register_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserRead, status_code=201)
async def register(
    payload: UserCreate,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """Only existing admins can provision new dashboard users."""
    return await register_user(session, payload)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, session: AsyncSession = Depends(get_session)):
    return await authenticate_user(session, payload)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, session: AsyncSession = Depends(get_session)):
    return await refresh_access_token(session, payload.refresh_token)


@router.get("/me", response_model=UserRead)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
