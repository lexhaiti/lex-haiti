"""Executive act parser — décret / arrêté / ordonnance.

These are issued directly by an executive or administrative authority,
they don't go through a parliamentary vote and they don't require a
separate promulgation. Their structure is typically:

  LE PRÉSIDENT [/ LE MINISTRE …] DE LA RÉPUBLIQUE,
    Vu …
    Considérant …
    Sur le rapport de …
  Décrète [/ Arrête] :
    Article 1er …
    Article 2 …
    …
    Article final : Le présent décret sera publié au Moniteur

Single-level article numbering. Rare TOC beyond Chapitre/Section.
"""
from __future__ import annotations

from schemas.enums import HeadingLevel, LegalCategory, ParserProfile

from .base import BaseParser, _HEADING_PATTERNS_DEFAULT


# Executive acts rarely use depth above Chapitre. Keep all default
# patterns enabled (in case they're there) but the data has tighter
# distribution at chapter/section level.
_EXEC_HEADING_PATTERNS = [
    (lvl, pat)
    for lvl, pat in _HEADING_PATTERNS_DEFAULT
    if lvl
    in {HeadingLevel.title, HeadingLevel.chapter, HeadingLevel.section, HeadingLevel.subsection}
]


class ExecutiveActParser(BaseParser):
    PROFILE = ParserProfile.executive_act
    CATEGORY_GUESS = LegalCategory.decret  # narrowed in editorial UI
    EXPECTS_PROMULGATION = False
    HEADING_PATTERNS = _EXEC_HEADING_PATTERNS
