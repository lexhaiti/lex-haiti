"""Add transcript_url to moniteur_issues.

When the editor uploads an already-transcribed version of the Moniteur
file (clean PDF/DOCX), the parse pipeline reads text from this instead
of running OCR on the scanned original.

Revision ID: 0014_moniteur_transcript
Revises: 0013_promulgations
Create Date: 2026-05-11
"""

import sqlalchemy as sa
from alembic import op

revision = "0014_moniteur_transcript"
down_revision = "0013_promulgations"
branch_labels = None
depends_on = None


SCHEMA = "public_corpus"


def upgrade() -> None:
    op.add_column(
        "moniteur_issues",
        sa.Column(
            "transcript_url",
            sa.Text(),
            nullable=True,
            comment="Path to a pre-transcribed version of the file (skips OCR).",
        ),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("moniteur_issues", "transcript_url", schema=SCHEMA)
