"""Add director_role column to moniteur_issues.

Real-world Haitian Moniteur cover pages carry the director's institutional
title in parens after their name — e.g. "Directeur : Henry Robert
MARC-CHARLES (Major des Forces Armées d'Haïti)". The role is meaningful
context (which institution the director was speaking for) and the
metadata extractor already pulls it from the PDF; we just need a column
to store it.

Revision ID: 0017_moniteur_director_role
Revises: 0016_phase1_refactor_additive
Create Date: 2026-05-12
"""

from alembic import op
import sqlalchemy as sa


revision = "0017_moniteur_director_role"
down_revision = "0016_phase1_refactor_additive"
branch_labels = None
depends_on = None


SCHEMA = "public_corpus"


def upgrade() -> None:
    # Idempotent: tolerate the column already existing (a manual ALTER on
    # a dev DB, or a re-run after partial application).
    op.execute(
        f'ALTER TABLE {SCHEMA}.moniteur_issues '
        f'ADD COLUMN IF NOT EXISTS director_role TEXT'
    )


def downgrade() -> None:
    op.execute(
        f'ALTER TABLE {SCHEMA}.moniteur_issues '
        f'DROP COLUMN IF EXISTS director_role'
    )
