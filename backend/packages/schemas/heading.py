from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict

from packages.schemas.enums import HeadingLevel


class LegalHeadingBase(BaseModel):
    key: str
    parent_key: Optional[str] = None
    level: HeadingLevel
    number: Optional[str] = None
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    content_fr: Optional[str] = None
    content_ht: Optional[str] = None
    position: int = 0


class LegalHeadingCreate(LegalHeadingBase):
    pass


class LegalHeadingInsertInput(BaseModel):
    """Editor-supplied payload to insert a brand-new heading (Titre /
    Chapitre / Section / …) into a legal text — typically used to fix
    parser output that missed a structural break.

    Position is computed server-side from one of two anchors (the
    editor supplies one, never both):
    - ``after_heading_id``: new heading inherits that heading's
      ``parent_id`` and slots at ``position + 1``, with later siblings
      bumped by one. Same pattern as article insertion.
    - ``parent_id``: new heading is created at the *end* of that
      parent's children list (or at the text root when ``parent_id``
      is null). No sibling shift needed.

    ``key`` is required and must be unique within the text — the
    repository / migration enforces a UNIQUE constraint on
    ``(legal_text_id, key)``.
    """

    key: str
    level: HeadingLevel
    number: Optional[str] = None
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    content_fr: Optional[str] = None
    content_ht: Optional[str] = None

    after_heading_id: Optional[int] = None
    parent_id: Optional[int] = None

    model_config = ConfigDict(extra="forbid")


class LegalHeadingPatch(BaseModel):
    """Full editor-supplied patch for an existing heading. Every field
    is optional (``exclude_unset=True`` on the model_dump call); only
    the fields the editor changed flow through to the service.

    Distinct from the existing title-only PATCH route at
    ``/headings/{id}/title``: this one can also re-parent the heading
    (``parent_id``), change its level (``Section`` → ``Chapitre`` when
    the parser mis-classified), renumber it, or move its position.
    """

    level: Optional[HeadingLevel] = None
    number: Optional[str] = None
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    content_fr: Optional[str] = None
    content_ht: Optional[str] = None
    parent_id: Optional[int] = None
    position: Optional[int] = None

    model_config = ConfigDict(extra="forbid")


class LegalHeadingRead(BaseModel):
    id: int
    legal_text_id: int
    parent_id: Optional[int] = None
    level: HeadingLevel
    key: str
    number: Optional[str] = None
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    content_fr: Optional[str] = None
    content_ht: Optional[str] = None
    position: int

    model_config = ConfigDict(from_attributes=True)


class TocNode(BaseModel):
    """Tree-shaped TOC node — used for the article reader sidebar."""

    id: int
    key: str
    level: HeadingLevel
    number: Optional[str] = None
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    content_fr: Optional[str] = None
    content_ht: Optional[str] = None
    position: int = 0
    children: List["TocNode"] = []
