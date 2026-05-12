"""Phase 1 — additive refactor batch.

Lands the whole "safe additive" wave from the LexHaïti refactor proposal in
ONE idempotent migration. Idempotent because parts of this batch have
already been applied in prior (now-lost) worktree migrations:
``authorities`` table, ``authority_type`` enum, FK columns on
``legal_texts`` / ``legal_signers``, and the extended ``legal_category``
+ ``heading_level`` enums all already exist in the live DB. Re-running
this migration is harmless — every CREATE uses IF NOT EXISTS.

What this migration guarantees after running:

ENUMS
  - public_corpus.authority_type
  - public_corpus.block_kind
  - public_corpus.content_source
  - public_corpus.change_kind
  - public_corpus.import_job_status
  - public_corpus.parser_profile
  - public_corpus.language
  - public_corpus.translatable_entity
  - public_corpus.translator_kind
  - public_corpus.legal_category += {ordonnance, communique, avis, other_regulatory}
  - public_corpus.heading_level  += {part}

TABLES
  - public_corpus.authorities
  - public_corpus.authority_role_assignments
  - public_corpus.toc_nodes
  - public_corpus.legal_changes
  - public_corpus.import_jobs
  - public_corpus.import_drafts
  - public_corpus.translations

COLUMNS (additive on existing tables)
  - public_corpus.legal_texts: issuing_authority_id, adopting_body_id,
    promulgating_authority_id, legacy_issuing_authority_text
  - public_corpus.legal_signers: authority_id

No data movement: existing rows untouched. The Phase 2 migration will
copy formal-block columns into toc_nodes; the Phase 1 backfill script
resolves issuing_authority free-text → authority_id.

Revision ID: 0016_phase1_refactor_additive
Revises: 0015_tsvector_ast_amendments
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "0016_phase1_refactor_additive"
down_revision: Union[str, None] = "0015_tsvector_ast_amendments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Helpers (raw SQL — alembic's op.create_table doesn't support IF NOT EXISTS,
# which we need because parts of this batch may already be live).
# ---------------------------------------------------------------------------


def _create_enum_if_not_exists(name: str, values: tuple[str, ...]) -> None:
    quoted = ", ".join(f"'{v}'" for v in values)
    op.execute(
        f"""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_type t
                JOIN pg_namespace n ON t.typnamespace = n.oid
                WHERE n.nspname = 'public_corpus' AND t.typname = '{name}'
            ) THEN
                CREATE TYPE public_corpus.{name} AS ENUM ({quoted});
            END IF;
        END $$;
        """
    )


def _add_enum_value_if_missing(enum_name: str, value: str) -> None:
    op.execute(
        f"ALTER TYPE public_corpus.{enum_name} ADD VALUE IF NOT EXISTS '{value}'"
    )


def upgrade() -> None:
    # ── Enums ────────────────────────────────────────────────────────────
    # ``authority_type`` may already exist from a prior (lost) worktree
    # migration with a slightly different value set
    # (legislative_chamber/executive/judiciary/independent_body/other).
    # Create-if-missing + ADD VALUE IF NOT EXISTS gives us the superset
    # without losing the existing rows.
    _create_enum_if_not_exists(
        "authority_type",
        (
            "person",
            "institution",
            "ministry",
            "parliamentary_body",
            "executive_body",
            "collective_body",
            "administrative_body",
            "judicial_body",
            "unknown",
        ),
    )
    for v in (
        "person",
        "institution",
        "ministry",
        "parliamentary_body",
        "executive_body",
        "collective_body",
        "administrative_body",
        "judicial_body",
        "unknown",
    ):
        _add_enum_value_if_missing("authority_type", v)
    _create_enum_if_not_exists(
        "block_kind",
        (
            "sovereignty_formula",
            "preamble",
            "visa",
            "considerant",
            "enacting_formula",
            "structural",
            "annex",
            "closing_formula",
            "signature_block",
            "promulgation_block",
            "prose_body",
        ),
    )
    _create_enum_if_not_exists(
        "content_source",
        (
            "parser",
            "editor",
            "import_draft",
            "amendment",
            "machine_translation",
            "ocr",
        ),
    )
    _create_enum_if_not_exists(
        "change_kind",
        (
            "amend",
            "abrogate",
            "replace",
            "add",
            "renumber",
            "suspend",
            "restore",
        ),
    )
    _create_enum_if_not_exists(
        "import_job_status",
        (
            "running",
            "parsed",
            "reviewing",
            "committed",
            "rejected",
            "failed",
        ),
    )
    _create_enum_if_not_exists(
        "parser_profile",
        (
            "generic",
            "constitution",
            "code",
            "loi",
            "executive_act",
            "circulaire",
            "communique",
        ),
    )
    _create_enum_if_not_exists("language", ("fr", "ht"))
    _create_enum_if_not_exists(
        "translatable_entity",
        ("legal_text", "article_version", "toc_node", "promulgation"),
    )
    _create_enum_if_not_exists("translator_kind", ("human", "machine", "mixed"))

    # Extend existing enums (ADD VALUE IF NOT EXISTS is PG-13+)
    for v in ("ordonnance", "communique", "avis", "other_regulatory"):
        _add_enum_value_if_missing("legal_category", v)
    _add_enum_value_if_missing("heading_level", "part")

    # ── authorities ──────────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public_corpus.authorities (
            id              SERIAL PRIMARY KEY,
            code            TEXT UNIQUE,
            name_fr         VARCHAR(255) NOT NULL UNIQUE,
            name_ht         VARCHAR(255),
            short_name      VARCHAR(100),
            authority_type  public_corpus.authority_type NOT NULL,
            parent_id       INTEGER REFERENCES public_corpus.authorities(id)
                                ON DELETE SET NULL,
            founded_on      DATE,
            dissolved_on    DATE,
            notes           TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    # Some older worktree creation may have missed the optional columns.
    op.execute(
        "ALTER TABLE public_corpus.authorities ADD COLUMN IF NOT EXISTS code TEXT"
    )
    op.execute(
        "ALTER TABLE public_corpus.authorities ADD COLUMN IF NOT EXISTS founded_on DATE"
    )
    op.execute(
        "ALTER TABLE public_corpus.authorities ADD COLUMN IF NOT EXISTS dissolved_on DATE"
    )
    op.execute(
        "ALTER TABLE public_corpus.authorities ADD COLUMN IF NOT EXISTS notes TEXT"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_authorities_code "
        "ON public_corpus.authorities (code) WHERE code IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_authorities_parent_id "
        "ON public_corpus.authorities (parent_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_authorities_authority_type "
        "ON public_corpus.authorities (authority_type)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_authorities_name_fr_trgm "
        "ON public_corpus.authorities USING gin (name_fr gin_trgm_ops)"
    )

    # ── authority_role_assignments ───────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public_corpus.authority_role_assignments (
            id              SERIAL PRIMARY KEY,
            authority_id    INTEGER NOT NULL REFERENCES public_corpus.authorities(id)
                                ON DELETE CASCADE,
            person_name     TEXT NOT NULL,
            role_title_fr   TEXT NOT NULL,
            role_title_ht   TEXT,
            started_on      DATE,
            ended_on        DATE,
            notes           TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_authority_role_assignments_authority_id "
        "ON public_corpus.authority_role_assignments (authority_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_authority_role_assignments_dates "
        "ON public_corpus.authority_role_assignments (started_on, ended_on)"
    )

    # ── toc_nodes ────────────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public_corpus.toc_nodes (
            id              SERIAL PRIMARY KEY,
            legal_text_id   INTEGER NOT NULL REFERENCES public_corpus.legal_texts(id)
                                ON DELETE CASCADE,
            parent_id       INTEGER REFERENCES public_corpus.toc_nodes(id)
                                ON DELETE CASCADE,
            block_kind      public_corpus.block_kind NOT NULL,
            level           public_corpus.heading_level,
            key             TEXT NOT NULL,
            number          TEXT,
            title_fr        TEXT,
            title_ht        TEXT,
            body_fr         TEXT,
            body_ht         TEXT,
            position        INTEGER NOT NULL DEFAULT 0,
            source          public_corpus.content_source NOT NULL DEFAULT 'editor',
            confidence      NUMERIC(3,2),
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_toc_nodes_text_key UNIQUE (legal_text_id, key)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_toc_nodes_text_position "
        "ON public_corpus.toc_nodes (legal_text_id, position)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_toc_nodes_text_block_kind "
        "ON public_corpus.toc_nodes (legal_text_id, block_kind)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_toc_nodes_parent_id "
        "ON public_corpus.toc_nodes (parent_id)"
    )

    # ── legal_changes ────────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public_corpus.legal_changes (
            id                  SERIAL PRIMARY KEY,
            amending_text_id    INTEGER NOT NULL REFERENCES public_corpus.legal_texts(id)
                                    ON DELETE CASCADE,
            amended_text_id     INTEGER NOT NULL REFERENCES public_corpus.legal_texts(id)
                                    ON DELETE CASCADE,
            amended_article_id  INTEGER REFERENCES public_corpus.articles(id)
                                    ON DELETE CASCADE,
            new_version_id      INTEGER REFERENCES public_corpus.article_versions(id)
                                    ON DELETE SET NULL,
            change_kind         public_corpus.change_kind NOT NULL,
            effective_on        DATE,
            text_fr             TEXT,
            text_ht             TEXT,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_legal_changes_amended_text "
        "ON public_corpus.legal_changes (amended_text_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_legal_changes_amending_text "
        "ON public_corpus.legal_changes (amending_text_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_legal_changes_amended_article "
        "ON public_corpus.legal_changes (amended_article_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_legal_changes_change_kind "
        "ON public_corpus.legal_changes (change_kind)"
    )

    # ── import_jobs ──────────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public_corpus.import_jobs (
            id                      SERIAL PRIMARY KEY,
            source_document_id      INTEGER REFERENCES public_corpus.raw_documents(id)
                                        ON DELETE SET NULL,
            target_legal_text_id    INTEGER REFERENCES public_corpus.legal_texts(id)
                                        ON DELETE SET NULL,
            parser_profile          public_corpus.parser_profile NOT NULL,
            classifier_decision     public_corpus.legal_category,
            status                  public_corpus.import_job_status NOT NULL DEFAULT 'running',
            started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            finished_at             TIMESTAMPTZ,
            error                   TEXT,
            config                  JSONB,
            created_by              INTEGER
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_import_jobs_status "
        "ON public_corpus.import_jobs (status)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_import_jobs_source_document_id "
        "ON public_corpus.import_jobs (source_document_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_import_jobs_target_legal_text_id "
        "ON public_corpus.import_jobs (target_legal_text_id)"
    )

    # ── import_drafts ────────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public_corpus.import_drafts (
            id                  SERIAL PRIMARY KEY,
            import_job_id       INTEGER NOT NULL REFERENCES public_corpus.import_jobs(id)
                                    ON DELETE CASCADE,
            title_fr            TEXT,
            title_ht            TEXT,
            category_guess      public_corpus.legal_category,
            metadata_json       JSONB,
            toc_json            JSONB,
            articles_json       JSONB,
            promulgation_json   JSONB,
            signatures_json     JSONB,
            warnings            JSONB,
            confidence          NUMERIC(3,2),
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_import_drafts_import_job_id "
        "ON public_corpus.import_drafts (import_job_id)"
    )

    # ── translations ─────────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public_corpus.translations (
            id                  SERIAL PRIMARY KEY,
            entity_type         public_corpus.translatable_entity NOT NULL,
            entity_id           INTEGER NOT NULL,
            language            public_corpus.language NOT NULL,
            source_version_id   INTEGER,
            translator_kind     public_corpus.translator_kind NOT NULL,
            translator_id       INTEGER,
            machine_engine      TEXT,
            translated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            review_status       public_corpus.editorial_status NOT NULL DEFAULT 'draft',
            notes               TEXT,
            CONSTRAINT uq_translations_entity_language
                UNIQUE (entity_type, entity_id, language)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_translations_entity "
        "ON public_corpus.translations (entity_type, entity_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_translations_review_status "
        "ON public_corpus.translations (review_status)"
    )

    # ── legal_texts: authority FKs + legacy column ──────────────────────
    # FK columns may already exist from worktree migrations. Idempotent.
    op.execute(
        "ALTER TABLE public_corpus.legal_texts "
        "ADD COLUMN IF NOT EXISTS issuing_authority_id INTEGER "
        "REFERENCES public_corpus.authorities(id) ON DELETE SET NULL"
    )
    op.execute(
        "ALTER TABLE public_corpus.legal_texts "
        "ADD COLUMN IF NOT EXISTS adopting_body_id INTEGER "
        "REFERENCES public_corpus.authorities(id) ON DELETE SET NULL"
    )
    op.execute(
        "ALTER TABLE public_corpus.legal_texts "
        "ADD COLUMN IF NOT EXISTS promulgating_authority_id INTEGER "
        "REFERENCES public_corpus.authorities(id) ON DELETE SET NULL"
    )
    op.execute(
        "ALTER TABLE public_corpus.legal_texts "
        "ADD COLUMN IF NOT EXISTS legacy_issuing_authority_text TEXT"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_legal_texts_issuing_authority_id "
        "ON public_corpus.legal_texts (issuing_authority_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_legal_texts_adopting_body_id "
        "ON public_corpus.legal_texts (adopting_body_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_legal_texts_promulgating_authority_id "
        "ON public_corpus.legal_texts (promulgating_authority_id)"
    )

    # Copy free-text issuing_authority → legacy column for audit (one-shot,
    # only fills rows where the legacy column is still null).
    op.execute(
        """
        UPDATE public_corpus.legal_texts
        SET legacy_issuing_authority_text = issuing_authority
        WHERE issuing_authority IS NOT NULL
          AND legacy_issuing_authority_text IS NULL
        """
    )

    # ── legal_signers: authority_id FK ──────────────────────────────────
    op.execute(
        "ALTER TABLE public_corpus.legal_signers "
        "ADD COLUMN IF NOT EXISTS authority_id INTEGER "
        "REFERENCES public_corpus.authorities(id) ON DELETE SET NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_legal_signers_authority_id "
        "ON public_corpus.legal_signers (authority_id)"
    )

    # ── promulgations: promulgating_authority_id FK ─────────────────────
    op.execute(
        "ALTER TABLE public_corpus.promulgations "
        "ADD COLUMN IF NOT EXISTS promulgating_authority_id INTEGER "
        "REFERENCES public_corpus.authorities(id) ON DELETE SET NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_promulgations_promulgating_authority_id "
        "ON public_corpus.promulgations (promulgating_authority_id)"
    )

    # ── promulgation_signers: authority_id FK ───────────────────────────
    op.execute(
        "ALTER TABLE public_corpus.promulgation_signers "
        "ADD COLUMN IF NOT EXISTS authority_id INTEGER "
        "REFERENCES public_corpus.authorities(id) ON DELETE SET NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_promulgation_signers_authority_id "
        "ON public_corpus.promulgation_signers (authority_id)"
    )


def downgrade() -> None:
    # Drop in reverse dependency order. Tables that may have been added
    # by worktree migrations are dropped here too — assumption: this
    # migration is the new canonical source.
    op.execute("DROP TABLE IF EXISTS public_corpus.translations CASCADE")
    op.execute("DROP TABLE IF EXISTS public_corpus.import_drafts CASCADE")
    op.execute("DROP TABLE IF EXISTS public_corpus.import_jobs CASCADE")
    op.execute("DROP TABLE IF EXISTS public_corpus.legal_changes CASCADE")
    op.execute("DROP TABLE IF EXISTS public_corpus.toc_nodes CASCADE")
    op.execute(
        "DROP TABLE IF EXISTS public_corpus.authority_role_assignments CASCADE"
    )

    # Reverse the FK additions
    op.execute(
        "ALTER TABLE public_corpus.promulgation_signers "
        "DROP COLUMN IF EXISTS authority_id"
    )
    op.execute(
        "ALTER TABLE public_corpus.promulgations "
        "DROP COLUMN IF EXISTS promulgating_authority_id"
    )
    op.execute(
        "ALTER TABLE public_corpus.legal_signers "
        "DROP COLUMN IF EXISTS authority_id"
    )
    for col in (
        "legacy_issuing_authority_text",
        "promulgating_authority_id",
        "adopting_body_id",
        "issuing_authority_id",
    ):
        op.execute(
            f"ALTER TABLE public_corpus.legal_texts DROP COLUMN IF EXISTS {col}"
        )

    op.execute("DROP TABLE IF EXISTS public_corpus.authorities CASCADE")

    # Drop the new enums. Cannot drop enum VALUES added to legal_category
    # and heading_level — Postgres doesn't support that.
    for type_name in (
        "translator_kind",
        "translatable_entity",
        "language",
        "parser_profile",
        "import_job_status",
        "change_kind",
        "content_source",
        "block_kind",
        "authority_type",
    ):
        op.execute(f"DROP TYPE IF EXISTS public_corpus.{type_name}")
