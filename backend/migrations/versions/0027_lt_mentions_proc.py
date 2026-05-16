"""Add ``mentions_procedurales_fr`` and ``mentions_procedurales_ht`` to
``legal_texts``.

Every Haitian arrêté and décret carries a short procedural block
between the ``Considérants`` and the dispositif word
(``Arrête`` / ``Décrète``): typically ``Sur le rapport du …`` /
``Sur la proposition du …`` followed by ``Et après délibération en
Conseil des Ministres ;`` (or ``Et après avis …``). The split
between visas, considérants, and these procedural mentions is
established in French/Haitian legal drafting, but until now they
landed in ``considerants_fr`` because the parser had no state for
them — see the trailing ``Sur le rapport ... ; Et après
délibération ... ;`` lines in
``arrete-pnpps-2020.considerants_fr`` on prod.

Splitting them out lets:
  * the parser stop polluting ``considerants_fr``;
  * the editor curate the block independently (rephrase, add the
    Kreyòl translation, fix OCR splits);
  * the reader page render them as their own formal block, mirroring
    the printed Moniteur layout.

Both columns are nullable — historical texts may have no procedural
mention, and the field is fully editorial. No backfill: the
``promote_moniteur_batch.py`` re-run + editor edits populate values
where they belong.

Revision ID: 0027_lt_mentions_proc
Revises: 0026_moniteur_doctype_resolution
Create Date: 2026-05-16
"""

import sqlalchemy as sa
from alembic import op


revision = "0027_lt_mentions_proc"
down_revision = "0026_moniteur_doctype_resolution"
branch_labels = None
depends_on = None


SCHEMA = "public_corpus"


def upgrade() -> None:
    op.add_column(
        "legal_texts",
        sa.Column("mentions_procedurales_fr", sa.Text(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "legal_texts",
        sa.Column("mentions_procedurales_ht", sa.Text(), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("legal_texts", "mentions_procedurales_ht", schema=SCHEMA)
    op.drop_column("legal_texts", "mentions_procedurales_fr", schema=SCHEMA)
