"""Corpus domain service.

Public API for the routes layer. Converts ORM rows to Pydantic schemas at
its public boundary; routes never touch ORM.
"""
from __future__ import annotations

from datetime import date
from typing import List, Literal, Optional, Sequence, Union

from sqlalchemy.orm import Session

from packages.schemas.article import (
    ArticleEmbed,
    ArticleListItem,
    ArticleRead,
    ArticleResolved,
    ArticleWithHistoryRead,
)
from packages.schemas.citation import CitationRead
from packages.schemas.common import PaginatedResponse
from packages.schemas.decision import DecisionListItem, DecisionRead
from packages.schemas.enums import (
    ArticleStatus,
    CitationNodeType,
    CitationRelation,
    CodeSubcategory,
    CourtType,
    EditorialStatus,
    LegalCategory,
    LegalStatus,
    LegalTheme,
    ThemeSource,
)
from packages.schemas.heading import LegalHeadingRead, TocNode
from packages.schemas.legal_text import LegalTextListItem, LegalTextRead, MatchSnippet
from packages.schemas.signer import LegalSignerRead
from services.corpus.exceptions import NotFound
from services.corpus.models import Article, LegalText
from services.corpus.repository import CorpusRepository


def article_to_embed(article: Article) -> ArticleEmbed:
    """Flatten an Article + its current_version into the embed shape."""
    cv = article.current_version
    return ArticleEmbed(
        id=article.id,
        legal_text_id=article.legal_text_id,
        heading_id=article.heading_id,
        number=article.number,
        slug=article.slug,
        position=article.position,
        domain_tags=list(article.domain_tags or []),
        title_fr=cv.title_fr if cv else None,
        title_ht=cv.title_ht if cv else None,
        content_fr=cv.text_fr if cv else None,
        content_ht=cv.text_ht if cv else None,
        status=cv.status if cv else ArticleStatus.in_force,
        effective_from=cv.effective_from if cv else None,
        effective_to=cv.effective_to if cv else None,
        transferred_to_article_id=cv.transferred_to_article_id if cv else None,
        version_number=cv.version_number if cv else None,
    )


def text_to_read(
    text: LegalText,
    *,
    headings: list[LegalHeadingRead],
    articles: list[ArticleEmbed],
    signers: list[LegalSignerRead],
) -> LegalTextRead:
    """Build a LegalTextRead from an ORM row + already-converted children.

    We don't use `LegalTextRead.model_validate(text)` because the `articles`
    field expects ArticleEmbed (which flattens current_version content); the
    ORM's `text.articles` is a list of Article rows and Pydantic can't coerce
    those automatically.
    """
    return LegalTextRead(
        id=text.id,
        slug=text.slug,
        category=text.category,
        code_subcategory=text.code_subcategory,
        jurisdiction=text.jurisdiction,
        title_fr=text.title_fr,
        title_ht=text.title_ht,
        description_fr=text.description_fr,
        description_ht=text.description_ht,
        preamble_fr=text.preamble_fr,
        preamble_ht=text.preamble_ht,
        promulgation_date=text.promulgation_date,
        publication_date=text.publication_date,
        moniteur_ref=text.moniteur_ref,
        status=text.status,
        editorial_status=text.editorial_status,
        created_at=text.created_at,
        updated_at=text.updated_at,
        published_at=text.published_at,
        headings=headings,
        articles=articles,
        signers=signers,
        moniteur_issue_id=getattr(mi, "id", None) if (mi := getattr(text, "moniteur_issue", None)) else None,
        moniteur_issue_number=getattr(mi, "number", None) if (mi := getattr(text, "moniteur_issue", None)) else None,
        moniteur_issue_publication_date=getattr(mi, "publication_date", None) if (mi := getattr(text, "moniteur_issue", None)) else None,
    )

QuickAccessKey = Union[LegalCategory, CodeSubcategory]

# Constitution + the four core codes — what shows on the homepage.
DEFAULT_QUICK_ACCESS: list[QuickAccessKey] = [
    LegalCategory.constitution,
    CodeSubcategory.code_civil,
    CodeSubcategory.code_penal,
    CodeSubcategory.code_travail,
]

IncludeMode = Optional[Literal["toc", "all"]]


