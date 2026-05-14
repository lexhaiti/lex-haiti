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
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from schemas.article import ArticleCreate
from schemas.enums import (
    CodeSubcategory,
    LegalCategory,
    LegalStatus,
    MoniteurCandidateStatus,
    MoniteurDocumentType,
    MoniteurIssueStatus,
    ParserProfile,
)
from schemas.heading import LegalHeadingCreate
from schemas.signer import LegalSignerCreate


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
    # Human-friendly URL slug derived from publication_date — used by the
    # public detail route ``/moniteur/{slug}``. Always returned by the
    # API; the legacy numeric ID still works as a permalink. None when
    # publication_date is null (rare — only happens for half-imported
    # issues mid-editorial-review).
    slug: Optional[str] = None
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

    @classmethod
    def model_validate(cls, obj, *args, **kwargs):  # type: ignore[override]
        result = super().model_validate(obj, *args, **kwargs)
        # Derive the slug from publication_date + number. Lazy-computed
        # here rather than stored on the row — slugs are deterministic
        # functions of (publication_date, number) and don't need their
        # own column.
        pd = getattr(obj, "publication_date", None)
        if pd is not None:
            month_fr = _MONTHS_FR_INVERSE.get(pd.month)
            if month_fr:
                result.slug = f"{pd.day}-{month_fr}-{pd.year}"
        return result


# Inverse of MONTHS_FR (date → French month name) used to generate the
# URL slug for ``/moniteur/{slug}``. Kept lowercase + accent-free so
# slugs stay URL-safe (28-avril-1987 not 28-Avril-1987 or 28-août-…
# which would need percent-encoding).
_MONTHS_FR_INVERSE: dict[int, str] = {
    1: "janvier", 2: "fevrier", 3: "mars", 4: "avril",
    5: "mai", 6: "juin", 7: "juillet", 8: "aout",
    9: "septembre", 10: "octobre", 11: "novembre", 12: "decembre",
}


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

    # Effective parser profile for this entry. NULL means "auto-pick
    # from detected_category at parse time". Editor-overridable.
    parser_profile: Optional[ParserProfile] = None
    # Typed parser output (ParserOutput as dict) — read-only for the
    # client; updated server-side when /parse runs or the editor changes
    # the parser_profile and asks for a re-parse.
    content_ast: Optional[Dict[str, Any]] = None

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
    # Optional per-entry date. Older imports sometimes carry a different
    # date than the issue header (a decree signed on day X but appearing
    # in the Moniteur of day Y), so the editor can pre-fill it. The
    # editor UI auto-fills this from the issue's ``publication_date``
    # for new rows, but a per-entry override sticks.
    detected_date: Optional[date] = None
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


class JsonImportLegalText(BaseModel):
    """Fully-structured legal text supplied inline inside a JSON-import
    entry. Mirrors ``LegalTextCreate``'s editable surface so the
    caller can hand-deliver a complete draft text (slug, formal
    blocks, headings, articles, signers) without going through the
    OCR/parser pipeline.

    Used by ``JsonImportEntry.content`` — when present, the importer
    auto-promotes the entry to a draft ``LegalText`` immediately
    instead of leaving it pending for editorial review.

    Only ``slug`` and ``title_fr`` are required; everything else
    matches the defaults on ``LegalTextCreate`` so callers can omit
    fields they don't have. ``editorial_status`` is forced to draft
    server-side regardless of what the caller sends — promotion via
    JSON-import always lands as a draft.
    """

    slug: str
    category: LegalCategory
    code_subcategory: Optional[CodeSubcategory] = None
    jurisdiction: str = "HT"

    title_fr: str
    title_ht: Optional[str] = None
    description_fr: Optional[str] = None
    description_ht: Optional[str] = None
    preamble_fr: Optional[str] = None
    preamble_ht: Optional[str] = None
    visas_fr: Optional[str] = None
    visas_ht: Optional[str] = None
    considerants_fr: Optional[str] = None
    considerants_ht: Optional[str] = None
    enacting_formula_fr: Optional[str] = None
    enacting_formula_ht: Optional[str] = None
    enacting_formula_align: str = "left"

    promulgation_date: Optional[date] = None
    publication_date: Optional[date] = None
    moniteur_ref: Optional[str] = None

    official_number: Optional[str] = None
    issuing_authority: Optional[str] = None
    official_formula: Optional[str] = None

    status: LegalStatus = LegalStatus.in_force

    headings: Optional[List[LegalHeadingCreate]] = None
    articles: Optional[List[ArticleCreate]] = None
    signers: Optional[List[LegalSignerCreate]] = None

    model_config = ConfigDict(extra="forbid")


class JsonImportEntry(BaseModel):
    """One entry inside a JSON-imported Moniteur issue.

    Shape mirrors ``SommaireEntryInput`` but with the parser fields
    pre-filled — the caller supplies the structured data, no OCR or
    boundary detection is run. ``raw_text`` is the canonical body
    (used for re-parse later if needed); ``content_ast`` is the
    typed parser output, when the caller has it.

    Pages are optional — JSON-imported entries bypass the parser,
    so the page-range hint is only meaningful when the caller wants
    to record where the text appears in the printed issue.

    When ``content`` is provided, the importer auto-promotes the
    entry to a draft ``LegalText`` immediately — bypassing the
    "pending → reviewed → promote" editorial flow. Use it when the
    caller already has the full structured law and wants a one-shot
    import-and-promote.
    """

    detected_category: MoniteurDocumentType
    detected_title: Optional[str] = None
    detected_number: Optional[str] = None
    detected_date: Optional[date] = None
    page_from: Optional[int] = None
    page_to: Optional[int] = None
    raw_text: str = ""
    content_ast: Optional[Dict[str, Any]] = None
    content: Optional[JsonImportLegalText] = None

    model_config = ConfigDict(extra="forbid")


class MoniteurJsonImport(BaseModel):
    """Top-level JSON-import payload — one Moniteur issue + N entries.

    Dev-only path that bypasses the OCR / heuristic parser pipeline:
    the caller hands over the structured data verbatim, the server
    creates the issue + entry rows in one transaction. Idempotent on
    ``(number, year)`` — re-importing the same issue updates its
    entries rather than creating a duplicate.

    ``schema_version`` is a future-proofing escape hatch. Bump it
    when the JSON shape changes and add a back-compat branch in the
    importer if old files need to keep loading.
    """

    schema_version: int = 1
    issue: MoniteurIssueCreate
    entries: List[JsonImportEntry] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


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


class MoniteurEntryParserProfileUpdate(BaseModel):
    """Editor override for which parser profile runs on this entry.

    Used by PATCH /editorial/moniteur/entries/{id}/parser-profile.
    Sending ``parser_profile = None`` clears the override and falls back
    to "auto-pick from detected_category" on the next parse.

    When ``rerun = True``, the typ-specific parser is invoked
    synchronously and ``content_ast`` is refreshed in the same request.
    Otherwise the override is saved but the AST stays stale until the
    next /parse run.
    """

    parser_profile: Optional[ParserProfile] = None
    rerun: bool = True
