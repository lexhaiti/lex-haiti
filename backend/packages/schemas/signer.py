from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict


class LegalSignerBase(BaseModel):
    name: str
    function_fr: str
    function_ht: Optional[str] = None
    position: int = 0


class LegalSignerCreate(LegalSignerBase):
    pass


class LegalSignerRead(LegalSignerBase):
    id: int
    legal_text_id: int

    model_config = ConfigDict(from_attributes=True)
