"""enable_unaccent_extension

Revision ID: 1c1eaa9fd7c7
Revises: 0004_article_version_status
Create Date: 2026-05-03 20:09:12.510147

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '1c1eaa9fd7c7'
down_revision: Union[str, None] = '0004_article_version_status'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Used by the corpus search to normalize accents (so "president" matches
    # "président"). Required by services.corpus.repository.list_texts when
    # filtering with the `q` parameter.
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")


def downgrade() -> None:
    # Don't drop the extension — other databases on the same cluster might
    # depend on it. Migration is one-way for shared infrastructure.
    pass
