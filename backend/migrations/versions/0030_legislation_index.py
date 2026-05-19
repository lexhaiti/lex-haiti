"""Add the ``legislation_index_entries`` table + ``legislation_in_force_status`` enum.

Backs the "Chronologie" editorial section. Each row is a *historical
reference* extracted from a published index of Haitian legislation
(seed source: Ministère de la Justice, ``Index Chronologique de la
Législation Haïtienne (1804-2000)``, 2001), not the underlying text
itself. The ``legal_text_id`` / ``moniteur_issue_id`` FKs are
nullable so an entry can exist independently of whether we've
ingested the act — the editorial UI uses them to indicate
"imported / not imported" and to power the cross-link to a full
LawDetail page.

The ``in_force_status`` column carries an editor-managed verdict
(default ``unknown``) about whether the indexed act is still law.
This is intentionally separate from ``LegalStatus`` (which describes
ingested texts only) because the dominant case for pre-1990 entries
is "we have a citation but no confirmation"; the public surface must
display ``unknown`` verbatim so users don't infer "in_force" when we
literally have not checked.

Revision ID: 0030_legislation_index
Revises: 0029_loi_constitutionnelle
Create Date: 2026-05-19
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0030_legislation_index"
down_revision = "0029_loi_constitutionnelle"
branch_labels = None
depends_on = None


SCHEMA = "public_corpus"


def upgrade() -> None:
    # Create the new enum type. ``legal_category`` already exists from
    # earlier migrations — we reference it with ``create_type=False``
    # below so Alembic doesn't try to recreate it.
    in_force_status = postgresql.ENUM(
        "unknown",
        "in_force",
        "abrogated",
        "superseded",
        "modified",
        name="legislation_in_force_status",
        schema=SCHEMA,
    )
    in_force_status.create(op.get_bind(), checkfirst=True)

    legal_category = postgresql.ENUM(
        name="legal_category",
        schema=SCHEMA,
        create_type=False,
    )

    op.create_table(
        "legislation_index_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "source",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'INDEX_CHRONOLOGIQUE_2001'"),
        ),
        sa.Column("source_page", sa.Integer(), nullable=True),
        sa.Column(
            "display_order",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("chapter", sa.Text(), nullable=True),
        sa.Column("section", sa.Text(), nullable=True),
        sa.Column("description_fr", sa.Text(), nullable=False),
        sa.Column("detected_category", legal_category, nullable=True),
        sa.Column("act_date", sa.Date(), nullable=True),
        sa.Column("act_date_raw", sa.Text(), nullable=True),
        sa.Column("moniteur_number", sa.Text(), nullable=True),
        sa.Column("moniteur_year", sa.Integer(), nullable=True),
        sa.Column("moniteur_date", sa.Date(), nullable=True),
        sa.Column("moniteur_date_raw", sa.Text(), nullable=True),
        sa.Column(
            "legal_text_id",
            sa.Integer(),
            sa.ForeignKey(
                f"{SCHEMA}.legal_texts.id", ondelete="SET NULL"
            ),
            nullable=True,
        ),
        sa.Column(
            "moniteur_issue_id",
            sa.Integer(),
            sa.ForeignKey(
                f"{SCHEMA}.moniteur_issues.id", ondelete="SET NULL"
            ),
            nullable=True,
        ),
        sa.Column(
            "in_force_status",
            postgresql.ENUM(
                name="legislation_in_force_status",
                schema=SCHEMA,
                create_type=False,
            ),
            nullable=False,
            server_default=sa.text("'unknown'"),
        ),
        sa.Column("in_force_notes", sa.Text(), nullable=True),
        sa.Column(
            "in_force_verified_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "source",
            "display_order",
            name="uq_legislation_index_source_order",
        ),
        schema=SCHEMA,
    )

    op.create_index(
        "ix_legislation_index_chapter",
        "legislation_index_entries",
        ["chapter"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_legislation_index_act_date",
        "legislation_index_entries",
        ["act_date"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_legislation_index_moniteur_year",
        "legislation_index_entries",
        ["moniteur_year"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_legislation_index_detected_category",
        "legislation_index_entries",
        ["detected_category"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_legislation_index_legal_text_id",
        "legislation_index_entries",
        ["legal_text_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_legislation_index_in_force_status",
        "legislation_index_entries",
        ["in_force_status"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_legislation_index_in_force_status",
        table_name="legislation_index_entries",
        schema=SCHEMA,
    )
    op.drop_index(
        "ix_legislation_index_legal_text_id",
        table_name="legislation_index_entries",
        schema=SCHEMA,
    )
    op.drop_index(
        "ix_legislation_index_detected_category",
        table_name="legislation_index_entries",
        schema=SCHEMA,
    )
    op.drop_index(
        "ix_legislation_index_moniteur_year",
        table_name="legislation_index_entries",
        schema=SCHEMA,
    )
    op.drop_index(
        "ix_legislation_index_act_date",
        table_name="legislation_index_entries",
        schema=SCHEMA,
    )
    op.drop_index(
        "ix_legislation_index_chapter",
        table_name="legislation_index_entries",
        schema=SCHEMA,
    )
    op.drop_table("legislation_index_entries", schema=SCHEMA)
    postgresql.ENUM(
        name="legislation_in_force_status",
        schema=SCHEMA,
    ).drop(op.get_bind(), checkfirst=True)
