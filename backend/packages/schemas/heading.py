from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict

from packages.schemas.enums import HeadingLevel


class LegalHeadingBase(BaseModel):
    key: str
    parent_key: Optional[str] = None
    level: HeadingLevel
    number: Optional[str] = None
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    content_fr: Optional[str] = None
    content_ht: Optional[str] = None
    position: int = 0


class LegalHeadingCreate(LegalHeadingBase):
    pass


class LegalHeadingRead(BaseModel):
    id: int
    legal_text_id: int
    parent_id: Optional[int] = None
    level: HeadingLevel
    key: str
    number: Optional[str] = None
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    content_fr: Optional[str] = None
    content_ht: Optional[str] = None
    position: int

    model_config = ConfigDict(from_attributes=True)


class TocNode(BaseModel):
    """Tree-shaped TOC node — used for the article reader sidebar."""

    id: int
    key: str
    level: HeadingLevel
    number: Optional[str] = None
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    content_fr: Optional[str] = None
    content_ht: Optional[str] = None
    position: int = 0
    children: List["TocNode"] = []
