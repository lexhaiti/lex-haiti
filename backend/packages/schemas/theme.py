"""Pydantic schemas for legal theme tags.

Tags are produced either by an editor or by the keyword auto-suggester.
The public API exposes them on each `LegalTextRead` so the frontend can
render theme chips on the law detail page.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict

from packages.schemas.enums import LegalTheme, ThemeSource


class LegalThemeTagRead(BaseModel):
    """A single theme tag attached to a legal text."""

    theme: LegalTheme
    source: ThemeSource
    # 0.00–1.00 — only meaningful for source=auto rows. NULL for editor tags.
    confidence: Optional[Decimal] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ThemeSuggestion(BaseModel):
    """An auto-suggester output: which theme, and how strong the signal."""

    theme: LegalTheme
    confidence: Decimal
    matched_terms: list[str] = []


class LegalThemeTagWrite(BaseModel):
    """Editor-supplied theme write payload (no source — server sets editor)."""

    themes: list[LegalTheme]
