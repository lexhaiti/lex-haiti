"""Loi parser.

Standard structure: TITRE / CHAPITRE / SECTION, articles with possible
1°/2° points, lettre de promulgation at the end.

This is the most common profile and uses BaseParser as-is plus
``EXPECTS_PROMULGATION=True`` to surface the post-articles promulgation
block.
"""
from __future__ import annotations

from schemas.enums import LegalCategory, ParserProfile

from .base import BaseParser


class LoiParser(BaseParser):
    PROFILE = ParserProfile.loi
    CATEGORY_GUESS = LegalCategory.loi
    EXPECTS_PROMULGATION = True
