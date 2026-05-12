"""Parser-profile registry + selector.

``select_parser(text)`` runs the document-type classifier (regex
header detection over the first 2 pages) and returns the chosen
ParserProfile + an instance ready to run.

When the classifier confidence is low (< 0.6), we fall back to the
generic profile. The editor can override the chosen profile in the
import-review UI; the override is persisted on ``ImportJob``.
"""
from __future__ import annotations

import re
from typing import Optional

from packages.schemas.enums import (
    LegalCategory,
    MoniteurDocumentType,
    ParserProfile,
)

from .base import BaseParser
from .circulaire import CirculaireParser
from .code import CodeParser
from .communique import CommuniqueParser
from .constitution import ConstitutionParser
from .executive_act import ExecutiveActParser
from .generic import GenericParser
from .loi import LoiParser
from .traite import TraiteParser


_REGISTRY: dict[ParserProfile, type[BaseParser]] = {
    ParserProfile.generic: GenericParser,
    ParserProfile.constitution: ConstitutionParser,
    ParserProfile.code: CodeParser,
    ParserProfile.loi: LoiParser,
    ParserProfile.executive_act: ExecutiveActParser,
    ParserProfile.circulaire: CirculaireParser,
    ParserProfile.communique: CommuniqueParser,
    ParserProfile.traite: TraiteParser,
}


def available_profiles() -> list[ParserProfile]:
    return list(_REGISTRY.keys())


def get_parser(profile: ParserProfile) -> BaseParser:
    cls = _REGISTRY[profile]
    return cls()


# ---------------------------------------------------------------------------
# Category → Profile mapping
# ---------------------------------------------------------------------------


# Mapping shared between LegalCategory and MoniteurDocumentType — both
# enums use the same string values for the overlapping types, so a
# single string-keyed table covers both. Anything not in the map (or
# explicitly mapped to ``None``) falls back to the generic profile —
# convention / errata / promulgation / autre / other_regulatory.
_CATEGORY_TO_PROFILE: dict[str, ParserProfile] = {
    "constitution": ParserProfile.constitution,
    "code": ParserProfile.code,
    "loi": ParserProfile.loi,
    "decret": ParserProfile.executive_act,
    "arrete": ParserProfile.executive_act,
    "ordonnance": ParserProfile.executive_act,
    "circulaire": ParserProfile.circulaire,
    "communique": ParserProfile.communique,
    "avis": ParserProfile.communique,
    # International instruments — LegalCategory.convention covers
    # traités, conventions, accords, protocoles.
    "convention": ParserProfile.traite,
}


def profile_for_category(
    category: LegalCategory | MoniteurDocumentType | str | None,
) -> ParserProfile:
    """Return the parser profile to use for a given document category.

    Accepts ``LegalCategory``, ``MoniteurDocumentType``, the raw string
    value of either, or ``None``. Unmapped values (convention, errata,
    promulgation, autre, other_regulatory, ``None``) fall back to the
    generic profile.
    """
    if category is None:
        return ParserProfile.generic
    key = category.value if hasattr(category, "value") else str(category)
    return _CATEGORY_TO_PROFILE.get(key, ParserProfile.generic)


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------


# Patterns matched against the head of the document. Order matters — the
# first match wins. Higher specificity at the top.
_CLASSIFICATION_RULES: list[tuple[ParserProfile, LegalCategory, re.Pattern[str]]] = [
    (
        ParserProfile.constitution,
        LegalCategory.constitution,
        re.compile(r"\bCONSTITUTION\b\s+(?:DE\s+LA\s+R[ÉE]PUBLIQUE\s+D['']HA[ÏI]TI|D['']HA[ÏI]TI)\b", re.IGNORECASE),
    ),
    (
        ParserProfile.code,
        LegalCategory.code,
        re.compile(r"\bCODE\s+(?:CIVIL|P[ÉE]NAL|DU\s+TRAVAIL|DE\s+COMMERCE|DE\s+PROC[ÉE]DURE|RURAL)\b", re.IGNORECASE),
    ),
    (
        ParserProfile.loi,
        LegalCategory.loi,
        # ``LOI N° …``, ``LOI No. …``, ``LOI du …``, ``Loi portant …``,
        # case-insensitive, anywhere in the head (some scans put it on
        # a line that isn't strictly line-start after OCR).
        re.compile(r"\bLOI\b\s+(?:N[°ºO\.\:]+|du\s|portant\b)", re.IGNORECASE),
    ),
    (
        ParserProfile.executive_act,
        LegalCategory.decret,
        re.compile(r"^\s*D[ÉE]CRET\b", re.IGNORECASE | re.MULTILINE),
    ),
    (
        ParserProfile.executive_act,
        LegalCategory.arrete,
        re.compile(r"^\s*ARR[ÊE]T[ÉE]\b", re.IGNORECASE | re.MULTILINE),
    ),
    (
        ParserProfile.executive_act,
        LegalCategory.ordonnance,
        re.compile(r"^\s*ORDONNANCE\b", re.IGNORECASE | re.MULTILINE),
    ),
    (
        ParserProfile.circulaire,
        LegalCategory.circulaire,
        re.compile(r"^\s*CIRCULAIRE\b", re.IGNORECASE | re.MULTILINE),
    ),
    (
        ParserProfile.communique,
        LegalCategory.communique,
        re.compile(r"\bCOMMUNIQU[ÉE]\s+(?:DE\s+PRESSE|OFFICIEL)\b", re.IGNORECASE),
    ),
    (
        ParserProfile.communique,
        LegalCategory.avis,
        re.compile(r"^\s*AVIS\b", re.IGNORECASE | re.MULTILINE),
    ),
    (
        # International instruments — order matters: place after the
        # specific domestic patterns so a "Loi portant ratification du
        # traité…" still classifies as a loi (the law ratifying the
        # treaty, not the treaty itself).
        ParserProfile.traite,
        LegalCategory.convention,
        re.compile(
            r"\b(?:TRAIT[ÉE]|CONVENTION|ACCORD|PROTOCOLE)\s+"
            r"(?:INTERNATIONAL|BILAT[ÉE]RAL|MULTILAT[ÉE]RAL|ENTRE)\b",
            re.IGNORECASE,
        ),
    ),
]


def select_parser(
    text: str, *, hint: Optional[ParserProfile] = None
) -> tuple[ParserProfile, LegalCategory | None, BaseParser]:
    """Classify the document and return the matching parser instance.

    Args:
        text: normalised document text (typically the first 2-3 pages
            are enough; passing more is fine).
        hint: editor-provided override. When given, bypasses the
            classifier entirely.

    Returns:
        (profile, category_guess, parser_instance)
    """
    if hint is not None:
        cls = _REGISTRY[hint]
        return hint, cls.CATEGORY_GUESS, cls()

    head = text[:6000]  # first ~2 pages
    for profile, category, pat in _CLASSIFICATION_RULES:
        if pat.search(head):
            cls = _REGISTRY[profile]
            return profile, category, cls()

    # No match — fall back to generic.
    return ParserProfile.generic, None, GenericParser()


__all__ = [
    "available_profiles",
    "get_parser",
    "profile_for_category",
    "select_parser",
]
