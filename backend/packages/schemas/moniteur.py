"""Pydantic schemas for the Moniteur ingestion pipeline.

The pipeline has two main entities:

  - MoniteurIssue (the publication itself — date, number, PDF)
  - MoniteurLawCandidate (parser output — one suspected law per row)

Editor reviews candidates and promotes them to real `LegalText` rows.
See backend/services/ingestion/moniteur/ for the parser and promotion
logic.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from packages.schemas.enums import (
    LegalCategory,
    MoniteurCandidateStatus,
    MoniteurDocumentType,
    MoniteurIssueStatus,
)


class MoniteurIssueBase(BaseModel):
    """Editor-supplied metadata for a Moniteur issue."""

    number: str = Field(..., description='e.g. "47" or "47-bis"')
    year: int = Field(..., ge=1800, le=2200)
    publication_date: Optional[date] = None
    edition_label: Optional[str] = Field(
        default=None,
        description='Optional sub-label, e.g. "Numéro spécial", "Bis".',
    )


class MoniteurIssueCreate(MoniteurIssueBase):
    """POST /moniteur/issues body. PDF arrives separately via multipart upload."""

    pass


class MoniteurIssueUpdate(BaseModel):
    number: Optional[str] = None
    year: Optional[int] = Field(default=None, ge=1800, le=2200)
    publication_date: Optional[date] = None
    edition_label: Optional[str] = None


class SommaireEntry(BaseModel):
    """Lightweight summary of a candidate for the list-page cards."""

    category: Optional[MoniteurDocumentType] = None
    title: Optional[str] = None
    promoted_slug: Optional[str] = None


class MoniteurIssueRead(MoniteurIssueBase):
    """Response shape for a Moniteur issue."""

    id: int
    file_url: Optional[str] = None
    page_count: Optional[int] = None
    processing_status: MoniteurIssueStatus
    processing_error: Optional[str] = None

    uploaded_at: datetime
    parsed_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    candidates_count: int = 0
    accepted_count: int = 0
    sommaire: List[SommaireEntry] = []

    model_config = ConfigDict(from_attributes=True)


class MoniteurLawCandidateRead(BaseModel):
    """Parser output — one suspected law inside an issue."""

    id: int
    issue_id: int
    position: int

    detected_category: Optional[MoniteurDocumentType] = None
    detected_title: Optional[str] = None
    display_title: Optional[str] = None
    detected_number: Optional[str] = None
    detected_date: Optional[date] = None
    parent_candidate_id: Optional[int] = None

    raw_text: str
    confidence: Optional[Decimal] = None
    page_from: Optional[int] = None
    page_to: Optional[int] = None

    review_status: MoniteurCandidateStatus
    promoted_legal_text_id: Optional[int] = None
    # Pre-resolved slug of the promoted LegalText so the editor UI can build
    # a /loi/{slug} permalink without an extra round-trip. Null until the
    # candidate is accepted and promoted.
    promoted_legal_text_slug: Optional[str] = None
    promoted_legal_text_title_fr: Optional[str] = None
    review_notes: Optional[str] = None
    reviewed_at: Optional[datetime] = None

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def model_validate(cls, obj, *args, **kwargs):  # type: ignore[override]
        # Promote the relationship's slug + title up into the flat shape.
        # Pydantic's from_attributes mode pulls them from `obj.promoted_legal_text_slug`
        # automatically — but the relationship attribute is named
        # `promoted_legal_text`, not `_slug` / `_title_fr`. So we read the
        # related row ourselves and patch the result post-validation.
        result = super().model_validate(obj, *args, **kwargs)
        promoted = getattr(obj, "promoted_legal_text", None)
        if promoted is not None:
            result.promoted_legal_text_slug = getattr(promoted, "slug", None)
            result.promoted_legal_text_title_fr = getattr(
                promoted, "title_fr", None
            )
        return result


class MoniteurIssueWithCandidates(MoniteurIssueRead):
    """Full review payload — issue + all its candidates."""

    candidates: List[MoniteurLawCandidateRead] = []


class CandidateReviewInput(BaseModel):
    """Editor input for a candidate.

    Two use cases share this shape:
      1. **Status change** (accept / reject / defer) — set `review_status`,
         optionally override the detected fields at the same time.
      2. **Field correction only** — leave `review_status` unset, supply
         only the `detected_*` fields the editor wants to fix. Used by the
         "Edit fields" inline editor on the review page so the editor can
         clean up parser noise (typos, wrong category) before promoting.
    """

    review_status: Optional[MoniteurCandidateStatus] = None
    detected_category: Optional[MoniteurDocumentType] = None
    detected_title: Optional[str] = None
    display_title: Optional[str] = None
    detected_number: Optional[str] = None
    detected_date: Optional[date] = None
    parent_candidate_id: Optional[int] = None
    review_notes: Optional[str] = None
