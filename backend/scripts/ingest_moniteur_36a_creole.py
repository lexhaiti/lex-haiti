"""Ingest *Le Moniteur* N° 36-A (28 avril 1987) — Kreyòl Constitution.

What this script does
---------------------
1. Creates the ``moniteur_issues`` row for N° 36-A if it doesn't exist.
2. Sets ``moniteur_entries.translation_issue_id`` on the existing N° 36
   entry (id=18) that promoted the French constitution (legal_text id=87).
3. Sets ``legal_texts.moniteur_issue_id_ht`` on constitution-1987 to the
   new N° 36-A issue id.
4. Reads the PDF, extracts Kreyòl text via pdfplumber (embedded text layer)
   or pdf2image + pytesseract (OCR fallback), then parses article blocks.
5. Bulk-UPDATEs ``article_versions.text_ht`` on the current version of
   each constitution-1987 article using the matched Kreyòl text.

Run from the backend directory:
    python scripts/ingest_moniteur_36a_creole.py \\
        --pdf /path/to/Constitution-du-29-mars-1987_creole.pdf

Idempotent: re-running overwrites text_ht with re-parsed content; it will
not create a second N° 36-A issue if one already exists.
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from pathlib import Path

# ── path bootstrap ────────────────────────────────────────────────────────────
# Allow running as ``python scripts/ingest_moniteur_36a_creole.py`` from the
# backend/ directory without pip-installing the package.
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, select, update
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

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

ISSUE_YEAR = 1987
ISSUE_NUMBER = "36-A"
ISSUE_DATE = date(1987, 4, 28)
ISSUE_LABEL = "Numéro extraordinaire"

CONSTITUTION_SLUG = "constitution-1987"
FR_ENTRY_ID = 18          # moniteur_entries.id for the French constitution
FR_ISSUE_ID = 15          # moniteur_issues.id for N° 36


# ─────────────────────────────────────────────────────────────────────────────
# Article number mapping: PDF "Atik N" → DB articles.number
# ─────────────────────────────────────────────────────────────────────────────

def _pdf_to_db_number(n: str) -> str:
    """Map the Kreyòl article number string (from the PDF) to the canonical
    ``articles.number`` stored in the DB.

    Article 1 is stored as 'premier' (and its sub-articles as 'premier-1',
    'premier-2', …) to match the French legal convention. All other articles
    map directly (e.g. '12-3' stays '12-3').
    """
    if n == "1":
        return "premier"
    if n.startswith("1-"):
        return f"premier-{n[2:]}"
    return n


# ─────────────────────────────────────────────────────────────────────────────
# PDF text extraction
# ─────────────────────────────────────────────────────────────────────────────

def _extract_via_pdfplumber(pdf_path: Path) -> str:
    """Try extracting embedded text with pdfplumber.  Returns empty string
    when the PDF has no text layer (purely raster scan)."""
    try:
        import pdfplumber  # type: ignore[import]
    except ImportError:
        return ""

    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
            pages.append(text)
    return "\n".join(pages)


def _extract_via_ocr(pdf_path: Path) -> str:
    """Convert every page to a raster image and run Tesseract OCR.

    Uses ``fra`` (French) as the language model — it covers the Kreyòl
    character set (accented Latin) and usually produces better output than
    the ``hat`` data pack which may not be installed on all systems.

    The PDF is two-column; Tesseract --psm 1 (auto OSD) handles that
    reasonably well for article-level parsing.
    """
    try:
        import pytesseract  # type: ignore[import]
        from pdf2image import convert_from_path  # type: ignore[import]
    except ImportError as exc:
        sys.exit(
            f"OCR dependencies missing ({exc}). "
            "Install pdf2image and pytesseract, then re-run."
        )

    print("  Rasterising PDF pages for OCR…", flush=True)
    images = convert_from_path(pdf_path, dpi=300)
    pages = []
    for i, img in enumerate(images, 1):
        print(f"  OCR page {i}/{len(images)}…", end="\r", flush=True)
        text = pytesseract.image_to_string(img, lang="fra", config="--psm 1")
        pages.append(text)
    print()
    return "\n".join(pages)


def extract_text(pdf_path: Path, *, reocr: bool = False) -> str:
    """Extract full text from the PDF. Tries pdfplumber first (fast, lossless
    when a text layer exists), falls back to OCR for scanned documents.

    OCR results are cached next to the PDF as ``<name>.ocr.txt`` so that
    re-runs that only tweak the parser regex don't pay the 3-minute
    rasterise+OCR cost again. Pass ``reocr=True`` to force a fresh pass.
    """
    print("Extracting text from PDF…")
    text = _extract_via_pdfplumber(pdf_path)
    if len(text.strip()) > 2000:
        print(f"  Embedded text layer found ({len(text)} chars).")
        return text
    cache_path = pdf_path.with_suffix(".ocr.txt")
    if cache_path.exists() and not reocr:
        cached = cache_path.read_text(encoding="utf-8")
        print(f"  Reusing OCR cache ({len(cached)} chars) → {cache_path.name}")
        return cached
    print("  No embedded text layer — running OCR fallback.")
    text = _extract_via_ocr(pdf_path)
    cache_path.write_text(text, encoding="utf-8")
    print(f"  OCR cache written → {cache_path.name}")
    return text


# ─────────────────────────────────────────────────────────────────────────────
# Article block parser
# ─────────────────────────────────────────────────────────────────────────────

# Matches the start of an article or sub-article in the Kreyòl text:
#   "Atik 1:"  "Atik: 2:"  "Atik 12:"  "atik 5:"   (main articles)
#   "1-1:"  "7-2:"  "12-3:"                         (sub-articles, BOL)
#
# Case-insensitive on the "Atik" marker — Tesseract occasionally drops
# the capital letter on the leading column word (we saw "atik 5:" in
# the cached OCR for article 5; that mis-cased entry was the reason
# articles 5/9/13/31/35/36 were initially skipped).
#
# Group 1 → numeric article number (e.g. "1", "12", "12-3")
_ARTICLE_RE = re.compile(
    r"(?:[Aa]tik\s*:?\s*(\d+(?:-\d+)?)\s*:|^(\d+(?:-\d+)?)\s*:)",
    re.MULTILINE,
)


def parse_articles(raw: str) -> dict[str, str]:
    """Return a mapping of {db_number: kreyol_text} from the full extracted
    text of the N° 36-A issue.

    Strategy: find all article-header positions, then slice the text between
    consecutive headers to get each article's body.  Strip leading/trailing
    whitespace and collapse internal whitespace runs.
    """
    matches = list(_ARTICLE_RE.finditer(raw))
    if not matches:
        return {}

    articles: dict[str, str] = {}
    for idx, m in enumerate(matches):
        num = m.group(1) or m.group(2)
        db_num = _pdf_to_db_number(num)

        # Body: from end of this match to start of next (or end of string)
        body_start = m.end()
        body_end = matches[idx + 1].start() if idx + 1 < len(matches) else len(raw)
        body = raw[body_start:body_end].strip()

        # Collapse multi-space / stray newlines from OCR
        body = re.sub(r" {2,}", " ", body)
        body = re.sub(r"\n{3,}", "\n\n", body)

        if body:
            articles[db_num] = body

    return articles


# ─────────────────────────────────────────────────────────────────────────────
# DB operations
# ─────────────────────────────────────────────────────────────────────────────

def get_or_create_issue(session: Session) -> MoniteurIssue:
    stmt = select(MoniteurIssue).where(
        MoniteurIssue.year == ISSUE_YEAR,
        MoniteurIssue.number == ISSUE_NUMBER,
    )
    issue = session.execute(stmt).scalar_one_or_none()
    if issue:
        print(f"  N° {ISSUE_NUMBER} issue already exists (id={issue.id}).")
        return issue

    issue = MoniteurIssue(
        year=ISSUE_YEAR,
        number=ISSUE_NUMBER,
        publication_date=ISSUE_DATE,
        edition_label=ISSUE_LABEL,
        processing_status=MoniteurIssueStatus.published,
    )
    session.add(issue)
    session.flush()
    print(f"  Created N° {ISSUE_NUMBER} issue (id={issue.id}).")
    return issue


def link_to_constitution(session: Session, issue: MoniteurIssue) -> None:
    """Set moniteur_issue_id_ht on constitution-1987 and
    translation_issue_id on the N° 36 French entry."""

    text = session.execute(
        select(LegalText).where(LegalText.slug == CONSTITUTION_SLUG)
    ).scalar_one_or_none()
    if not text:
        sys.exit(f"ERROR: legal_text '{CONSTITUTION_SLUG}' not found.")

    if text.moniteur_issue_id_ht != issue.id:
        text.moniteur_issue_id_ht = issue.id
        print(f"  Set constitution-1987.moniteur_issue_id_ht = {issue.id}.")
    else:
        print("  moniteur_issue_id_ht already set.")

    entry = session.get(MoniteurEntry, FR_ENTRY_ID)
    if entry and entry.translation_issue_id != issue.id:
        entry.translation_issue_id = issue.id
        print(f"  Set moniteur_entries[{FR_ENTRY_ID}].translation_issue_id = {issue.id}.")


def bulk_update_text_ht(
    session: Session, articles: dict[str, str]
) -> tuple[int, int]:
    """Update article_versions.text_ht for each parsed article.

    Returns (updated_count, not_found_count).
    """
    # Load all articles for constitution-1987 with their current version id.
    constitution = session.execute(
        select(LegalText).where(LegalText.slug == CONSTITUTION_SLUG)
    ).scalar_one()

    rows = session.execute(
        select(Article.number, Article.current_version_id)
        .where(Article.legal_text_id == constitution.id)
    ).all()

    number_to_version_id: dict[str, int] = {
        r.number: r.current_version_id
        for r in rows
        if r.current_version_id is not None
    }

    updated = 0
    not_found = 0
    for db_num, kreyo_text in articles.items():
        vid = number_to_version_id.get(db_num)
        if vid is None:
            print(f"  WARN: no article with number '{db_num}' found — skipped.")
            not_found += 1
            continue
        session.execute(
            update(ArticleVersion)
            .where(ArticleVersion.id == vid)
            .values(text_ht=kreyo_text)
        )
        updated += 1

    return updated, not_found


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--pdf",
        required=True,
        type=Path,
        help="Path to the N° 36-A Kreyòl Constitution PDF.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and report without writing to the DB.",
    )
    parser.add_argument(
        "--reocr",
        action="store_true",
        help="Force a fresh OCR pass even if a cached .ocr.txt exists.",
    )
    args = parser.parse_args()

    if not args.pdf.exists():
        sys.exit(f"ERROR: PDF not found: {args.pdf}")

    # ── text extraction & parsing ─────────────────────────────────────────
    raw = extract_text(args.pdf, reocr=args.reocr)
    print(f"Parsing article blocks… (total chars: {len(raw)})")
    parsed = parse_articles(raw)
    print(f"Found {len(parsed)} article blocks.")

    if args.dry_run:
        for num, body in list(parsed.items())[:5]:
            print(f"\n--- Atik {num} ---\n{body[:200]}…")
        print("\n[dry-run] No DB changes written.")
        return

    # ── DB writes ────────────────────────────────────────────────────────
    settings = get_settings()
    engine = create_engine(settings.database_url, echo=False)

    with Session(engine) as session:
        print("\n[1/3] Creating / verifying N° 36-A issue…")
        issue = get_or_create_issue(session)

        print("\n[2/3] Linking to constitution-1987…")
        link_to_constitution(session, issue)

        print("\n[3/3] Updating article_versions.text_ht…")
        updated, not_found = bulk_update_text_ht(session, parsed)

        session.commit()

    print(
        f"\nDone. {updated} articles updated, {not_found} not matched."
        f"\nRun 'make migrate' if you haven't already applied migration 0023."
    )


if __name__ == "__main__":
    main()
