"""Parse the historical constitutions into Articles + heading tree.

After `scripts/ingest_constitutions.py` runs, each constitution lives in the
database with its full body text in `preamble_fr` and zero articles. This
script does the structuring pass:

  1. For each constitution, walk preamble_fr line by line
  2. Detect Titre / Chapitre / Section headings
  3. Detect Article markers ("Article 1.-", "Art. 1.", etc.)
  4. Build the heading tree (Titre → Chapitre → Section)
  5. Insert Article + ArticleVersion rows, attach to the deepest heading
  6. Trim preamble_fr down to just the actual preamble
     (text BEFORE the first heading or article)

It's a best-effort parser — these texts span 200 years of evolving form, so
the regexes won't catch everything. Articles it can't parse stay where they
are (in preamble_fr), and editors fix in the UI.

Idempotent: skips constitutions that already have articles.

Run:
    python -m scripts.structure_constitutions
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Optional

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from api.db import SessionLocal
from packages.schemas.enums import (
    EditorialStatus,
    HeadingLevel,
    LegalCategory,
)
from scripts.ingest_constitutions import _extract_text
from services.corpus.models import (
    Article,
    ArticleVersion,
    LegalHeading,
    LegalText,
)

RAW_DIR = Path(__file__).parent / "_constitutions_raw"

# Match "Titre I : ...", "Chapitre IV - ...", "Section 2 - ...", "Titre premier."
# Accepts uppercase or lowercase Roman numerals (some scraped sources use lowercase
# 'l' as the numeral, e.g. "Titre lll." for "Titre III.").
HEADING_PATTERN = re.compile(
    r"^(Titre|Chapitre|Section)\s+"
    r"(premier|première|premiere|1er|1ère|1ere|[IVXLCDMivxlcdm]+|\d+(?:er|ere)?)"
    r"\s*[\.:\-—]?\s*(.*)$",
    re.IGNORECASE,
)


def _normalize_heading_number(raw: str) -> str:
    """Normalize Roman numerals (l→I) and French ordinals.

    Sources sometimes use lowercase "l" as the numeral I (a typography
    artifact from older typesetting where lowercase l and digit 1 share a
    glyph), yielding strings like "ll", "lll", "lV". Replace lowercase l → I
    *before* uppercasing so we don't end up with "LL" (Roman 100, written C)
    when the source meant "II".
    """
    s = raw.strip()
    if s.lower() in {"premier", "première", "premiere", "1er", "1ère", "1ere"}:
        return "I"
    if re.fullmatch(r"[IVXLCDMivxlcdm]+", s):
        s = s.replace("l", "I")  # case-sensitive: lowercase l → uppercase I
        return s.upper()
    return s

# Match article headers in any of these forms:
#   "Article 1.- texte", "Article 12. texte", "Art. 7 - texte"
#   "ARTICLE 100 texte" or just "Article 100" alone (bare line)
#   "Article premier." / "Article 1er" (French ordinal for article 1)
#   "Article 1.1" / "Article 134-1" (sub-numbered amendments)
#   "Article 5 bis" / "Article 5 ter"
# The trailing body is captured in group 2 and may be empty when the article
# header sits alone on its own line (very common in scraped sources).
_NUM = (
    r"premier|première|premiere|1er|1ère|1ere"
    r"|"
    r"\d+(?:\s*[\.\-]\s*\d+)*(?:\s*(?:bis|ter|quater))?"
)
ARTICLE_PATTERN = re.compile(
    rf"^(?:Article|Art\.?)\s+({_NUM})\s*[\.\-—:]*\s*(.*)$",
    re.IGNORECASE,
)


def _normalize_article_number(raw: str) -> str:
    """Normalize French ordinal forms and whitespace in article numbers.

    "Article premier" → "1", "Article 134 - 1" → "134-1", "Article 1.1" → "1.1".
    """
    s = raw.strip().lower()
    if s in {"premier", "première", "premiere", "1er", "1ère", "1ere"}:
        return "1"
    # Compress whitespace around dots/dashes; uppercase suffix tokens for tidiness.
    s = re.sub(r"\s*\.\s*", ".", s)
    s = re.sub(r"\s*-\s*", "-", s)
    s = re.sub(r"\s+(bis|ter|quater)\b", r" \1", s)
    return s

LEVEL_MAP = {
    "titre": HeadingLevel.title,
    "chapitre": HeadingLevel.chapter,
    "section": HeadingLevel.section,
}


def _slugify(value: str) -> str:
    """Lowercase, strip non-alphanumerics, collapse dashes."""
    s = re.sub(r"[^a-zA-Z0-9]+", "-", value).lower().strip("-")
    return s or "x"


def parse_constitution_text(text: str) -> dict:
    """Walk the body text, return preamble + heading tree + articles."""
    lines = text.split("\n")

    preamble_lines: list[str] = []
    headings: list[dict] = []
    articles: list[dict] = []

    current_article: Optional[dict] = None
    current_titre_key: Optional[str] = None
    current_chapitre_key: Optional[str] = None
    current_section_key: Optional[str] = None
    seen_first_section = False
    heading_counter = 0

    for raw in lines:
        line = raw.strip()

        h = HEADING_PATTERN.match(line) if line else None
        if h:
            if current_article:
                articles.append(current_article)
                current_article = None

            level_word = h.group(1).lower()
            level = LEVEL_MAP.get(level_word, HeadingLevel.section)
            heading_counter += 1
            key = f"{level.value}-{heading_counter}"

            if level == HeadingLevel.title:
                parent_key = None
                current_titre_key = key
                current_chapitre_key = None
                current_section_key = None
            elif level == HeadingLevel.chapter:
                parent_key = current_titre_key
                current_chapitre_key = key
                current_section_key = None
            else:  # section
                parent_key = current_chapitre_key or current_titre_key
                current_section_key = key

            # Strip stray leading punctuation from the title (sources often
            # have "Titre II. Des Droits." → group(3) = ". Des Droits.").
            raw_title = h.group(3).strip()
            raw_title = re.sub(r"^[\.\-—:]+\s*", "", raw_title).strip()

            headings.append(
                {
                    "level": level,
                    "key": key,
                    "parent_key": parent_key,
                    "number": _normalize_heading_number(h.group(2)),
                    "title": raw_title or None,
                }
            )
            seen_first_section = True
            continue

        a = ARTICLE_PATTERN.match(line) if line else None
        if a:
            if current_article:
                articles.append(current_article)

            heading_key = (
                current_section_key
                or current_chapitre_key
                or current_titre_key
            )

            body0 = a.group(2).strip()
            current_article = {
                "number": _normalize_article_number(a.group(1)),
                "lines": [body0] if body0 else [],
                "heading_key": heading_key,
            }
            seen_first_section = True
            continue

        # Non-heading, non-article line
        if current_article is not None:
            current_article["lines"].append(line)
        elif not seen_first_section:
            preamble_lines.append(line)
        # else: dangling text after the last article (signers, footnotes) — drop

    if current_article:
        articles.append(current_article)

    # Collapse 3+ blank lines, trim
    preamble = re.sub(r"\n{3,}", "\n\n", "\n".join(preamble_lines)).strip()

    # Drop "TOC ghost" headings — those whose subtree contains no articles.
    # Many sources prepend a clickable table of contents at the top, listing
    # every titre before the actual sectioned body. Without this prune they
    # show up as empty headings and articles get attached to the wrong titre.
    referenced_keys: set[str] = set()
    for a in articles:
        if a.get("heading_key"):
            referenced_keys.add(a["heading_key"])
    by_key = {h["key"]: h for h in headings}
    # Walk ancestors so titres above a referenced chapitre are also kept.
    for key in list(referenced_keys):
        cur = by_key.get(key)
        while cur and cur.get("parent_key"):
            referenced_keys.add(cur["parent_key"])
            cur = by_key.get(cur["parent_key"])
    headings = [h for h in headings if h["key"] in referenced_keys]

    return {
        "preamble": preamble,
        "headings": headings,
        "articles": [
            {
                "number": a["number"],
                "text": "\n".join(a["lines"]).strip(),
                "heading_key": a.get("heading_key"),
            }
            for a in articles
        ],
    }


def _restore_preamble_from_raw(text: LegalText) -> bool:
    """Re-fetch preamble_fr from raw HTML when --force is used.

    Required because the first structuring pass trims preamble_fr down to the
    real preamble; re-running would have nothing to parse otherwise.
    Returns True if preamble was restored.
    """
    m = re.match(r"^constitution-(\d{4})$", text.slug or "")
    if not m:
        return False
    raw_path = RAW_DIR / f"ht{m.group(1)}.htm"
    if not raw_path.exists():
        return False
    full_text = _extract_text(raw_path.read_text(encoding="utf-8", errors="replace"))
    text.preamble_fr = full_text
    return True


def structure_one(
    session: Session, text: LegalText, *, force: bool = False
) -> Optional[dict]:
    existing = session.execute(
        select(Article).where(Article.legal_text_id == text.id).limit(1)
    ).scalar_one_or_none()

    if existing and not force:
        return None

    if existing and force:
        # Wipe articles + versions + headings before re-parsing. Order matters:
        # versions reference articles; articles reference headings.
        # Detach current_version_id first so the version delete cascade doesn't
        # trip the FK back-pointer.
        session.execute(
            Article.__table__.update()
            .where(Article.legal_text_id == text.id)
            .values(current_version_id=None)
        )
        session.execute(
            delete(ArticleVersion).where(
                ArticleVersion.article_id.in_(
                    select(Article.id).where(Article.legal_text_id == text.id)
                )
            )
        )
        session.execute(delete(Article).where(Article.legal_text_id == text.id))
        session.execute(
            delete(LegalHeading).where(LegalHeading.legal_text_id == text.id)
        )
        session.flush()
        # Restore the full body text from raw HTML so the parser has something
        # to work with (the first pass trimmed it).
        if not _restore_preamble_from_raw(text):
            return None

    if not text.preamble_fr:
        return None

    parsed = parse_constitution_text(text.preamble_fr)
    if not parsed["articles"]:
        return None

    # Phase 1: insert headings flat
    heading_id_by_key: dict[str, int] = {}
    pending_parents: list[tuple[LegalHeading, str]] = []
    for idx, h in enumerate(parsed["headings"]):
        heading = LegalHeading(
            legal_text_id=text.id,
            parent_id=None,
            level=h["level"],
            key=h["key"],
            number=h["number"],
            title_fr=h["title"],
            position=idx,
        )
        session.add(heading)
        session.flush()
        heading_id_by_key[h["key"]] = heading.id
        if h["parent_key"]:
            pending_parents.append((heading, h["parent_key"]))

    # Phase 2: resolve parent ids
    for heading, parent_key in pending_parents:
        heading.parent_id = heading_id_by_key.get(parent_key)

    # Phase 3: articles + versions
    used_slugs: set[str] = set()
    for idx, a in enumerate(parsed["articles"]):
        base_slug = _slugify(f"art-{a['number']}")
        slug = base_slug
        # Disambiguate if number repeats (rare but defensive).
        n = 2
        while slug in used_slugs:
            slug = f"{base_slug}-{n}"
            n += 1
        used_slugs.add(slug)

        article = Article(
            legal_text_id=text.id,
            heading_id=heading_id_by_key.get(a["heading_key"])
            if a["heading_key"]
            else None,
            number=a["number"],
            slug=slug,
            position=idx,
            domain_tags=[],
        )
        session.add(article)
        session.flush()

        version = ArticleVersion(
            article_id=article.id,
            version_number=1,
            text_fr=a["text"],
            editorial_status=EditorialStatus.draft,
        )
        session.add(version)
        session.flush()
        article.current_version_id = version.id

    # Trim preamble to the real preamble (text before first heading/article).
    text.preamble_fr = parsed["preamble"] or None

    return {
        "headings": len(parsed["headings"]),
        "articles": len(parsed["articles"]),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Structure constitutions into articles + headings.")
    ap.add_argument(
        "--force",
        action="store_true",
        help="Wipe existing articles/headings, restore preamble_fr from raw HTML, "
        "and re-parse. Use after fixing the parser.",
    )
    ap.add_argument(
        "--slug",
        action="append",
        default=None,
        help="Limit to specific slug(s); repeatable. Default: all constitutions.",
    )
    args = ap.parse_args()

    with SessionLocal() as session:
        stmt = (
            select(LegalText)
            .where(LegalText.category == LegalCategory.constitution)
            .order_by(LegalText.slug)
        )
        if args.slug:
            stmt = stmt.where(LegalText.slug.in_(args.slug))
        constitutions = session.execute(stmt).scalars().all()

        if not constitutions:
            print("No constitutions found. Run scripts/ingest_constitutions.py first.")
            return 0

        structured = 0
        skipped = 0
        total_h = 0
        total_a = 0

        for text in constitutions:
            result = structure_one(session, text, force=args.force)
            if result is None:
                skipped += 1
                print(f"  skip   {text.slug}")
            else:
                structured += 1
                total_h += result["headings"]
                total_a += result["articles"]
                print(
                    f"  done   {text.slug:25}  "
                    f"{result['headings']:>3} headings  "
                    f"{result['articles']:>4} articles"
                )

        session.commit()
        print("---")
        print(
            f"Structured: {structured}    Skipped: {skipped}    "
            f"Total: {total_h} headings, {total_a} articles"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
