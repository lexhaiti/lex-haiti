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
    LegalSigner,
    LegalText,
    LegalThemeTag,
)


# ---------------------------------------------------------------------------
# Free-text q clause builder — shared between the simple list_texts() flow
# (one q + q_field + q_mode) and the advanced search flow (N criteria
# composed with AND/OR/NOT).
# ---------------------------------------------------------------------------


def _build_q_clause(q: str, q_field: str, q_mode: str):
    """Return a SQLAlchemy boolean expression for a single text criterion,
    or None if the query is empty.

    `q_field` controls which columns we match against:
      - "title"        : title_fr + title_ht
      - "description"  : description_fr + description_ht
      - "all" (default): titles + descriptions + moniteur_ref + an
                         EXISTS on the legal_text's article bodies
                         (ArticleVersion.text_fr/_ht) so a body match
                         qualifies the parent text.

    `q_mode` controls how the words combine:
      - "all"     : every word must match somewhere
      - "exact"   : the whole phrase as a single substring
      - "any"     : at least one word matches
      - "exclude" : none of the words match (each word is NOT'd)
    """
    if not q:
        return None
    q_clean = q.strip()
    if not q_clean:
        return None

    title_cols = [LegalText.title_fr, LegalText.title_ht]
    desc_cols = [LegalText.description_fr, LegalText.description_ht]
    if q_field == "title":
        target_cols = title_cols
    elif q_field == "description":
        target_cols = desc_cols
    else:
        target_cols = title_cols + desc_cols + [LegalText.moniteur_ref]
    search_articles = q_field == "all"

    # NULL-safe + accent-insensitive helpers. Coalesce nulls before
    # ILIKE so the predicate never returns NULL (which would silently
    # break the `exclude` / NOT branches).
    def col(c):
        return func.unaccent(func.coalesce(c, ""))

    def pat(word: str):
        return func.unaccent(f"%{word}%")

    def word_predicate(word: str):
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
        return word_predicate(q_clean)

    words = [w for w in q_clean.split() if w]
    if not words:
        return None
    if q_mode == "any":
        return or_(*(word_predicate(w) for w in words))
    if q_mode == "exclude":
        return and_(*(not_(word_predicate(w)) for w in words))
    # "all" (default) — every word must match somewhere
    return and_(*(word_predicate(w) for w in words))


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
            clause = _build_q_clause(q, q_field, q_mode)
            if clause is not None:
                stmt = stmt.where(clause)

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
        elif sort == "oldest":
            # Historical publication date, oldest first. NULLs last so
            # undated texts don't dominate the head of the list.
            order_clauses = [
                nullslast(LegalText.publication_date.asc()),
                LegalText.id.asc(),
            ]
        elif sort == "alphabetical":
            # Title sort using the French title (the primary editorial
            # title). Postgres' default collation ordering is reasonable
            # for French; the collation can be tuned per-column later if
            # diacritic ordering becomes a problem in practice.
            order_clauses = [
                nullslast(LegalText.title_fr.asc()),
                LegalText.id.asc(),
            ]
        else:  # "publication_date" — historical publication date, newest first
            order_clauses = [
                nullslast(desc(LegalText.publication_date)),
                desc(LegalText.id),
            ]

        stmt = stmt.order_by(*order_clauses).offset(offset).limit(limit)

        # Eager-load the linked Moniteur issue so the schema-side
        # publication_date fallback can read ``moniteur_issue.publication_date``
        # without firing an extra query per row.
        stmt = stmt.options(selectinload(LegalText.moniteur_issue))

        rows = list(self.session.execute(stmt).scalars().all())
        return rows, total

    def advanced_search_texts(
        self,
        *,
        criteria: List[dict],
        category: Optional[LegalCategory] = None,
        code_subcategory: Optional[CodeSubcategory] = None,
        legal_status: Optional[LegalStatus] = None,
        editorial_status: Optional[EditorialStatus] = EditorialStatus.published,
        year_from: Optional[int] = None,
        year_to: Optional[int] = None,
        sort: str = "publication_date",
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[LegalText], int]:
        """Multi-criterion search composed server-side with AND / OR / NOT.

        Each `criteria` entry is a dict shaped like:
            {
                "operator": "AND" | "OR" | "NOT"   (default AND)
                "field":    "all" | "title" | "description"  (default all)
                "mode":     "all" | "exact" | "any" | "exclude"  (default all)
                "text":     str  (required, non-empty)
            }

        Composition:
          • All AND criteria → ANDed together (every one must match).
          • All OR criteria → ORed together (at least one must match);
            the OR group is then ANDed with the AND group.
          • All NOT criteria → each is NOT'd and ANDed with the rest.

        Empty criteria (text="" after strip) are silently dropped so the
        editor can leave a blank row without it nuking the result set.

        Same category / status / year / sort / pagination shape as
        `list_texts()` so the route can reuse the LegalTextListItem
        response model.
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

        # Bucket non-empty criteria by operator. The first criterion's
        # operator is treated as AND (the UI hides the operator selector
        # for the first row — there's nothing before it to connect to).
        and_clauses, or_clauses, not_clauses = [], [], []
        for i, c in enumerate(criteria or []):
            text = (c.get("text") or "").strip()
            if not text:
                continue
            clause = _build_q_clause(
                text,
                c.get("field", "all"),
                c.get("mode", "all"),
            )
            if clause is None:
                continue
            op = (c.get("operator") or "AND") if i > 0 else "AND"
            if op == "OR":
                or_clauses.append(clause)
            elif op == "NOT":
                not_clauses.append(clause)
            else:
                and_clauses.append(clause)

        # Combine the three groups. Empty groups are dropped so we don't
        # ship a no-op `True` predicate that confuses the query planner.
        combined = []
        if and_clauses:
            combined.append(and_(*and_clauses))
        if or_clauses:
            combined.append(or_(*or_clauses))
        if not_clauses:
            combined.append(and_(*(not_(c) for c in not_clauses)))
        if combined:
            stmt = stmt.where(and_(*combined))

        total_stmt = select(func.count()).select_from(stmt.subquery())
        total = int(self.session.execute(total_stmt).scalar_one())

        # Sort + paginate — identical to list_texts(). Worth a future
        # refactor into a shared helper if a third caller appears.
        if sort == "recently_updated":
            order_clauses = [desc(LegalText.updated_at), desc(LegalText.id)]
        elif sort == "recently_added":
            order_clauses = [desc(LegalText.created_at), desc(LegalText.id)]
        elif sort == "recently_published":
            order_clauses = [
                nullslast(desc(LegalText.published_at)),
                desc(LegalText.id),
            ]
        elif sort == "oldest":
            order_clauses = [
                nullslast(LegalText.publication_date.asc()),
                LegalText.id.asc(),
            ]
        elif sort == "alphabetical":
            order_clauses = [
                nullslast(LegalText.title_fr.asc()),
                LegalText.id.asc(),
            ]
        else:
            order_clauses = [
                nullslast(desc(LegalText.publication_date)),
                desc(LegalText.id),
            ]

        stmt = stmt.order_by(*order_clauses).offset(offset).limit(limit)

        # Same Moniteur-issue eager-load as list_texts so the schema-side
        # publication_date fallback doesn't fire per-row queries.
        stmt = stmt.options(selectinload(LegalText.moniteur_issue))

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

    def get_heading_by_id(self, heading_id: int) -> Optional[LegalHeading]:
        return self.session.get(LegalHeading, heading_id)

    def update_heading_titles(
        self,
        heading: LegalHeading,
        *,
        title_fr: Optional[str] = None,
        title_ht: Optional[str] = None,
    ) -> LegalHeading:
        """Update a heading's bilingual title in place. ``None`` means
        "leave untouched"; empty string clears the field. Caller owns
        the commit.
        """
        if title_fr is not None:
            heading.title_fr = title_fr.strip() or None
        if title_ht is not None:
            heading.title_ht = title_ht.strip() or None
        self.session.flush()
        return heading

    # -------------------------------------------------------------------
    # LegalSigner — manual CRUD for the editor (parser fills these too,
    # but the editor needs add / patch / delete for cases where the
    # parser missed something or the source carries no structured
    # signatory block).
    # -------------------------------------------------------------------

    def get_signer_by_id(self, signer_id: int) -> Optional[LegalSigner]:
        return self.session.get(LegalSigner, signer_id)

    def list_signers_by_text(self, text_id: int) -> list[LegalSigner]:
        stmt = (
            select(LegalSigner)
            .where(LegalSigner.legal_text_id == text_id)
            .order_by(LegalSigner.position, LegalSigner.id)
        )
        return list(self.session.execute(stmt).scalars().all())

    def create_signer(
        self,
        legal_text_id: int,
        data: dict,
    ) -> LegalSigner:
        """Insert a new signer. ``data`` carries any LegalSignerCreate
        fields. ``position`` defaults to "last in the list" so editor
        appends behave intuitively without explicit ordering.
        """
        if data.get("position") is None:
            existing = self.list_signers_by_text(legal_text_id)
            data["position"] = (
                max((s.position for s in existing), default=-1) + 1
            )
        signer = LegalSigner(
            legal_text_id=legal_text_id,
            **{k: v for k, v in data.items() if v is not None},
        )
        self.session.add(signer)
        self.session.flush()
        return signer

    def update_signer(
        self,
        signer: LegalSigner,
        patch: dict,
    ) -> LegalSigner:
        """Apply partial update — only keys present in ``patch`` are
        touched. Caller owns the commit.
        """
        for key, value in patch.items():
            setattr(signer, key, value)
        self.session.flush()
        return signer

    def delete_signer(self, signer: LegalSigner) -> None:
        self.session.delete(signer)
        self.session.flush()

    # -------------------------------------------------------------------
    # LegalText delete — used by the editor to remove a draft before
    # promotion to ``published``. Most dependent tables are declared with
    # ``ondelete=CASCADE`` (legal_theme_tags, legal_headings,
    # legal_signers, articles → article_versions) so a single DB-level
    # DELETE removes the whole subtree. MoniteurEntry.promoted_legal_text_id
    # is ``ondelete=SET NULL`` which is what we want — the source entry
    # in Le Moniteur should survive the deletion of its promoted draft
    # so the editor can re-promote it later.
    # -------------------------------------------------------------------

    def delete_text(self, text: LegalText) -> None:
        """Delete a LegalText row + everything that cascades from it."""
        self.session.delete(text)
        self.session.flush()

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
