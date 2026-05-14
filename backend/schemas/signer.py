from __future__ import annotations

from datetime import date
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from schemas.enums import SignatoryChamber, SigningCapacity


class LegalSignerBase(BaseModel):
    """Base shape — fields editable by the import parser and the editor.

    `function_fr` is the human-readable position ("Sénateur", "Ministre
    de la Justice", "Président Provisoire de la République"). Distinct
    from `signing_capacity` (the legal kind of signature) — see the
    enum's docstring for why both are needed.
    """

    name: str
    function_fr: str
    function_ht: Optional[str] = None
    signing_capacity: SigningCapacity = SigningCapacity.other
    chamber: Optional[SignatoryChamber] = None
    signed_at: Optional[date] = None
    position: int = 0


class LegalSignerCreate(LegalSignerBase):
    pass


class LegalSignerUpdate(BaseModel):
    """Editor-supplied patch for an existing signer row. Every field is
    optional — only the fields the editor actually changed are sent."""

    name: Optional[str] = None
    function_fr: Optional[str] = None
    function_ht: Optional[str] = None
    signing_capacity: Optional[SigningCapacity] = None
    chamber: Optional[SignatoryChamber] = None
    signed_at: Optional[date] = None
    position: Optional[int] = None


class LegalSignerRead(LegalSignerBase):
    id: int
    legal_text_id: int

    model_config = ConfigDict(from_attributes=True)


class LegalSignerBulkInput(BaseModel):
    """Editor-supplied JSON payload for the bulk-add endpoint.

    Use case: pasting a Constituante membership list (60+ signataires
    on the 1987 Constitution) is impractical row-by-row. The editor
    pastes a JSON array; each item is appended in order with
    auto-assigned positions starting from the current tail.

    Each entry accepts the same fields as ``LegalSignerCreate`` —
    only ``name`` and ``function_fr`` are required; everything else
    falls back to the defaults from ``LegalSignerBase`` (capacity =
    other, chamber = null, signed_at = null).
    """

    signers: List[LegalSignerCreate] = Field(..., min_length=1)
