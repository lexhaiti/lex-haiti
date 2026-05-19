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
    # Offset of the article heading within the original ``body`` string
    # passed to ``split_into_articles``. Lets the caller compare article
    # positions to structural-heading positions without re-searching the
    # text (a substring search would return the first match, which is
    # wrong when the same heading number appears multiple times — e.g.
    # CHAPITRE I under TITRE I and again under TITRE II).
    source_offset: Optional[int] = None


@dataclass
class PreambleParts:
    """Structured breakdown of the pre-article text.

    Real-world ordering in a Haitian legal instrument:
      préambule (rare, mostly constitutions)
      → visas ("Vu …")
      → considérants ("Considérant que …")
      → mentions procédurales ("Sur le rapport du … ;" /
        "Et après délibération en Conseil des Ministres ;")
      → formule d'adoption ("Le Corps Législatif a voté …" / "DÉCRÈTE :")
    """

    preamble: Optional[str]
    visas: Optional[str]
    considerants: Optional[str]
    mentions_procedurales: Optional[str]
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
#   "Article 190ter.1", "Article 190bis.2"  (sub-article after a bis/ter)
#   "Article 190quinquies"  (rarer Latin ordinals: quater, quinquies,
#                            sexies, septies, octies, nonies, decies)
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
    (                              # -- number, captured --
        [Pp]remier(?:[\.\-]\d+)?   # "Article premier", "Article premier-1"
      | [IVXLCDM]{1,8}             # Roman numerals — anchored to known
                                   # Roman characters only. ``Article I``,
                                   # ``Article Ier``, ``Article II``,
                                   # ``Article IVème``. Used by older
                                   # Haitian instruments and by
                                   # Concordat-style international acts.
        (?:er|ère|e|re|ème)?       # optional ordinal suffix on the Roman
                                   # form (1er and friends; ère/re carry
                                   # the feminine, ème the post-1990 form)
        (?=[\s\.\-—–:]|$)          # require a separator after the Roman
                                   # block so ``Article IRE …`` does NOT
                                   # parse as Roman ``IRE`` + tail; lets
                                   # ``Article I.-`` and ``Article Ier.``
                                   # through cleanly
      | \d+                        # core integer
        (?:[\.\-]\d+)?             # optional first dot/dash suffix
        (?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?
        (?:[\.\-]\d+)?             # optional dot/dash suffix AFTER bis/ter (190ter.1)
        (?:er|ère|e)?              # optional ordinal suffix (1er, 1ère, 1e)
    )
    # Trailing separator(s) — any combo of `. - — – :` and surrounding
    # whitespace. Greedy so "Article 1er. —" consumes both `.` and `—`
    # and the body cleanly starts at the first content character.
    [\s\.\-—–:]*
    """,
    re.MULTILINE | re.VERBOSE,
)


# Standalone "DISPOSITIONS TRANSITOIRES" header — must be its own line.
# We require the line-anchored form so prose references like
# "des dispositions transitoires de la loi" don't trigger the cut.
# Used as a hard stop for the article splitter: transitional dispositions
# (typical for Constitutions and some Codes) are handled separately by
# the consuming parser profile as an `annex` block, never merged into
# the preceding article's body.
_TRANSITIONAL_ANNEX_HEADER_RE = re.compile(
    r"^\s*DISPOSITIONS\s+TRANSITOIRES\s*$",
    re.IGNORECASE | re.MULTILINE,
)

# Structural-heading line (PARTIE / LIVRE / TITRE / CHAPITRE / SECTION
# / SOUS-SECTION) — used as a soft boundary inside the article splitter
# so an article's body never silently swallows the next TITRE / CHAPITRE
# header. Inline references ("Le présent TITRE concerne…") don't match
# because the regex is line-anchored and requires an identifier right
# after the keyword.
#
# Identifier grammar mirrors ``base._IDENT_RE``: Roman numerals + digits
# + the single capital letter form used by Haitian Code sections
# (SECTION A, SECTION B, … SECTION J). Without the letter branch the
# article splitter would let an article body consume a whole block of
# letter-numbered sections as prose.
_STRUCTURAL_HEADING_RE = re.compile(
    r"^\s*(?:PARTIE|LIVRE|TITRE|CHAPITRE|SECTION|SOUS-SECTION)"
    r"\s+(?:[IVXLCDM\d]+(?:er|ère|e|re)?|[A-Z](?=\s|$|[.,;:\-—]))",
    re.IGNORECASE | re.MULTILINE,
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

    # Hard stop on a standalone "DISPOSITIONS TRANSITOIRES" header. The
    # transitional dispositions are handled separately by the consuming
    # parser profile (e.g. ConstitutionParser.finalize lifts them as an
    # `annex` block), and must NOT be merged into the preceding article's
    # body. Inline references like "des dispositions transitoires de…"
    # don't match the line-anchored regex, so this is safe for lois that
    # only mention transitional dispositions in prose.
    annex_marker = _TRANSITIONAL_ANNEX_HEADER_RE.search(body)
    if annex_marker:
        body = body[: annex_marker.start()].rstrip()

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
        next_article_start = (
            matches[i + 1].start() if i + 1 < len(matches) else len(body)
        )
        body_end = next_article_start
        # A structural heading (TITRE / CHAPITRE / SECTION …) sitting
        # between two articles is the start of a new structural region,
        # not part of the previous article's body — cut at the heading
        # so the article body ends cleanly.
        struct = _STRUCTURAL_HEADING_RE.search(body, body_start, body_end)
        if struct:
            body_end = struct.start()
        article_body = body[body_start:body_end].strip()
        # Drop articles whose body is empty (the parser caught the heading
        # but nothing followed before the next heading — usually OCR noise).
        if not article_body:
            continue
        articles.append(
            ParsedArticle(
                number=number, body=article_body, source_offset=m.start()
            )
        )

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
# Mentions procédurales — the clauses that record the procedural
# pathway between considérants and the enacting word. Lines that
# open with ``Sur le rapport``, ``Sur la proposition``, ``Sur l'avis``,
# ``Et après délibération``, ``Et après avis``, etc. Distinct from
# the transitional word that follows (``ARRÊTE`` / ``DÉCRÈTE``).
_MENTIONS_PROC_RE = re.compile(
    r"^\s*(?:"
    r"Sur\s+(?:le\s+rapport|la\s+proposition|l[ae]\s+demande|l'avis)|"
    r"Et\s+(?:apr[èe]s\s+(?:d[éeè]lib[éeè]ration|avis|consultation))"
    r")",
    re.IGNORECASE,
)
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
    """Split pre-article text into its five legal blocks.

    States flow forward only:
      pre → visa → considerant → mentions_proc → enacting

    Text before any "Vu" is a true preamble (rare — mostly
    constitutions). Mentions procédurales sit between considérants
    and the dispositif word (``Sur le rapport du … ;`` /
    ``Et après délibération en Conseil des Ministres ;``); they used
    to bleed into ``considerants`` before this state existed.
    """
    if not text or not text.strip():
        return PreambleParts(
            preamble=None,
            visas=None,
            considerants=None,
            mentions_procedurales=None,
            enacting_formula=None,
        )

    lines = text.split("\n")
    preamble_lines: list[str] = []
    visa_lines: list[str] = []
    cons_lines: list[str] = []
    mentions_lines: list[str] = []
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
        elif state in ("visa", "considerant") and _MENTIONS_PROC_RE.match(stripped):
            state = "mentions_proc"
            mentions_lines.append(line)
        elif state == "mentions_proc" and stripped and _MENTIONS_PROC_RE.match(stripped):
            # Another "Et après délibération …" continuation — stay
            # in the mentions block.
            mentions_lines.append(line)
        elif state in ("visa", "considerant", "mentions_proc"):
            if stripped and _TRANSITIONAL_RE.match(stripped):
                state = "enacting"
                enacting_lines.append(line)
            elif state == "visa":
                visa_lines.append(line)
            elif state == "considerant":
                cons_lines.append(line)
            else:
                mentions_lines.append(line)
        elif state == "enacting":
            enacting_lines.append(line)
        else:
            preamble_lines.append(line)

    return PreambleParts(
        preamble="\n".join(preamble_lines).strip() or None,
        visas="\n".join(visa_lines).strip() or None,
        considerants="\n".join(cons_lines).strip() or None,
        mentions_procedurales="\n".join(mentions_lines).strip() or None,
        enacting_formula="\n".join(enacting_lines).strip() or None,
    )


def _normalize_number(raw: str) -> str:
    """Canonicalize an article number for storage.

    "1er" / "1ère" / "1e" all become "1". "1bis" stays "1bis" (no space).
    "premier" becomes "premier" (preserves the traditional label).
    "premier-1" becomes "premier-1".
    Hyphenated and dotted forms (Constitution-style "1.1") are preserved.
    """
    n = raw.strip()
    n = re.sub(r"\s+", "", n)
    # "Article premier" → keep as-is (canonical Haitian numbering)
    if n.lower().startswith("premier"):
        return n.lower()
    n = re.sub(r"(?<=\d)(er|ère|e)$", "", n, flags=re.IGNORECASE)
    return n
