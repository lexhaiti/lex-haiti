"""Add director column to moniteur_issues.

Revision ID: 0012
Revises: 0011_official_metadata_and_signing_capacity
Create Date: 2026-05-11
"""

from alembic import op
import sqlalchemy as sa

revision = "0012_moniteur_director"
down_revision = "e6f48fc1fce2"
branch_labels = None
depends_on = None


SCHEMA = "public_corpus"


def upgrade() -> None:
    op.add_column(
        "moniteur_issues",
        sa.Column("director", sa.Text(), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("moniteur_issues", "director", schema=SCHEMA)
