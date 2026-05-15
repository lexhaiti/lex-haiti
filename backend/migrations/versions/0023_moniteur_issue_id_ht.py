"""Add moniteur_issue_id_ht to legal_texts for Kreyòl supplement issues.

Foundational texts like the 1987 Constitution were published twice: once in
French (*Le Moniteur* N° 36) and once in Kreyòl (*Le Moniteur* N° 36-A).
This column holds the FK to the Kreyòl supplement issue, mirroring the
existing ``moniteur_issue_id`` which points to the French original.

Revision ID: 0023_moniteur_issue_id_ht
Revises: 0022_enacting_formula_align
Create Date: 2026-05-15
"""

import sqlalchemy as sa
from alembic import op

revision = "0023_moniteur_issue_id_ht"
down_revision = "0022_enacting_formula_align"
branch_labels = None
depends_on = None

SCHEMA = "public_corpus"


def upgrade() -> None:
    op.add_column(
        "legal_texts",
        sa.Column("moniteur_issue_id_ht", sa.Integer(), nullable=True),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_legal_texts_moniteur_issue_id_ht",
        "legal_texts",
        ["moniteur_issue_id_ht"],
        schema=SCHEMA,
    )
    op.create_foreign_key(
        "fk_legal_texts_moniteur_issue_ht",
        "legal_texts",
        "moniteur_issues",
        ["moniteur_issue_id_ht"],
        ["id"],
        ondelete="SET NULL",
        source_schema=SCHEMA,
        referent_schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_legal_texts_moniteur_issue_ht",
        "legal_texts",
        schema=SCHEMA,
        type_="foreignkey",
    )
    op.drop_index(
        "ix_legal_texts_moniteur_issue_id_ht",
        table_name="legal_texts",
        schema=SCHEMA,
    )
    op.drop_column("legal_texts", "moniteur_issue_id_ht", schema=SCHEMA)
