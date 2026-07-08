from typing import Optional
from pydantic import BaseModel


class GraphNode(BaseModel):
    id: str
    label: str
    type: str                    # "root" | "agent" | "resource_type" | "resource"
    allow_count: int = 0
    deny_count: int = 0
    total_count: int = 0
    actions: list[str] = []
    last_seen: Optional[str] = None
    children: list["GraphNode"] = []


GraphNode.model_rebuild()


class AccessGraphResponse(BaseModel):
    nodes: list[GraphNode]       # top-level agent nodes
    total_decisions: int
    agents_count: int
