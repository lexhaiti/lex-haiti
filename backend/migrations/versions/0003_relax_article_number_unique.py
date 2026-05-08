"""relax articles (legal_text_id, number) unique constraint

Revision ID: 0003_relax_article_number_unique
Revises: 0002_auth_schema
Create Date: 2026-05-01

Some historical Haitian constitutions (1804 and earlier especially) reset
article numbering at each chapter boundary, so the same article number can
legitimately appear multiple times within one LegalText. The original schema
assumed modern sequential numbering and enforced UNIQUE(legal_text_id, number);
that fails on real data.

The slug uniqueness constraint stays — slugs are URL identifiers and must be
unique. The structuring script disambiguates slugs (e.g., "art-2-2") when
numbers repeat.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0003_relax_article_number_unique"
down_revision: Union[str, None] = "0002_auth_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE public_corpus.articles "
        "DROP CONSTRAINT IF EXISTS uq_articles_text_number"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE public_corpus.articles "
        "ADD CONSTRAINT uq_articles_text_number "
        "UNIQUE (legal_text_id, number)"
    )
