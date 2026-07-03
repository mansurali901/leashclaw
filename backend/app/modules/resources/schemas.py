from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.db.models import DataClassification, ResourceType


class ResourceCreate(BaseModel):
    resource_type: ResourceType
    identifier: str
    classification: DataClassification = DataClassification.INTERNAL
    owner_team: Optional[str] = None
    description: Optional[str] = None


class ResourceRead(BaseModel):
    id: str
    resource_type: ResourceType
    identifier: str
    classification: DataClassification
    owner_team: Optional[str]
    description: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
