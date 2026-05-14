"""Search repository — Postgres FTS via raw SQL.

The tsvector operator (`@@`) and `ts_rank_cd` / `ts_headline` aren't ergonomic
through SQLAlchemy's expression language, so we use raw SQL with bound
parameters. Two queries per search:

  1. find matching legal_texts with rank + matched-article count, paginated
  2. fetch top-N article snippets per text (highlighted via ts_headline)

`vector + reranker` retrieval will layer on top of this when embeddings are
populated; for Phase 0 lexical search alone is sufficient and meets ADR-001's
"Postgres FTS first" stance.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session

from schemas.enums import CodeSubcategory, LegalCategory, LegalStatus


# ts_headline options:
#   MaxFragments=1     — one snippet, joined with ellipsis if needed
#   MaxWords=30        — ~3 lines on mobile
#   MinWords=8         — avoid tiny snippets
#   ShortWord=2        — strip 1-letter words from boundary trimming
#   FragmentDelimiter  — visible cue between fragments
_HEADLINE_OPTS = (
    "MaxFragments=1, MaxWords=30, MinWords=8, "
    'ShortWord=2, FragmentDelimiter=" ... "'
)


class SearchRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    # -------------------------------------------------------------------
    # Stage 1 — score and paginate matching legal_texts
    # -------------------------------------------------------------------

    def search_texts(
        self,
        q: str,
        *,
        category: Optional[LegalCategory] = None,
        code_subcategory: Optional[CodeSubcategory] = None,
        legal_status: Optional[LegalStatus] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        params = {
            "q": q,
            "limit": limit,
            "offset": offset,
            "category": category.value if category else None,
            "code_subcategory": code_subcategory.value if code_subcategory else None,
            "legal_status": legal_status.value if legal_status else None,
        }

        sql = sa_text(
            """
            WITH article_matches AS (
                SELECT
                    a.legal_text_id,
                    av.id AS av_id,
                    GREATEST(
                        ts_rank_cd(av.search_vector_fr, plainto_tsquery('french', :q)),
                        ts_rank_cd(av.search_vector_ht, plainto_tsquery('simple', :q))
                    ) AS rank
                FROM public_corpus.article_versions av
                JOIN public_corpus.articles a ON a.id = av.article_id
                WHERE (
                    av.search_vector_fr @@ plainto_tsquery('french', :q)
                    OR av.search_vector_ht @@ plainto_tsquery('simple', :q)
                )
                  AND av.editorial_status = 'published'
            ),
            text_matches AS (
                -- Rank against title + description + preamble + identifier
                -- fields. The identifier fields (slug, moniteur_ref, the
                -- promoting Moniteur entry's detected_number) carry the
                -- alphanumeric loi numbers like "CL-007-09-09" that users
                -- type verbatim into the search bar but that aren't in the
                -- prose of title_fr / description_fr.
                --
                -- Hyphens are split to spaces before tokenizing so
                -- plainto_tsquery's hyphen-splitting tokenization aligns
                -- with the source. preamble_fr also holds the full body
                -- text for legal_texts that haven't been structured into
                -- articles yet (e.g. historical constitutions).
                --
                -- A LATERAL subquery builds the tsvector once per row so
                -- the source isn't duplicated between the SELECT and the
                -- WHERE.
                --
                -- TODO: when the corpus grows, materialize this into a
                -- STORED generated tsvector column to avoid recomputing
                -- per query.
                SELECT
                    lt.id AS legal_text_id,
                    ts_rank_cd(s.tsv, plainto_tsquery('french', :q)) AS rank
                FROM public_corpus.legal_texts lt
                CROSS JOIN LATERAL (
                    SELECT to_tsvector(
                        'french',
                        coalesce(lt.title_fr, '') || ' ' ||
                        coalesce(lt.description_fr, '') || ' ' ||
                        coalesce(lt.preamble_fr, '') || ' ' ||
                        replace(coalesce(lt.slug, ''), '-', ' ') || ' ' ||
                        replace(coalesce(lt.moniteur_ref, ''), '-', ' ') || ' ' ||
                        coalesce((
                            SELECT string_agg(
                                replace(me.detected_number, '-', ' '),
                                ' '
                            )
                            FROM public_corpus.moniteur_entries me
                            WHERE me.promoted_legal_text_id = lt.id
                              AND me.detected_number IS NOT NULL
                        ), '')
                    ) AS tsv
                ) s
                WHERE s.tsv @@ plainto_tsquery('french', :q)
                  AND lt.editorial_status = 'published'
            ),
            identifier_matches AS (
                -- Fuzzy fallback for loi-number-like queries. Postgres FTS
                -- requires every token to match, so a single-character typo
                -- in an identifier like "CL-007-07-09" (vs the real
                -- "CL-007-09-09") returns nothing. pg_trgm's similarity
                -- gives us a 0.0–1.0 score we threshold at 0.3 (the
                -- pg_trgm default) to surface near-misses.
                --
                -- Only fires when the query LOOKS like an identifier (has
                -- a hyphen, or is short and alphanumeric) — otherwise it
                -- would slow down full-text queries and surface noisy
                -- matches on substrings of common French words.
                --
                -- The ranks here are deliberately small (max 1.0) so a
                -- clean FTS hit always beats a fuzzy identifier hit when
                -- both fire.
                SELECT
                    lt.id AS legal_text_id,
                    GREATEST(
                        similarity(coalesce(lt.slug, ''), :q),
                        similarity(coalesce(lt.moniteur_ref, ''), :q),
                        coalesce((
                            SELECT MAX(similarity(me.detected_number, :q))
                            FROM public_corpus.moniteur_entries me
                            WHERE me.promoted_legal_text_id = lt.id
                              AND me.detected_number IS NOT NULL
                        ), 0)
                    ) AS rank
                FROM public_corpus.legal_texts lt
                WHERE :q ~ '^[A-Za-z0-9./_-]+$'
                  AND (length(:q) <= 24 OR strpos(:q, '-') > 0)
                  AND lt.editorial_status = 'published'
                  AND (
                    coalesce(lt.slug, '') % :q
                    OR coalesce(lt.moniteur_ref, '') % :q
                    OR EXISTS (
                        SELECT 1
                        FROM public_corpus.moniteur_entries me
                        WHERE me.promoted_legal_text_id = lt.id
                          AND me.detected_number IS NOT NULL
                          AND me.detected_number % :q
                    )
                  )
            ),
            scored AS (
                SELECT
                    legal_text_id,
                    SUM(rank) AS rank,
                    COUNT(DISTINCT av_id) AS matched
                FROM article_matches
                GROUP BY legal_text_id

                UNION ALL

                -- Boost title/description matches; they're more deliberate.
                SELECT legal_text_id, rank * 1.5 AS rank, 0 AS matched
                FROM text_matches

                UNION ALL

                -- Fuzzy identifier matches. Trigram similarity is naturally
                -- in [0,1] and we keep it small so a clean FTS hit (which
                -- can rank well above 1.0 with the *1.5 boost) always
                -- outranks a fuzzy near-miss.
                SELECT legal_text_id, rank, 0 AS matched
                FROM identifier_matches
            ),
            aggregated AS (
                SELECT
                    legal_text_id,
                    SUM(rank) AS total_rank,
                    SUM(matched) AS matched_articles
                FROM scored
                GROUP BY legal_text_id
            )
            SELECT
                lt.id,
                lt.slug,
                lt.title_fr,
                lt.title_ht,
                lt.category::text AS category,
                lt.code_subcategory::text AS code_subcategory,
                lt.status::text AS status,
                lt.editorial_status::text AS editorial_status,
                lt.moniteur_ref,
                lt.publication_date,
                lt.description_fr,
                lt.description_ht,
                ag.total_rank,
                ag.matched_articles,
                COUNT(*) OVER () AS total_count
            FROM aggregated ag
            JOIN public_corpus.legal_texts lt ON lt.id = ag.legal_text_id
            WHERE lt.editorial_status = 'published'
              AND (CAST(:category AS text) IS NULL OR lt.category::text = :category)
              AND (
                CAST(:code_subcategory AS text) IS NULL
                OR lt.code_subcategory::text = :code_subcategory
              )
              AND (CAST(:legal_status AS text) IS NULL OR lt.status::text = :legal_status)
            ORDER BY ag.total_rank DESC,
                     lt.publication_date DESC NULLS LAST,
                     lt.id DESC
            LIMIT :limit OFFSET :offset
            """
        )

        rows = self.session.execute(sql, params).mappings().all()
        if not rows:
            return [], 0

        total = int(rows[0]["total_count"])
        return [dict(r) for r in rows], total

    # -------------------------------------------------------------------
    # Stage 2 — top-N snippets per matched text
    # -------------------------------------------------------------------

    def fetch_snippets_for_texts(
        self,
        text_ids: list[int],
        q: str,
        *,
        per_text: int = 3,
    ) -> dict[int, list[dict[str, Any]]]:
        if not text_ids:
            return {}

        sql = sa_text(
            f"""
            WITH ranked AS (
                SELECT
                    a.legal_text_id,
                    a.id AS article_id,
                    a.number,
                    a.slug AS article_slug,
                    a.position,
                    a.heading_id,
                    a.domain_tags,
                    av.title_fr,
                    av.title_ht,
                    GREATEST(
                        ts_rank_cd(av.search_vector_fr, plainto_tsquery('french', :q)),
                        ts_rank_cd(av.search_vector_ht, plainto_tsquery('simple', :q))
                    ) AS rank,
                    ts_headline(
                        'french',
                        coalesce(av.text_fr, ''),
                        plainto_tsquery('french', :q),
                        '{_HEADLINE_OPTS}'
                    ) AS snippet_fr,
                    CASE
                        WHEN coalesce(av.text_ht, '') = '' THEN ''
                        ELSE ts_headline(
                            'simple',
                            av.text_ht,
                            plainto_tsquery('simple', :q),
                            '{_HEADLINE_OPTS}'
                        )
                    END AS snippet_ht,
                    ROW_NUMBER() OVER (
                        PARTITION BY a.legal_text_id
                        ORDER BY GREATEST(
                            ts_rank_cd(
                                av.search_vector_fr,
                                plainto_tsquery('french', :q)
                            ),
                            ts_rank_cd(
                                av.search_vector_ht,
                                plainto_tsquery('simple', :q)
                            )
                        ) DESC
                    ) AS rn
                FROM public_corpus.article_versions av
                JOIN public_corpus.articles a ON a.id = av.article_id
                WHERE a.legal_text_id = ANY(:text_ids)
                  AND (
                    av.search_vector_fr @@ plainto_tsquery('french', :q)
                    OR av.search_vector_ht @@ plainto_tsquery('simple', :q)
                  )
                  AND av.editorial_status = 'published'
            )
            SELECT *
            FROM ranked
            WHERE rn <= :per_text
            ORDER BY legal_text_id, rn
            """
        )

        rows = self.session.execute(
            sql, {"q": q, "text_ids": text_ids, "per_text": per_text}
        ).mappings().all()

        grouped: dict[int, list[dict[str, Any]]] = {}
        for r in rows:
            grouped.setdefault(int(r["legal_text_id"]), []).append(dict(r))
        return grouped
