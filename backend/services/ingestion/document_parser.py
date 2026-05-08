"""Document parser for legal text imports.

Accepts raw text (or a file path to PDF / DOCX / TXT) and returns a
structured parse result: headings hierarchy, articles with heading
assignments, preamble, confidence score, and warnings.

Used by ``POST /api/v1/editorial/parse-document`` to let editors preview
the parsed structure before committing the import.

Heading detection is regex-based (LIVRE, TITRE, CHAPITRE, SECTION) —
Haitian legal texts follow very regular formatting conventions. Article
detection reuses the existing ``article_split`` module.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from services.ingestion.article_split import (
    SplitResult,
    _ARTICLE_HEADING_RE,
    _normalize_number,
    split_into_articles,
)

_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Output types
# ---------------------------------------------------------------------------


@dataclass
class ParsedHeading:
    """A structural heading detected in the document."""

    key: str  # e.g. "titre-1", "chapitre-2"
    level: str  # book | title | chapter | section | subsection
    number: str  # e.g. "I", "1", "II"
    title_fr: str  # e.g. "Des Haïtiens et de leurs droits"
    parent_key: Optional[str] = None
    position: int = 0


@dataclass
class ParsedArticleResult:
    """An article with heading assignment."""

    number: str
    content_fr: str
    heading_path: list[str] = field(default_factory=list)
    heading_key: Optional[str] = None
    title: Optional[str] = None


@dataclass
class DocumentParseResult:
    """Complete parse output returned to the frontend for preview."""

    headings: List[ParsedHeading]
    articles: List[ParsedArticleResult]
    preamble: str
    parser_confidence: float
    warnings: List[str]


# ---------------------------------------------------------------------------
# Heading patterns — ordered by structural depth
# ---------------------------------------------------------------------------

_HEADING_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "book",
        re.compile(
            r"^[\s ]*(LIVRE|Livre)\s+"
            r"([IVXLCDM]+|\d+)"
            r"[\s.\-—–:]*\s*(.*?)$",
            re.MULTILINE,
        ),
    ),
    (
        "title",
        re.compile(
            r"^[\s ]*(TITRE|Titre)\s+"
            r"([IVXLCDM]+|\d+)"
            r"[\s.\-—–:]*\s*(.*?)$",
            re.MULTILINE,
        ),
    ),
    (
        "chapter",
        re.compile(
            r"^[\s ]*(CHAPITRE|Chapitre|Chap\.?)\s+"
            r"([IVXLCDM]+|\d+)"
            r"[\s.\-—–:]*\s*(.*?)$",
            re.MULTILINE,
        ),
    ),
    (
        "section",
        re.compile(
            r"^[\s ]*(SECTION|Section|Sect\.?)\s+"
            r"([IVXLCDM]+|\d+)"
            r"[\s.\-—–:]*\s*(.*?)$",
            re.MULTILINE,
        ),
    ),
    (
        "subsection",
        re.compile(
            r"^[\s ]*(SOUS-SECTION|Sous-section|SOUS[\s-]SECTION)\s+"
            r"([IVXLCDM]+|\d+)"
            r"[\s.\-—–:]*\s*(.*?)$",
            re.MULTILINE,
        ),
    ),
]

_LEVEL_DEPTH = {
    "book": 0,
    "title": 1,
    "chapter": 2,
    "section": 3,
    "subsection": 4,
}


# ---------------------------------------------------------------------------
# Text extraction from various file formats
# ---------------------------------------------------------------------------


def extract_text_from_file(
    file_path: str, *, content_type: Optional[str] = None
) -> tuple[str, list[str]]:
    """Read text from a file on disk. Returns (text, warnings).

    Supported:
      - ``.txt`` — read as UTF-8 (fallback latin-1)
      - ``.docx`` — extract via python-docx
      - ``.pdf`` — extract via the OCR pipeline
    """
    path = Path(file_path)
    warnings: list[str] = []

    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    suffix = path.suffix.lower()
    if content_type:
        suffix = _suffix_from_content_type(content_type) or suffix

    if suffix == ".txt":
        return _read_txt(path), warnings

    if suffix == ".docx":
        return _read_docx(path, warnings), warnings

    if suffix == ".pdf":
        return _read_pdf(path, warnings), warnings

    raise ValueError(f"Unsupported file format: {suffix}")


def _suffix_from_content_type(ct: str) -> Optional[str]:
    ct = ct.split(";")[0].strip().lower()
    mapping = {
        "text/plain": ".txt",
        "application/pdf": ".pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    }
    return mapping.get(ct)


def _read_txt(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="latin-1")


def _read_docx(path: Path, warnings: list[str]) -> str:
    try:
        import docx  # noqa: PLC0415
    except ImportError:
        warnings.append("python-docx not installed — cannot parse DOCX files.")
        raise ValueError("DOCX parsing requires python-docx")

    doc = docx.Document(str(path))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs)


def _read_pdf(path: Path, warnings: list[str]) -> str:
    from services.ingestion.ocr import extract_text_from_pdf  # noqa: PLC0415

    pages = extract_text_from_pdf(str(path))
    if not pages:
        warnings.append("PDF extraction returned no pages.")
        return ""

    # Flag low-content pages (likely OCR failures)
    for i, page_text in enumerate(pages):
        if 0 < len(page_text.strip()) < 50:
            warnings.append(
                f"Page {i + 1}: very little text extracted ({len(page_text.strip())} chars) "
                "— OCR confidence may be low."
            )

    return "\n\n".join(pages)


# ---------------------------------------------------------------------------
# Core parser
# ---------------------------------------------------------------------------


def _make_key(level: str, number: str) -> str:
    """Generate a stable key for a heading."""
    n = number.strip().lower()
    n = re.sub(r"[^a-z0-9]+", "-", n)
    return f"{level}-{n}" if n else level


def parse_document(body: str) -> DocumentParseResult:
    """Parse a legal document body into structured headings + articles.

    Steps:
      1. Detect heading lines (LIVRE, TITRE, CHAPITRE, SECTION)
      2. Split articles using the existing article splitter
      3. Assign each article to its nearest preceding heading
      4. Compute confidence based on coverage and numbering regularity
    """
    if not body or not body.strip():
        return DocumentParseResult(
            headings=[],
            articles=[],
            preamble="",
            parser_confidence=0.0,
            warnings=["Document is empty."],
        )

    warnings: list[str] = []

    # --- Step 1: Detect headings with their positions ---
    heading_matches: list[tuple[int, str, str, str]] = []  # (pos, level, number, title)

    for level, pattern in _HEADING_PATTERNS:
        for m in pattern.finditer(body):
            number = m.group(2).strip()
            title = m.group(3).strip() if m.group(3) else ""
            heading_matches.append((m.start(), level, number, title))

    heading_matches.sort(key=lambda x: x[0])

    # Build heading list with parent resolution via a depth stack
    headings: list[ParsedHeading] = []
    heading_stack: dict[int, str] = {}  # depth → key
    existing_keys: set[str] = set()

    for pos_idx, (_, level, number, title) in enumerate(heading_matches):
        key = _make_key(level, number)
        if key in existing_keys:
            key = f"{key}-{pos_idx}"
        existing_keys.add(key)

        depth = _LEVEL_DEPTH.get(level, 0)

        # Find parent: most recent heading at a shallower depth
        parent_key = None
        for d in range(depth - 1, -1, -1):
            if d in heading_stack:
                parent_key = heading_stack[d]
                break

        heading_stack[depth] = key
        # Clear deeper levels when a shallower heading resets the scope
        for d in list(heading_stack):
            if d > depth:
                del heading_stack[d]

        headings.append(
            ParsedHeading(
                key=key,
                level=level,
                number=number,
                title_fr=title,
                parent_key=parent_key,
                position=pos_idx,
            )
        )

    # --- Step 2: Split articles ---
    split: SplitResult = split_into_articles(body)

    # --- Step 3: Assign articles to headings ---
    # Re-find article positions in text so we can match against heading positions
    article_positions: dict[str, int] = {}
    for m in _ARTICLE_HEADING_RE.finditer(body):
        num = _normalize_number(m.group(1))
        if num not in article_positions:
            article_positions[num] = m.start()

    heading_positions = [hm[0] for hm in heading_matches]
    articles: list[ParsedArticleResult] = []

    for art in split.articles:
        art_pos = article_positions.get(art.number, 0)

        # Find all headings that come before this article
        preceding: list[tuple[int, ParsedHeading]] = [
            (pos, h)
            for pos, h in zip(heading_positions, headings)
            if pos < art_pos
        ]

        heading_key = None
        heading_path: list[str] = []

        if preceding:
            _, nearest = preceding[-1]
            heading_key = nearest.key
            heading_path = _build_path(nearest, headings)

        articles.append(
            ParsedArticleResult(
                number=art.number,
                content_fr=art.body,
                heading_path=heading_path,
                heading_key=heading_key,
                title=art.title,
            )
        )

    # --- Step 4: Confidence ---
    confidence = _compute_confidence(body, split, articles, headings, warnings)

    return DocumentParseResult(
        headings=headings,
        articles=articles,
        preamble=split.preamble,
        parser_confidence=confidence,
        warnings=warnings,
    )


def parse_file(
    file_path: str, *, content_type: Optional[str] = None
) -> DocumentParseResult:
    """High-level entry point: extract text, then parse.

    Combines text extraction (PDF/DOCX/TXT) with the structural parser.
    """
    text, extraction_warnings = extract_text_from_file(
        file_path, content_type=content_type
    )
    result = parse_document(text)
    result.warnings = extraction_warnings + result.warnings
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_path(heading: ParsedHeading, all_headings: list[ParsedHeading]) -> list[str]:
    """Walk up from a heading to the root, returning the path as labels."""
    _LEVEL_LABELS = {
        "book": "Livre",
        "title": "Titre",
        "chapter": "Chapitre",
        "section": "Section",
        "subsection": "Sous-section",
    }
    parts: list[str] = []
    current: Optional[ParsedHeading] = heading
    seen: set[str] = set()

    while current and current.key not in seen:
        seen.add(current.key)
        label = f"{_LEVEL_LABELS.get(current.level, current.level)} {current.number}"
        if current.title_fr:
            label += f" — {current.title_fr}"
        parts.append(label)
        if current.parent_key:
            current = next((h for h in all_headings if h.key == current.parent_key), None)
        else:
            current = None

    return list(reversed(parts))


def _compute_confidence(
    body: str,
    split: SplitResult,
    articles: list[ParsedArticleResult],
    headings: list[ParsedHeading],
    warnings: list[str],
) -> float:
    """Heuristic confidence score (0.0–1.0)."""
    total_len = len(body.strip())
    if total_len == 0:
        return 0.0

    article_len = sum(len(a.content_fr) for a in articles)
    preamble_len = len(split.preamble)
    coverage = (article_len + preamble_len) / total_len

    has_articles = len(articles) > 0
    sequential = _check_sequential(articles)

    if has_articles:
        confidence = 0.4 + (coverage * 0.3) + (0.3 if sequential else 0.1)
    elif split.preamble:
        confidence = 0.2
        warnings.append(
            "No articles detected — the entire text was treated as preamble."
        )
    else:
        confidence = 0.0

    if has_articles and not sequential:
        warnings.append(
            "Article numbering is non-sequential — some articles may have been "
            "missed or have non-standard numbering."
        )

    if headings and not articles:
        warnings.append(
            "Headings were detected but no articles — the document may need "
            "manual structuring."
        )

    return round(min(confidence, 1.0), 2)


def _check_sequential(articles: list[ParsedArticleResult]) -> bool:
    """Check that article numbers are roughly sequential (allows gaps)."""
    if len(articles) < 2:
        return True
    nums: list[int] = []
    for a in articles:
        digits = re.sub(r"[^0-9]", "", a.number)
        if digits:
            nums.append(int(digits))
    if len(nums) < 2:
        return True
    return all(nums[i] >= nums[i - 1] for i in range(1, len(nums)))
