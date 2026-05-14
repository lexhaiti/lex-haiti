from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel

from schemas.article import ArticleListItem
from schemas.legal_text import LegalTextListItem
from schemas.moniteur import MoniteurIssueRead


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


class AdvancedSearchCriterion(BaseModel):
    """One row of the advanced search form.

    The first criterion's `operator` is ignored (the UI hides the
    operator selector for the first row — there's nothing before it
    to connect to). All other operators bucket the row into the
    AND / OR / NOT group at composition time.
    """

    operator: str = "AND"  # "AND" | "OR" | "NOT"
    field: str = "all"  # "all" | "title" | "description"
    mode: str = "all"  # "all" | "exact" | "any" | "exclude"
    text: str


class AdvancedSearchInput(BaseModel):
    """Body of POST /legal-texts/advanced-search.

    Empty `text` rows are dropped server-side so the editor can keep a
    blank row in the UI without it killing the result set. All filters
    below are optional and mirror the simple `list_texts` GET endpoint.
    """

    criteria: List[AdvancedSearchCriterion] = []
    category: Optional[str] = None
    code_subcategory: Optional[str] = None
    status: Optional[str] = None
    year_from: Optional[int] = None
    year_to: Optional[int] = None
    sort: Optional[str] = None
    with_snippets: bool = False
    limit: int = 24
    offset: int = 0


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
