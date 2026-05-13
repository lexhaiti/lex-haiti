"""Add ``correspondance`` to MoniteurDocumentType.

Correspondance officielles (letters between institutions, presidential
addresses, etc.) routinely appear in the Moniteur and don't map to any
of the existing non-promotable kinds (communiqué is institutional
announcements; errata is corrections; autre is the catch-all). Giving
them a dedicated label lets editors classify and search them properly
without losing them in "Autre".

Non-promotable: a correspondance has no own legal effect, so it
attaches to a parent entry (the act it accompanies) like a
promulgation letter or a communiqué.

Revision ID: 0021_moniteur_correspondance
Revises: 0020_legal_text_block_versions
Create Date: 2026-05-13
"""

from alembic import op


revision = "0021_moniteur_correspondance"
down_revision = "0020_legal_text_block_versions"
branch_labels = None
depends_on = None


SCHEMA = "public_corpus"


def upgrade() -> None:
    # ALTER TYPE ADD VALUE can't run inside a transaction on older PG;
    # autocommit_block keeps the migration safe across versions.
    with op.get_context().autocommit_block():
        op.execute(
            f"ALTER TYPE {SCHEMA}.moniteur_document_type "
            "ADD VALUE IF NOT EXISTS 'correspondance'"
        )


def downgrade() -> None:
    # Postgres doesn't support DROP VALUE on an enum cleanly. Removing
    # the value would orphan any row that used it; safer to leave it.
    # Downgrade is intentionally a no-op.
    pass