class CorpusService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.repo = CorpusRepository(session)

    # -------------------------------------------------------------------
    # LegalText listings
    # -------------------------------------------------------------------

    def list_texts(
        self,
        *,
        q: Optional[str] = None,
        q_field: str = "all",
        q_mode: str = "all",
        category: Optional[LegalCategory] = None,
        code_subcategory: Optional[CodeSubcategory] = None,
        legal_status: Optional[LegalStatus] = None,
        editorial_status: Optional[EditorialStatus] = EditorialStatus.published,
        year_from: Optional[int] = None,
        year_to: Optional[int] = None,
        themes: Optional[List[LegalTheme]] = None,
        theme_source: Optional[ThemeSource] = None,
        sort: str = "publication_date",
        with_snippets: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> PaginatedResponse[LegalTextListItem]:
        rows, total = self.repo.list_texts(
            q=q,
            q_field=q_field,
            q_mode=q_mode,
            category=category,
            code_subcategory=code_subcategory,
            legal_status=legal_status,
            editorial_status=editorial_status,
            year_from=year_from,
            year_to=year_to,
            themes=themes,
            theme_source=theme_source,
            sort=sort,
            limit=limit,
            offset=offset,
        )
        items = [LegalTextListItem.model_validate(t) for t in rows]

        # Attach matching article snippets when requested. Only meaningful
        # when q_field=all (we searched article bodies) and a query is set.
        if with_snippets and q and q.strip() and q_field == "all" and items:
            snippets_by_id = self.repo.fetch_match_snippets(
                [it.id for it in items], q.strip(), per_text=2
            )
            for it in items:
                raw = snippets_by_id.get(it.id, [])
                if raw:
                    it.match_snippets = [
                        MatchSnippet(
                            article_number=s["article_number"],
                            article_slug=s.get("article_slug"),
                            snippet_fr=s.get("snippet_fr"),
                            snippet_ht=s.get("snippet_ht"),
                        )
                        for s in raw
                    ]

        return PaginatedResponse(
            items=items,
            total=total,
            page=(offset // max(limit, 1)) + 1,
            size=limit,
        )

    # -------------------------------------------------------------------
    # LegalText detail
    # -------------------------------------------------------------------

    def get_text_by_slug(
        self,
        slug: str,
        *,
        include: IncludeMode = None,
    ) -> LegalTextRead:
        with_relations = include in ("toc", "all")
        text = self.repo.get_text_by_slug(
            slug,
            with_headings=with_relations,
            with_articles=(include == "all"),
            with_signers=(include == "all"),
        )
        if not text:
            raise NotFound(f"LegalText not found: {slug}")

        if include == "all":
            return text_to_read(
                text,
                headings=[LegalHeadingRead.model_validate(h) for h in text.headings],
                articles=[article_to_embed(a) for a in text.articles],
                signers=[LegalSignerRead.model_validate(s) for s in text.signers],
            )
        if include == "toc":
            return text_to_read(
                text,
                headings=[LegalHeadingRead.model_validate(h) for h in text.headings],
                articles=[],
                signers=[],
            )
        # default: metadata only
        return text_to_read(text, headings=[], articles=[], signers=[])

    def get_toc_by_slug(self, slug: str) -> List[TocNode]:
        text = self.repo.get_text_by_slug(slug)
        if not text:
            raise NotFound(f"LegalText not found: {slug}")
        headings = self.repo.get_headings_by_text_id(text.id)

        nodes: dict[int, TocNode] = {
            h.id: TocNode(
                id=h.id,
                key=h.key,
                level=h.level,
                number=h.number,
                title_fr=h.title_fr,
                title_ht=h.title_ht,
                content_fr=h.content_fr,
                content_ht=h.content_ht,
                position=h.position,
                children=[],
            )
            for h in headings
        }

        roots: List[TocNode] = []
        for h in headings:
            node = nodes[h.id]
            if h.parent_id and h.parent_id in nodes:
                nodes[h.parent_id].children.append(node)
            else:
                roots.append(node)

        def sort_tree(items: List[TocNode]) -> None:
            items.sort(key=lambda n: (n.position, n.id))
            for n in items:
                sort_tree(n.children)

        sort_tree(roots)
        return roots

    def list_articles_by_text_slug(
        self,
        slug: str,
        *,
        heading_id: Optional[int] = None,
        heading_key: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> PaginatedResponse[ArticleListItem]:
        text = self.repo.get_text_by_slug(slug)
        if not text:
            raise NotFound(f"LegalText not found: {slug}")

        resolved_heading_id = heading_id
        if heading_key:
            heading = self.repo.get_heading_by_key(text.id, heading_key)
            if not heading:
                raise NotFound(
                    f"Heading not found in {slug}: {heading_key}"
                )
            resolved_heading_id = heading.id

        rows, total = self.repo.list_articles_by_text(
            text.id,
            heading_id=resolved_heading_id,
            limit=limit,
            offset=offset,
        )
        items = [ArticleListItem.model_validate(a) for a in rows]
        return PaginatedResponse(
            items=items,
            total=total,
            page=(offset // max(limit, 1)) + 1,
            size=limit,
        )

    def list_amendments_by_text_slug(
        self, slug: str
    ) -> List[ArticleWithHistoryRead]:
        """All amended articles in a legal text — i.e., those with > 1
        version. Each returned item is the full ArticleWithHistoryRead so
        the frontend can render every version in the timeline without
        another fetch. Sorted by article position (the natural read order
        of the text).
        """
        text = self.repo.get_text_by_slug(slug)
        if not text:
            raise NotFound(f"LegalText not found: {slug}")

        articles = self.repo.list_amended_articles(text.id)
        return [ArticleWithHistoryRead.model_validate(a) for a in articles]

    # -------------------------------------------------------------------
    # Article detail
    # -------------------------------------------------------------------

    def get_article(
        self,
        article_id: int,
        *,
        with_history: bool = True,
    ) -> ArticleRead | ArticleWithHistoryRead:
        article = self.repo.get_article(article_id)
        if not article:
            raise NotFound(f"Article not found: {article_id}")

        if with_history:
            return ArticleWithHistoryRead.model_validate(article)
        return ArticleRead.model_validate(article)

    def resolve_articles(self, article_ids: list[int]) -> list[ArticleResolved]:
        """Batch-resolve article IDs to their parent-text label + permalink.

        Drives the citation panel's cross-text label resolution.
        """
        rows = self.repo.resolve_articles(article_ids)
        result: list[ArticleResolved] = []
        for a in rows:
            text = a.legal_text
            if text is None:
                continue
            result.append(
                ArticleResolved(
                    id=a.id,
                    number=a.number,
                    slug=a.slug,
                    text_id=text.id,
                    text_slug=text.slug,
                    text_title_fr=text.title_fr,
                )
            )
        return result

    # -------------------------------------------------------------------
    # Quick access (homepage cards)
    # -------------------------------------------------------------------

    def get_quick_access(
        self,
        keys: Optional[Sequence[QuickAccessKey]] = None,
    ) -> List[LegalTextListItem]:
        keys = keys or DEFAULT_QUICK_ACCESS

        result: List[LegalTextListItem] = []
        for key in keys:
            if isinstance(key, LegalCategory):
                text = self.repo.latest_by_category(key)
            else:
                text = self.repo.latest_by_subcategory(key)
            if text:
                result.append(LegalTextListItem.model_validate(text))
        return result

    # -------------------------------------------------------------------
    # Decisions
    # -------------------------------------------------------------------

    def list_decisions(
        self,
        *,
        q: Optional[str] = None,
        court: Optional[CourtType] = None,
        editorial_status: Optional[EditorialStatus] = EditorialStatus.published,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> PaginatedResponse[DecisionListItem]:
        rows, total = self.repo.list_decisions(
            q=q,
            court=court,
            editorial_status=editorial_status,
            date_from=date_from,
            date_to=date_to,
            limit=limit,
            offset=offset,
        )
        items = [DecisionListItem.model_validate(d) for d in rows]
        return PaginatedResponse(
            items=items,
            total=total,
            page=(offset // max(limit, 1)) + 1,
            size=limit,
        )

    def get_decision_by_slug(self, slug: str) -> DecisionRead:
        decision = self.repo.get_decision_by_slug(slug)
        if not decision:
            raise NotFound(f"Decision not found: {slug}")
        return DecisionRead.model_validate(decision)

    # -------------------------------------------------------------------
    # Citations
    # -------------------------------------------------------------------

    def list_citations(
        self,
        *,
        source_type: Optional[CitationNodeType] = None,
        source_id: Optional[int] = None,
        target_type: Optional[CitationNodeType] = None,
        target_id: Optional[int] = None,
        relation: Optional[CitationRelation] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> PaginatedResponse[CitationRead]:
        rows, total = self.repo.list_citations(
            source_type=source_type,
            source_id=source_id,
            target_type=target_type,
            target_id=target_id,
            relation=relation,
            limit=limit,
            offset=offset,
        )
        items = [CitationRead.model_validate(c) for c in rows]
        return PaginatedResponse(
            items=items,
            total=total,
            page=(offset // max(limit, 1)) + 1,
            size=limit,
        )
