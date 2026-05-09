from __future__ import annotations

from typing import List

from pydantic import BaseModel

from packages.schemas.article import ArticleListItem
from packages.schemas.legal_text import LegalTextListItem
from packages.schemas.moniteur import MoniteurIssueRead


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


class GlobalSearchResponse(BaseModel):
    """Cross-entity search results for the landing-page search bar.

    Returns ranked legal-text hits (with their matched-article snippets,
    same shape as the dedicated /legal-texts/search endpoint) plus the
    Moniteur issues whose number / edition label / year matched the
    query. The frontend renders each list under its own section so the
    user can pick the right entity directly.
    """

    query: str
    legal_texts: List[SearchHit]
    moniteur_issues: List[MoniteurIssueRead]
    total_legal_texts: int
    total_moniteur_issues: int
