"""Backfill visas_fr / considerants_fr / enacting_formula_fr from preamble_fr.

Scans all LegalText rows that have preamble_fr but no visas_fr,
splits the pre-article text into the four legal blocks, and updates.

Idempotent — rows with visas_fr already set are skipped.

Usage (from backend/):
    .venv/bin/python -m scripts.backfill_visas_considerants [--dry-run]
"""
from __future__ import annotations

import argparse

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from api.config import get_settings
from services.corpus.models import LegalText
from services.ingestion.article_split import split_preamble


def run(dry_run: bool = False) -> None:
    engine = create_engine(get_settings().database_url, future=True)
    factory = sessionmaker(bind=engine, autoflush=False, future=True)
    session: Session = factory()

    stmt = (
        select(LegalText)
        .where(LegalText.preamble_fr.isnot(None))
        .where(LegalText.visas_fr.is_(None))
        .where(LegalText.considerants_fr.is_(None))
        .where(LegalText.enacting_formula_fr.is_(None))
    )
    texts = list(session.scalars(stmt))
    print(f"Found {len(texts)} texts with unsplit preamble")

    updated = 0
    for text in texts:
        parts = split_preamble(text.preamble_fr or "")
        if not parts.visas and not parts.considerants and not parts.enacting_formula:
            continue
        text.visas_fr = parts.visas
        text.considerants_fr = parts.considerants
        text.enacting_formula_fr = parts.enacting_formula
        text.preamble_fr = parts.preamble
        updated += 1
        print(f"  [{text.id}] {text.slug}: "
              f"visas={len(parts.visas or '')}c, "
              f"cons={len(parts.considerants or '')}c, "
              f"enacting={len(parts.enacting_formula or '')}c, "
              f"preamble={len(parts.preamble or '')}c")

    if dry_run:
        print(f"\nDry run — {updated} texts would be updated. Rolling back.")
        session.rollback()
    else:
        session.commit()
        print(f"\nCommitted — {updated} texts updated.")
    session.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run(dry_run=args.dry_run)
