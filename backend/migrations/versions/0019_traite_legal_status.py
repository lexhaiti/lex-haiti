"""Extend ParserProfile + LegalStatus for treaties (Phase B).

Adds three new ``legal_status`` values that only apply to international
agreements (``signed``, ``ratified``, ``denounced``) and one new
``parser_profile`` value (``traite``) for the dedicated treaty parser.
The domestic statuses (in_force / abrogated / partially_abrogated)
stay valid for treaties that are post-promulgation.

Both enums live in the ``public_corpus`` schema (created in 0001 /
0016). Adding values to a Postgres enum requires ``ALTER TYPE``;
``IF NOT EXISTS`` keeps the migration idempotent across partial-state
dev DBs.

Revision ID: 0019_traite_legal_status
Revises: 0018_moniteur_entry_parser_ast
Create Date: 2026-05-12
"""

from alembic import op


revision = "0019_traite_legal_status"
down_revision = "0018_moniteur_entry_parser_ast"
branch_labels = None
depends_on = None


SCHEMA = "public_corpus"


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE can't run inside a transaction block on
    # older PG, so each statement is wrapped in its own autocommit.
    # Modern Postgres (≥12) handles this fine inside the migration
    # transaction; Alembic uses autocommit_block for safety.
    with op.get_context().autocommit_block():
        op.execute(
            f"ALTER TYPE {SCHEMA}.legal_status ADD VALUE IF NOT EXISTS 'signed'"
        )
        op.execute(
            f"ALTER TYPE {SCHEMA}.legal_status ADD VALUE IF NOT EXISTS 'ratified'"
        )
        op.execute(
            f"ALTER TYPE {SCHEMA}.legal_status ADD VALUE IF NOT EXISTS 'denounced'"
        )
        op.execute(
            f"ALTER TYPE {SCHEMA}.parser_profile ADD VALUE IF NOT EXISTS 'traite'"
        )


def downgrade() -> None:
    # Postgres has no native ALTER TYPE ... DROP VALUE. A clean
    # downgrade would require recreating the enum, retyping every
    # column that uses it, and validating no rows carry the removed
    # values — too invasive for a forward-mostly schema. Left as a
    # no-op; if a downgrade is genuinely needed, do it by hand.
    pass
