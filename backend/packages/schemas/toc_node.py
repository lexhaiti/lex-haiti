"""TocNode schemas — the unified TOC + formal-block tree.

A TocNode is either:
  - a STRUCTURAL node with ``block_kind='structural'`` + a HeadingLevel
    (part / book / title / chapter / section / subsection) and an
    optional title; OR
  - a FORMAL-BLOCK node (preamble / visa / considérant / enacting_formula
    / annex / closing_formula / signature_block / promulgation_block /
    sovereignty_formula / prose_body) whose body lives in ``body_fr`` /
    ``body_ht``.

The Phase-2 migration copies the flat ``preamble_fr`` etc. columns on
LegalText into TocNode rows of the corresponding ``block_kind``.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict

from .enums import BlockKind, ContentSource, HeadingLevel


class TocNodeBase(BaseModel):
    block_kind: BlockKind
    level: Optional[HeadingLevel] = None  # only set when block_kind='structural'
    key: str
    number: Optional[str] = None
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    body_fr: Optional[str] = None
    body_ht: Optional[str] = None
    position: int = 0


class TocNodeCreate(TocNodeBase):
    legal_text_id: int
    parent_id: Optional[int] = None
    source: ContentSource = ContentSource.editor
    confidence: Optional[Decimal] = None


class TocNodeUpdate(BaseModel):
    """Partial update — every field is optional; pass null to clear."""

    block_kind: Optional[BlockKind] = None
    level: Optional[HeadingLevel] = None
    number: Optional[str] = None
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    body_fr: Optional[str] = None
    body_ht: Optional[str] = None
    position: Optional[int] = None
    source: Optional[ContentSource] = None
    parent_id: Optional[int] = None


class TocNodeRead(TocNodeBase):
    id: int
    legal_text_id: int
    parent_id: Optional[int] = None
    source: ContentSource
    confidence: Optional[Decimal] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TocNodeTree(TocNodeRead):
    """Recursive tree for the public renderer."""

    children: List["TocNodeTree"] = []


TocNodeTree.model_rebuild()
