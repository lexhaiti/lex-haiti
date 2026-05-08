"""Auto-suggester for `LegalTheme` tags.

Approach: keyword dictionary per theme (FR + HT). The suggester runs over a
text's title + description + (for broad-scope categories) article bodies and
returns themes with their confidence — number of distinct keyword hits
divided by an arbitrary saturation point.

This is a transparent, reviewable signal — editors can see WHICH keywords
fired and decide whether the suggestion is correct. Replace with embeddings
later if precision becomes an issue.

Editorial workflow:
  1. On import, call `suggest_themes_for_text(...)` to get auto suggestions.
  2. Persist them with `source=auto`.
  3. Editor reviews on the law detail page; confirmed tags get
     `source=editor`, the rest stay `auto` (still surface in /lois?theme=…
     by default; can be filtered with `?theme_source=editor` for stricter
     listings).

Tuning: a tag fires if at least one keyword matches. Confidence climbs as
more distinct keywords match — capped at 1.0 once the saturation count is
reached. Saturation is intentionally low (3) so a few solid matches is
enough.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable

from packages.schemas.enums import LegalCategory, LegalTheme

# Saturation: confidence reaches 1.0 after this many distinct keywords match.
_CONFIDENCE_SATURATION = 3


# Each theme has FR + HT keywords. Keywords are matched case-insensitively
# and substring-wise against unaccented text — so "société" matches
# "sociétés" / "Société" / "sociètés" all the same.
#
# Editorial guidance: prefer SPECIFIC, low-ambiguity terms. "travail" alone
# is very broad — pair it with more specific terms ("salarié", "employeur",
# "syndicat", "code du travail") so we don't tag every text mentioning
# "travail" as droit_travail.
THEME_KEYWORDS_FR: dict[LegalTheme, list[str]] = {
    LegalTheme.droit_societes: [
        "société",
        "sociétés",
        "actionnaire",
        "actionnaires",
        "société anonyme",
        "SARL",
        "fonds de commerce",
        "registre du commerce",
        "associé",
    ],
    LegalTheme.droit_fiscal: [
        "impôt",
        "impôts",
        "fiscal",
        "fiscalité",
        "taxe",
        "taxes",
        "DGI",
        "patente",
        "douane",
        "tarif douanier",
        "TCA",
    ],
    LegalTheme.droit_bancaire: [
        "banque",
        "bancaire",
        "BRH",
        "monétaire",
        "monnaie",
        "crédit",
        "établissement de crédit",
        "blanchiment",
    ],
    LegalTheme.propriete_intellectuelle: [
        "brevet",
        "brevets",
        "marque déposée",
        "droit d'auteur",
        "droits d'auteur",
        "propriété intellectuelle",
        "propriété industrielle",
    ],
    LegalTheme.droit_travail: [
        "code du travail",
        "salarié",
        "salariés",
        "employeur",
        "syndicat",
        "syndicale",
        "convention collective",
        "contrat de travail",
        "licenciement",
    ],
    LegalTheme.protection_sociale: [
        "sécurité sociale",
        "OFATMA",
        "ONA",
        "retraite",
        "pension",
        "assurance maladie",
        "accident du travail",
    ],
    LegalTheme.droit_famille: [
        "mariage",
        "divorce",
        "enfant",
        "enfants",
        "filiation",
        "adoption",
        "tutelle",
        "autorité parentale",
        "régime matrimonial",
    ],
    LegalTheme.successions: [
        "succession",
        "successions",
        "héritier",
        "héritiers",
        "héritage",
        "testament",
        "testaments",
        "legs",
        "donation",
    ],
    LegalTheme.droit_administratif: [
        "fonction publique",
        "fonctionnaire",
        "fonctionnaires",
        "ministère",
        "ministres",
        "service public",
        "acte administratif",
        "tribunal administratif",
    ],
    LegalTheme.marches_publics: [
        "marché public",
        "marchés publics",
        "appel d'offres",
        "CNMP",
        "passation",
        "soumissionnaire",
        "concession",
    ],
    LegalTheme.environnement: [
        "environnement",
        "environnemental",
        "écologique",
        "biodiversité",
        "pollution",
        "déchets",
        "ressources naturelles",
    ],
    LegalTheme.foncier: [
        "foncier",
        "foncière",
        "cadastre",
        "cadastral",
        "immobilier",
        "propriété immobilière",
        "domaine de l'État",
        "domanial",
    ],
}


# Kreyòl keywords are sparser — many legal terms are still French-loaned
# in formal Haitian legal writing. Adding what we have; expand as the
# corpus grows.
THEME_KEYWORDS_HT: dict[LegalTheme, list[str]] = {
    LegalTheme.droit_societes: ["sosyete", "aksyonè"],
    LegalTheme.droit_fiscal: ["taks", "enpo"],
    LegalTheme.droit_bancaire: ["bank", "lajan"],
    LegalTheme.propriete_intellectuelle: ["brevè", "dwa otè"],
    LegalTheme.droit_travail: ["travayè", "patwon", "sendika"],
    LegalTheme.protection_sociale: ["pansyon", "asirans"],
    LegalTheme.droit_famille: ["maryaj", "divòs", "timoun", "pitit"],
    LegalTheme.successions: ["eritaj", "eritye", "testaman"],
    LegalTheme.droit_administratif: ["fonksyonè", "ministè", "sèvis piblik"],
    LegalTheme.marches_publics: ["mache piblik", "konkou"],
    LegalTheme.environnement: ["anviwònman", "polisyon"],
    LegalTheme.foncier: ["tè", "kadas"],
}


# Categories whose article BODIES we should also scan (broad-scope texts).
# For lois / décrets / arrêtés, the title + description usually capture the
# theme — scanning every article would inflate confidence on incidental
# mentions.
_BROAD_CATEGORIES = {LegalCategory.code, LegalCategory.constitution}


_ACCENT_MAP = str.maketrans(
    "àâäéèêëîïôöùûüÿçÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ",
    "aaaeeeeiioouuuycAAAEEEEIIOOUUUYC",
)


def _normalize(text: str) -> str:
    """Lowercase + strip accents for keyword matching."""
    return text.translate(_ACCENT_MAP).lower()


@dataclass(frozen=True)
class ThemeMatch:
    theme: LegalTheme
    confidence: Decimal
    matched_terms: list[str]


def suggest_themes(
    *,
    title_fr: str,
    title_ht: str | None = None,
    description_fr: str | None = None,
    description_ht: str | None = None,
    category: LegalCategory,
    article_bodies: Iterable[str] = (),
) -> list[ThemeMatch]:
    """Run the keyword suggester over a legal text's metadata + (optionally)
    article bodies, and return the matched themes ordered by confidence.

    Article bodies are scanned only for broad-scope categories (code,
    constitution) — for lois/décrets we trust the title+description to
    capture intent without false positives from passing references.
    """
    haystacks_fr: list[str] = [title_fr]
    haystacks_ht: list[str] = []
    if title_ht:
        haystacks_ht.append(title_ht)
    if description_fr:
        haystacks_fr.append(description_fr)
    if description_ht:
        haystacks_ht.append(description_ht)

    if category in _BROAD_CATEGORIES:
        for body in article_bodies:
            if body:
                # We don't know which language each article is in here, so
                # scan against both keyword sets. Keywords are distinct
                # enough across FR/HT that there's negligible cross-noise.
                haystacks_fr.append(body)
                haystacks_ht.append(body)

    norm_fr = " ".join(_normalize(h) for h in haystacks_fr if h)
    norm_ht = " ".join(_normalize(h) for h in haystacks_ht if h)

    matches: list[ThemeMatch] = []
    for theme in LegalTheme:
        # Per-theme: collect distinct matched terms, FR and HT.
        matched: set[str] = set()
        for kw in THEME_KEYWORDS_FR.get(theme, []):
            kw_norm = _normalize(kw)
            if kw_norm and re.search(rf"\b{re.escape(kw_norm)}\b", norm_fr):
                matched.add(kw)
        for kw in THEME_KEYWORDS_HT.get(theme, []):
            kw_norm = _normalize(kw)
            if kw_norm and re.search(rf"\b{re.escape(kw_norm)}\b", norm_ht):
                matched.add(kw)

        if not matched:
            continue
        # Confidence: cap at 1.0 once SATURATION distinct keywords match.
        raw = min(1.0, len(matched) / _CONFIDENCE_SATURATION)
        matches.append(
            ThemeMatch(
                theme=theme,
                confidence=Decimal(f"{raw:.2f}"),
                matched_terms=sorted(matched),
            )
        )

    matches.sort(key=lambda m: (-m.confidence, m.theme.value))
    return matches
