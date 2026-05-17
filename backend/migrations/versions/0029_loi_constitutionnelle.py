"""Add ``loi_constitutionnelle`` to ``legal_category`` + ``moniteur_doctype``.

A ``loi constitutionnelle`` is an Act of Parliament that amends the
Constitution — distinct from a ``constitution`` (the founding text)
and from a regular ``loi`` (one-off scope and special adoption
procedure). The 2012 amendment of the 1987 Constitution is the
canonical Haitian example.

Both the corpus-level ``legal_category`` enum and the Moniteur-level
``moniteur_doctype`` enum get the new value so editors can re-classify
existing ``loi`` rows and the ingestion parser can tag freshly-parsed
amendments correctly.

PostgreSQL's ``ALTER TYPE … ADD VALUE`` must run outside a
transaction block; ``op.execute(...)`` with the autocommit context.

Revision ID: 0029_loi_constitutionnelle
Revises: 0028_lt_official_title
Create Date: 2026-05-17
"""

from alembic import op


revision = "0029_loi_constitutionnelle"
down_revision = "0028_lt_official_title"
branch_labels = None
depends_on = None


SCHEMA = "public_corpus"


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE must run outside a transaction. The
    # ``IF NOT EXISTS`` clause makes the upgrade idempotent — safe to
    # re-run against a DB that already has the value.
    with op.get_context().autocommit_block():
        op.execute(
            f"ALTER TYPE {SCHEMA}.legal_category ADD VALUE IF NOT EXISTS 'loi_constitutionnelle'"
        )
        op.execute(
            f"ALTER TYPE {SCHEMA}.moniteur_document_type ADD VALUE IF NOT EXISTS 'loi_constitutionnelle'"
        )


def downgrade() -> None:
    # Postgres has no built-in way to drop a single enum value. A full
    # downgrade would require recreating the type, repointing every
    # column that references it, and re-classifying any rows that hold
    # the dropped value. The downgrade is intentionally a no-op — the
    # enum value coexists harmlessly with the old set.
    pass
