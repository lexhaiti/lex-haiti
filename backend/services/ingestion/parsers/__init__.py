"""Profile-based legal-text parsers.

Each profile knows about a specific document family's quirks
(Constitution: PARTIE level above LIVRE, transitional dispositions
annex; Code: deeper TOC, no promulgation; Loi: standard
TITRE/CHAPITRE/SECTION with promulgation block; etc.).

Shared infrastructure lives on ``BaseParser`` in ``base.py``.

Usage:

    from services.ingestion.parsers import select_parser, ParserContext

    profile, parser = select_parser(text, hint=None)
    result = parser.parse(ParserContext(normalized_text=text))

``ParserOutput`` is the canonical output shape, designed to be
``model_dump`` into an ``ImportDraft`` row without further reshaping.
"""
from __future__ import annotations

from .base import BaseParser, ParserContext, ParserOutput
from .registry import (
    available_profiles,
    get_parser,
    profile_for_category,
    select_parser,
)

__all__ = [
    "BaseParser",
    "ParserContext",
    "ParserOutput",
    "select_parser",
    "get_parser",
    "profile_for_category",
    "available_profiles",
]
