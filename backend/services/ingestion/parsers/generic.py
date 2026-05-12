"""Generic parser — the fallback profile used when classification is
uncertain. Inherits everything from BaseParser; no overrides."""
from __future__ import annotations

from .base import BaseParser
from packages.schemas.enums import ParserProfile


class GenericParser(BaseParser):
    PROFILE = ParserProfile.generic
    CATEGORY_GUESS = None
    EXPECTS_PROMULGATION = False
