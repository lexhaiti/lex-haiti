from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from packages.schemas.enums import ArticleStatus, EditorialStatus


# ---------------------------------------------------------------------------
# ArticleVersion
# ---------------------------------------------------------------------------


class ArticleVersionBase(BaseModel):
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    text_fr: str
    text_ht: Optional[str] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    status: ArticleStatus = ArticleStatus.in_force
    transferred_to_article_id: Optional[int] = None
    source_amendment_id: Optional[int] = None
    confidence: Optional[Decimal] = Field(default=None, ge=0, le=1)


class ArticleVersionCreate(ArticleVersionBase):
    version_number: int = 1
    editorial_status: EditorialStatus = EditorialStatus.draft


class ArticleVersionRead(ArticleVersionBase):
    id: int
    article_id: int
    version_number: int
    editorial_status: EditorialStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Article
# ---------------------------------------------------------------------------


class ArticleBase(BaseModel):
    number: str
    slug: str
    heading_key: Optional[str] = None
    domain_tags: List[str] = []
    position: int = 0


class ArticleCreate(ArticleBase):
    """Used by seed scripts and editorial UI. The first version is created together."""

    version: ArticleVersionCreate


class ArticleListItem(BaseModel):
    """Lightweight shape — list endpoints use this."""

    id: int
    legal_text_id: int
    heading_id: Optional[int] = None
    number: str
    slug: str
    position: int
    domain_tags: List[str] = []

    model_config = ConfigDict(from_attributes=True)


class ArticleEmbed(BaseModel):
    """Flattened article shape used when embedded in LegalTextRead.

    Inlines the current_version's title, text and per-article status so the
    frontend can render a Code reader without per-article fetches.
    """

    id: int
    legal_text_id: int
    heading_id: Optional[int] = None
    number: str
    slug: str
    position: int
    domain_tags: List[str] = []

    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    content_fr: Optional[str] = None
    content_ht: Optional[str] = None

    # Per-article state from the current_version (Légifrance-style).
    status: ArticleStatus = ArticleStatus.in_force
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    transferred_to_article_id: Optional[int] = None
    version_number: Optional[int] = None


class ArticleRead(BaseModel):
    """Detail shape — includes current version."""

    id: int
    legal_text_id: int
    heading_id: Optional[int] = None
    number: str
    slug: str
    domain_tags: List[str] = []
    position: int
    current_version: Optional[ArticleVersionRead] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ArticleWithHistoryRead(ArticleRead):
    """Detail shape with full version history — used by the article reader."""

    versions: List[ArticleVersionRead] = []


class ArticleResolved(BaseModel):
    """Lightweight article identity for cross-text citation label resolution.

    Returns enough to render "Code Civil — Article 1382" without the full
    article body.
    """

    id: int
    number: str
    slug: str
    text_id: int
    text_slug: str
    text_title_fr: str


class LegalChangeMadeRead(BaseModel):
    """One edit a law made to an article in another text.

    Used by the "Modifications apportées" panel on an amending law's
    detail page. Each row is a denormalised view of a ``LegalChange``
    row, joined with the amended legal text + article so the panel can
    render the link + label without an N+1 fetch:
    "→ Code Civil, Article 1444 — v3 (28 avril 2024)".
    """

    id: int
    change_kind: str
    effective_on: Optional[date] = None
    new_version_id: Optional[int] = None
    new_version_number: Optional[int] = None
    amended_text_id: int
    amended_text_slug: str
    amended_text_title_fr: str
    amended_article_id: Optional[int] = None
    amended_article_number: Optional[str] = None
    amended_article_slug: Optional[str] = None
    created_at: datetime


class ArticleContentUpdate(BaseModel):
    """Partial update of the editable content fields of an article version.

    Sent by the inline editor in the law-detail view. Only fields the editor
    actually changed are included (frontend uses model_dump(exclude_unset)).
    Versioning semantics live in EditorialService.update_article_content:
    a draft version mutates in place; a published version is superseded by
    a new draft version pointing at the same article.
    """

    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    text_fr: Optional[str] = None
    text_ht: Optional[str] = None
    comment: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class ArticleVersionAddInput(BaseModel):
    """Editor-supplied payload to add a new version of an article *because
    of an amending legal text*.

    Distinct from ``ArticleContentUpdate`` (which is editorial-correction-
    flavoured — no source law required). Here the editor is saying "this
    incoming law (decree / loi modifiant) introduces a new version of
    the article", so ``source_legal_text_id`` is mandatory and a
    ``LegalChange`` graph row is created alongside the new version.

    ``effective_from`` defaults to the source law's promulgation /
    publication date when omitted — the service fills it in.
    """

    text_fr: str = Field(..., min_length=1)
    text_ht: Optional[str] = None
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    effective_from: Optional[date] = None
    source_legal_text_id: int
    # When the amending law itself has a specific article that introduces
    # the change (e.g. "Article 3 of the amending decree modifies Article
    # 1444 of the Code Civil"), capture the precise pointer too. Optional —
    # many amending texts are short and the whole law is the change.
    source_article_id: Optional[int] = None
    comment: Optional[str] = None

    model_config = ConfigDict(extra="forbid")
