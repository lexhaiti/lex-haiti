"""Add ``official_title_fr`` and ``official_title_ht`` to ``legal_texts``.

The body of a LawDetail page mirrors the Le Moniteur masthead: under
the devise ("LIBERTÉ ÉGALITÉ FRATERNITÉ / RÉPUBLIQUE D'HAÏTI") the
act announces its class (ARRÊTÉ / DÉCRET / LOI / …) and then states
its official title in the verbatim form printed in the journal — no
date, exact capitalisation as published. The existing ``title_*``
columns hold the editor-friendly citation form (typically prefixed
with the date, used in lists and the hero h1); we need a separate
verbatim field so the body can render the official wording without
forcing editors to overload the title column.

Both columns are nullable — historical texts may not have an
official version captured, and the field is fully editorial. When
the value is null, the LawDetail body falls back to ``title_*``.

Revision ID: 0028_lt_official_title
Revises: 0027_lt_mentions_proc
Create Date: 2026-05-17
"""

import sqlalchemy as sa
from alembic import op


revision = "0028_lt_official_title"
down_revision = "0027_lt_mentions_proc"
branch_labels = None
depends_on = None


SCHEMA = "public_corpus"


def upgrade() -> None:
    op.add_column(
        "legal_texts",
        sa.Column("official_title_fr", sa.Text(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "legal_texts",
        sa.Column("official_title_ht", sa.Text(), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("legal_texts", "official_title_ht", schema=SCHEMA)
    op.drop_column("legal_texts", "official_title_fr", schema=SCHEMA)
