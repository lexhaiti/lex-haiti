from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict

from packages.schemas.enums import SignatoryChamber, SigningCapacity


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


class LegalSignerRead(LegalSignerBase):
    id: int
    legal_text_id: int

    model_config = ConfigDict(from_attributes=True)
