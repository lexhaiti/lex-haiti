"""Import a Moniteur issue from a structured JSON file — dev-only
path that bypasses the OCR / heuristic-parser pipeline.

Usage (from backend/):
    .venv/bin/python -m scripts.import_moniteur_json path/to/issue.json
    .venv/bin/python -m scripts.import_moniteur_json path/to/issue.json --dry-run
    .venv/bin/python -m scripts.import_moniteur_json path/to/issue.json \\
        --actor-email editor@example.com

The expected JSON shape mirrors ``MoniteurJsonImport`` —
``schema_version: 1``, an ``issue`` object, and a list of
``entries`` objects. Two flavours of entry are supported:

Pending entry (default — editor still has to review/promote)::

    {
      "detected_category": "loi",
      "detected_title": "Loi sur ...",
      "detected_number": "CL-007-09",
      "detected_date": "2014-06-04",
      "page_from": 3,
      "page_to": 25,
      "raw_text": "Article 1.- ..."
    }

Auto-promoted entry (full structure → draft LegalText)::

    {
      "detected_category": "loi",
      "content": {
        "slug": "loi-portant-exemple",
        "category": "loi",
        "title_fr": "Loi portant ...",
        "promulgation_date": "2014-06-04",
        "headings": [
          {"key": "titre-i", "level": "titre", "number": "I",
           "title_fr": "Dispositions générales", "position": 0}
        ],
        "articles": [
          {"number": "1", "slug": "art-1", "heading_key": "titre-i",
           "position": 0,
           "version": {"text_fr": "Le présent texte ..."}}
        ]
      }
    }

When ``content`` is present, the entry is auto-promoted to a draft
``LegalText`` immediately (no editorial review needed). ``page_from``
and ``page_to`` are optional — JSON-imported entries bypass the
parser, so the page-range hint is only useful for tracking where
the text appears in the printed issue.

Idempotent on ``(year, number)`` — re-running with the same issue
updates its metadata and replaces the pending entries (promoted
rows are kept). The same logic backs the
``POST /editorial/moniteur/issues/import-json`` HTTP route.

Dry-run mode prints what would be created without touching the DB.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.config import get_settings
from api.db import SessionLocal
from packages.schemas.moniteur import MoniteurJsonImport
from services.auth.enums import UserRole
from services.auth.models import User
from services.ingestion.moniteur.repository import MoniteurRepository


def _load_payload(path: Path) -> MoniteurJsonImport:
    """Read + validate the JSON file. Raises pydantic.ValidationError
    on shape mismatch — printed verbatim by the CLI so the editor
    sees field paths and reasons in one place."""
    with path.open("r", encoding="utf-8") as fh:
        raw = json.load(fh)
    return MoniteurJsonImport.model_validate(raw)


def _resolve_actor(
    session: Session, actor_email: Optional[str]
) -> Optional[User]:
    """Find a User to attribute the import + auto-promotion actions to.

    Auto-promotion goes through ``EditorialService.create_legal_text``
    which audits the action against a real user — we need someone to
    hang the editorial-actions row on. Resolution order:

      1. ``--actor-email`` if provided (must match an existing user).
      2. The first user with role ``editor`` or ``admin``.
      3. None — auto-promotion will be skipped.
    """
    if actor_email:
        user = session.execute(
            select(User).where(User.email == actor_email)
        ).scalar_one_or_none()
        if user is None:
            raise SystemExit(
                f"error: no user found with email {actor_email!r}"
            )
        return user
    return session.execute(
        select(User)
        .where(User.role.in_((UserRole.editor, UserRole.admin)))
        .order_by(User.id)
        .limit(1)
    ).scalar_one_or_none()


def _import(
    session: Session,
    payload: MoniteurJsonImport,
    *,
    actor: Optional[User] = None,
) -> tuple[int, int, int]:
    """Run the import against a live session. Returns ``(issue_id,
    entry_count, promoted_count)``.

    Entries that carry an inline ``content`` block are auto-promoted
    to draft LegalText rows when an ``actor`` is supplied. When the
    actor is None (no editor in the DB and no --actor-email), entries
    with content are left pending — the editor can promote them
    manually from the review page.
    """
    repo = MoniteurRepository(session)
    entry_dicts = [
        e.model_dump(exclude={"content"}) for e in payload.entries
    ]
    issue = repo.import_from_json(
        issue_data=payload.issue.model_dump(),
        entries=entry_dicts,
        uploaded_by=actor.id if actor is not None else None,
    )

    promoted = 0
    if actor is not None:
        full = repo.get_issue_with_entries(issue.id)
        by_position = (
            {e.position: e for e in full.entries} if full is not None else {}
        )
        for i, payload_entry in enumerate(payload.entries):
            if payload_entry.content is None:
                continue
            db_entry = by_position.get(i)
            if db_entry is None or db_entry.promoted_legal_text_id is not None:
                continue
            repo.auto_promote_from_content(
                db_entry,
                payload_entry.content.model_dump(),
                actor=actor,
            )
            promoted += 1

    return issue.id, len(payload.entries), promoted


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
    parser.add_argument(
        "--actor-email",
        default=None,
        help=(
            "Email of the editor to attribute the import to (for "
            "auto-promotion's audit trail). When omitted, the first "
            "editor/admin in the DB is used; if none exists, entries "
            "with inline ``content`` are left pending."
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

    content_count = sum(1 for e in payload.entries if e.content is not None)
    print(
        f"Loaded payload: schema_version={payload.schema_version} "
        f"issue={payload.issue.number}/{payload.issue.year} "
        f"entries={len(payload.entries)} "
        f"with_content={content_count}"
    )

    if args.dry_run:
        print("(dry-run) skipping DB write")
        for i, entry in enumerate(payload.entries, start=1):
            pages = (
                f"pp. {entry.page_from}-{entry.page_to}"
                if entry.page_from is not None or entry.page_to is not None
                else "pp. —"
            )
            marker = " [content]" if entry.content is not None else ""
            print(
                f"  #{i:02d} {entry.detected_category.value:14s}  "
                f"{pages:14s}  "
                f"{(entry.detected_title or '')[:80]}{marker}"
            )
        return 0

    settings = get_settings()
    print(
        f"writing to {settings.database_url.split('@')[-1].split('/')[0]}…"
    )
    session = SessionLocal()
    try:
        actor = _resolve_actor(session, args.actor_email)
        if actor is not None:
            print(f"auto-promoting under actor: {actor.email or f'user-{actor.id}'}")
        elif content_count:
            print(
                "warning: no editor user found — entries with inline "
                "``content`` will stay pending (no auto-promotion)."
            )
        issue_id, entry_count, promoted = _import(
            session, payload, actor=actor
        )
        session.commit()
        review_path = f"/editorial/moniteur/{issue_id}/review"
        promoted_msg = (
            f" (auto-promoted {promoted}/{content_count} entries)"
            if content_count
            else ""
        )
        print(
            f"✓ imported issue #{issue_id} with {entry_count} entries"
            f"{promoted_msg} — visit {review_path} to triage."
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
