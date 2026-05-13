"""Add ``enacting_formula_align`` column to legal_texts.

Editor-controlled alignment for the enacting formula block on the
law detail page (``Sur proposition de … Le Sénat a adopté la loi
suivante :``). Stored as a short text column rather than a Postgres
enum so the value set can grow cheaply (e.g. ``justify`` later)
without an ``ALTER TYPE`` round trip.

Default ``left`` — matches the recent renderer change that moved
the compact ``EditableFormalBlock`` away from centred output. Old
rows pick up the default at backfill time so the legal_texts read
path stays NOT NULL safe.

Revision ID: 0022_enacting_formula_align
Revises: 0021_moniteur_correspondance
Create Date: 2026-05-13
"""

from alembic import op
import sqlalchemy as sa


revision = "0022_enacting_formula_align"
down_revision = "0021_moniteur_correspondance"
branch_labels = None
depends_on = None


SCHEMA = "public_corpus"


def upgrade() -> None:
    op.add_column(
        "legal_texts",
        sa.Column(
            "enacting_formula_align",
            sa.String(length=8),
            nullable=False,
            server_default="left",
        ),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("legal_texts", "enacting_formula_align", schema=SCHEMA)
