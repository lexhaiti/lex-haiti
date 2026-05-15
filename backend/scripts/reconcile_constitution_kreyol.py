"""Reconcile constitution-1987 ``text_ht`` against a clean Kreyòl
transcription split page-by-page.

Context
-------
The first pass (``ingest_moniteur_36a_creole.py``) ran Tesseract over a
1987 scan with watermarks and missed ~100 article markers (squashed
numbers like ``2151``, mis-cased ``atik 5:``). The user has since
provided a higher-quality page-by-page transcription as a series of
``NNNNN.txt`` files; this script reconciles that source against what's
currently in the DB.

Reconciliation rules per parsed article:

  * **DB empty, transcription has body** → write transcription body.
  * **DB has body, transcription has body**:
      - If transcription is materially longer (≥ 1.2× the DB length
        AND ≥ 20 chars longer) → replace. The transcription is the
        better source for this article.
      - Otherwise → keep DB. The previous editor cleanup likely
        already polished this row.
  * **DB has body, transcription empty** → keep DB.
  * **Transcription article doesn't match a DB article number** →
    logged at the end so the editor can decide whether to insert a
    new article (parser gaps) or hand-correct the number (squashed
    OCR like ``2151`` → ``21-5-1``).

The HTML-paragraph wrap step (``wrap_text_ht_in_paragraphs.py``) is
re-run after this script — paragraph wrapping is idempotent so any
rows we replace get re-wrapped automatically.

Usage (from ``backend/``)::

    .venv/bin/python scripts/reconcile_constitution_kreyol.py \\
        --dir "/Users/pracht/Downloads/files 3"

    # Don't write — just print the proposed changes:
    .venv/bin/python scripts/reconcile_constitution_kreyol.py \\
        --dir "/Users/pracht/Downloads/files 3" --dry-run
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import Session

from api.config import get_settings
from services.corpus.models import Article, ArticleVersion, LegalText

# Re-use the parser primitives from the first-pass script so this
# stays a single-source-of-truth on article-number normalisation.
from scripts.ingest_moniteur_36a_creole import (
    _ARTICLE_RE,
    _pdf_to_db_number,
    parse_articles,
)


CONSTITUTION_SLUG = "constitution-1987"


def load_transcription(folder: Path) -> str:
    """Concatenate every ``NNNNN.txt`` file in numeric order. Drops the
    sidecar ``EZ4T...xml.txt`` manifest. Pages join with a blank line
    so the article splitter sees a paragraph break at page edges and
    doesn't merge end-of-page content with the next page's marker."""
    text_files = sorted(
        p for p in folder.iterdir() if re.fullmatch(r"\d+\.txt", p.name)
    )
    if not text_files:
        raise SystemExit(f"No NNNNN.txt files found in {folder}")
    print(f"Reading {len(text_files)} pages from {folder.name}/")
    chunks: list[str] = []
    for p in text_files:
        chunks.append(p.read_text(encoding="utf-8"))
    return "\n\n".join(chunks)


def looks_html(s: str) -> bool:
    return s.lstrip().startswith("<")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dir",
        required=True,
        type=Path,
        help="Folder of per-page NNNNN.txt files (Kreyòl transcription).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report planned changes without writing to the DB.",
    )
    # Material-improvement thresholds. The defaults are tuned so we
    # only replace when the transcription is substantially fuller —
    # avoids stomping on rows the user has already hand-cleaned.
    parser.add_argument("--min-ratio", type=float, default=1.2)
    parser.add_argument("--min-delta", type=int, default=20)
    args = parser.parse_args()

    raw = load_transcription(args.dir.expanduser().resolve())
    parsed = parse_articles(raw)
    print(f"Parsed {len(parsed)} article bodies from transcription.")

    settings = get_settings()
    engine = create_engine(settings.database_url, echo=False)

    inserted = 0      # DB was empty, transcription supplied content
    replaced = 0      # transcription was materially better
    kept = 0          # DB already had something at least as good
    db_missing: list[str] = []   # transcription number → no DB article

    with Session(engine) as session:
        text = session.execute(
            select(LegalText).where(LegalText.slug == CONSTITUTION_SLUG)
        ).scalar_one_or_none()
        if text is None:
            print(f"ERROR: legal_text {CONSTITUTION_SLUG!r} not found.")
            return 1

        rows = session.execute(
            select(Article.number, Article.current_version_id)
            .where(Article.legal_text_id == text.id)
        ).all()
        number_to_vid: dict[str, int] = {
            r.number: r.current_version_id
            for r in rows
            if r.current_version_id is not None
        }

        for db_num_unnormalised, body in parsed.items():
            # parse_articles already returned db-normalised keys
            db_num = db_num_unnormalised
            vid = number_to_vid.get(db_num)
            if vid is None:
                db_missing.append(db_num)
                continue

            current = (
                session.execute(
                    select(ArticleVersion.text_ht).where(
                        ArticleVersion.id == vid
                    )
                ).scalar_one()
                or ""
            )

            # If the live row was already cleaned up to HTML by the
            # editor, leave it alone — the wrap script can re-format
            # later but we don't want to clobber hand-edits with raw
            # OCR.
            if looks_html(current) and len(current) > 100:
                kept += 1
                continue

            if not current.strip():
                if not args.dry_run:
                    session.execute(
                        update(ArticleVersion)
                        .where(ArticleVersion.id == vid)
                        .values(text_ht=body)
                    )
                inserted += 1
                continue

            # Both sides have content — pick the materially better one.
            cur_len = len(current)
            new_len = len(body)
            ratio = (new_len / cur_len) if cur_len else float("inf")
            if ratio >= args.min_ratio and (new_len - cur_len) >= args.min_delta:
                if not args.dry_run:
                    session.execute(
                        update(ArticleVersion)
                        .where(ArticleVersion.id == vid)
                        .values(text_ht=body)
                    )
                replaced += 1
            else:
                kept += 1

        if not args.dry_run:
            session.commit()

    print(
        f"\nSummary"
        f"\n  Inserted (was empty): {inserted}"
        f"\n  Replaced (transcription fuller): {replaced}"
        f"\n  Kept (DB already good): {kept}"
        f"\n  Transcription articles not in DB: {len(db_missing)}"
    )
    if db_missing:
        preview = ", ".join(db_missing[:30])
        more = f"  …+{len(db_missing) - 30} more" if len(db_missing) > 30 else ""
        print(f"\n  Missing in DB (first 30): {preview}{more}")
    print("[dry-run]" if args.dry_run else "[committed]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
