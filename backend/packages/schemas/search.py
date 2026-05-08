from __future__ import annotations

from typing import List

from pydantic import BaseModel

from packages.schemas.article import ArticleListItem
from packages.schemas.legal_text import LegalTextListItem


class SearchSnippet(BaseModel):
    """A matching article excerpt within a search hit."""

    article: ArticleListItem
    snippet_fr: str = ""
    snippet_ht: str = ""


class SearchHit(BaseModel):
    """One legal text + a few of its matching articles."""

    text: LegalTextListItem
    matched_articles: int = 0
    snippets: List[SearchSnippet] = []


class PaginatedSearchResponse(BaseModel):
    items: List[SearchHit]
    total: int
    page: int
    size: int
    query: str
