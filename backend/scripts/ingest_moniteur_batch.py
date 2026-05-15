"""Ingest the 2025 transcript batch of historic + recent Moniteurs.

Reads ``backend/data/moniteur_batch_2025.py``, UPSERTs the five
issues defined there and their entries against the database
addressed by ``DATABASE_URL``. Designed to be run **inside the API
Container App** so the prod creds stay where they live, but works
identically against the local dev DB.

Idempotent on three axes:

  * ``moniteur_issues`` is UPSERTed on ``(year, number)`` — the
    composite unique constraint that already exists on the table.
    Re-running the script updates ``publication_date``, director,
    edition_label, file_url, and page_count to the latest values
    in the data file.

  * ``moniteur_entries`` is UPSERTed on ``(issue_id, position)``.
    Re-running rewrites ``raw_text``, ``display_title``,
    ``summary_fr`` etc. but preserves any editorial mutations made
    on prod that aren't in the data file (in particular
    ``promoted_legal_text_id``, ``review_status``, ``review_notes``).

  * ``file_url`` is rewritten to an absolute path that resolves
    inside the container's working tree (``/app/<rel>``). On a
    laptop run, ``--local`` flips this to the developer's repo
    path. The scan-PDF download endpoint accepts either.

Usage (local)::

    .venv/bin/python scripts/ingest_moniteur_batch.py --local

Usage (prod via Container Apps Job)::

    az containerapp job update -n lex-haiti-migrate -g lex-haiti-prod \\
        --image lexhaitiacr785ece.azurecr.io/lex-haiti-backend:<sha> \\
        --command python scripts/ingest_moniteur_batch.py
    az containerapp job start -n lex-haiti-migrate -g lex-haiti-prod
    # then restore the migrate command:
    az containerapp job update -n lex-haiti-migrate -g lex-haiti-prod \\
        --command python scripts/run_migrations.py
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Bootstrap path so the script works from either ``backend/`` or
# inside ``/app/`` in the container.
HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import create_engine, text  # noqa: E402

from data.moniteur_batch_2025 import ALL_ISSUES, EntryData, IssueData  # noqa: E402


def _resolve_db_url() -> str | None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        return None
    # SQLAlchemy 2 + psycopg2 want the explicit driver; some prod
    # secrets ship as plain ``postgresql://`` (libpq form).
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return url


def _file_url(issue: IssueData, local: bool) -> str:
    """Where the scan PDF lives at runtime.

    Local: absolute path on the developer's machine, so the
    ``/issues/{id}/scan`` endpoint serves directly out of
    ``backend/data/scans/`` during dev.

    Container: absolute path inside the image
    (``/app/data/scans/...``), which the ``_static_scans_root``
    helper in routes/moniteur.py already accepts.
    """
    rel = issue.file_url  # e.g. ``data/scans/moniteur-1936-40.pdf``
    if local:
        return str((BACKEND_ROOT / rel).resolve())
    return f"/app/{rel}"


def upsert_issue(conn, issue: IssueData, *, local: bool) -> int:
    """UPSERT the issue row and return its id."""
    file_url = _file_url(issue, local)
    row = conn.execute(
        text(
            """
            INSERT INTO moniteur_issues
              (number, year, publication_date, edition_label, director,
               director_role, file_url, page_count, processing_status,
               parsed_at, published_at)
            VALUES
              (:number, :year, :publication_date, :edition_label, :director,
               :director_role, :file_url, :page_count, 'published',
               now(), now())
            ON CONFLICT (year, number) DO UPDATE SET
              publication_date = EXCLUDED.publication_date,
              edition_label    = EXCLUDED.edition_label,
              director         = EXCLUDED.director,
              director_role    = EXCLUDED.director_role,
              file_url         = EXCLUDED.file_url,
              page_count       = EXCLUDED.page_count,
              processing_status = CASE
                  WHEN moniteur_issues.processing_status = 'published'
                  THEN moniteur_issues.processing_status
                  ELSE 'published'
              END,
              parsed_at        = COALESCE(moniteur_issues.parsed_at, now()),
              published_at     = COALESCE(moniteur_issues.published_at, now())
            RETURNING id
            """
        ),
        {
            "number": issue.number,
            "year": issue.year,
            "publication_date": issue.publication_date,
            "edition_label": issue.edition_label,
            "director": issue.director,
            "director_role": issue.director_role,
            "file_url": file_url,
            "page_count": issue.page_count,
        },
    ).first()
    assert row is not None, "RETURNING never empty after UPSERT"
    return int(row[0])


def upsert_entry(conn, issue_id: int, entry: EntryData) -> None:
    """UPSERT the entry row keyed on (issue_id, position).

    Preserves any editorial state set on prod — ``review_status``,
    ``promoted_legal_text_id``, ``reviewed_by/at`` — by leaving
    those columns out of the UPDATE clause.
    """
    conn.execute(
        text(
            """
            INSERT INTO moniteur_entries
              (issue_id, position, detected_category, detected_title,
               display_title, detected_number, detected_date,
               summary_fr, raw_text, page_from, page_to,
               review_status)
            VALUES
              (:issue_id, :position,
               CAST(:detected_category AS public_corpus.moniteur_document_type),
               :detected_title, :display_title, :detected_number,
               :detected_date, :summary_fr, :raw_text, :page_from,
               :page_to, 'pending')
            ON CONFLICT (issue_id, position) DO UPDATE SET
              detected_category = EXCLUDED.detected_category,
              detected_title    = EXCLUDED.detected_title,
              display_title     = EXCLUDED.display_title,
              detected_number   = EXCLUDED.detected_number,
              detected_date     = EXCLUDED.detected_date,
              summary_fr        = EXCLUDED.summary_fr,
              raw_text          = EXCLUDED.raw_text,
              page_from         = EXCLUDED.page_from,
              page_to           = EXCLUDED.page_to
            """
        ),
        {
            "issue_id": issue_id,
            "position": entry.position,
            "detected_category": entry.detected_category,
            "detected_title": entry.detected_title,
            "display_title": entry.display_title,
            "detected_number": entry.detected_number,
            "detected_date": entry.detected_date,
            "summary_fr": entry.summary_fr,
            "raw_text": entry.raw_text,
            "page_from": entry.page_from,
            "page_to": entry.page_to,
        },
    )


def _ensure_position_unique_constraint(conn) -> None:
    """Idempotent: add the partial unique index that the entry
    UPSERT relies on, if it doesn't already exist."""
    conn.execute(
        text(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS
              uq_moniteur_entries_issue_position
              ON moniteur_entries (issue_id, position)
            """
        )
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--local",
        action="store_true",
        help=(
            "Use absolute filesystem paths under the developer's repo for "
            "``file_url`` (dev DB). Default: use ``/app/...`` (container)."
        ),
    )
    args = parser.parse_args()

    db_url = _resolve_db_url()
    if not db_url:
        print("ERROR: DATABASE_URL is not set. Refusing to run.", file=sys.stderr)
        return 30

    engine = create_engine(
        db_url,
        pool_pre_ping=True,
        connect_args={"options": "-csearch_path=public_corpus,public"},
    )

    n_issues = 0
    n_entries = 0
    with engine.begin() as conn:
        _ensure_position_unique_constraint(conn)
        for issue in ALL_ISSUES:
            issue_id = upsert_issue(conn, issue, local=args.local)
            n_issues += 1
            for entry in issue.entries:
                upsert_entry(conn, issue_id, entry)
                n_entries += 1
            print(
                f"  ✓ {issue.year} N° {issue.number}  →  issue_id={issue_id}, "
                f"{len(issue.entries)} entries"
            )

    print(f"\nDone. issues={n_issues}  entries={n_entries}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
