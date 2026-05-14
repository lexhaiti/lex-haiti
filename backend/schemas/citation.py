from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from schemas.enums import (
    CitationNodeType,
    CitationRelation,
    EditorialStatus,
    ExtractionMethod,
)


class CitationBase(BaseModel):
    source_node_type: CitationNodeType
    source_node_id: int
    target_node_type: CitationNodeType
    target_node_id: int
    relation: CitationRelation
    source_paragraph: Optional[str] = None
    confidence: Optional[Decimal] = Field(default=None, ge=0, le=1)
    extraction_method: Optional[ExtractionMethod] = None
    validated_by: Optional[str] = None
    editorial_status: EditorialStatus = EditorialStatus.draft


class CitationCreate(CitationBase):
    pass


class CitationRead(CitationBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
