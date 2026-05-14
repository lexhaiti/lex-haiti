"""Translation audit/provenance schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from .enums import EditorialStatus, Language, TranslatableEntity, TranslatorKind


class TranslationBase(BaseModel):
    entity_type: TranslatableEntity
    entity_id: int
    language: Language
    source_version_id: Optional[int] = None
    translator_kind: TranslatorKind
    translator_id: Optional[int] = None
    machine_engine: Optional[str] = None
    notes: Optional[str] = None


class TranslationCreate(TranslationBase):
    review_status: EditorialStatus = EditorialStatus.draft


class TranslationRead(TranslationBase):
    id: int
    translated_at: datetime
    review_status: EditorialStatus

    model_config = ConfigDict(from_attributes=True)
