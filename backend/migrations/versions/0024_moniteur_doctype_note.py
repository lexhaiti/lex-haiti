"""Add ``note`` to the ``moniteur_document_type`` enum.

Editorial annotations (translator notes, transcription gap markers,
deviations from the printed source) deserve a category of their own —
distinct from ``communique`` (official public notice) and
``correspondance`` (private letter). Adding ``note`` lets editors
attach a sommaire row that reads as an internal editorial comment
without re-purposing one of the legal/official categories.

Postgres ``ALTER TYPE … ADD VALUE`` must run outside a transaction, so
the migration disables transactional DDL just for itself. Downgrade
is intentionally a no-op — removing an enum value safely would require
rewriting every column that uses it.

Revision ID: 0024_moniteur_doctype_note
Revises: 0023_moniteur_issue_id_ht
Create Date: 2026-05-15
"""

from alembic import op


revision = "0024_moniteur_doctype_note"
down_revision = "0023_moniteur_issue_id_ht"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # `ADD VALUE` cannot run inside a transaction block on older
    # Postgres versions, and the new value isn't visible inside the
    # transaction that creates it on any version. Commit explicitly
    # so subsequent statements (and downstream migrations) see it.
    op.execute("COMMIT")
    op.execute(
        "ALTER TYPE public_corpus.moniteur_document_type ADD VALUE IF NOT EXISTS 'note'"
    )


def downgrade() -> None:
    # Postgres enum value removal isn't supported safely — would
    # require updating every column that uses it. Intentional no-op.
    pass
