from typing import List

from fastapi import APIRouter, Query

from api.deps import CorpusServiceDep
from packages.schemas.article import ArticleResolved, ArticleWithHistoryRead

router = APIRouter(prefix="/articles", tags=["articles"])


@router.get("/resolve", response_model=List[ArticleResolved])
def resolve_articles(
    service: CorpusServiceDep,
    ids: str = Query(
        ...,
        description="Comma-separated article IDs to look up. Max 100.",
    ),
):
    """Batch-resolve article IDs to their parent-text label + permalink.

    Drives the citation panel's cross-text label resolution — when an
    article cites another article from a different LegalText, the panel
    needs the parent text title to show "Code Civil — Article 1382"
    instead of the bare "Article #1234". Same-text resolution stays in
    the client (it already has the sibling list).
    """
    parts = [p.strip() for p in ids.split(",") if p.strip()]
    parsed: list[int] = []
    for p in parts[:100]:
        try:
            parsed.append(int(p))
        except ValueError:
            continue
    if not parsed:
        return []
    return service.resolve_articles(parsed)


@router.get("/{article_id}", response_model=ArticleWithHistoryRead)
def get_article(article_id: int, service: CorpusServiceDep):
    """Get an article with current version + full version history."""
    return service.get_article(article_id, with_history=True)
