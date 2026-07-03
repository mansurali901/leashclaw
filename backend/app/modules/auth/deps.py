from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.core.security import decode_token, verify_api_key
from app.db.models import Agent, AgentStatus, User, UserRole
from app.db.session import get_session

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_exception
        user_id: str = payload.get("sub")
        if not user_id:
            raise credentials_exception
    except ValueError:
        raise credentials_exception

    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise credentials_exception
    return user


def require_roles(*roles: UserRole):
    async def _checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {[r.value for r in roles]}",
            )
        return user

    return _checker


require_admin = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
require_auditor_or_above = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AUDITOR)


async def get_agent_from_api_key(
    x_agent_api_key: Optional[str] = Header(default=None, alias="X-Agent-Api-Key"),
    session: AsyncSession = Depends(get_session),
) -> Agent:
    """
    Authenticates an external agent (e.g. an OpenClaw/Hermes-integrated
    agent) calling the enforcement API directly via a service API key.
    """
    if not x_agent_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing X-Agent-Api-Key header")

    prefix = x_agent_api_key[:12]
    result = await session.exec(
        select(Agent).where(Agent.api_key_prefix == prefix, Agent.status != AgentStatus.DECOMMISSIONED)
    )
    candidates = result.all()
    for agent in candidates:
        if verify_api_key(x_agent_api_key, agent.api_key_hash):
            if agent.status == AgentStatus.SUSPENDED:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Agent is suspended")
            return agent
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid agent API key")
