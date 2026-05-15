"""Wrap raw text_ht in HTML <p> tags so it renders correctly.

The OCR ingestion in ``ingest_moniteur_36a_creole.py`` writes raw
Kreyòl text to ``article_versions.text_ht`` — line breaks preserved
as literal ``\\n``, no markup. The public reader path expects
``text_fr`` / ``text_ht`` to be sanitised HTML (paragraphs in
``<p>`` tags) because the renderer uses ``dangerouslySetInnerHTML``
and the Tiptap editor stores its output in that shape.

This one-shot script converts every text_ht that doesn't already
look like HTML — i.e. starts with something other than ``<`` — into
a series of ``<p>`` blocks. Splitting strategy:

  • split on blank lines first (paragraph boundaries from the OCR)
  • for each paragraph, collapse the in-paragraph newlines to spaces
    so wrapped lines from the two-column scan join back into a
    single readable run
  • HTML-escape any stray ``<``/``>``/``&`` before wrapping
  • emit ``<p>...</p>`` for each non-empty paragraph

Idempotent: a text_ht that already starts with ``<`` is left alone,
so running this twice doesn't double-wrap. Pass ``--dry-run`` to
preview the row count without writing.

Usage (from ``backend/``)::

    .venv/bin/python scripts/wrap_text_ht_in_paragraphs.py
    .venv/bin/python scripts/wrap_text_ht_in_paragraphs.py --dry-run
"""

from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import Session

from api.config import get_settings
from services.corpus.models import ArticleVersion, LegalText


CONSTITUTION_SLUG = "constitution-1987"


def looks_like_html(s: str) -> bool:
    """Cheap check: does the string already start with an HTML tag?
    Avoids double-wrapping rows that were already cleaned via the
    editor UI."""
    return s.lstrip().startswith("<")


def to_paragraphs(raw: str) -> str:
    """Turn an OCR'd raw string into a ``<p>``-wrapped HTML snippet.

    Steps:
      1. normalise CRLF → LF
      2. split on runs of blank lines (paragraph breaks)
      3. inside each paragraph, fold remaining single newlines into
         spaces (two-column scan splits a sentence across lines)
      4. HTML-escape so OCR noise like ``<`` from "Atik <12>" can't
         inject markup
      5. wrap each non-empty paragraph in ``<p>...</p>``
    """
    normalised = raw.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalised:
        return ""
    paragraphs = re.split(r"\n\s*\n+", normalised)
    out: list[str] = []
    for para in paragraphs:
        # Fold soft line-wraps back into a single line.
        flat = re.sub(r"\s*\n\s*", " ", para).strip()
        # Collapse runs of multiple spaces left over from the fold.
        flat = re.sub(r" {2,}", " ", flat)
        if not flat:
            continue
        out.append(f"<p>{html.escape(flat, quote=False)}</p>")
    return "".join(out)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Count rows that would change without writing.",
    )
    parser.add_argument(
        "--legal-text-slug",
        default=CONSTITUTION_SLUG,
        help="Slug of the legal text to process (default: constitution-1987).",
    )
    args = parser.parse_args()

    settings = get_settings()
    engine = create_engine(settings.database_url, echo=False)

    with Session(engine) as session:
        text = session.execute(
            select(LegalText).where(LegalText.slug == args.legal_text_slug)
        ).scalar_one_or_none()
        if text is None:
            print(f"ERROR: legal_text {args.legal_text_slug!r} not found")
            return 1

        rows = session.execute(
            select(ArticleVersion)
            .join(ArticleVersion.article)
            .where(ArticleVersion.article.has(legal_text_id=text.id))
            .where(ArticleVersion.text_ht.is_not(None))
        ).scalars().all()

        total = changed = skipped_html = skipped_empty = 0
        for v in rows:
            total += 1
            raw = v.text_ht or ""
            if not raw.strip():
                skipped_empty += 1
                continue
            if looks_like_html(raw):
                skipped_html += 1
                continue
            wrapped = to_paragraphs(raw)
            if not wrapped or wrapped == raw:
                continue
            changed += 1
            if not args.dry_run:
                session.execute(
                    update(ArticleVersion)
                    .where(ArticleVersion.id == v.id)
                    .values(text_ht=wrapped)
                )

        if not args.dry_run:
            session.commit()

        print(
            f"text_ht rows: {total} total · {changed} wrapped · "
            f"{skipped_html} already-HTML · {skipped_empty} empty"
        )
        print("[dry-run]" if args.dry_run else "[committed]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
