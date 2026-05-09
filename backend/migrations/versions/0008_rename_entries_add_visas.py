"""Rename moniteur_law_candidates -> moniteur_entries, add summary + visas columns.

Three changes in one migration:
  1. Rename the candidates table to moniteur_entries (domain-correct name).
  2. Add summary_fr / summary_ht to moniteur_entries for editorial summaries.
  3. Add visas_fr / visas_ht / considerants_fr / considerants_ht to legal_texts
     so they can be shown as separate TOC sections.

Revision ID: 0008_rename_entries
Revises: 0007_moniteur_enrichment
Create Date: 2026-05-09
"""
from alembic import op
import sqlalchemy as sa

revision = "0008_rename_entries"
down_revision = "0007_moniteur_enrichment"
branch_labels = None
depends_on = None

SCHEMA = "public_corpus"


def upgrade() -> None:
    # 1. Rename table
    op.rename_table(
        "moniteur_law_candidates", "moniteur_entries", schema=SCHEMA
    )

    # 2. Rename self-FK column for clarity
    op.alter_column(
        "moniteur_entries",
        "parent_candidate_id",
        new_column_name="parent_entry_id",
        schema=SCHEMA,
    )

    # 3. Add summary columns to the renamed table
    op.add_column(
        "moniteur_entries",
        sa.Column("summary_fr", sa.Text(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "moniteur_entries",
        sa.Column("summary_ht", sa.Text(), nullable=True),
        schema=SCHEMA,
    )

    # 4. Add visas / considérants to legal_texts
    op.add_column(
        "legal_texts",
        sa.Column("visas_fr", sa.Text(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "legal_texts",
        sa.Column("visas_ht", sa.Text(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "legal_texts",
        sa.Column("considerants_fr", sa.Text(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "legal_texts",
        sa.Column("considerants_ht", sa.Text(), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("legal_texts", "considerants_ht", schema=SCHEMA)
    op.drop_column("legal_texts", "considerants_fr", schema=SCHEMA)
    op.drop_column("legal_texts", "visas_ht", schema=SCHEMA)
    op.drop_column("legal_texts", "visas_fr", schema=SCHEMA)

    op.drop_column("moniteur_entries", "summary_ht", schema=SCHEMA)
    op.drop_column("moniteur_entries", "summary_fr", schema=SCHEMA)

    op.alter_column(
        "moniteur_entries",
        "parent_entry_id",
        new_column_name="parent_candidate_id",
        schema=SCHEMA,
    )

    op.rename_table(
        "moniteur_entries", "moniteur_law_candidates", schema=SCHEMA
    )
