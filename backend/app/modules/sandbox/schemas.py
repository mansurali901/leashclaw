from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class SandboxProfileCreate(BaseModel):
    name: str
    description: Optional[str] = None
    cpu_limit_cores: float = Field(default=1.0, gt=0)
    memory_limit_mb: int = Field(default=512, gt=0)
    timeout_seconds: int = Field(default=30, gt=0)
    network_access: bool = False
    allowed_locations: list[str] = Field(default_factory=list)
    max_concurrent_executions: int = Field(default=1, gt=0)


class SandboxProfileUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    cpu_limit_cores: Optional[float] = Field(default=None, gt=0)
    memory_limit_mb: Optional[int] = Field(default=None, gt=0)
    timeout_seconds: Optional[int] = Field(default=None, gt=0)
    network_access: Optional[bool] = None
    allowed_locations: Optional[list[str]] = None
    max_concurrent_executions: Optional[int] = Field(default=None, gt=0)


class SandboxProfileRead(BaseModel):
    id: str
    name: str
    description: Optional[str]
    cpu_limit_cores: float
    memory_limit_mb: int
    timeout_seconds: int
    network_access: bool
    allowed_locations: list[str]
    max_concurrent_executions: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
