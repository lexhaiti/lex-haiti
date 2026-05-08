"""Enrich Moniteur candidates with document type, display title, parent link.

Revision ID: 0007_moniteur_enrichment
Revises: 0006_moniteur
Create Date: 2026-05-08

Three changes:

  1. New enum `moniteur_document_type` — superset of `legal_category` that
     includes Moniteur-only types (communique, promulgation, errata, autre,
     ordonnance). Replaces the reuse of `legal_category` on candidates.

  2. `display_title` (text, nullable) — editor-curated short title for
     sommaire display, vs. the raw-OCR `detected_title`.

  3. `parent_candidate_id` (self-FK, nullable) — promulgation letters
     and cover pages belong to their parent law candidate. Lets the UI
     group them together on the Moniteur detail page.
"""
from typing import Union

from alembic import op

revision: str = "0007_moniteur_enrichment"
down_revision: Union[str, None] = "0006_moniteur"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None

SCHEMA = "public_corpus"


def upgrade() -> None:
    # 1. Create the new enum type
    op.execute(f"""
        DO $$ BEGIN
            CREATE TYPE {SCHEMA}.moniteur_document_type AS ENUM (
                'constitution', 'code', 'loi', 'decret', 'arrete',
                'circulaire', 'convention', 'ordonnance',
                'communique', 'promulgation', 'errata', 'autre'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)

    # 2. Migrate detected_category from legal_category → moniteur_document_type.
    #    All existing legal_category values are a subset of the new enum, so
    #    the cast text→new_enum is safe.
    op.execute(f"""
        ALTER TABLE {SCHEMA}.moniteur_law_candidates
        ALTER COLUMN detected_category
        TYPE {SCHEMA}.moniteur_document_type
        USING detected_category::text::{SCHEMA}.moniteur_document_type
    """)

    # 3. Add display_title column
    op.execute(f"""
        ALTER TABLE {SCHEMA}.moniteur_law_candidates
        ADD COLUMN IF NOT EXISTS display_title TEXT
    """)

    # 4. Add parent_candidate_id self-FK
    op.execute(f"""
        ALTER TABLE {SCHEMA}.moniteur_law_candidates
        ADD COLUMN IF NOT EXISTS parent_candidate_id INTEGER
            REFERENCES {SCHEMA}.moniteur_law_candidates(id)
            ON DELETE SET NULL
    """)
    op.execute(f"""
        CREATE INDEX IF NOT EXISTS ix_moniteur_law_candidates_parent_candidate_id
        ON {SCHEMA}.moniteur_law_candidates (parent_candidate_id)
    """)


def downgrade() -> None:
    op.execute(f"""
        DROP INDEX IF EXISTS {SCHEMA}.ix_moniteur_law_candidates_parent_candidate_id
    """)
    op.execute(f"""
        ALTER TABLE {SCHEMA}.moniteur_law_candidates
        DROP COLUMN IF EXISTS parent_candidate_id
    """)
    op.execute(f"""
        ALTER TABLE {SCHEMA}.moniteur_law_candidates
        DROP COLUMN IF EXISTS display_title
    """)
    # Cast back — values not in legal_category (communique etc.) become NULL
    op.execute(f"""
        ALTER TABLE {SCHEMA}.moniteur_law_candidates
        ALTER COLUMN detected_category
        TYPE {SCHEMA}.legal_category
        USING CASE
            WHEN detected_category::text IN (
                'constitution','code','loi','decret','arrete','circulaire','convention'
            )
            THEN detected_category::text::{SCHEMA}.legal_category
            ELSE NULL
        END
    """)
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.moniteur_document_type")
