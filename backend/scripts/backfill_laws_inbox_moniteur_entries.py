"""One-off: create a ``MoniteurEntry`` for each laws-inbox draft that
was ingested before the ``ingest_laws_inbox.py`` patch that auto-
creates entries.

Walks ``backend/data/laws_inbox_2026/*.json``, picks up every JSON
whose ``status == ingested`` and that has a ``legal_text_id`` whose
parent ``LegalText.moniteur_issue_id`` is set but no matching
``MoniteurEntry.promoted_legal_text_id`` exists yet. Creates the
missing entry so the ``/editorial/moniteur`` view surfaces the
text inside its issue.

Idempotent. Re-running is a no-op.
"""
from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import func, select  # noqa: E402

from api.db import SessionLocal  # noqa: E402
from schemas.enums import MoniteurCandidateStatus, MoniteurDocumentType  # noqa: E402
from services.corpus.models import (  # noqa: E402
    LegalText,
    MoniteurEntry,
)


def _doctype_for(category) -> MoniteurDocumentType:
    try:
        return MoniteurDocumentType(category.value)
    except Exception:  # noqa: BLE001
        return MoniteurDocumentType.autre


def main() -> None:
    inbox = BACKEND_ROOT / "data" / "laws_inbox_2026"
    if not inbox.is_dir():
        print(f"inbox does not exist: {inbox}")
        return

    created = 0
    already = 0
    skipped = 0
    with SessionLocal() as session:
        for json_path in sorted(inbox.glob("*.json")):
            payload = json.loads(json_path.read_text())
            if payload.get("status") != "ingested":
                skipped += 1
                continue
            lt_id = payload.get("legal_text_id")
            if not lt_id:
                skipped += 1
                continue

            lt = session.get(LegalText, lt_id)
            if lt is None:
                skipped += 1
                continue
            if lt.moniteur_issue_id is None:
                skipped += 1
                continue

            existing = session.scalars(
                select(MoniteurEntry).where(
                    MoniteurEntry.promoted_legal_text_id == lt.id
                )
            ).first()
            if existing is not None:
                already += 1
                continue

            next_position = session.scalar(
                select(
                    func.coalesce(func.max(MoniteurEntry.position), -1) + 1
                ).where(MoniteurEntry.issue_id == lt.moniteur_issue_id)
            ) or 0

            raw_text_blob = (payload.get("preamble_fr") or "") + "\n\n" + "\n\n".join(
                f"Article {a.get('number')}.- {a.get('text_fr') or ''}"
                for a in (payload.get("articles") or [])
            )

            session.add(
                MoniteurEntry(
                    issue_id=lt.moniteur_issue_id,
                    position=int(next_position),
                    detected_category=_doctype_for(lt.category),
                    detected_title=lt.official_title_fr or lt.title_fr,
                    display_title=lt.title_fr,
                    detected_date=lt.promulgation_date,
                    raw_text=raw_text_blob.strip() or (lt.title_fr or "(no text)"),
                    review_status=MoniteurCandidateStatus.accepted,
                    promoted_legal_text_id=lt.id,
                    reviewed_at=datetime.now(UTC),
                )
            )
            session.commit()
            created += 1
            print(
                f"  [+] entry for legal_text #{lt.id} ({json_path.stem}) "
                f"in moniteur_issue #{lt.moniteur_issue_id}"
            )

    print(
        f"\nbackfilled {created}, already-had-entry {already}, skipped {skipped}"
    )


if __name__ == "__main__":
    main()
