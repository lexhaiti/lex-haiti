"""LegalChange schemas — amendment graph table.

One row per "this amending act touched this article" fact. Read /
Create shapes used by the editorial UI and the future amendment-graph
APIs (``GET /loi/{slug}/amended-by``, ``GET /loi/{slug}/amends``).
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from .enums import ChangeKind


class LegalChangeBase(BaseModel):
    amending_text_id: int
    amended_text_id: int
    amended_article_id: Optional[int] = None
    new_version_id: Optional[int] = None
    change_kind: ChangeKind
    effective_on: Optional[date] = None
    text_fr: Optional[str] = None
    text_ht: Optional[str] = None


class LegalChangeCreate(LegalChangeBase):
    pass


class LegalChangeRead(LegalChangeBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
