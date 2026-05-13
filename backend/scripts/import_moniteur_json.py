"""Import a Moniteur issue from a structured JSON file — dev-only
path that bypasses the OCR / heuristic-parser pipeline.

Usage (from backend/):
    .venv/bin/python -m scripts.import_moniteur_json path/to/issue.json
    .venv/bin/python -m scripts.import_moniteur_json path/to/issue.json --dry-run

The expected JSON shape mirrors ``MoniteurJsonImport`` —
``schema_version: 1``, an ``issue`` object, and a list of
``entries`` objects:

    {
      "schema_version": 1,
      "issue": {
        "number": "47",
        "year": 2014,
        "publication_date": "2014-06-04",
        "edition_label": null,
        "director": "Henry Robert MARC-CHARLES",
        "director_role": null
      },
      "entries": [
        {
          "detected_category": "loi",
          "detected_title": "Loi sur ...",
          "detected_number": "CL-007-09",
          "detected_date": "2014-06-04",
          "page_from": 3,
          "page_to": 25,
          "raw_text": "..."
        }
      ]
    }

Idempotent on ``(year, number)`` — re-running with the same issue
updates its metadata and replaces the pending entries (promoted rows
are kept). The same logic backs the
``POST /editorial/moniteur/issues/import-json`` HTTP route.

Dry-run mode prints what would be created without touching the DB.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from sqlalchemy.orm import Session

from api.config import get_settings
from api.db import SessionLocal
from packages.schemas.moniteur import MoniteurJsonImport
from services.ingestion.moniteur.repository import MoniteurRepository


def _load_payload(path: Path) -> MoniteurJsonImport:
    """Read + validate the JSON file. Raises pydantic.ValidationError
    on shape mismatch — printed verbatim by the CLI so the editor
    sees field paths and reasons in one place."""
    with path.open("r", encoding="utf-8") as fh:
        raw = json.load(fh)
    return MoniteurJsonImport.model_validate(raw)


def _import(session: Session, payload: MoniteurJsonImport) -> tuple[int, int, str]:
    """Run the import against a live session. Returns ``(issue_id,
    entry_count, action)`` where ``action`` is 'created' for a fresh
    issue or 'updated' when an existing one was patched."""
    repo = MoniteurRepository(session)
    existing = (
        session.query(repo.model_cls()) if hasattr(repo, "model_cls") else None
    )
    # Cheaper to detect existing via the same uniqueness pair the
    # repository checks. Defer to the repo + read the returned issue.
    issue = repo.import_from_json(
        issue_data=payload.issue.model_dump(),
        entries=[e.model_dump() for e in payload.entries],
        uploaded_by=None,
    )
    # If the issue id was already in DB before the call, treat it
    # as an update — the repo overrides metadata in place. We don't
    # have a clean way to know other than checking the new state, so
    # report a neutral "imported" verb.
    return issue.id, len(payload.entries), "imported"


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Import a Moniteur issue + entries from a JSON file, "
            "bypassing the OCR/parser pipeline."
        )
    )
    parser.add_argument(
        "json_path",
        type=Path,
        help="Path to the JSON file to import.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Validate the JSON + show what would be created, but do "
            "not write to the database."
        ),
    )
    args = parser.parse_args()

    if not args.json_path.exists():
        print(f"error: {args.json_path} does not exist", file=sys.stderr)
        return 1

    try:
        payload = _load_payload(args.json_path)
    except Exception as e:  # noqa: BLE001 — print + exit
        print(f"error: invalid JSON payload\n  {e}", file=sys.stderr)
        return 2

    print(
        f"Loaded payload: schema_version={payload.schema_version} "
        f"issue={payload.issue.number}/{payload.issue.year} "
        f"entries={len(payload.entries)}"
    )

    if args.dry_run:
        print("(dry-run) skipping DB write")
        for i, entry in enumerate(payload.entries, start=1):
            print(
                f"  #{i:02d} {entry.detected_category.value:14s}  "
                f"pp. {entry.page_from}-{entry.page_to:>4}  "
                f"{(entry.detected_title or '')[:80]}"
            )
        return 0

    settings = get_settings()
    print(
        f"writing to {settings.database_url.split('@')[-1].split('/')[0]}…"
    )
    session = SessionLocal()
    try:
        issue_id, entry_count, action = _import(session, payload)
        session.commit()
        print(
            f"✓ {action} issue #{issue_id} with {entry_count} entries "
            f"(status: parsed — visit /editorial/moniteur/{issue_id}/review "
            "to triage)."
        )
    except Exception as e:  # noqa: BLE001 — print + exit
        session.rollback()
        print(f"error: import failed\n  {e}", file=sys.stderr)
        return 3
    finally:
        session.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
