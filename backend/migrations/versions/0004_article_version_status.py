"""add per-version legal status to article_versions

Revision ID: 0004_article_version_status
Revises: 0003_relax_article_number_unique
Create Date: 2026-05-02

Légifrance-style per-article state. Whole-text `legal_texts.status`
(in_force / abrogated / partially_abrogated) tells us about the document
overall; a Code can be in_force while individual articles are abrogated
or have a closed effective_from→effective_to window.

This migration adds:
  - public_corpus.article_status enum (in_force, abrogated, suspended,
    transferred, obsolete)
  - article_versions.status column (default in_force) with an index — the
    /lois listing will eventually filter by it.
  - article_versions.transferred_to_article_id FK — when an article is
    renumbered, point at its successor instead of duplicating the text.

All existing rows default to `in_force`. Editors flip the status from the
metadata editor as the corpus is cleaned.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_article_version_status"
down_revision: Union[str, None] = "0003_relax_article_number_unique"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ARTICLE_STATUS_VALUES = (
    "in_force",
    "abrogated",
    "suspended",
    "transferred",
    "obsolete",
)


def upgrade() -> None:
    article_status = postgresql.ENUM(
        *ARTICLE_STATUS_VALUES,
        name="article_status",
        schema="public_corpus",
    )
    article_status.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "article_versions",
        sa.Column(
            "status",
            sa.Enum(
                *ARTICLE_STATUS_VALUES,
                name="article_status",
                schema="public_corpus",
                create_type=False,
            ),
            nullable=False,
            server_default="in_force",
        ),
        schema="public_corpus",
    )
    op.create_index(
        "ix_article_versions_status",
        "article_versions",
        ["status"],
        schema="public_corpus",
    )

    op.add_column(
        "article_versions",
        sa.Column(
            "transferred_to_article_id",
            sa.Integer(),
            sa.ForeignKey(
                "public_corpus.articles.id",
                ondelete="SET NULL",
                name="fk_article_versions_transferred_to",
            ),
            nullable=True,
        ),
        schema="public_corpus",
    )


def downgrade() -> None:
    op.drop_column(
        "article_versions",
        "transferred_to_article_id",
        schema="public_corpus",
    )
    op.drop_index(
        "ix_article_versions_status",
        table_name="article_versions",
        schema="public_corpus",
    )
    op.drop_column("article_versions", "status", schema="public_corpus")

    article_status = postgresql.ENUM(
        *ARTICLE_STATUS_VALUES,
        name="article_status",
        schema="public_corpus",
    )
    article_status.drop(op.get_bind(), checkfirst=True)
