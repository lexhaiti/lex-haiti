"""tsvector_ast_amendments

Restores the migration that adds:
  - article_versions.search_vector_fr (STORED tsvector generated column) + GIN
  - article_versions.search_vector_ht (STORED tsvector generated column) + GIN
  - article_versions.content_ast_fr  (JSONB)
  - article_versions.content_ast_ht  (JSONB)
  - article_versions.embedding HNSW index
  - btree index on article_versions.source_amendment_id
  - legal_texts.search_vector_fr (STORED tsvector generated column) + GIN

This file was lost when an upstream worktree was cleaned; the DB has
the columns/indexes applied already. The migration is intentionally
idempotent (CREATE … IF NOT EXISTS, DROP … IF EXISTS) so a stamp / re-
apply mismatch on any developer machine is harmless.

Revision ID: 0015_tsvector_ast_amendments
Revises: 0014_moniteur_transcript
Create Date: 2026-05-10 12:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "0015_tsvector_ast_amendments"
down_revision: Union[str, None] = "0014_moniteur_transcript"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── article_versions: tsvector generated columns ──────────────────────
    op.execute(
        """
        ALTER TABLE public_corpus.article_versions
            ADD COLUMN IF NOT EXISTS search_vector_fr tsvector
            GENERATED ALWAYS AS (
                to_tsvector(
                    'french',
                    COALESCE(title_fr, '') || ' ' || COALESCE(text_fr, '')
                )
            ) STORED
        """
    )
    op.execute(
        """
        ALTER TABLE public_corpus.article_versions
            ADD COLUMN IF NOT EXISTS search_vector_ht tsvector
            GENERATED ALWAYS AS (
                to_tsvector(
                    'simple',
                    COALESCE(title_ht, '') || ' ' || COALESCE(text_ht, '')
                )
            ) STORED
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_article_versions_search_fr "
        "ON public_corpus.article_versions USING GIN (search_vector_fr)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_article_versions_search_ht "
        "ON public_corpus.article_versions USING GIN (search_vector_ht)"
    )

    # ── article_versions: content AST JSONB ───────────────────────────────
    op.execute(
        "ALTER TABLE public_corpus.article_versions "
        "ADD COLUMN IF NOT EXISTS content_ast_fr JSONB"
    )
    op.execute(
        "ALTER TABLE public_corpus.article_versions "
        "ADD COLUMN IF NOT EXISTS content_ast_ht JSONB"
    )

    # ── article_versions: embedding HNSW (already pgvector-enabled) ──────
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_article_versions_embedding "
        "ON public_corpus.article_versions USING hnsw (embedding vector_cosine_ops)"
    )

    # ── article_versions: source_amendment_id index ─────────────────────
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_article_versions_source_amendment_id "
        "ON public_corpus.article_versions (source_amendment_id)"
    )

    # ── legal_texts: search_vector_fr generated + GIN ────────────────────
    op.execute(
        """
        ALTER TABLE public_corpus.legal_texts
            ADD COLUMN IF NOT EXISTS search_vector_fr tsvector
            GENERATED ALWAYS AS (
                to_tsvector(
                    'french',
                    COALESCE(title_fr, '') || ' ' ||
                    COALESCE(description_fr, '') || ' ' ||
                    COALESCE(preamble_fr, '') || ' ' ||
                    replace(COALESCE(slug, ''), '-', ' ') || ' ' ||
                    replace(COALESCE(moniteur_ref, ''), '-', ' ')
                )
            ) STORED
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_legal_texts_search_vector_fr "
        "ON public_corpus.legal_texts USING GIN (search_vector_fr)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS public_corpus.ix_legal_texts_search_vector_fr")
    op.execute(
        "ALTER TABLE public_corpus.legal_texts DROP COLUMN IF EXISTS search_vector_fr"
    )

    op.execute("DROP INDEX IF EXISTS public_corpus.ix_article_versions_source_amendment_id")
    op.execute("DROP INDEX IF EXISTS public_corpus.ix_article_versions_embedding")
    op.execute(
        "ALTER TABLE public_corpus.article_versions DROP COLUMN IF EXISTS content_ast_ht"
    )
    op.execute(
        "ALTER TABLE public_corpus.article_versions DROP COLUMN IF EXISTS content_ast_fr"
    )
    op.execute("DROP INDEX IF EXISTS public_corpus.ix_article_versions_search_ht")
    op.execute("DROP INDEX IF EXISTS public_corpus.ix_article_versions_search_fr")
    op.execute(
        "ALTER TABLE public_corpus.article_versions DROP COLUMN IF EXISTS search_vector_ht"
    )
    op.execute(
        "ALTER TABLE public_corpus.article_versions DROP COLUMN IF EXISTS search_vector_fr"
    )
