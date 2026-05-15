"""Add an index on ``articles.current_version_id``.

The 0001 schema declares the FK but no index. Every join from
``articles`` to ``article_versions`` via ``current_version_id`` —
which happens on the public law-detail page, the translation-stats
dashboard, the editorial worklist, and the article search rendering
— pays for a sequential scan of ``articles``. ~3.5k rows today; the
seq-scan won't hurt yet but the missing index is invisible to query
planners trying to push down filters against it.

Postgres index creation is fast on a table this size, so we run it
in-band (not CONCURRENTLY) — the deploy migration step blocks for a
few hundred ms.

Revision ID: 0025_idx_articles_curr_ver
Revises: 0024_moniteur_doctype_note
Create Date: 2026-05-15
"""

from alembic import op


revision = "0025_idx_articles_curr_ver"
down_revision = "0024_moniteur_doctype_note"
branch_labels = None
depends_on = None


SCHEMA = "public_corpus"


def upgrade() -> None:
    op.create_index(
        "ix_articles_current_version_id",
        "articles",
        ["current_version_id"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_articles_current_version_id",
        table_name="articles",
        schema=SCHEMA,
    )
