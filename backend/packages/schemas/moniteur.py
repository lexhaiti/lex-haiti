"""Pydantic schemas for the Moniteur ingestion pipeline.

The pipeline has two main entities:

  - MoniteurIssue (the publication itself — date, number, PDF)
  - MoniteurEntry (one document/entry inside an issue)

Editor reviews entries and promotes normative ones to real `LegalText` rows.
See backend/services/ingestion/moniteur/ for the parser and promotion logic.
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
    director: Optional[str] = Field(
        default=None,
        description="Director of Le Moniteur for this issue.",
    )
    director_role: Optional[str] = Field(
        default=None,
        description=(
            "Director's institutional title (e.g. 'Major Forces Armées "
            "d'Haïti', 'Secrétaire d'État à la Communication') — what "
            "appears in parens after the director's name on the cover page."
        ),
    )


class MoniteurIssueCreate(MoniteurIssueBase):
    """POST /moniteur/issues body. PDF arrives separately via multipart upload."""

    pass


class MoniteurIssueUpdate(BaseModel):
    number: Optional[str] = None
    year: Optional[int] = Field(default=None, ge=1800, le=2200)
    publication_date: Optional[date] = None
    edition_label: Optional[str] = None
    director: Optional[str] = None
    director_role: Optional[str] = None


class SommaireEntry(BaseModel):
    """Lightweight summary of an entry for the list-page cards."""

    category: Optional[MoniteurDocumentType] = None
    # The loi / décret / arrêté number ("CL-007-09-09", "13-04", …).
    # Surfaced on the card so visitors can recognise an entry by its
    # identifier, and so the cross-entity search picks the issue up
    # when someone types the number in the homepage search bar.
    number: Optional[str] = None
    title: Optional[str] = None
    promoted_slug: Optional[str] = None


class MoniteurIssueRead(MoniteurIssueBase):
    """Response shape for a Moniteur issue."""

    id: int
    file_url: Optional[str] = None
    transcript_url: Optional[str] = None
    page_count: Optional[int] = None
    processing_status: MoniteurIssueStatus
    processing_error: Optional[str] = None

    uploaded_at: datetime
    parsed_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    entries_count: int = 0
    accepted_count: int = 0
    sommaire: List[SommaireEntry] = []

    model_config = ConfigDict(from_attributes=True)


class CompanionDocument(BaseModel):
    """One side-document attached to a translation entry (e.g. a
    promulgation letter or arrêté d'application that appears alongside
    the translated text in the companion Moniteur issue)."""

    kind: str  # e.g. "promulgation_letter", "decree_of_application"
    pages: Optional[str] = None  # free-text e.g. "1-3"
    note: Optional[str] = None


class MoniteurEntryRead(BaseModel):
    """One entry (document) inside a Moniteur issue."""

    id: int
    issue_id: int
    position: int

    detected_category: Optional[MoniteurDocumentType] = None
    detected_title: Optional[str] = None
    display_title: Optional[str] = None
    detected_number: Optional[str] = None
    detected_date: Optional[date] = None
    parent_entry_id: Optional[int] = None
    summary_fr: Optional[str] = None
    summary_ht: Optional[str] = None

    raw_text: str
    confidence: Optional[Decimal] = None
    page_from: Optional[int] = None
    page_to: Optional[int] = None

    review_status: MoniteurCandidateStatus
    promoted_legal_text_id: Optional[int] = None
    promoted_legal_text_slug: Optional[str] = None
    promoted_legal_text_title_fr: Optional[str] = None
    review_notes: Optional[str] = None
    reviewed_at: Optional[datetime] = None

    # Translation source — points to the companion (Kreyòl) Moniteur
    # issue when the HT version of this content is published separately.
    translation_issue_id: Optional[int] = None
    translation_issue_number: Optional[str] = None
    translation_issue_year: Optional[int] = None
    translation_detected_number: Optional[str] = None
    translation_title_ht: Optional[str] = None
    translation_page_from: Optional[int] = None
    translation_page_to: Optional[int] = None
    translation_summary_ht: Optional[str] = None
    companion_documents: Optional[List[CompanionDocument]] = None

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def model_validate(cls, obj, *args, **kwargs):  # type: ignore[override]
        result = super().model_validate(obj, *args, **kwargs)
        promoted = getattr(obj, "promoted_legal_text", None)
        if promoted is not None:
            result.promoted_legal_text_slug = getattr(promoted, "slug", None)
            result.promoted_legal_text_title_fr = getattr(
                promoted, "title_fr", None
            )
        # The translation_issue relationship is loaded if eager-loaded by
        # the repository; surface its number/year for the UI.
        trans = getattr(obj, "translation_issue", None)
        if trans is not None:
            result.translation_issue_number = getattr(trans, "number", None)
            result.translation_issue_year = getattr(trans, "year", None)
        return result


class MoniteurEntryTranslationUpdate(BaseModel):
    """Editor-supplied translation pointer for an entry. All fields
    optional — pass null to a field to clear it. Used by
    PATCH /editorial/moniteur/entries/{id}/translation."""

    translation_issue_id: Optional[int] = None
    translation_detected_number: Optional[str] = None
    translation_title_ht: Optional[str] = None
    translation_page_from: Optional[int] = None
    translation_page_to: Optional[int] = None
    translation_summary_ht: Optional[str] = None
    companion_documents: Optional[List[CompanionDocument]] = None


class MoniteurIssueWithEntries(MoniteurIssueRead):
    """Full review payload — issue + all its entries."""

    entries: List[MoniteurEntryRead] = []


class SommaireEntryInput(BaseModel):
    """One pre-filled sommaire entry, supplied by the editor at upload time.

    The Moniteur's front page always carries a sommaire — the editor knows
    the type, title, and page range of every document before OCR runs.
    Pre-filling these turns the parser's hardest job (boundary detection
    on noisy OCR) into a deterministic page-range slice. Each pre-filled
    entry becomes a `MoniteurEntry` row before parsing; the parser then
    fills `raw_text` from the OCR output for that entry's pages without
    inventing boundaries.

    All fields except the type and page range are optional — the parser
    will populate `detected_number` / `detected_date` from the OCR if the
    editor leaves them blank.
    """

    detected_category: MoniteurDocumentType
    detected_title: Optional[str] = None
    detected_number: Optional[str] = None
    page_from: int
    page_to: int


class TranscriptArticlePreview(BaseModel):
    """One article as the splitter would extract it from raw_text."""

    number: str
    body_preview: str  # first ~200 chars
    body_length: int


class TranscriptPreview(BaseModel):
    """Live preview of how the OCR transcript would be split into the
    structured legal blocks at promotion time. Lets editors validate
    their corrections (line breaks, marker placement) before promoting,
    instead of finding out the structure is off only after."""

    preamble: Optional[str] = None
    visas: Optional[str] = None
    considerants: Optional[str] = None
    enacting_formula: Optional[str] = None
    articles: List[TranscriptArticlePreview]


class TranscriptPreviewInput(BaseModel):
    """Optional override of the entry's stored raw_text for the preview
    endpoint. None means "preview against what's currently saved." """

    raw_text: Optional[str] = None


class SommaireBulkInput(BaseModel):
    """Wrapper for the sommaire endpoint — N entries at once.

    Replaces (not merges) any existing pending entries on the issue,
    matching the lifecycle of the heuristic parser which also clears
    pending entries before re-running.
    """

    entries: List[SommaireEntryInput]


class EntryReviewInput(BaseModel):
    """Editor input for an entry review.

    Two use cases share this shape:
      1. **Status change** (accept / reject / defer) — set `review_status`,
         optionally override the detected fields at the same time.
      2. **Field correction only** — leave `review_status` unset, supply
         only the `detected_*` fields the editor wants to fix.
    """

    review_status: Optional[MoniteurCandidateStatus] = None
    detected_category: Optional[MoniteurDocumentType] = None
    detected_title: Optional[str] = None
    display_title: Optional[str] = None
    detected_number: Optional[str] = None
    detected_date: Optional[date] = None
    parent_entry_id: Optional[int] = None
    summary_fr: Optional[str] = None
    summary_ht: Optional[str] = None
    review_notes: Optional[str] = None
    # Editor's hand-corrected transcription. Sent when the editor saves
    # changes to the OCR text in the review page's edit mode. None means
    # "no change" — distinct from "" which would clear the field.
    raw_text: Optional[str] = None
