"""legal theme tags (many-to-many)

Revision ID: 0005_legal_theme_tags
Revises: 1c1eaa9fd7c7
Create Date: 2026-05-05

Adds the cross-cutting "Thématiques" tagging system used by the homepage
"Thématiques" megamenu and the /lois?theme=… filter.

Why a separate join table (and not an ARRAY column on legal_texts)?
  - We need per-row metadata (source = editor|auto, confidence) on each
    tag. ARRAY of enums can't carry that.
  - Editors will eventually review auto-suggested tags one at a time —
    a row-per-tag makes UPDATE / DELETE granular.
  - Indexes per (theme, legal_text_id) give fast theme-filtered listings.

Schema:
  - legal_theme            (Postgres enum, 12 themes — see enums.py)
  - theme_source           (Postgres enum: editor | auto)
  - legal_theme_tags       (id, legal_text_id, theme, source, confidence,
                            created_at, updated_at)
    UNIQUE (legal_text_id, theme) — a text can't carry the same tag twice.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005_legal_theme_tags"
down_revision: Union[str, None] = "1c1eaa9fd7c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LEGAL_THEME_VALUES = (
    "droit_societes",
    "droit_fiscal",
    "droit_bancaire",
    "propriete_intellectuelle",
    "droit_travail",
    "protection_sociale",
    "droit_famille",
    "successions",
    "droit_administratif",
    "marches_publics",
    "environnement",
    "foncier",
)

THEME_SOURCE_VALUES = ("editor", "auto")


def upgrade() -> None:
    # Postgres enums in the public_corpus schema. Use a DO block instead of
    # SQLAlchemy's `.create(checkfirst=True)` because the latter can race
    # against other transactions creating the same type, and Postgres has
    # no native CREATE TYPE IF NOT EXISTS.
    bind = op.get_bind()
    bind.exec_driver_sql(
        f"""
        DO $$ BEGIN
            CREATE TYPE public_corpus.legal_theme AS ENUM (
                {", ".join(repr(v) for v in LEGAL_THEME_VALUES)}
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    bind.exec_driver_sql(
        f"""
        DO $$ BEGIN
            CREATE TYPE public_corpus.theme_source AS ENUM (
                {", ".join(repr(v) for v in THEME_SOURCE_VALUES)}
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    # Raw CREATE TABLE — `op.create_table` with `sa.Enum(create_type=False)`
    # still triggers SQLAlchemy's `_on_table_create` event which re-issues
    # CREATE TYPE for enum columns. Bypass it.
    bind.exec_driver_sql(
        """
        CREATE TABLE public_corpus.legal_theme_tags (
            id              SERIAL PRIMARY KEY,
            legal_text_id   INTEGER NOT NULL
                            REFERENCES public_corpus.legal_texts (id)
                            ON DELETE CASCADE,
            theme           public_corpus.legal_theme NOT NULL,
            source          public_corpus.theme_source NOT NULL DEFAULT 'auto',
            confidence      NUMERIC(3, 2),
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_legal_theme_tags_text_theme
                UNIQUE (legal_text_id, theme)
        );
        """
    )
    op.create_index(
        "ix_legal_theme_tags_legal_text_id",
        "legal_theme_tags",
        ["legal_text_id"],
        schema="public_corpus",
    )
    op.create_index(
        "ix_legal_theme_tags_theme",
        "legal_theme_tags",
        ["theme"],
        schema="public_corpus",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_legal_theme_tags_theme",
        table_name="legal_theme_tags",
        schema="public_corpus",
    )
    op.drop_index(
        "ix_legal_theme_tags_legal_text_id",
        table_name="legal_theme_tags",
        schema="public_corpus",
    )
    op.drop_table("legal_theme_tags", schema="public_corpus")

    theme_source = postgresql.ENUM(
        *THEME_SOURCE_VALUES, name="theme_source", schema="public_corpus"
    )
    theme_source.drop(op.get_bind(), checkfirst=True)

    legal_theme = postgresql.ENUM(
        *LEGAL_THEME_VALUES, name="legal_theme", schema="public_corpus"
    )
    legal_theme.drop(op.get_bind(), checkfirst=True)
