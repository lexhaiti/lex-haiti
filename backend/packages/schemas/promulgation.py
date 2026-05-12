"""Pydantic schemas for the Promulgation entity.

A promulgation is the executive act by which the President (or ruling
council) orders a law adopted by Parliament to be sealed, printed,
published, and executed.  It appears in *Le Moniteur* but is *not* a
sommaire entry and *not* part of the law text body.

See ADR-002 for the full rationale.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Signer sub-schemas
# ---------------------------------------------------------------------------


class PromulgationSignerBase(BaseModel):
    """Fields shared by create and read shapes for a promulgation signer."""

    name: str = Field(..., description="Full name, e.g. 'Henri NAMPHY'")
    function_fr: Optional[str] = Field(
        default=None,
        description="French title, e.g. 'Président du CNG'",
    )
    function_ht: Optional[str] = Field(
        default=None,
        description="Kreyòl title, if available",
    )
    position: int = Field(
        default=0,
        description="Display order (0 = head of state, then ministers)",
    )


class PromulgationSignerCreate(PromulgationSignerBase):
    pass


class PromulgationSignerRead(PromulgationSignerBase):
    id: int
    promulgation_id: int

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Promulgation schemas
# ---------------------------------------------------------------------------


class PromulgationBase(BaseModel):
    """Editor-supplied metadata for a promulgation act."""

    content_fr: str = Field(
        ...,
        description="Full promulgation text (header + formula + location)",
    )
    content_ht: Optional[str] = Field(
        default=None,
        description="Kreyòl translation of the promulgation, if available",
    )
    promulgation_date: Optional[date] = Field(
        default=None,
        description="Date extracted from 'Donné au… le [date]'",
    )
    location: Optional[str] = Field(
        default=None,
        description="E.g. 'Palais National, Port-au-Prince'",
    )
    page_from: Optional[int] = None
    page_to: Optional[int] = None


class PromulgationCreate(PromulgationBase):
    """POST body — creates a promulgation linked to a Moniteur issue."""

    moniteur_issue_id: int
    legal_text_id: Optional[int] = Field(
        default=None,
        description="Nullable — can be linked later when the law is promoted",
    )
    signers: List[PromulgationSignerCreate] = Field(default_factory=list)


class PromulgationUpdate(BaseModel):
    """PATCH body — all fields optional."""

    content_fr: Optional[str] = None
    content_ht: Optional[str] = None
    promulgation_date: Optional[date] = None
    location: Optional[str] = None
    page_from: Optional[int] = None
    page_to: Optional[int] = None
    legal_text_id: Optional[int] = None
    signers: Optional[List[PromulgationSignerCreate]] = None


class PromulgationRead(PromulgationBase):
    """Response shape for a promulgation with nested signers."""

    id: int
    moniteur_issue_id: int
    legal_text_id: Optional[int] = None
    signers: List[PromulgationSignerRead] = []

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
