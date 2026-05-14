"""Authority + role-assignment schemas.

Read / Create / Write / Ref shapes for the normalised Authority entity.
``Ref`` is the inlined shape returned alongside ``LegalText`` and
``Promulgation`` so the frontend doesn't need a second fetch.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from .enums import AuthorityType


class AuthorityRef(BaseModel):
    """Inlined Authority pointer — what the public API returns embedded
    inside LegalText / Promulgation / LegalSigner reads."""

    id: int
    code: Optional[str] = None
    name_fr: str
    name_ht: Optional[str] = None
    short_name: Optional[str] = None
    authority_type: AuthorityType

    model_config = ConfigDict(from_attributes=True)


class AuthorityRead(AuthorityRef):
    parent_id: Optional[int] = None
    founded_on: Optional[date] = None
    dissolved_on: Optional[date] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AuthorityCreate(BaseModel):
    code: Optional[str] = None
    name_fr: str = Field(..., min_length=1, max_length=255)
    name_ht: Optional[str] = Field(default=None, max_length=255)
    short_name: Optional[str] = Field(default=None, max_length=100)
    authority_type: AuthorityType
    parent_id: Optional[int] = None
    founded_on: Optional[date] = None
    dissolved_on: Optional[date] = None
    notes: Optional[str] = None


class AuthorityUpdate(BaseModel):
    code: Optional[str] = None
    name_fr: Optional[str] = None
    name_ht: Optional[str] = None
    short_name: Optional[str] = None
    authority_type: Optional[AuthorityType] = None
    parent_id: Optional[int] = None
    founded_on: Optional[date] = None
    dissolved_on: Optional[date] = None
    notes: Optional[str] = None


class AuthorityRoleAssignmentRead(BaseModel):
    id: int
    authority_id: int
    person_name: str
    role_title_fr: str
    role_title_ht: Optional[str] = None
    started_on: Optional[date] = None
    ended_on: Optional[date] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuthorityResolution(BaseModel):
    """Output of ``authority_service.resolve_text(free_text)`` — used by
    the editorial UI to confirm or override the auto-match before
    committing an import draft."""

    match_kind: str  # 'exact' | 'trigram' | 'llm' | 'none'
    confidence: float
    authority: Optional[AuthorityRef] = None
    candidates: List[AuthorityRef] = []
