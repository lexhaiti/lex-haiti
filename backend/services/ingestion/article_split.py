"""Heuristic article splitter.

Given the full body text of a law (typically a candidate's `raw_text`
from the Moniteur pipeline, or an editor-pasted text), split it into
discrete articles and return one record per article. Used at promote
time so a Moniteur candidate becomes a real `LegalText` with browsable
`Article` rows, not an empty shell with the whole body in `description`.

Detection is purely regex — finds article-heading lines like
`Article 1er. —`, `Article 1.`, `ARTICLE 12`, `Art. 25`. Body of an
article extends from one heading to the next (or to end-of-text).

Lead-in text BEFORE the first article (preamble, considérants, signatures
section, "Le Président de la République, … ARRÊTE :") is returned
separately so callers can store it on `LegalText.preamble_fr` instead of
silently dropping it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class ParsedArticle:
    """One article extracted from a law body."""

    number: str
    body: str
    title: Optional[str] = None  # Reserved — most Haitian laws don't title articles.


@dataclass
class SplitResult:
    """Output of `split_into_articles`."""

    preamble: str  # everything before "Article 1" (often empty / whitespace)
    articles: List[ParsedArticle]


# Article-heading patterns. Order matters — most specific first. Each
# regex captures the article *number* in group 1.
#
# Examples we want to catch:
#   "Article 1er. —"
#   "Article 1er.-"
#   "Article 1. —"
#   "Article 1.-"
#   "Article 1 -"
#   "Article 1:"
#   "ARTICLE 1"
#   "Art. 25"
#   "Art. 25.—"
#   "Article 1.1"  (Constitution-style amendments)
#   "Article 1bis", "Article 1 bis"
#
# We require the heading to start at the beginning of a line (or after
# whitespace + newline) so paragraph-internal "article 12 de la loi …"
# refs don't get mistaken for headings.
_ARTICLE_HEADING_RE = re.compile(
    r"""
    ^[\s ]*                       # start of line, optional indent
    (?:Article|ARTICLE|Art\.?)         # the keyword
    [\s ]+                        # at least one space
    (\d+(?:[\.\-]\d+)?(?:\s*(?:bis|ter|quater))?(?:er|ère|e)?)  # number, captured
    # Trailing separator(s) — any combo of `. - — – :` and surrounding
    # whitespace. Greedy so "Article 1er. —" consumes both `.` and `—`
    # and the body cleanly starts at the first content character.
    [\s\.\-—–:]*
    """,
    re.MULTILINE | re.VERBOSE,
)


def split_into_articles(body: str) -> SplitResult:
    """Split a law body into preamble + list of articles.

    Empty or article-less input returns a result whose `articles` list is
    empty and `preamble` carries the whole input. Callers can fall back
    to "store everything as the description / preamble" in that case.
    """
    if not body or not body.strip():
        return SplitResult(preamble="", articles=[])

    matches = list(_ARTICLE_HEADING_RE.finditer(body))
    if not matches:
        return SplitResult(preamble=body.strip(), articles=[])

    preamble = body[: matches[0].start()].strip()

    articles: list[ParsedArticle] = []
    for i, m in enumerate(matches):
        number = _normalize_number(m.group(1))
        body_start = m.end()
        body_end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        article_body = body[body_start:body_end].strip()
        # Drop articles whose body is empty (the parser caught the heading
        # but nothing followed before the next heading — usually OCR noise).
        if not article_body:
            continue
        articles.append(ParsedArticle(number=number, body=article_body))

    return SplitResult(preamble=preamble, articles=articles)


def _normalize_number(raw: str) -> str:
    """Canonicalize an article number for storage.

    "1er" / "1ère" / "1e" all become "1". "1bis" stays "1bis" (no space).
    Hyphenated and dotted forms (Constitution-style "1.1") are preserved.
    """
    n = raw.strip()
    n = re.sub(r"\s+", "", n)
    n = re.sub(r"(?<=\d)(er|ère|e)$", "", n, flags=re.IGNORECASE)
    return n
