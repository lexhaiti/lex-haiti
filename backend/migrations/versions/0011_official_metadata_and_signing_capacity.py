"""Add official_number / issuing_authority / official_formula + extend
legal_signers with signing_capacity / chamber / signed_at.

Background — see the analysis in the front-of-document conversation
where we mapped the full law structure (devise, autorité émettrice,
LOI N°, formules de vote, formule de promulgation, signataires) and
realised:

  - LegalText needs three new columns to hold the page-1 + post-
    dispositif metadata that the parser extracts from the document
    head and tail.
  - LegalSigner already exists but only carries (name, function_fr,
    function_ht, position). It can't tell us *how* a person signs:
    Sénat bureau attesting the vote vs President promulgating vs
    minister countersigning a décret. We add `signing_capacity` and
    `chamber` enums so the SignatureGrid can group + caption.
  - `signed_at` lets the UI render "Voté le 18 août 2009" next to
    each chamber's bureau, and "Promulgué le 23 janvier 2017" next
    to the President — when the two dates differ (often they do).

Revision ID: 0011_official_metadata
Revises: ("0010_enable_pg_trgm", "1c1eaa9fd7c7")

This migration also serves as a *merge point* — the repo had two
divergent alembic heads (`0010_enable_pg_trgm` from the main chain and
`1c1eaa9fd7c7` from a separate unaccent-extension branch). Declaring
both as parents collapses them into a single head from here on so
`alembic upgrade head` resolves cleanly without specifying a target.
"""
from alembic import op
import sqlalchemy as sa


revision = "0011_official_metadata"
down_revision = ("0010_enable_pg_trgm", "1c1eaa9fd7c7")
branch_labels = None
depends_on = None

SCHEMA = "public_corpus"


def upgrade() -> None:
    # ---- LegalText additions -------------------------------------------
    # `official_number` is searchable (CL-007-09-09 style identifiers).
    # `String(64)` is plenty — the longest format observed (`CL-NNN-YY-YY`)
    # is 13 chars; padding to 64 covers any future prefixes.
    op.add_column(
        "legal_texts",
        sa.Column("official_number", sa.String(64), nullable=True),
        schema=SCHEMA,
    )
    # Multi-line text — for joint arrêtés (one line per minister) and for
    # the Conseil Présidentiel (institution name + N members listed).
    op.add_column(
        "legal_texts",
        sa.Column("issuing_authority", sa.Text(), nullable=True),
        schema=SCHEMA,
    )
    # Verbatim post-dispositif block (Votée + LIBERTÉ banner + Donné).
    # Stored unparsed so editors can correct OCR noise inline; the
    # signatories table carries the structured names alongside.
    op.add_column(
        "legal_texts",
        sa.Column("official_formula", sa.Text(), nullable=True),
        schema=SCHEMA,
    )

    # `official_number` participates in fuzzy + identifier searches —
    # mirror the index pattern used for moniteur_issues.number. A plain
    # B-tree is enough for exact-match; the trigram index for typo
    # tolerance can be added in a follow-up migration if needed.
    op.create_index(
        "ix_legal_texts_official_number",
        "legal_texts",
        ["official_number"],
        unique=False,
        schema=SCHEMA,
    )

    # ---- legal_signers extensions -------------------------------------
    # Postgres ENUM types — created as plain server-side enums so the
    # values are visible in psql and integrate cleanly with the existing
    # _enum() pattern in services/corpus/models.py.
    signing_capacity_enum = sa.Enum(
        "authoring",
        "presiding",
        "attesting",
        "promulgating",
        "countersigning",
        "other",
        name="signing_capacity",
        schema=SCHEMA,
    )
    signing_capacity_enum.create(op.get_bind(), checkfirst=True)

    signatory_chamber_enum = sa.Enum(
        "senat",
        "chambre",
        "executive",
        "ministerial",
        name="signatory_chamber",
        schema=SCHEMA,
    )
    signatory_chamber_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "legal_signers",
        sa.Column(
            "signing_capacity",
            sa.Enum(
                "authoring",
                "presiding",
                "attesting",
                "promulgating",
                "countersigning",
                "other",
                name="signing_capacity",
                schema=SCHEMA,
                create_type=False,
            ),
            nullable=False,
            server_default="other",
        ),
        schema=SCHEMA,
    )
    op.add_column(
        "legal_signers",
        sa.Column(
            "chamber",
            sa.Enum(
                "senat",
                "chambre",
                "executive",
                "ministerial",
                name="signatory_chamber",
                schema=SCHEMA,
                create_type=False,
            ),
            nullable=True,
        ),
        schema=SCHEMA,
    )
    op.add_column(
        "legal_signers",
        sa.Column("signed_at", sa.Date(), nullable=True),
        schema=SCHEMA,
    )

    # The default lets existing rows survive the NOT NULL constraint;
    # drop the default after creation so future inserts must specify
    # the capacity explicitly (the parser does, the editor UI does).
    op.alter_column(
        "legal_signers",
        "signing_capacity",
        server_default=None,
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("legal_signers", "signed_at", schema=SCHEMA)
    op.drop_column("legal_signers", "chamber", schema=SCHEMA)
    op.drop_column("legal_signers", "signing_capacity", schema=SCHEMA)
    sa.Enum(name="signatory_chamber", schema=SCHEMA).drop(
        op.get_bind(), checkfirst=True
    )
    sa.Enum(name="signing_capacity", schema=SCHEMA).drop(
        op.get_bind(), checkfirst=True
    )

    op.drop_index(
        "ix_legal_texts_official_number",
        table_name="legal_texts",
        schema=SCHEMA,
    )
    op.drop_column("legal_texts", "official_formula", schema=SCHEMA)
    op.drop_column("legal_texts", "issuing_authority", schema=SCHEMA)
    op.drop_column("legal_texts", "official_number", schema=SCHEMA)
