"""Seed ``legislation_index_entries`` from ``data/chronologie_2001.json``.

Idempotent: upserts on the ``(source, display_order)`` unique index
so re-running rewrites all index-derived columns (``description_fr``,
``section``, ``act_date_*``, ``moniteur_*``) without clobbering
editorial mutations made on the row (``in_force_status``,
``in_force_notes``, ``in_force_verified_at``, ``notes``,
``legal_text_id``, ``moniteur_issue_id``). Those columns are
excluded from the ``DO UPDATE SET`` clause.

Run locally::

    .venv/bin/python scripts/seed_chronologie_2001.py

Run inside the API container against prod::

    az containerapp job update -n lex-haiti-migrate -g lex-haiti-prod \\
        --command python scripts/seed_chronologie_2001.py
    az containerapp job start -n lex-haiti-migrate -g lex-haiti-prod
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Iterable

HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy.dialects.postgresql import insert as pg_insert  # noqa: E402

from api.db import SessionLocal  # noqa: E402
from services.corpus.models import LegislationIndexEntry  # noqa: E402

DEFAULT_SOURCE = "INDEX_CHRONOLOGIQUE_2001"


def _coerce_date(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).date()
        except ValueError:
            return None
    return None


def _rows_from_json(path: Path) -> Iterable[dict]:
    with path.open() as fh:
        data = json.load(fh)
    for raw in data:
        yield {
            "source": DEFAULT_SOURCE,
            "source_page": raw.get("source_page"),
            "display_order": raw["display_order"],
            "chapter": None,  # the 2001 index doesn't print a Chapitre header
                              # on each page; we keep it null and surface
                              # ``section`` (DROIT INTERNATIONAL PUBLIC, …)
                              # as the primary grouping in editorial.
            "section": raw.get("section"),
            "description_fr": raw["description_fr"],
            "detected_category": None,  # left for a later AI pass
            "act_date": _coerce_date(raw.get("act_date")),
            "act_date_raw": raw.get("act_date_raw"),
            "moniteur_number": raw.get("moniteur_number"),
            "moniteur_year": raw.get("moniteur_year"),
            "moniteur_date": _coerce_date(raw.get("moniteur_date")),
            "moniteur_date_raw": raw.get("moniteur_date_raw"),
        }


def seed(json_path: Path) -> tuple[int, int]:
    rows = list(_rows_from_json(json_path))
    if not rows:
        return 0, 0

    # Columns we rewrite on conflict. ``in_force_status``,
    # ``in_force_notes``, ``in_force_verified_at``, ``notes``,
    # ``legal_text_id``, ``moniteur_issue_id`` are intentionally
    # **excluded** — those are editor-owned values.
    rewriteable = {
        "source_page",
        "section",
        "chapter",
        "description_fr",
        "detected_category",
        "act_date",
        "act_date_raw",
        "moniteur_number",
        "moniteur_year",
        "moniteur_date",
        "moniteur_date_raw",
    }

    inserted = 0
    updated = 0
    with SessionLocal() as session:
        # Cheap pre-scan so we can report inserted vs. updated.
        from sqlalchemy import select, func

        existing_orders = set(
            session.scalars(
                select(LegislationIndexEntry.display_order).where(
                    LegislationIndexEntry.source == DEFAULT_SOURCE
                )
            ).all()
        )

        # Upsert in batches to keep the parameter count under Postgres
        # limits and to stream nice progress output.
        batch_size = 500
        for i in range(0, len(rows), batch_size):
            chunk = rows[i : i + batch_size]
            stmt = pg_insert(LegislationIndexEntry).values(chunk)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_legislation_index_source_order",
                set_={col: getattr(stmt.excluded, col) for col in rewriteable},
            )
            session.execute(stmt)
            for r in chunk:
                if r["display_order"] in existing_orders:
                    updated += 1
                else:
                    inserted += 1
        session.commit()

        total = session.scalar(
            select(func.count()).select_from(LegislationIndexEntry).where(
                LegislationIndexEntry.source == DEFAULT_SOURCE
            )
        )

    return inserted, updated


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--src",
        type=Path,
        default=BACKEND_ROOT / "data" / "chronologie_2001.json",
    )
    args = ap.parse_args()
    if not args.src.exists():
        ap.error(f"seed JSON does not exist: {args.src}")

    inserted, updated = seed(args.src)
    print(f"chronologie 2001: inserted={inserted}, updated={updated}")


if __name__ == "__main__":
    main()
