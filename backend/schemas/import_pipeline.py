"""Schemas for the parser-driven import pipeline.

  - ``ImportJob`` records one parser execution and its lifecycle.
  - ``ImportDraft`` carries the structured parser output as JSONB blobs;
    the editor reviews and commits it into live tables.
  - The ``Draft*`` nested shapes describe the JSONB payload structure.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from .enums import ImportJobStatus, LegalCategory, ParserProfile


# ---------------------------------------------------------------------------
# JSONB payload shapes — Pydantic-validated on every write
# ---------------------------------------------------------------------------


class DraftMetadata(BaseModel):
    official_number: Optional[str] = None
    issuing_authority_text: Optional[str] = None
    issuing_authority_id: Optional[int] = None   # resolved by service
    adopting_body_id: Optional[int] = None
    promulgating_authority_id: Optional[int] = None
    promulgation_date: Optional[str] = None  # ISO date string
    publication_date: Optional[str] = None
    moniteur_ref: Optional[str] = None


class DraftTocNode(BaseModel):
    block_kind: str
    level: Optional[str] = None
    key: str
    number: Optional[str] = None
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    body_fr: Optional[str] = None
    body_ht: Optional[str] = None
    position: int = 0
    confidence: Optional[float] = None


class DraftArticle(BaseModel):
    number: str
    toc_node_key: Optional[str] = None
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    text_fr: Optional[str] = None
    text_ht: Optional[str] = None
    content_ast_fr: Optional[List[dict]] = None  # validated against ContentNode at commit
    content_ast_ht: Optional[List[dict]] = None
    confidence: Optional[float] = None


class DraftSigner(BaseModel):
    name: str
    role_title_fr: Optional[str] = None
    role_title_ht: Optional[str] = None
    signing_capacity: Optional[str] = None
    chamber: Optional[str] = None
    authority_id: Optional[int] = None


class DraftPromulgation(BaseModel):
    promulgation_date: Optional[str] = None
    location: Optional[str] = None
    sovereignty_formula: Optional[str] = None
    promulgation_formula_fr: Optional[str] = None
    promulgation_formula_ht: Optional[str] = None
    closing_formula_fr: Optional[str] = None
    promulgating_authority_id: Optional[int] = None
    signers: List[DraftSigner] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Read / Create schemas
# ---------------------------------------------------------------------------


class ImportJobRead(BaseModel):
    id: int
    source_document_id: Optional[int] = None
    target_legal_text_id: Optional[int] = None
    parser_profile: ParserProfile
    classifier_decision: Optional[LegalCategory] = None
    status: ImportJobStatus
    started_at: datetime
    finished_at: Optional[datetime] = None
    error: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    created_by: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class ImportDraftRead(BaseModel):
    id: int
    import_job_id: int
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    category_guess: Optional[LegalCategory] = None
    metadata_json: Optional[DraftMetadata] = None
    toc_json: Optional[List[DraftTocNode]] = None
    articles_json: Optional[List[DraftArticle]] = None
    promulgation_json: Optional[DraftPromulgation] = None
    signatures_json: Optional[List[DraftSigner]] = None
    warnings: Optional[List[str]] = None
    confidence: Optional[Decimal] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ImportJobWithDraft(ImportJobRead):
    draft: Optional[ImportDraftRead] = None
