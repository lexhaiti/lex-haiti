"""Heuristic law-boundary parser for *Le Moniteur* issues.

Walks OCR'd pages, finds boundaries between laws (LOI, DÉCRET, ARRÊTÉ,
CIRCULAIRE, CONVENTION), and returns one ``ParsedCandidate`` per suspected
law. The parser is intentionally permissive — the editor decides what to
keep or reject.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import List, Optional

from schemas.enums import LegalCategory
from services.ingestion.ocr import extract_text_from_pdf

# ---------------------------------------------------------------------------
# Boundary patterns
# ---------------------------------------------------------------------------

_LAW_BOUNDARY_PATTERNS: list[tuple[LegalCategory, re.Pattern[str]]] = [
    (
        LegalCategory.loi,
        re.compile(
            r"^\s*LOI\s+N[°O\.]?\s*[\w-]+.*$",
            re.IGNORECASE | re.MULTILINE,
        ),
    ),
    (
        LegalCategory.decret,
        re.compile(
            r"^\s*D[ÉE]CRET(?:\s+(?:N[°O\.]?\s*[\w-]+|du\s+\d+))?.*$",
            re.IGNORECASE | re.MULTILINE,
        ),
    ),
    (
        LegalCategory.arrete,
        re.compile(
            r"^\s*ARR[ÊE]T[ÉE](?:\s+(?:N[°O\.]?\s*[\w-]+|du\s+\d+)).*$",
            re.IGNORECASE | re.MULTILINE,
        ),
    ),
    (
        LegalCategory.circulaire,
        re.compile(
            r"^\s*CIRCULAIRE\s+N[°O\.]?\s*[\w-]+.*$",
            re.IGNORECASE | re.MULTILINE,
        ),
    ),
    (
        LegalCategory.convention,
        re.compile(
            r"^\s*CONVENTION\s+.+$",
            re.IGNORECASE | re.MULTILINE,
        ),
    ),
]

_NUMBER_RE = re.compile(r"N[°O\.]?\s*([\w-]+)", re.IGNORECASE)

_DATE_RE = re.compile(
    r"(\d{1,2})\s+("
    r"janvier|f[ée]vrier|mars|avril|mai|juin|juillet|"
    r"ao[ûu]t|septembre|octobre|novembre|d[ée]cembre"
    r")\s+(\d{4})",
    re.IGNORECASE,
)

# Single canonical month map (deduplicated from the old code).
FR_MONTHS = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "août": 8, "aout": 8,
    "septembre": 9, "octobre": 10, "novembre": 11,
    "décembre": 12, "decembre": 12,
}

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class ParsedCandidate:
    """Parser output for one suspected law."""

    detected_category: Optional[LegalCategory]
    detected_title: Optional[str]
    detected_number: Optional[str]
    detected_date: Optional[date]
    raw_text: str
    confidence: Decimal
    page_from: Optional[int] = None
    page_to: Optional[int] = None
    matched_signals: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_law_candidates(pages: List[str]) -> List[ParsedCandidate]:
    """Walk the OCR'd pages, find law boundaries, return one candidate per law."""
    if not pages:
        return []

    text_with_marks = ""
    page_offsets: list[int] = []
    for i, page_text in enumerate(pages):
        page_offsets.append(len(text_with_marks))
        text_with_marks += page_text + "\n\n"

    boundaries: list[tuple[int, LegalCategory, str]] = []
    for category, pattern in _LAW_BOUNDARY_PATTERNS:
        for match in pattern.finditer(text_with_marks):
            boundaries.append((match.start(), category, match.group().strip()))

    boundaries.sort(key=lambda b: b[0])
    deduped: list[tuple[int, LegalCategory, str]] = []
    for b in boundaries:
        if deduped and b[0] - deduped[-1][0] < 5:
            continue
        deduped.append(b)

    if not deduped:
        return []

    candidates: list[ParsedCandidate] = []
    for i, (start, category, header_line) in enumerate(deduped):
        end = deduped[i + 1][0] if i + 1 < len(deduped) else len(text_with_marks)
        chunk = text_with_marks[start:end].strip()
        page_from = _page_for_offset(start, page_offsets)
        page_to = _page_for_offset(end - 1, page_offsets)

        candidate = _build_candidate(
            category=category,
            header_line=header_line,
            raw_text=chunk,
            position=i,
            page_from=page_from,
            page_to=page_to,
        )
        candidates.append(candidate)

    return candidates


def run_pipeline(pdf_path: str) -> List[ParsedCandidate]:
    """One-shot: OCR a PDF and return the heuristic parser's candidates."""
    pages = extract_text_from_pdf(pdf_path)
    return detect_law_candidates(pages)


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _page_for_offset(offset: int, page_offsets: list[int]) -> int:
    """1-based page number containing the given character offset."""
    page = 1
    for i, off in enumerate(page_offsets):
        if offset >= off:
            page = i + 1
        else:
            break
    return page


def _build_candidate(
    *,
    category: LegalCategory,
    header_line: str,
    raw_text: str,
    position: int,
    page_from: int,
    page_to: int,
) -> ParsedCandidate:
    """Extract metadata from a chunk + score the parser's confidence."""
    signals: list[str] = ["category"]

    number_match = _NUMBER_RE.search(header_line)
    detected_number = number_match.group(1) if number_match else None
    if detected_number:
        signals.append("number")

    date_match = _DATE_RE.search(raw_text[:400])
    detected_date: Optional[date] = None
    if date_match:
        day = int(date_match.group(1))
        month_name = date_match.group(2).lower()
        year = int(date_match.group(3))
        month = FR_MONTHS.get(month_name)
        if month:
            try:
                detected_date = date(year, month, day)
                signals.append("date")
            except ValueError:
                pass

    if len(raw_text) > 200:
        signals.append("body_length")

    detected_title = header_line[:240].strip().rstrip(".,;:")

    raw_score = len(signals) / 4
    confidence = Decimal(f"{min(1.0, raw_score):.2f}")

    return ParsedCandidate(
        detected_category=category,
        detected_title=detected_title,
        detected_number=detected_number,
        detected_date=detected_date,
        raw_text=raw_text,
        confidence=confidence,
        page_from=page_from,
        page_to=page_to,
        matched_signals=signals,
    )
