from typing import Generic, List, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    size: int


class CorpusStats(BaseModel):
    """Public-facing corpus aggregates — drives the homepage stats strip.

    All counts are restricted to what the public site renders (i.e.,
    `editorial_status='published'` for legal texts and articles, and
    `processing_status='published'` for Moniteur issues), so the numbers
    a visitor sees on the homepage match what they'd find when browsing.
    """

    legal_texts: int
    articles: int
    moniteur_issues: int
