"""Add parser_profile + content_ast columns to moniteur_entries.

So far the parse stage of the Moniteur pipeline only slices ``raw_text``
per page-range and stores it; there is no per-entry typed parser output.
This migration adds two columns so the typ-specific parser registry
(constitution / code / loi / executive_act / circulaire / communique)
can run at parse time and persist its structured output for the editor
to preview and then for ``promote_entry`` to consume.

- ``parser_profile``: which profile to use. NULL means "auto-pick from
  detected_category". Editor sets this explicitly when the
  classification is off (e.g. a décret that's structurally a code).
- ``content_ast``: full ``ParserOutput`` as JSONB — TOC nodes, articles,
  signatures, metadata, warnings, parser_confidence. Re-derived on every
  re-parse, so we don't worry about staleness.

The ``parser_profile`` enum was already created in migration 0016 for the
``import_jobs`` table, so we reuse it here.

Revision ID: 0018_moniteur_entry_parser_ast
Revises: 0017_moniteur_director_role
Create Date: 2026-05-12
"""

from alembic import op


revision = "0018_moniteur_entry_parser_ast"
down_revision = "0017_moniteur_director_role"
branch_labels = None
depends_on = None


SCHEMA = "public_corpus"


def upgrade() -> None:
    op.execute(
        f"ALTER TABLE {SCHEMA}.moniteur_entries "
        f"ADD COLUMN IF NOT EXISTS parser_profile {SCHEMA}.parser_profile"
    )
    op.execute(
        f"ALTER TABLE {SCHEMA}.moniteur_entries "
        f"ADD COLUMN IF NOT EXISTS content_ast JSONB"
    )


def downgrade() -> None:
    op.execute(
        f"ALTER TABLE {SCHEMA}.moniteur_entries "
        f"DROP COLUMN IF EXISTS content_ast"
    )
    op.execute(
        f"ALTER TABLE {SCHEMA}.moniteur_entries "
        f"DROP COLUMN IF EXISTS parser_profile"
    )
