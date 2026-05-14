"""Schemas for versioning the formal blocks of a legal text — the
preamble, visas, considérants and enacting formula.

Mirrors ``article.ArticleVersionRead`` / ``ArticleVersionAddInput``
for blocks rather than articles. Read schemas come back through the
``GET /legal-texts/{slug}/blocks/{kind}/versions`` route; the add
input is consumed by the editor's "Ajouter une version" affordance
on each formal block.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from packages.schemas.enums import BlockKind, EditorialStatus


class BlockVersionRead(BaseModel):
    """One row of a formal block's version timeline."""

    id: int
    legal_text_id: int
    block_kind: BlockKind
    version_number: int
    text_fr: Optional[str] = None
    text_ht: Optional[str] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    source_amendment_id: Optional[int] = None
    # When source_amendment_id is populated, the service resolves the
    # amending law's slug + title alongside it so the formal-block
    # accordion can render a "Modifié par X" line inline without a
    # second fetch.
    source_amendment_slug: Optional[str] = None
    source_amendment_title_fr: Optional[str] = None
    editorial_status: EditorialStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BlockVersionAddInput(BaseModel):
    """Editor input for adding a new version of a formal block,
    anchored to an amending legal text.

    Same contract as ``ArticleVersionAddInput`` minus the article-
    specific fields: ``source_legal_text_id`` is mandatory because
    every new version must point at the law that caused the change.
    Either ``text_fr`` or ``text_ht`` must be non-empty — formal
    blocks are bilingual and at least one language must carry the
    new content.
    """

    text_fr: Optional[str] = None
    text_ht: Optional[str] = None
    effective_from: Optional[date] = None
    source_legal_text_id: int
    comment: Optional[str] = Field(default=None, max_length=2000)

    model_config = ConfigDict(extra="forbid")
