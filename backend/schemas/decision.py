from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from schemas.enums import CourtType, EditorialStatus


class DecisionBase(BaseModel):
    slug: str
    court: CourtType
    chamber: Optional[str] = None
    formation: Optional[str] = None
    case_number: Optional[str] = None
    decision_date: date
    parties_anonymized: bool = True

    summary_fr: Optional[str] = None
    summary_ht: Optional[str] = None
    headnotes_fr: Optional[str] = None
    headnotes_ht: Optional[str] = None
    full_text_fr: Optional[str] = None
    full_text_ht: Optional[str] = None
    outcome: Optional[str] = None

    editorial_status: EditorialStatus = EditorialStatus.draft


class DecisionCreate(DecisionBase):
    pass


class DecisionListItem(BaseModel):
    id: int
    slug: str
    court: CourtType
    chamber: Optional[str] = None
    case_number: Optional[str] = None
    decision_date: date
    summary_fr: Optional[str] = None
    summary_ht: Optional[str] = None
    outcome: Optional[str] = None
    editorial_status: EditorialStatus

    model_config = ConfigDict(from_attributes=True)


class DecisionRead(DecisionBase):
    id: int
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
