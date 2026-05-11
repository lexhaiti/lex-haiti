"""Align an FR parse result with an HT parse result by article number.

Used by the bilingual import flow (POST /editorial/parse-document with two
files) and by the late-translation flow (POST /editorial/loi/{slug}/parse-
translation).

The output is a single ``BilingualParseResult`` where every article carries
both ``content_fr`` and ``content_ht`` when matched. Headings are reconciled
on the FR side (Haitian legal texts don't typically re-number their
structure in translation — the *titles* may translate but the *numbers* and
the structural skeleton stay identical).

Edge cases the alignment must surface as warnings (not errors):
- HT has fewer articles than FR (orphan FR articles → text_ht stays null)
- HT has extra articles not in FR (flagged; editor decides what to do)
- Article numbers don't match (alignment by number is bypassed; editor
  manually reconciles in the review pane)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from services.ingestion.article_split import _normalize_number
from services.ingestion.document_parser import (
    DocumentParseResult,
    ParsedArticleResult,
    ParsedHeading,
)


@dataclass
class BilingualArticle:
    """An article with bilingual content fields. content_ht is null when
    the HT parse didn't have a matching number."""

    number: str
    content_fr: str
    content_ht: Optional[str] = None
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    heading_path: list[str] = field(default_factory=list)
    heading_key: Optional[str] = None


@dataclass
class BilingualParseResult:
    """Aligned bilingual parse — superset of DocumentParseResult."""

    headings: list[ParsedHeading]
    articles: list[BilingualArticle]
    preamble_fr: str = ""
    preamble_ht: Optional[str] = None
    parser_confidence: float = 0.0
    warnings: list[str] = field(default_factory=list)
    official_number: Optional[str] = None
    issuing_authority: Optional[str] = None
    official_formula: Optional[str] = None
    # Article counts on each side — useful for the UI's "47 FR / 46 HT"
    # alignment summary.
    fr_article_count: int = 0
    ht_article_count: int = 0
    matched_count: int = 0


def align_bilingual(
    fr: DocumentParseResult,
    ht: Optional[DocumentParseResult],
) -> BilingualParseResult:
    """Build a bilingual aligned view from two independent parse results.

    When ``ht`` is None, returns the FR result lifted into the bilingual
    shape with empty HT fields. This keeps the API uniform — callers
    don't need to branch on whether HT was provided.
    """
    if ht is None:
        return _fr_only(fr)

    # Index HT articles by normalised number for O(1) lookup.
    ht_by_number: dict[str, ParsedArticleResult] = {}
    ht_duplicate_numbers: set[str] = set()
    for ha in ht.articles:
        key = _normalize_number(ha.number)
        if key in ht_by_number:
            ht_duplicate_numbers.add(key)
        ht_by_number[key] = ha

    aligned: list[BilingualArticle] = []
    matched = 0
    matched_ht_keys: set[str] = set()

    for fa in fr.articles:
        key = _normalize_number(fa.number)
        ha = ht_by_number.get(key)
        if ha is not None:
            matched += 1
            matched_ht_keys.add(key)
        aligned.append(
            BilingualArticle(
                number=fa.number,
                content_fr=fa.content_fr,
                content_ht=ha.content_fr if ha else None,  # ha.content_fr holds the raw HT text — the parser doesn't know language
                title_fr=fa.title,
                title_ht=ha.title if ha else None,
                heading_path=list(fa.heading_path),
                heading_key=fa.heading_key,
            )
        )

    warnings: list[str] = []
    warnings.extend(fr.warnings)
    warnings.extend(f"[HT] {w}" for w in ht.warnings)

    fr_count = len(fr.articles)
    ht_count = len(ht.articles)

    if matched < fr_count:
        warnings.append(
            f"{fr_count - matched} article(s) FR sans traduction HT correspondante."
        )
    orphan_ht = ht_count - len(matched_ht_keys)
    if orphan_ht > 0:
        warnings.append(
            f"{orphan_ht} article(s) HT sans équivalent FR — vérifier la numérotation."
        )
    if ht_duplicate_numbers:
        warnings.append(
            "Numéros d'article dupliqués côté HT: "
            + ", ".join(sorted(ht_duplicate_numbers))
        )

    return BilingualParseResult(
        headings=fr.headings,
        articles=aligned,
        preamble_fr=fr.preamble,
        preamble_ht=ht.preamble or None,
        parser_confidence=fr.parser_confidence,
        warnings=warnings,
        official_number=fr.official_number,
        issuing_authority=fr.issuing_authority,
        official_formula=fr.official_formula,
        fr_article_count=fr_count,
        ht_article_count=ht_count,
        matched_count=matched,
    )


def _fr_only(fr: DocumentParseResult) -> BilingualParseResult:
    """Lift an FR-only parse into the bilingual shape with empty HT slots."""
    return BilingualParseResult(
        headings=fr.headings,
        articles=[
            BilingualArticle(
                number=a.number,
                content_fr=a.content_fr,
                content_ht=None,
                title_fr=a.title,
                title_ht=None,
                heading_path=list(a.heading_path),
                heading_key=a.heading_key,
            )
            for a in fr.articles
        ],
        preamble_fr=fr.preamble,
        preamble_ht=None,
        parser_confidence=fr.parser_confidence,
        warnings=list(fr.warnings),
        official_number=fr.official_number,
        issuing_authority=fr.issuing_authority,
        official_formula=fr.official_formula,
        fr_article_count=len(fr.articles),
        ht_article_count=0,
        matched_count=0,
    )
