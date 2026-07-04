from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from app.db.models import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    role: UserRole = UserRole.VIEWER
    team: Optional[str] = None


class UserRead(BaseModel):
    id: str
    email: str
    full_name: str
    role: UserRole
    team: Optional[str]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserRead


class RefreshRequest(BaseModel):
    refresh_token: str
