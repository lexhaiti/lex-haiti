"""Cross-entity search route — composes law search + Moniteur issue search.

The two domains live in independent bounded contexts (services.search and
services.ingestion are required to stay independent by the import-linter
contracts in pyproject.toml), so the composition happens here at the
api layer rather than inside either service.

Used by the landing-page hero search to send a visitor to a single
results page that surfaces both kinds of matches.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from api.deps import DbSession, SearchServiceDep
from packages.schemas.moniteur import MoniteurIssueRead
from packages.schemas.search import GlobalSearchResponse
from services.ingestion.moniteur.repository import MoniteurRepository

router = APIRouter(tags=["search"])


def _issue_to_read(issue) -> MoniteurIssueRead:
    """Bare-bones mapping for search results — skips the per-issue entry
    counts and sommaire that the dedicated /moniteur/issues endpoint
    computes, because search_issues doesn't eager-load entries (and
    nobody renders that detail in the search dropdown anyway)."""
    payload = MoniteurIssueRead.model_validate(issue)
    payload.entries_count = 0
    payload.accepted_count = 0
    payload.sommaire = []
    return payload


@router.get("/search", response_model=GlobalSearchResponse)
def global_search(
    db: DbSession,
    service: SearchServiceDep,
    q: str = Query(..., min_length=1, description="Free-text search query."),
    legal_text_limit: int = Query(10, ge=1, le=50),
    moniteur_issue_limit: int = Query(10, ge=1, le=50),
):
    """Single-call cross-entity search.

    Returns the top legal-text hits (with article snippets) and the top
    matching Moniteur issues. The frontend renders each list under its
    own section so the visitor can pick the right entity directly,
    without having to know in advance which kind of result they want.
    """
    q_clean = (q or "").strip()
    if not q_clean:
        return GlobalSearchResponse(
            query="",
            legal_texts=[],
            moniteur_issues=[],
            total_legal_texts=0,
            total_moniteur_issues=0,
        )

    # Law search — reuses the existing FTS pipeline (which now also
    # indexes slug, moniteur_ref, and the promoting Moniteur entry's
    # detected_number, so a query like "CL-007-09-09" lands on the
    # right text).
    text_results = service.search_texts(q_clean, limit=legal_text_limit, offset=0)

    # Moniteur issue search — straight ILIKE on number / edition label
    # / year. The corpus is small and these are short identifier-ish
    # strings, so FTS would be overkill.
    moniteur_repo = MoniteurRepository(db)
    issues, total_issues = moniteur_repo.search_issues(
        q_clean,
        limit=moniteur_issue_limit,
        published_only=True,
    )

    return GlobalSearchResponse(
        query=q_clean,
        legal_texts=text_results.items,
        moniteur_issues=[_issue_to_read(i) for i in issues],
        total_legal_texts=text_results.total,
        total_moniteur_issues=total_issues,
    )
