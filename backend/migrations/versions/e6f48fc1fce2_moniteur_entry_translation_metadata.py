"""moniteur_entry_translation_metadata

Adds translation-source columns to moniteur_entries. When a law is
republished in a Kreyòl-companion Moniteur issue (the "36 → 36-a"
pattern), the editor attaches translation pointers to the original
French entry rather than re-ingesting the HT issue's sommaire as
duplicate candidates.

Columns added:
- translation_issue_id        FK to the HT moniteur_issue
- translation_detected_number text (entry number in the HT issue —
                              may differ from the FR entry's number)
- translation_title_ht        text (display title in HT)
- translation_page_from / _to int   (HT issue page range)
- translation_summary_ht      text (optional summary in HT)
- companion_documents         jsonb (list of {kind, pages, note} —
                              e.g. promulgation letter pages 1-3)

Revision ID: e6f48fc1fce2
Revises: 0011_official_metadata
Create Date: 2026-05-11 12:38:43.248806
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e6f48fc1fce2"
down_revision: Union[str, None] = "0011_official_metadata"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "moniteur_entries",
        sa.Column("translation_issue_id", sa.Integer(), nullable=True),
        schema="public_corpus",
    )
    op.add_column(
        "moniteur_entries",
        sa.Column("translation_detected_number", sa.Text(), nullable=True),
        schema="public_corpus",
    )
    op.add_column(
        "moniteur_entries",
        sa.Column("translation_title_ht", sa.Text(), nullable=True),
        schema="public_corpus",
    )
    op.add_column(
        "moniteur_entries",
        sa.Column("translation_page_from", sa.Integer(), nullable=True),
        schema="public_corpus",
    )
    op.add_column(
        "moniteur_entries",
        sa.Column("translation_page_to", sa.Integer(), nullable=True),
        schema="public_corpus",
    )
    op.add_column(
        "moniteur_entries",
        sa.Column("translation_summary_ht", sa.Text(), nullable=True),
        schema="public_corpus",
    )
    op.add_column(
        "moniteur_entries",
        sa.Column(
            "companion_documents",
            sa.dialects.postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        schema="public_corpus",
    )

    op.create_foreign_key(
        "fk_moniteur_entry_translation_issue",
        "moniteur_entries",
        "moniteur_issues",
        ["translation_issue_id"],
        ["id"],
        ondelete="SET NULL",
        source_schema="public_corpus",
        referent_schema="public_corpus",
    )
    op.create_index(
        "ix_moniteur_entries_translation_issue_id",
        "moniteur_entries",
        ["translation_issue_id"],
        schema="public_corpus",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_moniteur_entries_translation_issue_id",
        table_name="moniteur_entries",
        schema="public_corpus",
    )
    op.drop_constraint(
        "fk_moniteur_entry_translation_issue",
        "moniteur_entries",
        type_="foreignkey",
        schema="public_corpus",
    )
    for col in (
        "companion_documents",
        "translation_summary_ht",
        "translation_page_to",
        "translation_page_from",
        "translation_title_ht",
        "translation_detected_number",
        "translation_issue_id",
    ):
        op.drop_column("moniteur_entries", col, schema="public_corpus")
