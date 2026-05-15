"""Push local constitution-1987 Kreyòl content + N° 36-A moniteur issue
to the Azure prod DB.

Idempotent. Run order:

  1. Insert/upsert the N° 36-A ``moniteur_issues`` row.
  2. Insert/upsert the two ``moniteur_entries`` for N° 36-A (the
     Kreyòl constitution entry + the promulgation companion).
  3. Set ``legal_texts.moniteur_issue_id_ht`` on constitution-1987.
  4. Copy ``article_versions.text_ht`` for every row of
     constitution-1987 from local to prod, keyed on
     ``(article.number, version_number)`` so version-id differences
     between the two DBs don't matter.

The local DB connection comes from ``api.config.get_settings()`` —
same path the backend uses. The prod connection comes from the
``--prod-url`` flag (or the ``PROD_DATABASE_URL`` env var). The
script will refuse to run if --prod-url isn't given AND that env
var isn't set — no accidental cross-environment writes.

Use ``--dry-run`` to print what would happen without writing.

Usage (from ``backend/``)::

    .venv/bin/python scripts/migrate_constitution_to_azure.py \\
        --prod-url 'postgresql+psycopg2://lhadmin:<pwd>@lex-haiti-db-785ece.postgres.database.azure.com:5432/lexhaiti?sslmode=require'

    # Preview only:
    .venv/bin/python scripts/migrate_constitution_to_azure.py \\
        --prod-url '<url>' --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, select, text, update
from sqlalchemy.orm import Session

from api.config import get_settings
from schemas.enums import MoniteurIssueStatus
from services.corpus.models import (
    Article,
    ArticleVersion,
    LegalText,
    MoniteurEntry,
    MoniteurIssue,
)

CONSTITUTION_SLUG = "constitution-1987"
N36A_NUMBER = "36-A"
N36A_YEAR = 1987
N36A_DATE = date(1987, 4, 28)
N36A_LABEL = "Numéro extraordinaire"


def get_or_create_n36a(session: Session) -> MoniteurIssue:
    existing = session.execute(
        select(MoniteurIssue).where(
            MoniteurIssue.year == N36A_YEAR,
            MoniteurIssue.number == N36A_NUMBER,
        )
    ).scalar_one_or_none()
    if existing:
        print(f"  N° 36-A already exists on prod (id={existing.id})")
        return existing
    issue = MoniteurIssue(
        year=N36A_YEAR,
        number=N36A_NUMBER,
        publication_date=N36A_DATE,
        edition_label=N36A_LABEL,
        processing_status=MoniteurIssueStatus.published,
    )
    session.add(issue)
    session.flush()
    print(f"  Created N° 36-A on prod (id={issue.id})")
    return issue


def upsert_n36a_entries(session: Session, issue: MoniteurIssue, *, legal_text_id: int) -> None:
    """Ensure exactly two entries exist on N° 36-A: a constitution entry
    pointing at constitution-1987 and a promulgation companion."""
    existing = session.execute(
        select(MoniteurEntry).where(MoniteurEntry.issue_id == issue.id)
    ).scalars().all()
    by_cat = {e.detected_category.value if e.detected_category else None: e for e in existing}

    if "constitution" not in by_cat:
        session.add(
            MoniteurEntry(
                issue_id=issue.id,
                position=0,
                detected_category="constitution",
                detected_title="Konstitisyon Repiblik Ayiti 1987",
                raw_text="OCR Kreyol — see article_versions.text_ht on constitution-1987",
                review_status="accepted",
                promoted_legal_text_id=legal_text_id,
            )
        )
        print("  Inserted constitution entry on N° 36-A")
    else:
        print("  constitution entry already present on N° 36-A")

    if "promulgation" not in by_cat:
        session.add(
            MoniteurEntry(
                issue_id=issue.id,
                position=1,
                detected_category="promulgation",
                detected_title=None,
                raw_text="Premye koze: Pèp ayisyen deklare Konstitisyon sa a…",
                review_status="accepted",
                promoted_legal_text_id=None,
            )
        )
        print("  Inserted promulgation entry on N° 36-A")
    else:
        print("  promulgation entry already present on N° 36-A")


def fetch_local_text_ht(local_session: Session, legal_text_id: int) -> dict[tuple[str, int], str]:
    """Return ``{(article_number, version_number): text_ht}`` for every
    article_version of the given legal text where text_ht is non-empty."""
    rows = local_session.execute(
        select(Article.number, ArticleVersion.version_number, ArticleVersion.text_ht)
        .join(ArticleVersion, ArticleVersion.article_id == Article.id)
        .where(Article.legal_text_id == legal_text_id)
        .where(ArticleVersion.text_ht.is_not(None))
        .where(ArticleVersion.text_ht != "")
    ).all()
    return {(r.number, r.version_number): r.text_ht for r in rows}


def apply_text_ht_to_prod(
    prod_session: Session,
    *,
    legal_text_id: int,
    payload: dict[tuple[str, int], str],
    dry_run: bool,
) -> tuple[int, int]:
    """For each (number, version_number) in payload, find the matching
    article_version on prod and write its text_ht. Returns (updated,
    skipped) counts."""
    # Build a (article_id, version_number) → version_id map on prod.
    prod_rows = prod_session.execute(
        select(
            Article.number,
            ArticleVersion.id,
            ArticleVersion.version_number,
        )
        .join(ArticleVersion, ArticleVersion.article_id == Article.id)
        .where(Article.legal_text_id == legal_text_id)
    ).all()
    prod_index: dict[tuple[str, int], int] = {
        (r.number, r.version_number): r.id for r in prod_rows
    }

    updated = 0
    missing: list[tuple[str, int]] = []
    for key, body in payload.items():
        vid = prod_index.get(key)
        if vid is None:
            missing.append(key)
            continue
        if not dry_run:
            prod_session.execute(
                update(ArticleVersion).where(ArticleVersion.id == vid).values(text_ht=body)
            )
        updated += 1
    if missing:
        preview = ", ".join(f"{n} v{v}" for n, v in missing[:10])
        print(
            f"  WARN: {len(missing)} (number, version_number) keys exist on local "
            f"but not on prod. First 10: {preview}"
        )
    return updated, len(missing)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--prod-url",
        default=os.environ.get("PROD_DATABASE_URL"),
        help="SQLAlchemy URL for the prod (Azure) DB. Falls back to "
        "PROD_DATABASE_URL env var.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read both DBs, report planned changes, write nothing.",
    )
    args = parser.parse_args()

    if not args.prod_url:
        print(
            "ERROR: --prod-url or PROD_DATABASE_URL is required. "
            "Refusing to run without an explicit prod target."
        )
        return 1

    settings = get_settings()
    local_engine = create_engine(settings.database_url, echo=False)
    prod_engine = create_engine(args.prod_url, echo=False)

    print("== Fetching local Kreyòl content ==")
    with Session(local_engine) as local_session:
        constitution_local = local_session.execute(
            select(LegalText).where(LegalText.slug == CONSTITUTION_SLUG)
        ).scalar_one()
        payload = fetch_local_text_ht(local_session, constitution_local.id)
    print(f"  {len(payload)} article_version rows carry Kreyòl text on local.")

    print("\n== Writing to prod ==")
    with Session(prod_engine) as prod_session:
        constitution_prod = prod_session.execute(
            select(LegalText).where(LegalText.slug == CONSTITUTION_SLUG)
        ).scalar_one()

        print("[1/4] Ensuring N° 36-A moniteur issue…")
        issue = get_or_create_n36a(prod_session)

        print("\n[2/4] Ensuring N° 36-A entries…")
        upsert_n36a_entries(prod_session, issue, legal_text_id=constitution_prod.id)

        print("\n[3/4] Setting legal_texts.moniteur_issue_id_ht…")
        if constitution_prod.moniteur_issue_id_ht != issue.id:
            constitution_prod.moniteur_issue_id_ht = issue.id
            print(
                f"  Set constitution-1987.moniteur_issue_id_ht = {issue.id}"
            )
        else:
            print("  Already set.")

        print(
            f"\n[4/4] Pushing text_ht for {len(payload)} versions of "
            f"constitution-1987 (prod legal_text id={constitution_prod.id})…"
        )
        updated, missing = apply_text_ht_to_prod(
            prod_session,
            legal_text_id=constitution_prod.id,
            payload=payload,
            dry_run=args.dry_run,
        )
        print(f"  Updated {updated} versions ({missing} keys missing on prod).")

        if args.dry_run:
            prod_session.rollback()
            print("\n[dry-run] Rolled back.")
        else:
            prod_session.commit()
            print("\n[committed]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
