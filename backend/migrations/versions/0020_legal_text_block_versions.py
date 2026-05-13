"""Versioning for formal blocks (preamble / visas / considérants /
enacting formula) — Option A from the versioning brainstorm.

Today the formal blocks live as flat bilingual columns on
``legal_texts`` (e.g. ``preamble_fr``, ``visas_fr``) and have no
version history; editing one overwrites in place. This migration
introduces a parallel ``legal_text_block_versions`` table that mirrors
the shape of ``article_versions`` so each block can carry its own
amendment timeline.

The existing legal_texts columns stay as the denormalized "current"
content for read performance (the public site already reads them on
every render). The new versions table is the audit log + amendment
history; ``add_block_version`` updates both in one transaction.

``LegalChange`` is extended with two nullable columns so an
amendment that touches a formal block (not just an article) lands in
the same graph: the "Modifications apportées" panel on an amending
law surfaces block edits alongside article edits without a separate
read path.

Backfill: every legal_text whose preamble/visas/considerants/
enacting_formula columns are non-empty gets one v1 row per populated
block. effective_from is derived from the parent text's
promulgation_date or publication_date (nullable when neither is set,
which is fine — the panel renders "—" for missing dates).

Revision ID: 0020_legal_text_block_versions
Revises: 0019_traite_legal_status
Create Date: 2026-05-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0020_legal_text_block_versions"
down_revision = "0019_traite_legal_status"
branch_labels = None
depends_on = None


SCHEMA = "public_corpus"


# Subset of BlockKind that gets a versioned table — only the formal
# blocks that live as flat columns on legal_texts today. Structural
# nodes (articles + headings) already have their own version path.
_TEXT_BLOCK_KINDS = ("preamble", "visa", "considerant", "enacting_formula")


def upgrade() -> None:
    # The block_kind enum is already created by migration 0016. Re-use
    # it via Postgres's existing type rather than re-declaring it.
    block_kind = postgresql.ENUM(name="block_kind", schema=SCHEMA, create_type=False)
    editorial_status = postgresql.ENUM(
        name="editorial_status", schema=SCHEMA, create_type=False
    )

    op.create_table(
        "legal_text_block_versions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("legal_text_id", sa.Integer(), nullable=False),
        sa.Column("block_kind", block_kind, nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("text_fr", sa.Text(), nullable=True),
        sa.Column("text_ht", sa.Text(), nullable=True),
        sa.Column("effective_from", sa.Date(), nullable=True),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column(
            "source_amendment_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "editorial_status",
            editorial_status,
            nullable=False,
            server_default="draft",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(
            ["legal_text_id"],
            [f"{SCHEMA}.legal_texts.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_amendment_id"],
            [f"{SCHEMA}.legal_texts.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "legal_text_id",
            "block_kind",
            "version_number",
            name="uq_block_versions_text_kind_n",
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_block_versions_text_kind",
        "legal_text_block_versions",
        ["legal_text_id", "block_kind"],
        schema=SCHEMA,
    )

    # Extend legal_changes so an amendment can target a block (not just
    # an article). One row per amendment edit, same as today.
    op.add_column(
        "legal_changes",
        sa.Column("amended_block_kind", block_kind, nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "legal_changes",
        sa.Column(
            "new_block_version_id",
            sa.Integer(),
            nullable=True,
        ),
        schema=SCHEMA,
    )
    op.create_foreign_key(
        "fk_legal_changes_new_block_version_id",
        "legal_changes",
        "legal_text_block_versions",
        ["new_block_version_id"],
        ["id"],
        ondelete="SET NULL",
        source_schema=SCHEMA,
        referent_schema=SCHEMA,
    )

    # Backfill v1 of each populated block, per text. The version row
    # mirrors the current column content; the column stays in place
    # as the denormalized "current" value the public read path uses.
    # ``effective_from`` is the text's own publication / promulgation
    # date when available — historical accuracy where we have it.
    for kind in _TEXT_BLOCK_KINDS:
        column_fr = _column_for(kind, "fr")
        column_ht = _column_for(kind, "ht")
        op.execute(
            sa.text(
                f"""
                INSERT INTO {SCHEMA}.legal_text_block_versions (
                    legal_text_id, block_kind, version_number,
                    text_fr, text_ht, effective_from,
                    editorial_status, created_at, updated_at
                )
                SELECT
                    id, :kind, 1,
                    {column_fr}, {column_ht},
                    COALESCE(promulgation_date, publication_date),
                    'published',
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                FROM {SCHEMA}.legal_texts
                WHERE
                    ({column_fr} IS NOT NULL AND length(trim({column_fr})) > 0)
                    OR ({column_ht} IS NOT NULL AND length(trim({column_ht})) > 0)
                """
            ).bindparams(kind=kind)
        )


def downgrade() -> None:
    op.drop_constraint(
        "fk_legal_changes_new_block_version_id",
        "legal_changes",
        schema=SCHEMA,
        type_="foreignkey",
    )
    op.drop_column("legal_changes", "new_block_version_id", schema=SCHEMA)
    op.drop_column("legal_changes", "amended_block_kind", schema=SCHEMA)
    op.drop_index(
        "ix_block_versions_text_kind",
        table_name="legal_text_block_versions",
        schema=SCHEMA,
    )
    op.drop_table("legal_text_block_versions", schema=SCHEMA)


def _column_for(kind: str, lang: str) -> str:
    """Map a BlockKind enum value → the corresponding legal_texts
    column name. The columns are bilingual (``_fr`` / ``_ht``)."""
    if kind == "visa":
        return f"visas_{lang}"
    if kind == "considerant":
        return f"considerants_{lang}"
    if kind == "preamble":
        return f"preamble_{lang}"
    if kind == "enacting_formula":
        return f"enacting_formula_{lang}"
    raise ValueError(f"unknown block_kind for backfill: {kind}")
