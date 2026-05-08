"""moniteur issues + parsed law candidates

Revision ID: 0006_moniteur
Revises: 0005_legal_theme_tags
Create Date: 2026-05-05

The Moniteur ingestion pipeline (option B). Two tables:

  - moniteur_issues
      One row per Moniteur publication (issue number + date + PDF).
      Replaces the free-text `legal_texts.moniteur_ref` with a real FK.
      `processing_status` walks: uploaded → ocr_pending → parsed → reviewed.

  - moniteur_law_candidates
      Heuristic parser output: each candidate = one suspected law / décret /
      arrêté detected inside the issue's PDF. Editor reviews them on the
      `/editorial/moniteur/[id]/review` page; accepting a candidate creates
      a real `legal_texts` row pointing back to the source issue.

Why a separate `candidates` table (not just draft `legal_texts`)?
  - Candidates may be wrong (parser noise, false positives, junk text);
    keeping them out of the public corpus until an editor confirms keeps
    /lois clean even if processing runs unattended.
  - We carry `confidence` + `raw_text` per candidate so editors can audit
    the parser's reasoning without re-running OCR.
  - Once promoted, the candidate row is deleted (or kept for history; v1
    keeps for audit).

Note on the FK to legal_texts: a published `LegalText` ends up with
`moniteur_issue_id` pointing at its source issue. The earlier free-text
`moniteur_ref` column is preserved for now (legacy data still uses it);
new ingestions populate the FK and may also write the formatted ref string
for backwards compatibility.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_moniteur"
down_revision: Union[str, None] = "0005_legal_theme_tags"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ISSUE_STATUS_VALUES = (
    "uploaded",      # PDF on disk, not yet OCR'd
    "ocr_pending",   # OCR job queued / running
    "parsed",        # OCR + heuristic parse done; candidates ready for review
    "reviewed",      # editor has accepted/rejected all candidates
    "published",     # at least one candidate promoted to a published LegalText
    "failed",        # OCR or parse failed; needs manual intervention
)

CANDIDATE_STATUS_VALUES = (
    "pending",       # awaiting editor review
    "accepted",      # promoted to a real LegalText
    "rejected",      # editor marked as noise / not a law
    "deferred",      # editor wants to come back to it
)


def upgrade() -> None:
    bind = op.get_bind()

    # Enums via DO block — same pattern as 0005 to dodge SQLAlchemy's
    # over-eager auto-create on op.create_table with `sa.Enum(create_type=False)`.
    bind.exec_driver_sql(
        f"""
        DO $$ BEGIN
            CREATE TYPE public_corpus.moniteur_issue_status AS ENUM (
                {", ".join(repr(v) for v in ISSUE_STATUS_VALUES)}
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    bind.exec_driver_sql(
        f"""
        DO $$ BEGIN
            CREATE TYPE public_corpus.moniteur_candidate_status AS ENUM (
                {", ".join(repr(v) for v in CANDIDATE_STATUS_VALUES)}
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    # moniteur_issues — raw SQL to bypass SQLAlchemy enum auto-creation.
    bind.exec_driver_sql(
        """
        CREATE TABLE public_corpus.moniteur_issues (
            id                    SERIAL PRIMARY KEY,
            number                TEXT        NOT NULL,
            year                  INTEGER     NOT NULL,
            publication_date      DATE,
            edition_label         TEXT,
            file_url              TEXT,
            page_count            INTEGER,
            processing_status     public_corpus.moniteur_issue_status NOT NULL DEFAULT 'uploaded',
            processing_error      TEXT,
            uploaded_by           INTEGER,
            uploaded_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
            parsed_at             TIMESTAMPTZ,
            published_at          TIMESTAMPTZ,
            created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_moniteur_issues_year_number UNIQUE (year, number)
        );
        """
    )
    op.create_index(
        "ix_moniteur_issues_publication_date",
        "moniteur_issues",
        ["publication_date"],
        schema="public_corpus",
    )
    op.create_index(
        "ix_moniteur_issues_processing_status",
        "moniteur_issues",
        ["processing_status"],
        schema="public_corpus",
    )

    # moniteur_law_candidates — one row per parsed law inside an issue.
    bind.exec_driver_sql(
        """
        CREATE TABLE public_corpus.moniteur_law_candidates (
            id                    SERIAL PRIMARY KEY,
            issue_id              INTEGER NOT NULL
                                  REFERENCES public_corpus.moniteur_issues (id)
                                  ON DELETE CASCADE,
            position              INTEGER NOT NULL DEFAULT 0,
            detected_category     public_corpus.legal_category,
            detected_title        TEXT,
            detected_number       TEXT,
            detected_date         DATE,
            raw_text              TEXT NOT NULL,
            confidence            NUMERIC(3, 2),
            page_from             INTEGER,
            page_to               INTEGER,
            review_status         public_corpus.moniteur_candidate_status
                                  NOT NULL DEFAULT 'pending',
            promoted_legal_text_id INTEGER
                                  REFERENCES public_corpus.legal_texts (id)
                                  ON DELETE SET NULL,
            review_notes          TEXT,
            reviewed_by           INTEGER,
            reviewed_at           TIMESTAMPTZ,
            created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.create_index(
        "ix_moniteur_candidates_issue_id",
        "moniteur_law_candidates",
        ["issue_id"],
        schema="public_corpus",
    )
    op.create_index(
        "ix_moniteur_candidates_review_status",
        "moniteur_law_candidates",
        ["review_status"],
        schema="public_corpus",
    )

    # Add FK on legal_texts → moniteur_issues. Nullable; legacy rows keep
    # using the free-text moniteur_ref column.
    op.add_column(
        "legal_texts",
        sa.Column(
            "moniteur_issue_id",
            sa.Integer(),
            sa.ForeignKey(
                "public_corpus.moniteur_issues.id",
                ondelete="SET NULL",
                name="fk_legal_texts_moniteur_issue",
            ),
            nullable=True,
        ),
        schema="public_corpus",
    )
    op.create_index(
        "ix_legal_texts_moniteur_issue_id",
        "legal_texts",
        ["moniteur_issue_id"],
        schema="public_corpus",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_legal_texts_moniteur_issue_id",
        table_name="legal_texts",
        schema="public_corpus",
    )
    op.drop_column("legal_texts", "moniteur_issue_id", schema="public_corpus")

    op.drop_index(
        "ix_moniteur_candidates_review_status",
        table_name="moniteur_law_candidates",
        schema="public_corpus",
    )
    op.drop_index(
        "ix_moniteur_candidates_issue_id",
        table_name="moniteur_law_candidates",
        schema="public_corpus",
    )
    op.drop_table("moniteur_law_candidates", schema="public_corpus")

    op.drop_index(
        "ix_moniteur_issues_processing_status",
        table_name="moniteur_issues",
        schema="public_corpus",
    )
    op.drop_index(
        "ix_moniteur_issues_publication_date",
        table_name="moniteur_issues",
        schema="public_corpus",
    )
    op.drop_table("moniteur_issues", schema="public_corpus")

    candidate_status = postgresql.ENUM(
        *CANDIDATE_STATUS_VALUES,
        name="moniteur_candidate_status",
        schema="public_corpus",
    )
    candidate_status.drop(op.get_bind(), checkfirst=True)

    issue_status = postgresql.ENUM(
        *ISSUE_STATUS_VALUES,
        name="moniteur_issue_status",
        schema="public_corpus",
    )
    issue_status.drop(op.get_bind(), checkfirst=True)
