"""Cover-page metadata extraction for *Le Moniteur* issues.

Reads the first 1-2 pages of a Moniteur PDF (via the generic OCR module)
and proposes issue number, publication date, year, and edition label with
per-field confidence scores. The editor reviews this in the UI and corrects
anything the extractor missed.

Also detects a sommaire block (explicit ``SOMMAIRE`` label or law-boundary
heuristic) so the import form can auto-fill entries.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

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

# "Directeur : Henry Robert MARC-CHARLES (Major …)" — captures the name
# up to a parenthetical, "Date :" suffix, or end-of-line.
DIRECTOR_RE = re.compile(
    r"Directeur\s*:\s*(.+?)(?:\s*\(|\s+Date\s*:|$)",
    re.IGNORECASE | re.MULTILINE,
)

# Long-form French date "12 mars 2024" / "1er mai 2024".
DATE_LONG_RE = re.compile(
    r"\b(\d{1,2})(?:er)?\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})\b",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Sommaire detection patterns
# ---------------------------------------------------------------------------

# Matches "SOMMAIRE" label, possibly followed by a colon and inline content.
# Uses [ \t]* (not \s*) after the keyword so newlines aren't consumed —
# otherwise MULTILINE + greedy \s* swallows the line break and the next
# content line gets treated as a single-line inline SOMMAIRE.
_SOMMAIRE_LABEL_RE = re.compile(
    r"^\s*SOMMAIRE[ \t]*:?[ \t]*(.*)$",
    re.IGNORECASE | re.MULTILINE,
)

# Category keyword → MoniteurDocumentType value.
_SOMMAIRE_CATEGORY_MAP: list[tuple[str, re.Pattern[str]]] = [
    ("constitution", re.compile(r"\bCONSTITUTION\b", re.IGNORECASE)),
    ("loi", re.compile(r"\bLOI\b", re.IGNORECASE)),
    ("decret", re.compile(r"\bD[ÉE]CRET\b", re.IGNORECASE)),
    ("arrete", re.compile(r"\bARR[ÊE]T[ÉE]\b", re.IGNORECASE)),
    ("circulaire", re.compile(r"\bCIRCULAIRE\b", re.IGNORECASE)),
    ("convention", re.compile(r"\bCONVENTION\b", re.IGNORECASE)),
    ("ordonnance", re.compile(r"\bORDONNANCE\b", re.IGNORECASE)),
    ("communique", re.compile(r"\bCOMMUNIQU[ÉE]\b", re.IGNORECASE)),
    ("promulgation", re.compile(r"\bPROMULGATION\b", re.IGNORECASE)),
    ("errata", re.compile(r"\bERRATA\b", re.IGNORECASE)),
]

# Lines that signal body content (not sommaire). Stops scanning.
_SOMMAIRE_STOP_RE = re.compile(
    r"^\s*(?:\.?\s*DEVISE\b|Article\b|TITRE\b|CHAPITRE\b|SECTION\b"
    r"|Le\s+Pr[ée]sident\b|Vu\s+la\s+Constitution\b"
    r"|R[ÉE]PUBLIQUE\s+D)",
    re.IGNORECASE,
)

# Trailing page number: "........... 3" / "... p.3" / "…… 15"
# Requires ≥2 separator chars and a 1-3 digit number — avoids matching
# inline years like "Constitution ... 1987" as a page reference.
_TRAILING_PAGE_RE = re.compile(r"[.\s…·]{2,}(?:p\.?\s*)?(\d{1,3})\s*$")


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class SommaireSuggestion:
    """One auto-detected sommaire entry for the import form to pre-fill."""

    detected_category: str
    detected_title: str | None = None
    detected_number: str | None = None
    page_from: int = 1
    page_to: int = 1


@dataclass
class IssueMetadata:
    """Best-effort metadata extracted from a Moniteur cover page.

    All fields optional — the editor corrects anything missed.
    ``confidence`` is per-field so the UI can highlight low-confidence guesses.
    """

    number: str | None = None
    year: int | None = None
    publication_date: date | None = None
    edition_label: str | None = None
    director: str | None = None
    confidence: dict[str, float] = field(default_factory=dict)
    suggested_sommaire: list[SommaireSuggestion] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Metadata extraction (existing)
# ---------------------------------------------------------------------------


def extract_issue_metadata(pdf_path: str, *, max_pages: int = 2) -> IssueMetadata:
    """Read the first 1-2 pages of a Moniteur PDF and propose metadata."""
    pages = extract_text_from_pdf(pdf_path, max_pages=max_pages)
    if not pages:
        return IssueMetadata()
    head = "\n".join(pages[:max_pages])

    md = _run_metadata_heuristics(head)
    md.suggested_sommaire = detect_sommaire(head)
    return md


def _extract_metadata_from_text(text: str) -> IssueMetadata:
    """Run the same regex heuristics against pre-extracted text."""
    # Metadata from the first ~3000 chars (the "cover page" equivalent).
    md = _run_metadata_heuristics(text[:3000])
    # Sommaire uses full text so boundary detection sees all law headers.
    md.suggested_sommaire = detect_sommaire(text)
    return md


def _run_metadata_heuristics(head: str) -> IssueMetadata:
    """Shared metadata regex extraction (number, date, edition)."""
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

    # Director
    dm = DIRECTOR_RE.search(head)
    if dm:
        md.director = dm.group(1).strip()
        md.confidence["director"] = 0.8

    return md


def extract_issue_metadata_from_text(docx_path: str) -> IssueMetadata:
    """Extract metadata from a DOCX file by reading its text content."""
    from services.ingestion.document_parser import extract_text_from_file  # noqa: PLC0415

    text, _warnings = extract_text_from_file(docx_path)
    if not text.strip():
        return IssueMetadata()
    return _extract_metadata_from_text(text)


# ---------------------------------------------------------------------------
# Sommaire detection
# ---------------------------------------------------------------------------


def detect_sommaire(text: str) -> list[SommaireSuggestion]:
    """Detect sommaire entries from extracted Moniteur text.

    Strategy:
    1. Look for an explicit ``SOMMAIRE`` label and parse entries below it.
    2. If none found, fall back to the law-boundary heuristic (LOI / DÉCRET /
       ARRÊTÉ headers) from the Moniteur parser.
    """
    suggestions = _detect_explicit_sommaire(text)
    if suggestions:
        return suggestions
    return _detect_sommaire_from_boundaries(text)


def _detect_explicit_sommaire(text: str) -> list[SommaireSuggestion]:
    """Parse an explicit SOMMAIRE block from the text."""
    match = _SOMMAIRE_LABEL_RE.search(text[:5000])
    if not match:
        return []

    inline = match.group(1).strip()
    if inline:
        # Single-line: "SOMMAIRE : Constitution de la République d'Haiti 1987"
        entry = _parse_sommaire_line(inline)
        return [entry] if entry else []

    # Multi-line: collect entries from lines after the SOMMAIRE label.
    entries: list[SommaireSuggestion] = []
    blank_run = 0

    for line in text[match.end() : match.end() + 3000].split("\n"):
        stripped = line.strip()
        if not stripped:
            blank_run += 1
            if blank_run >= 3:
                break  # Large gap — sommaire section is over.
            continue
        blank_run = 0

        if _SOMMAIRE_STOP_RE.match(stripped):
            break

        entry = _parse_sommaire_line(stripped)
        if entry:
            entries.append(entry)

    return entries


def _detect_sommaire_from_boundaries(text: str) -> list[SommaireSuggestion]:
    """Fall back to law-boundary detection from the heuristic parser."""
    from services.ingestion.moniteur.parser import detect_law_candidates  # noqa: PLC0415

    candidates = detect_law_candidates([text])
    return [
        SommaireSuggestion(
            detected_category=(
                c.detected_category.value if c.detected_category else "autre"
            ),
            detected_title=c.detected_title,
            detected_number=c.detected_number,
            page_from=c.page_from or 1,
            page_to=c.page_to or 1,
        )
        for c in candidates
    ]


def _detect_category(text: str) -> str | None:
    """Return MoniteurDocumentType value if the text contains a category keyword."""
    for value, pattern in _SOMMAIRE_CATEGORY_MAP:
        if pattern.search(text[:120]):
            return value
    return None


def _parse_sommaire_line(line: str) -> SommaireSuggestion | None:
    """Parse a single sommaire line into a suggestion."""
    stripped = line.strip()
    if not stripped:
        return None

    category = _detect_category(stripped) or "autre"

    # Extract trailing page number ("LOI ... 3" or "LOI .......... 15").
    title = stripped
    page_from = None
    page_match = _TRAILING_PAGE_RE.search(stripped)
    if page_match:
        page_from = int(page_match.group(1))
        title = stripped[: page_match.start()].strip()

    # Extract number (N° XX).
    number = None
    num_match = ISSUE_NUMBER_RE.search(title)
    if num_match:
        number = num_match.group(1)

    title = title.rstrip(".,;:").strip() or None

    return SommaireSuggestion(
        detected_category=category,
        detected_title=title,
        detected_number=number,
        page_from=page_from or 1,
        page_to=page_from or 1,
    )
