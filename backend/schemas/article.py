from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from schemas.enums import ArticleStatus, EditorialStatus


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

    # When the current version was introduced by an amending law,
    # surface enough of it for the article viewer to render a
    # "Modifié par <X>" link without a second fetch.
    source_amendment_id: Optional[int] = None
    source_amendment_slug: Optional[str] = None
    source_amendment_title_fr: Optional[str] = None


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
    """One edit a law made to an article *or* a formal block in
    another text.

    Used by the "Modifications apportées" panel on an amending law's
    detail page. Each row is a denormalised view of a ``LegalChange``
    row, joined with the amended legal text + the touched target so
    the panel can render the link + label without an N+1 fetch:
    "→ Code Civil, Article 1444 — v3 (28 avril 2024)" or
    "→ Constitution, Préambule — v2 (15 mai 2026)".

    Exactly one of the two target groups is populated per row:
    - ``amended_article_*`` for an article edit
    - ``amended_block_kind`` + ``new_block_version_*`` for a formal-
      block edit
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
    amended_block_kind: Optional[str] = None
    new_block_version_id: Optional[int] = None
    new_block_version_number: Optional[int] = None
    created_at: datetime


class LegalChangeReceivedRead(BaseModel):
    """One edit another law made *to this text* — the inverse of
    ``LegalChangeMadeRead``.

    Powers the redesigned ``/loi/{slug}/amendements`` page. Each row is
    denormalised with the amending law + the touched article so the
    page can render the link + label + diff seed without N+1 fetches:
    "→ Article 12 a été remplacé par la Loi constitutionnelle de
    2011 (v2 — 19 juin 2012)".
    """

    id: int
    change_kind: str
    effective_on: Optional[date] = None
    new_version_id: Optional[int] = None
    new_version_number: Optional[int] = None
    amending_text_id: int
    amending_text_slug: str
    amending_text_title_fr: str
    amended_article_id: Optional[int] = None
    amended_article_number: Optional[str] = None
    amended_article_slug: Optional[str] = None
    amended_block_kind: Optional[str] = None
    new_block_version_id: Optional[int] = None
    new_block_version_number: Optional[int] = None
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


class ArticleVersionStatusUpdate(BaseModel):
    """Editor payload to flip the current version's lifecycle status
    independently of content editing.

    Use case: an article was amended via a later law (a new version
    already exists with the amended text), and now the editor wants to
    mark the previous still-published version as ``abrogated`` to
    surface the deprecation in the reader UI. The article's
    ``current_version`` pointer stays where it is; only that version's
    ``status`` field flips.

    Different from ``ArticleContentUpdate`` (which touches body / title
    and applies the draft-vs-published versioning rule) and different
    from ``ArticleVersionAddInput`` (which creates a new version
    anchored to an amending law). This one is the cheap "just change
    the lifecycle pill" path.
    """

    status: ArticleStatus
    effective_to: Optional[date] = Field(
        default=None,
        description=(
            "Optional end-of-effectiveness date. When the editor flips "
            "the status to abrogated/obsolete, this is typically the "
            "date the amending law took effect."
        ),
    )
    comment: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class ArticleInsertInput(BaseModel):
    """Editor-supplied payload to insert a brand-new article into a
    legal text.

    Two modes share the same shape, distinguished by whether
    ``source_legal_text_id`` is supplied:

    - **Amendment** (``source_legal_text_id`` set): the article is
      introduced by a modifying law (e.g. "Article 9-1" inserted by
      a 2024 loi between 9 and 10). Writes a ``LegalChange`` row
      with ``change_kind=add`` so the amending law's "Modifications
      apportées" panel picks it up.
    - **Parser correction** (``source_legal_text_id`` omitted): the
      article was always in the original text but the OCR/parser
      missed it. No ``LegalChange`` row; the article is treated as
      part of the original corpus. ``effective_from`` falls back to
      the parent text's own promulgation / publication date.

    Position is computed server-side from ``after_article_id``: the
    new article inherits that article's ``heading_id`` (same TOC
    node) and slots at ``position + 1``, with later siblings in the
    same heading bumped by one. Omit ``after_article_id`` and supply
    ``heading_id`` to insert at position 0 of that heading.
    """

    number: str = Field(..., min_length=1, max_length=64)
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    text_fr: str = Field(..., min_length=1)
    text_ht: Optional[str] = None

    # Anchor — one of these is required.
    after_article_id: Optional[int] = None
    heading_id: Optional[int] = None

    effective_from: Optional[date] = None
    # Optional now (was required) — see class docstring for the two
    # modes. None ⇒ parser-correction; populated ⇒ amendment.
    source_legal_text_id: Optional[int] = None
    source_article_id: Optional[int] = None
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
