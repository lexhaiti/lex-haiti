"""Circulaire parser.

Circulaires are usually loose ministerial prose with numbered
instructions. They often lack the formal preamble/visa/considérant
structure of a décret. We keep the base flow but drop the
promulgation expectation and downgrade structural-heading confidence.
"""
from __future__ import annotations

from schemas.enums import HeadingLevel, LegalCategory, ParserProfile

from .base import BaseParser, _HEADING_PATTERNS_DEFAULT


# Circulaires rarely have anything above Section in their structure.
_CIRC_HEADING_PATTERNS = [
    (lvl, pat)
    for lvl, pat in _HEADING_PATTERNS_DEFAULT
    if lvl in {HeadingLevel.section, HeadingLevel.subsection, HeadingLevel.chapter}
]


class CirculaireParser(BaseParser):
    PROFILE = ParserProfile.circulaire
    CATEGORY_GUESS = LegalCategory.circulaire
    EXPECTS_PROMULGATION = False
    HEADING_PATTERNS = _CIRC_HEADING_PATTERNS
