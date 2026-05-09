"""Add enacting_formula columns and fix preamble semantics.

The preamble_fr field was storing the enacting formula
("Le Corps Législatif a voté …" / "DÉCRÈTE :") which is a
distinct legal block. This migration adds proper columns for it
and moves existing data out of preamble_fr.

Revision ID: 0009_enacting_formula
Revises: 0008_rename_entries
"""
from alembic import op
import sqlalchemy as sa

revision = "0009_enacting_formula"
down_revision = "0008_rename_entries"
branch_labels = None
depends_on = None

SCHEMA = "public_corpus"


def upgrade() -> None:
    op.add_column(
        "legal_texts",
        sa.Column("enacting_formula_fr", sa.Text(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "legal_texts",
        sa.Column("enacting_formula_ht", sa.Text(), nullable=True),
        schema=SCHEMA,
    )
    # Move data: rows where preamble_fr looks like an enacting formula
    # (starts with "Le Corps", "Sur proposition", "DÉCRÈTE", etc.)
    # and visas_fr is already populated (meaning split_preamble ran).
    op.execute(f"""
        UPDATE {SCHEMA}.legal_texts
        SET enacting_formula_fr = preamble_fr,
            preamble_fr = NULL
        WHERE visas_fr IS NOT NULL
          AND preamble_fr IS NOT NULL
          AND preamble_fr ~ '(?i)^\\s*(Le\\s+Corps|Sur\\s+proposition|Le\\s+Pr[éeè]sident|ARR[ÊE]TE|D[ÉE]CR[ÈE]TE|ORDONNE|Le\\s+Conseil|Le\\s+Pouvoir)'
    """)


def downgrade() -> None:
    # Move enacting formula back into preamble
    op.execute(f"""
        UPDATE {SCHEMA}.legal_texts
        SET preamble_fr = COALESCE(preamble_fr || E'\\n\\n', '') || enacting_formula_fr
        WHERE enacting_formula_fr IS NOT NULL
    """)
    op.drop_column("legal_texts", "enacting_formula_ht", schema=SCHEMA)
    op.drop_column("legal_texts", "enacting_formula_fr", schema=SCHEMA)
