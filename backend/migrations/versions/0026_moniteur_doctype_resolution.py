"""Add ``resolution`` to the ``moniteur_document_type`` enum.

A resolution is a deliberation of a constituted body — Conseil
Présidentiel de Transition, Assemblée nationale, Sénat — that
records a decision without itself being a regulatory act. Distinct
from ``arrete`` (the executive act that *implements* the
resolution) and from ``communique`` (a public notice). The CPT's
November 2024 resolution choosing Alix Didier Fils-Aimé as Premier
Ministre is the type case: the *resolution* records the consensus
choice, and a companion *arrêté* in the same Moniteur Spécial
No. 57 nominates him.

Postgres ``ALTER TYPE … ADD VALUE`` must run outside a transaction,
so the migration commits before the ALTER. Downgrade is a no-op for
the same reason as 0024 — removing an enum value safely would
require rewriting every column that uses it.

Revision ID: 0026_moniteur_doctype_resolution
Revises: 0025_idx_articles_curr_ver
Create Date: 2026-05-16
"""

from alembic import op


revision = "0026_moniteur_doctype_resolution"
down_revision = "0025_idx_articles_curr_ver"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("COMMIT")
    op.execute(
        "ALTER TYPE public_corpus.moniteur_document_type "
        "ADD VALUE IF NOT EXISTS 'resolution'"
    )


def downgrade() -> None:
    # Postgres enum value removal isn't supported safely.
    pass
