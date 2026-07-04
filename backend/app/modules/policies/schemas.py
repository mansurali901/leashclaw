from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class PolicyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    enabled: bool = True


class PolicyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None


class PolicyRead(BaseModel):
    id: str
    name: str
    description: Optional[str]
    version: int
    enabled: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
