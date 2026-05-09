"""SQL queries for the corpus domain.

Repositories are internal infrastructure of the corpus service. They take a
SQLAlchemy Session and return ORM rows or simple tuples. The CorpusService
converts these to Pydantic schemas at its public boundary.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional, Tuple

from sqlalchemy import (
    and_,
    desc,
    extract,
    func,
    not_,
    nullslast,
    or_,
    select,
    text as sa_text,
)
from sqlalchemy.orm import Session, selectinload

from packages.schemas.enums import (
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
from services.corpus.models import (
    Article,
    ArticleVersion,
    Citation,
    Decision,
    LegalHeading,
    LegalText,
    LegalThemeTag,
)


class CorpusRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    # -------------------------------------------------------------------
    # Aggregate counts (used by the homepage corpus-stats strip)
    # -------------------------------------------------------------------

    def count_published_legal_texts(self) -> int:
        return int(
            self.session.execute(
                select(func.count())
                .select_from(LegalText)
                .where(LegalText.editorial_status == EditorialStatus.published)
            ).scalar_one()
        )

    def count_published_articles(self) -> int:
        """Count published article versions whose parent text is published.

        We count versions (not articles) because the same article can have
        multiple versions over time and the homepage stat is meant to
        convey "how much law text is browsable today" — i.e., the
        currently-in-force version per article. Approximating with the
        article-row count is close enough; the per-version subquery would
        be 5x more expensive on every page load.
        """
        return int(
            self.session.execute(
                select(func.count(Article.id))
                .join(LegalText, LegalText.id == Article.legal_text_id)
                .where(LegalText.editorial_status == EditorialStatus.published)
            ).scalar_one()
        )

    # -------------------------------------------------------------------
    # LegalText
    # -------------------------------------------------------------------

    def get_text_by_slug(
        self,
        slug: str,
        *,
        with_headings: bool = False,
        with_articles: bool = False,
        with_signers: bool = False,
        editorial_status: Optional[EditorialStatus] = EditorialStatus.published,
    ) -> Optional[LegalText]:
        """Look up a LegalText by slug.

        `editorial_status` defaults to `published` — the public read path. To
        access drafts (editorial UI, ingestion, tests), pass `None` for no
        filter or a specific status.
        """
        stmt = select(LegalText).where(LegalText.slug == slug)
        if editorial_status is not None:
            stmt = stmt.where(LegalText.editorial_status == editorial_status)
        opts = []
        if with_headings:
            opts.append(selectinload(LegalText.headings))
        if with_articles:
            # Eager-load each article's current_version so the service can
            # build ArticleEmbed without N+1 queries.
            opts.append(
                selectinload(LegalText.articles).selectinload(
                    Article.current_version
                )
            )
        if with_signers:
            opts.append(selectinload(LegalText.signers))
        if opts:
            stmt = stmt.options(*opts)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_text_by_id(self, text_id: int) -> Optional[LegalText]:
        return self.session.get(LegalText, text_id)

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
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[LegalText], int]:
        """List legal texts with advanced search filters.

        - `q_field`: which columns the text query targets — "all" / "title" /
          "description". "all" also matches the Moniteur reference.
        - `q_mode`: how `q` is matched —
            * "all"     — every word in q must appear (default, ILIKE per word)
            * "exact"   — the entire phrase must appear as a substring
            * "any"     — at least one word matches (OR over words)
            * "exclude" — no word may match (NOT ILIKE per word)
        - `year_from`/`year_to`: inclusive bounds on `publication_date` year.
        - `sort`: result ordering —
            * "publication_date" (default) — newest historical publication first
            * "recently_updated" — most recently edited row first (covers
              additions and revisions; right one for editorial activity feeds)
            * "recently_added" — most recently inserted row first
            * "recently_published" — most recently flipped to published
        """
        limit = max(1, min(limit, 100))
        offset = max(0, offset)

        stmt = select(LegalText)

        if category:
            stmt = stmt.where(LegalText.category == category)
        if code_subcategory:
            stmt = stmt.where(LegalText.code_subcategory == code_subcategory)
        if legal_status:
            stmt = stmt.where(LegalText.status == legal_status)
        if editorial_status:
            stmt = stmt.where(LegalText.editorial_status == editorial_status)

        if year_from is not None:
            stmt = stmt.where(
                extract("year", LegalText.publication_date) >= year_from
            )
        if year_to is not None:
            stmt = stmt.where(
                extract("year", LegalText.publication_date) <= year_to
            )

        if themes:
            # ANY-match: a text qualifies if ANY of its theme tags matches
            # ANY of the requested themes. Use EXISTS so we don't duplicate
            # rows when a text carries multiple matching tags.
            theme_filter = (
                select(1)
                .select_from(LegalThemeTag)
                .where(
                    LegalThemeTag.legal_text_id == LegalText.id,
                    LegalThemeTag.theme.in_(themes),
                )
            )
            if theme_source is not None:
                theme_filter = theme_filter.where(
                    LegalThemeTag.source == theme_source
                )
            stmt = stmt.where(theme_filter.exists())

        if q:
            q_clean = q.strip()
            if q_clean:
                # Resolve which columns to match against based on q_field.
                title_cols = [LegalText.title_fr, LegalText.title_ht]
                desc_cols = [LegalText.description_fr, LegalText.description_ht]
                if q_field == "title":
                    target_cols = title_cols
                elif q_field == "description":
                    target_cols = desc_cols
                else:
                    target_cols = title_cols + desc_cols + [LegalText.moniteur_ref]

                # When q_field == "all", also search article bodies. For
                # q_field=title/description we deliberately don't traverse the
                # article graph — the editor wants a metadata search.
                search_articles = q_field == "all"

                # NULL-safe + accent-insensitive column wrapper. Wrap both the
                # column and the search pattern with `unaccent()` so "président"
                # matches "president" and vice versa. Coalesce nulls so the
                # ILIKE never returns NULL (which would silently break the
                # `exclude` mode's NOT).
                def col(c):
                    return func.unaccent(func.coalesce(c, ""))

                def pat(word: str):
                    return func.unaccent(f"%{word}%")

                def word_predicate(word: str):
                    """OR of (every target column ILIKE word) and, when the
                    field selector is "all", an EXISTS on any article body
                    in this legal_text containing the word."""
                    parts = [col(c).ilike(pat(word)) for c in target_cols]
                    if search_articles:
                        parts.append(
                            select(1)
                            .select_from(Article)
                            .join(
                                ArticleVersion,
                                ArticleVersion.article_id == Article.id,
                            )
                            .where(
                                Article.legal_text_id == LegalText.id,
                                or_(
                                    col(ArticleVersion.text_fr).ilike(pat(word)),
                                    col(ArticleVersion.text_ht).ilike(pat(word)),
                                ),
                            )
                            .exists()
                        )
                    return or_(*parts)

                if q_mode == "exact":
                    # Treat the whole phrase as a single "word" so the same
                    # OR-across-targets predicate applies.
                    stmt = stmt.where(word_predicate(q_clean))
                else:
                    words = [w for w in q_clean.split() if w]
                    if words:
                        if q_mode == "any":
                            stmt = stmt.where(
                                or_(*(word_predicate(w) for w in words))
                            )
                        elif q_mode == "exclude":
                            stmt = stmt.where(
                                and_(*(not_(word_predicate(w)) for w in words))
                            )
                        else:  # "all" — every word must match somewhere
                            stmt = stmt.where(
                                and_(*(word_predicate(w) for w in words))
                            )

        total_stmt = select(func.count()).select_from(stmt.subquery())
        total = int(self.session.execute(total_stmt).scalar_one())

        # Tie-break with id DESC in every branch so pagination is stable when
        # the primary sort key is identical across rows (common for created_at
        # / updated_at on bulk-imported batches).
        if sort == "recently_updated":
            order_clauses = [desc(LegalText.updated_at), desc(LegalText.id)]
        elif sort == "recently_added":
            order_clauses = [desc(LegalText.created_at), desc(LegalText.id)]
        elif sort == "recently_published":
            order_clauses = [
                nullslast(desc(LegalText.published_at)),
                desc(LegalText.id),
            ]
        else:  # "publication_date" — historical publication date
            order_clauses = [
                nullslast(desc(LegalText.publication_date)),
                desc(LegalText.id),
            ]

        stmt = stmt.order_by(*order_clauses).offset(offset).limit(limit)

        rows = list(self.session.execute(stmt).scalars().all())
        return rows, total

    # -------------------------------------------------------------------
    # Theme tags
    # -------------------------------------------------------------------

    def get_theme_tags_for_text(self, text_id: int) -> List[LegalThemeTag]:
        """All theme tags attached to a given legal text, editor first."""
        stmt = (
            select(LegalThemeTag)
            .where(LegalThemeTag.legal_text_id == text_id)
            .order_by(
                # Editor-confirmed tags rank above auto suggestions.
                desc(LegalThemeTag.source == ThemeSource.editor),
                LegalThemeTag.theme,
            )
        )
        return list(self.session.execute(stmt).scalars().all())

    def get_theme_tags_for_texts(
        self, text_ids: List[int]
    ) -> dict[int, List[LegalThemeTag]]:
        """Bulk-fetch tags for many texts at once. Used by listing endpoints
        to avoid N+1 fetches when including theme chips on each result."""
        if not text_ids:
            return {}
        stmt = select(LegalThemeTag).where(
            LegalThemeTag.legal_text_id.in_(text_ids)
        )
        out: dict[int, list[LegalThemeTag]] = {tid: [] for tid in text_ids}
        for tag in self.session.execute(stmt).scalars().all():
            out.setdefault(tag.legal_text_id, []).append(tag)
        return out

    def replace_editor_theme_tags(
        self, text_id: int, themes: List[LegalTheme]
    ) -> List[LegalThemeTag]:
        """Editor-driven set: deletes existing editor tags and rewrites them.

        Auto tags are preserved — they remain visible alongside until an
        editor explicitly promotes or deletes them. Replacing only the
        editor set lets us treat editor input as the canonical layer
        without losing the suggester's history.
        """
        # Drop existing editor tags for this text.
        existing = self.session.execute(
            select(LegalThemeTag).where(
                LegalThemeTag.legal_text_id == text_id,
                LegalThemeTag.source == ThemeSource.editor,
            )
        ).scalars().all()
        for tag in existing:
            self.session.delete(tag)
        self.session.flush()

        # Insert new editor tags. If an auto tag already exists for the
        # same (text, theme), promote it to editor instead of double-rowing
        # (the unique constraint forbids that anyway).
        out: list[LegalThemeTag] = []
        for theme in themes:
            existing_auto = self.session.execute(
                select(LegalThemeTag).where(
                    LegalThemeTag.legal_text_id == text_id,
                    LegalThemeTag.theme == theme,
                )
            ).scalar_one_or_none()
            if existing_auto is not None:
                existing_auto.source = ThemeSource.editor
                out.append(existing_auto)
            else:
                tag = LegalThemeTag(
                    legal_text_id=text_id,
                    theme=theme,
                    source=ThemeSource.editor,
                )
                self.session.add(tag)
                out.append(tag)
        self.session.flush()
        return out

    def upsert_auto_theme_tags(
        self,
        text_id: int,
        suggestions: list[tuple[LegalTheme, float]],
    ) -> List[LegalThemeTag]:
        """Insert auto-suggester tags. Skips themes that already have an
        editor tag (we never overwrite editorial intent).
        """
        out: list[LegalThemeTag] = []
        for theme, confidence in suggestions:
            existing = self.session.execute(
                select(LegalThemeTag).where(
                    LegalThemeTag.legal_text_id == text_id,
                    LegalThemeTag.theme == theme,
                )
            ).scalar_one_or_none()
            if existing is not None:
                # Don't downgrade editor tags or overwrite confidence on
                # already-stored auto tags — the suggester is idempotent.
                if existing.source == ThemeSource.auto:
                    existing.confidence = round(Decimal(str(confidence)), 2)
                out.append(existing)
                continue
            tag = LegalThemeTag(
                legal_text_id=text_id,
                theme=theme,
                source=ThemeSource.auto,
                confidence=round(Decimal(str(confidence)), 2),
            )
            self.session.add(tag)
            out.append(tag)
        self.session.flush()
        return out

    def fetch_match_snippets(
        self,
        text_ids: List[int],
        q: str,
        *,
        per_text: int = 2,
    ) -> dict[int, list[dict]]:
        """For each given legal_text id, return up to `per_text` article
        snippets where the query matches the article body. Snippets come
        from Postgres `ts_headline` so the matched lexemes are wrapped in
        `<mark>...</mark>` and centered on the first match.

        Match detection uses the same accent-insensitive ILIKE as
        `list_texts` so the snippet set stays consistent with the filter.
        """
        if not text_ids or not q.strip():
            return {}

        sql = sa_text(
            """
            WITH ranked AS (
                SELECT
                    a.legal_text_id,
                    a.number,
                    a.slug,
                    av.text_fr,
                    av.text_ht,
                    a.position,
                    -- unaccent() applied to both side so "president" matches
                    -- "Président". Side-effect: snippets come back accent-
                    -- stripped (acceptable for the prototype).
                    ts_headline(
                        'french',
                        unaccent(coalesce(av.text_fr, '')),
                        plainto_tsquery('french', unaccent(:q)),
                        'MaxFragments=1, MaxWords=22, MinWords=8, ShortWord=2, '
                        'StartSel=<mark>, StopSel=</mark>, HighlightAll=FALSE'
                    ) AS snippet_fr,
                    CASE
                        WHEN coalesce(av.text_ht, '') = '' THEN NULL
                        ELSE ts_headline(
                            'simple',
                            unaccent(av.text_ht),
                            plainto_tsquery('simple', unaccent(:q)),
                            'MaxFragments=1, MaxWords=22, MinWords=8, ShortWord=2, '
                            'StartSel=<mark>, StopSel=</mark>, HighlightAll=FALSE'
                        )
                    END AS snippet_ht,
                    ROW_NUMBER() OVER (
                        PARTITION BY a.legal_text_id
                        ORDER BY a.position ASC NULLS LAST
                    ) AS rn
                FROM public_corpus.articles a
                JOIN public_corpus.article_versions av ON av.article_id = a.id
                WHERE a.legal_text_id = ANY(:text_ids)
                  AND (
                       unaccent(coalesce(av.text_fr, '')) ILIKE unaccent(:pattern)
                    OR unaccent(coalesce(av.text_ht, '')) ILIKE unaccent(:pattern)
                  )
            )
            SELECT legal_text_id, number, slug, snippet_fr, snippet_ht
            FROM ranked
            WHERE rn <= :per_text
            ORDER BY legal_text_id, rn
            """
        )
        rows = self.session.execute(
            sql,
            {
                "q": q,
                "pattern": f"%{q}%",
                "text_ids": text_ids,
                "per_text": per_text,
            },
        ).mappings().all()

        result: dict[int, list[dict]] = {}
        for r in rows:
            result.setdefault(int(r["legal_text_id"]), []).append(
                {
                    "article_number": r["number"],
                    "article_slug": r["slug"],
                    "snippet_fr": r["snippet_fr"],
                    "snippet_ht": r["snippet_ht"],
                }
            )
        return result

    def latest_by_category(
        self,
        category: LegalCategory,
        *,
        editorial_status: EditorialStatus = EditorialStatus.published,
    ) -> Optional[LegalText]:
        stmt = (
            select(LegalText)
            .where(LegalText.category == category)
            .where(LegalText.editorial_status == editorial_status)
            .order_by(
                nullslast(desc(LegalText.publication_date)),
                desc(LegalText.id),
            )
            .limit(1)
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def latest_by_subcategory(
        self,
        subcategory: CodeSubcategory,
        *,
        editorial_status: EditorialStatus = EditorialStatus.published,
    ) -> Optional[LegalText]:
        stmt = (
            select(LegalText)
            .where(LegalText.code_subcategory == subcategory)
            .where(LegalText.editorial_status == editorial_status)
            .order_by(
                nullslast(desc(LegalText.publication_date)),
                desc(LegalText.id),
            )
            .limit(1)
        )
        return self.session.execute(stmt).scalar_one_or_none()

    # -------------------------------------------------------------------
    # LegalHeading
    # -------------------------------------------------------------------

    def get_headings_by_text_id(self, text_id: int) -> List[LegalHeading]:
        stmt = (
            select(LegalHeading)
            .where(LegalHeading.legal_text_id == text_id)
            .order_by(LegalHeading.position, LegalHeading.id)
        )
        return list(self.session.execute(stmt).scalars().all())

    def get_heading_by_key(
        self, text_id: int, key: str
    ) -> Optional[LegalHeading]:
        stmt = select(LegalHeading).where(
            (LegalHeading.legal_text_id == text_id)
            & (LegalHeading.key == key)
        )
        return self.session.execute(stmt).scalar_one_or_none()

    # -------------------------------------------------------------------
    # Article
    # -------------------------------------------------------------------

    def get_article(self, article_id: int) -> Optional[Article]:
        stmt = (
            select(Article)
            .where(Article.id == article_id)
            .options(
                selectinload(Article.current_version),
                selectinload(Article.versions),
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def list_articles_by_text(
        self,
        text_id: int,
        *,
        heading_id: Optional[int] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Article], int]:
        limit = max(1, min(limit, 100))
        offset = max(0, offset)

        stmt = select(Article).where(Article.legal_text_id == text_id)
        if heading_id is not None:
            stmt = stmt.where(Article.heading_id == heading_id)

        total_stmt = select(func.count()).select_from(stmt.subquery())
        total = int(self.session.execute(total_stmt).scalar_one())

        stmt = (
            stmt.order_by(Article.position, Article.id)
            .offset(offset)
            .limit(limit)
        )
        rows = list(self.session.execute(stmt).scalars().all())
        return rows, total

    def list_amended_articles(self, text_id: int) -> List[Article]:
        """Articles in a legal text that have more than one version.

        Powers the constitutional-amendments page. Each returned Article has
        its full `versions` list eager-loaded (sorted by version_number) so
        the service can render the timeline without N+1 fetches.

        Filtering rule: COUNT(article_versions) > 1. Doesn't care about
        per-version status — a status filter would hide articles that were
        amended but stayed `in_force`. Editors can layer on status filters
        in the UI if desired.
        """
        # Subquery: article_id → versions count, with HAVING > 1.
        version_counts = (
            select(ArticleVersion.article_id)
            .group_by(ArticleVersion.article_id)
            .having(func.count() > 1)
            .subquery()
        )
        stmt = (
            select(Article)
            .join(version_counts, version_counts.c.article_id == Article.id)
            .where(Article.legal_text_id == text_id)
            .options(selectinload(Article.versions))
            .order_by(Article.position, Article.id)
        )
        return list(self.session.execute(stmt).scalars().all())

    # -------------------------------------------------------------------
    # Decision
    # -------------------------------------------------------------------

    def get_decision_by_slug(
        self,
        slug: str,
        *,
        editorial_status: Optional[EditorialStatus] = EditorialStatus.published,
    ) -> Optional[Decision]:
        """Look up a Decision by slug.

        `editorial_status` defaults to `published` — the public read path.
        Pass `None` for unfiltered access (editorial UI / ingestion / tests).
        """
        stmt = select(Decision).where(Decision.slug == slug)
        if editorial_status is not None:
            stmt = stmt.where(Decision.editorial_status == editorial_status)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_decision_by_id(self, decision_id: int) -> Optional[Decision]:
        return self.session.get(Decision, decision_id)

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
    ) -> Tuple[List[Decision], int]:
        limit = max(1, min(limit, 100))
        offset = max(0, offset)

        stmt = select(Decision)

        if court:
            stmt = stmt.where(Decision.court == court)
        if editorial_status:
            stmt = stmt.where(Decision.editorial_status == editorial_status)
        if date_from:
            stmt = stmt.where(Decision.decision_date >= date_from)
        if date_to:
            stmt = stmt.where(Decision.decision_date <= date_to)

        if q:
            q_clean = q.strip()
            if q_clean:
                pattern = f"%{q_clean}%"
                stmt = stmt.where(
                    or_(
                        Decision.summary_fr.ilike(pattern),
                        Decision.summary_ht.ilike(pattern),
                        Decision.headnotes_fr.ilike(pattern),
                        Decision.case_number.ilike(pattern),
                    )
                )

        total_stmt = select(func.count()).select_from(stmt.subquery())
        total = int(self.session.execute(total_stmt).scalar_one())

        stmt = (
            stmt.order_by(desc(Decision.decision_date), desc(Decision.id))
            .offset(offset)
            .limit(limit)
        )
        rows = list(self.session.execute(stmt).scalars().all())
        return rows, total

    # -------------------------------------------------------------------
    # Citation
    # -------------------------------------------------------------------

    def list_citations(
        self,
        *,
        source_type: Optional[CitationNodeType] = None,
        source_id: Optional[int] = None,
        target_type: Optional[CitationNodeType] = None,
        target_id: Optional[int] = None,
        relation: Optional[CitationRelation] = None,
        editorial_status: Optional[EditorialStatus] = EditorialStatus.published,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Citation], int]:
        limit = max(1, min(limit, 100))
        offset = max(0, offset)

        stmt = select(Citation)

        if source_type:
            stmt = stmt.where(Citation.source_node_type == source_type)
        if source_id is not None:
            stmt = stmt.where(Citation.source_node_id == source_id)
        if target_type:
            stmt = stmt.where(Citation.target_node_type == target_type)
        if target_id is not None:
            stmt = stmt.where(Citation.target_node_id == target_id)
        if relation:
            stmt = stmt.where(Citation.relation == relation)
        if editorial_status:
            stmt = stmt.where(Citation.editorial_status == editorial_status)

        total_stmt = select(func.count()).select_from(stmt.subquery())
        total = int(self.session.execute(total_stmt).scalar_one())

        stmt = (
            stmt.order_by(desc(Citation.created_at), desc(Citation.id))
            .offset(offset)
            .limit(limit)
        )
        rows = list(self.session.execute(stmt).scalars().all())
        return rows, total

    # -------------------------------------------------------------------
    # Batch article resolution (citation panel)
    # -------------------------------------------------------------------

    def resolve_articles(self, article_ids: list[int]) -> list[Article]:
        """Batch-fetch articles with their parent LegalText eagerly loaded."""
        if not article_ids:
            return []
        stmt = (
            select(Article)
            .where(Article.id.in_(article_ids))
            .options(selectinload(Article.legal_text))
        )
        return list(self.session.execute(stmt).scalars().all())
