"""Cover-page metadata extraction for *Le Moniteur* issues.

Reads the first 1-2 pages of a Moniteur PDF (via the generic OCR module)
and proposes issue number, publication date, year, and edition label with
per-field confidence scores. The editor reviews this in the UI and corrects
anything the extractor missed.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from services.ingestion.ocr import extract_text_from_pdf

# French long-form months -> 1-12. Le Moniteur cover dates are always
# written in French long form ("Lundi 5 mai 2024").
MONTHS_FR = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "août": 8, "aout": 8,
    "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12, "decembre": 12,
}

# "N° 47" / "No. 47-bis" / "Numéro 47" — handles OCR-mangled variants.
ISSUE_NUMBER_RE = re.compile(
    r"\b(?:N[°º]\s*|N[o.]\.?\s*|Num[ée]ro\s+)([0-9]+(?:[A-Za-z\-]+)?)",
    re.IGNORECASE,
)

# "Édition spéciale", "Numéro extraordinaire", etc.
EDITION_RE = re.compile(
    r"(édition\s+sp[ée]ciale|num[ée]ro\s+(?:sp[ée]cial|extraordinaire)|édition\s+extraordinaire)",
    re.IGNORECASE,
)

# Long-form French date "12 mars 2024" / "1er mai 2024".
DATE_LONG_RE = re.compile(
    r"\b(\d{1,2})(?:er)?\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})\b",
    re.IGNORECASE,
)


@dataclass
class IssueMetadata:
    """Best-effort metadata extracted from a Moniteur cover page.

    All fields optional — the editor corrects anything missed.
    ``confidence`` is per-field so the UI can highlight low-confidence guesses.
    """

    number: Optional[str] = None
    year: Optional[int] = None
    publication_date: Optional[date] = None
    edition_label: Optional[str] = None
    confidence: dict[str, float] = field(default_factory=dict)


def extract_issue_metadata(pdf_path: str, *, max_pages: int = 2) -> IssueMetadata:
    """Read the first 1-2 pages of a Moniteur PDF and propose metadata."""
    pages = extract_text_from_pdf(pdf_path, max_pages=max_pages)
    if not pages:
        return IssueMetadata()
    head = "\n".join(pages[:max_pages])

    md = IssueMetadata()

    # Issue number — skip matches preceded by "article" (article refs).
    for m in ISSUE_NUMBER_RE.finditer(head):
        start = max(0, m.start() - 20)
        prefix = head[start : m.start()].lower()
        if "article" in prefix or "art." in prefix:
            continue
        md.number = m.group(1)
        md.confidence["number"] = 0.85
        break

    # Date — first long-form French date wins.
    for m in DATE_LONG_RE.finditer(head):
        day = int(m.group(1))
        year = int(m.group(3))
        month = MONTHS_FR.get(m.group(2).lower())
        if month is None or not (1 <= day <= 31) or not (1800 <= year <= 2200):
            continue
        try:
            md.publication_date = date(year, month, day)
            md.year = year
            md.confidence["publication_date"] = 0.9
            md.confidence["year"] = 0.95
            break
        except ValueError:
            continue

    # Edition label
    em = EDITION_RE.search(head)
    if em:
        md.edition_label = em.group(1).strip().capitalize()
        md.confidence["edition_label"] = 0.7

    return md
