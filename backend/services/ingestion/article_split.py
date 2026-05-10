"""Heuristic article splitter.

Given the full body text of a law (typically a candidate's `raw_text`
from the Moniteur pipeline, or an editor-pasted text), split it into
discrete articles and return one record per article. Used at promote
time so a Moniteur candidate becomes a real `LegalText` with browsable
`Article` rows, not an empty shell with the whole body in `description`.

Detection is purely regex — finds article-heading lines like
`Article 1er. —`, `Article 1.`, `ARTICLE 12`, `Art. 25`. Body of an
article extends from one heading to the next (or to end-of-text).

Lead-in text BEFORE the first article is returned separately.
`split_preamble()` further breaks it into the four legal blocks:
préambule → visas → considérants → formule d'adoption.
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
class PreambleParts:
    """Structured breakdown of the pre-article text.

    Real-world ordering in a Haitian legal instrument:
      préambule (rare, mostly constitutions)
      → visas ("Vu …")
      → considérants ("Considérant que …")
      → formule d'adoption ("Le Corps Législatif a voté …" / "DÉCRÈTE :")
    """

    preamble: Optional[str]
    visas: Optional[str]
    considerants: Optional[str]
    enacting_formula: Optional[str]


@dataclass
class SplitResult:
    """Output of `split_into_articles`."""

    preamble: str  # everything before "Article 1" (often empty / whitespace)
    articles: List[ParsedArticle]
    official_formula: Optional[str] = None  # post-dispositif block (Votée + Donné)


# Post-dispositif markers — the first line after the last article's body
# that announces the closing block. Order matters only insofar as we want
# to log which marker matched; the regex is alternation-flat.
#
#   - "Votée au Sénat" / "Votée à la Chambre"  → law adoption certification
#   - "LIBERTÉ ÉGALITÉ"                          → presidential promulgation banner
#   - "Donné au"  / "Donné à"                    → presidential signing line
#   - "Fait à"                                   → ministerial signing line (arrêtés)
#   - "AU NOM DE LA RÉPUBLIQUE"                  → executive promulgation header
_OFFICIAL_FORMULA_MARKER_RE = re.compile(
    r"""
    ^[\s ]*                           # start of line, optional indent
    (?:
        Vot[ée]e\s+(?:au|à\s+la)      # Votée au … / Votée à la …
      | LIBERT[ÉE]\s+[ÉE]GALIT[ÉE]    # LIBERTÉ ÉGALITÉ banner
      | Donn[ée]\s+(?:au|à)           # Donné au / Donné à
      | Fait\s+(?:au|à)               # Fait à (arrêté variant)
      | AU\s+NOM\s+DE\s+LA\s+R[ÉE]PUBLIQUE
    )
    """,
    re.MULTILINE | re.VERBOSE,
)


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
    (?:\#{1,6}[\s ]+)?             # optional Markdown heading marker (## …)
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
    """Split a law body into preamble + list of articles + optional formula.

    Empty or article-less input returns a result whose `articles` list is
    empty and `preamble` carries the whole input. Callers can fall back
    to "store everything as the description / preamble" in that case.

    The post-dispositif block (Votée + LIBERTÉ + Donné + signature
    lines) is sliced off the end and returned as `official_formula`.
    The slice point is *sentence-aware*: we find the first marker, then
    walk back to the nearest preceding `.` so the last article's body
    always ends at a complete sentence — no half-paragraphs cut mid-
    word when the marker happens to sit immediately after some text.
    """
    if not body or not body.strip():
        return SplitResult(preamble="", articles=[], official_formula=None)

    # Slice off the post-dispositif formula first, so the article matcher
    # below doesn't see the "Article" mentions sometimes hidden inside the
    # promulgation prose ("…modifie l'article 17 de la loi…").
    body, official_formula = _split_official_formula(body)

    matches = list(_ARTICLE_HEADING_RE.finditer(body))
    if not matches:
        return SplitResult(
            preamble=body.strip(),
            articles=[],
            official_formula=official_formula,
        )

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

    return SplitResult(
        preamble=preamble,
        articles=articles,
        official_formula=official_formula,
    )


def _split_official_formula(body: str) -> tuple[str, Optional[str]]:
    """Slice the post-dispositif `official_formula` off the end of body.

    Returns `(body_without_formula, formula_or_None)`. The cut is made
    at the nearest period BEFORE the first marker, so the article body
    keeps its closing sentence intact.

    No marker found → returns `(body, None)` and the caller proceeds
    with the legacy splitter behaviour (all articles, no formula).
    """
    marker = _OFFICIAL_FORMULA_MARKER_RE.search(body)
    if not marker:
        return body, None

    # Walk backward from the marker to the nearest sentence terminator.
    # `.` covers the vast majority of legal prose; if nothing's found
    # (very short / OCR-broken input), fall back to a hard cut at the
    # marker itself rather than crashing.
    cut = body.rfind(".", 0, marker.start())
    if cut < 0:
        cut = marker.start() - 1

    article_body = body[: cut + 1].rstrip()
    formula = body[cut + 1 :].strip() or None
    return article_body, formula


_VU_RE = re.compile(r"^\s*Vu\s", re.IGNORECASE)
_CONS_RE = re.compile(r"^\s*Consid[éeè]rant\s", re.IGNORECASE)
_TRANSITIONAL_RE = re.compile(
    r"^\s*(?:"
    r"Le\s+Corps\s+L[éeè]gislatif|"
    r"Sur\s+proposition|"
    r"Le\s+Pr[éeè]sident|"
    r"Le\s+Conseil|"
    r"Le\s+Pouvoir|"
    r"ARR[ÊE]TE|"
    r"D[ÉE]CR[ÈE]TE|"
    r"ORDONNE"
    r")",
    re.IGNORECASE,
)


def split_preamble(text: str) -> PreambleParts:
    """Split pre-article text into its four legal blocks.

    States flow forward only: pre → visa → considerant → enacting.
    Text before any "Vu" is a true preamble (rare — mostly constitutions).
    Text after considérants is the enacting formula.
    """
    if not text or not text.strip():
        return PreambleParts(
            preamble=None, visas=None, considerants=None, enacting_formula=None,
        )

    lines = text.split("\n")
    preamble_lines: list[str] = []
    visa_lines: list[str] = []
    cons_lines: list[str] = []
    enacting_lines: list[str] = []

    state = "pre"

    for line in lines:
        stripped = line.strip()

        if _VU_RE.match(stripped):
            state = "visa"
            visa_lines.append(line)
        elif _CONS_RE.match(stripped):
            state = "considerant"
            cons_lines.append(line)
        elif state in ("visa", "considerant"):
            if stripped and _TRANSITIONAL_RE.match(stripped):
                state = "enacting"
                enacting_lines.append(line)
            elif state == "visa":
                visa_lines.append(line)
            else:
                cons_lines.append(line)
        elif state == "enacting":
            enacting_lines.append(line)
        else:
            preamble_lines.append(line)

    return PreambleParts(
        preamble="\n".join(preamble_lines).strip() or None,
        visas="\n".join(visa_lines).strip() or None,
        considerants="\n".join(cons_lines).strip() or None,
        enacting_formula="\n".join(enacting_lines).strip() or None,
    )


def _normalize_number(raw: str) -> str:
    """Canonicalize an article number for storage.

    "1er" / "1ère" / "1e" all become "1". "1bis" stays "1bis" (no space).
    Hyphenated and dotted forms (Constitution-style "1.1") are preserved.
    """
    n = raw.strip()
    n = re.sub(r"\s+", "", n)
    n = re.sub(r"(?<=\d)(er|ère|e)$", "", n, flags=re.IGNORECASE)
    return n
