"""Create promulgations and promulgation_signers tables.

See ADR-002 — Promulgation as a first-class entity.

Revision ID: 0013_promulgations
Revises: 0012_moniteur_director
Create Date: 2026-05-11
"""

from alembic import op
import sqlalchemy as sa

revision = "0013_promulgations"
down_revision = "0012_moniteur_director"
branch_labels = None
depends_on = None

SCHEMA = "public_corpus"


def upgrade() -> None:
    op.create_table(
        "promulgations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "moniteur_issue_id",
            sa.Integer(),
            sa.ForeignKey(
                f"{SCHEMA}.moniteur_issues.id", ondelete="CASCADE"
            ),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "legal_text_id",
            sa.Integer(),
            sa.ForeignKey(
                f"{SCHEMA}.legal_texts.id", ondelete="SET NULL"
            ),
            nullable=True,
        ),
        sa.Column("content_fr", sa.Text(), nullable=False),
        sa.Column("content_ht", sa.Text(), nullable=True),
        sa.Column("promulgation_date", sa.Date(), nullable=True),
        sa.Column("location", sa.Text(), nullable=True),
        sa.Column("page_from", sa.Integer(), nullable=True),
        sa.Column("page_to", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        schema=SCHEMA,
    )

    # One promulgation per legal text (partial unique — only where linked).
    op.create_index(
        "uq_promulgations_legal_text",
        "promulgations",
        ["legal_text_id"],
        unique=True,
        schema=SCHEMA,
        postgresql_where=sa.text("legal_text_id IS NOT NULL"),
    )

    op.create_table(
        "promulgation_signers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "promulgation_id",
            sa.Integer(),
            sa.ForeignKey(
                f"{SCHEMA}.promulgations.id", ondelete="CASCADE"
            ),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("function_fr", sa.Text(), nullable=True),
        sa.Column("function_ht", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint(
            "promulgation_id", "position", name="uq_promulgation_signer_pos"
        ),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("promulgation_signers", schema=SCHEMA)
    op.drop_index(
        "uq_promulgations_legal_text",
        table_name="promulgations",
        schema=SCHEMA,
    )
    op.drop_table("promulgations", schema=SCHEMA)
