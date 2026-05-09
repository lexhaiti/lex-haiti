"""enable pg_trgm extension for fuzzy identifier search

Revision ID: 0010_enable_pg_trgm
Revises: 0009_enacting_formula
Create Date: 2026-05-09

Trigram similarity is used by the cross-entity /search endpoint to
match identifier-like queries (loi numbers like "CL-007-09-09") even
when the visitor mistypes a digit. Postgres FTS by itself requires
all tokens to match, so a one-character typo in an identifier yields
zero results — trigrams give us a similarity score (0.0–1.0) that we
can threshold instead.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "0010_enable_pg_trgm"
down_revision: Union[str, None] = "0009_enacting_formula"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")


def downgrade() -> None:
    # Don't drop — extensions on a shared Postgres cluster may be used
    # by other databases. Migrations of this kind are one-way.
    pass
