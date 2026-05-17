from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict

from schemas.article import ArticleCreate, ArticleEmbed
from schemas.enums import (
    CodeSubcategory,
    EditorialStatus,
    LegalCategory,
    LegalStatus,
)
from schemas.heading import LegalHeadingCreate, LegalHeadingRead
from schemas.signer import LegalSignerCreate, LegalSignerRead
from schemas.theme import LegalThemeTagRead


class LegalTextBase(BaseModel):
    slug: str
    category: LegalCategory
    code_subcategory: Optional[CodeSubcategory] = None
    jurisdiction: str = "HT"

    title_fr: str
    title_ht: Optional[str] = None
    # Moniteur-verbatim form of the title (no date, exact wording as
    # printed under the LIBERTÉ / RÉPUBLIQUE banner above the issuing
    # authority). Nullable: when missing the LawDetail body falls back
    # to ``title_*``. The editor maintains it independently via
    # MetadataEditor / inline edit.
    official_title_fr: Optional[str] = None
    official_title_ht: Optional[str] = None
    description_fr: Optional[str] = None
    description_ht: Optional[str] = None
    preamble_fr: Optional[str] = None
    preamble_ht: Optional[str] = None
    visas_fr: Optional[str] = None
    visas_ht: Optional[str] = None
    considerants_fr: Optional[str] = None
    considerants_ht: Optional[str] = None
    # Mentions procédurales — ``Sur le rapport du … ;`` /
    # ``Et après délibération en Conseil des Ministres ;``. Bilingual,
    # editor-correctable, sits between considérants and the dispositif.
    mentions_procedurales_fr: Optional[str] = None
    mentions_procedurales_ht: Optional[str] = None
    enacting_formula_fr: Optional[str] = None
    enacting_formula_ht: Optional[str] = None
    # 'left' (default) or 'center' — controls how the reader page
    # aligns the enacting-formula block. Editor-controlled via
    # MetadataEditor; mirrors the SQL column with the same default.
    enacting_formula_align: str = "left"

    promulgation_date: Optional[date] = None
    publication_date: Optional[date] = None
    moniteur_ref: Optional[str] = None

    # Page-1 official metadata extracted by the parser; editor-correctable.
    official_number: Optional[str] = None        # e.g. "CL-007-09-09"
    issuing_authority: Optional[str] = None      # multi-line allowed
    # Verbatim post-dispositif block (Votée + LIBERTÉ banner + Donné).
    official_formula: Optional[str] = None

    status: LegalStatus = LegalStatus.in_force
    editorial_status: EditorialStatus = EditorialStatus.draft


class LegalTextCreate(LegalTextBase):
    """Used by seed scripts and editorial UI."""

    headings: Optional[List[LegalHeadingCreate]] = None
    articles: Optional[List[ArticleCreate]] = None
    signers: Optional[List[LegalSignerCreate]] = None


class MatchSnippet(BaseModel):
    """A highlighted excerpt showing where the search query matched in an
    article's body. `snippet_fr` / `snippet_ht` come from `ts_headline()` and
    contain `<mark>...</mark>` wrappers around the matched terms.
    """

    article_number: str
    article_slug: Optional[str] = None
    snippet_fr: Optional[str] = None
    snippet_ht: Optional[str] = None


class LegalTextListItem(BaseModel):
    """Lightweight shape for list endpoints — no children."""

    id: int
    slug: str
    title_fr: str
    title_ht: Optional[str] = None

    category: LegalCategory
    code_subcategory: Optional[CodeSubcategory] = None
    status: LegalStatus
    editorial_status: EditorialStatus
    moniteur_ref: Optional[str] = None
    publication_date: Optional[date] = None

    description_fr: Optional[str] = None
    description_ht: Optional[str] = None

    # Editorial timestamps — exposed on list items so the homepage / activity
    # feeds can sort and label by "recently added" vs "recently updated"
    # without fetching the full LegalTextRead shape.
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    published_at: Optional[datetime] = None

    # Theme chips for the listing card. Populated by the service from the
    # bulk-fetch helper to avoid N+1.
    theme_tags: List[LegalThemeTagRead] = []

    # Populated only when the route is called with `with_snippets=true` and a
    # search query was applied. Up to 2 article snippets per text where the
    # match was found in the body (not in the title/description).
    match_snippets: Optional[List["MatchSnippet"]] = None

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def model_validate(cls, obj, *args, **kwargs):  # type: ignore[override]
        """Fall back ``publication_date`` to the linked Moniteur issue's
        publication date when the text's own date is null. Historical
        texts (e.g. the 1987 Constitution) carry no per-text date but
        are attached to a Moniteur issue dated when they appeared in
        the Journal Officiel — that date is the right thing to show on
        listings and on the card subtitle ("28 avril 1987"). The
        repo's ``list_texts`` eagerly loads ``moniteur_issue`` so this
        access is N+0."""
        result = super().model_validate(obj, *args, **kwargs)
        if result.publication_date is None:
            issue = getattr(obj, "moniteur_issue", None)
            if issue is not None:
                result.publication_date = getattr(issue, "publication_date", None)
        return result


class AmendedByRef(BaseModel):
    """Minimal reference to a law that has amended one or more articles of
    the parent text. Surfaced as metadata on the law detail page."""

    id: int
    slug: str
    title_fr: str
    title_ht: Optional[str] = None
    publication_date: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)


class LegalTextRead(LegalTextBase):
    """Full shape with timestamps. Children loaded on demand via includes."""

    id: int
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime] = None

    headings: List[LegalHeadingRead] = []
    articles: List[ArticleEmbed] = []
    signers: List[LegalSignerRead] = []
    theme_tags: List[LegalThemeTagRead] = []

    # French Moniteur issue this text was published in.
    moniteur_issue_id: Optional[int] = None
    moniteur_issue_number: Optional[str] = None
    moniteur_issue_publication_date: Optional[date] = None

    # Kreyòl supplement issue (e.g. N° 36-A for the 1987 Constitution).
    # Null for most laws.
    moniteur_issue_id_ht: Optional[int] = None
    moniteur_issue_number_ht: Optional[str] = None
    moniteur_issue_publication_date_ht: Optional[date] = None

    # Laws that have amended one or more articles of this text.
    # Empty for texts with no tracked amendments.
    amended_by: List[AmendedByRef] = []

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def model_validate(cls, obj, *args, **kwargs):  # type: ignore[override]
        result = super().model_validate(obj, *args, **kwargs)
        issue = getattr(obj, "moniteur_issue", None)
        if issue is not None:
            result.moniteur_issue_id = getattr(issue, "id", None)
            result.moniteur_issue_number = getattr(issue, "number", None)
            result.moniteur_issue_publication_date = getattr(
                issue, "publication_date", None
            )
        issue_ht = getattr(obj, "moniteur_issue_ht", None)
        if issue_ht is not None:
            result.moniteur_issue_id_ht = getattr(issue_ht, "id", None)
            result.moniteur_issue_number_ht = getattr(issue_ht, "number", None)
            result.moniteur_issue_publication_date_ht = getattr(
                issue_ht, "publication_date", None
            )
        return result
