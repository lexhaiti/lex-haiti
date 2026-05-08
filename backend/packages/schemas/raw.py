from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict

from packages.schemas.enums import RawDocumentStatus, RawDocumentType, RawPageStatus


class RawDocumentRead(BaseModel):
    id: int
    document_type: RawDocumentType
    source_url: Optional[str] = None
    storage_path: str
    original_filename: Optional[str] = None
    sha256_hash: str
    file_size_bytes: Optional[int] = None
    mime_type: Optional[str] = None
    acquired_at: datetime
    source_metadata: Optional[dict[str, Any]] = None
    status: RawDocumentStatus

    model_config = ConfigDict(from_attributes=True)


class RawPageRead(BaseModel):
    id: int
    raw_document_id: int
    page_number: int
    image_path: Optional[str] = None
    ocr_text: Optional[str] = None
    ocr_blocks: Optional[dict[str, Any]] = None
    ocr_engine: Optional[str] = None
    ocr_confidence: Optional[Decimal] = None
    ocr_status: RawPageStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
