from typing import Optional

from fastapi import APIRouter, Query

from api.deps import CorpusServiceDep
from schemas.citation import CitationRead
from schemas.common import PaginatedResponse
from schemas.enums import CitationNodeType, CitationRelation

router = APIRouter(prefix="/citations", tags=["citations"])


@router.get("", response_model=PaginatedResponse[CitationRead])
def list_citations(
    service: CorpusServiceDep,
    source_type: Optional[CitationNodeType] = Query(
        None, description="Filter by source node type"
    ),
    source_id: Optional[int] = Query(
        None, description="Filter by source node id (combine with source_type)"
    ),
    target_type: Optional[CitationNodeType] = Query(
        None, description="Filter by target node type"
    ),
    target_id: Optional[int] = Query(
        None, description="Filter by target node id (combine with target_type)"
    ),
    relation: Optional[CitationRelation] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Polymorphic citation edges between articles, decisions, and legal texts.

    Common usage patterns:
      - Outgoing from an article: ?source_type=article&source_id=42
      - Incoming to an article:   ?target_type=article&target_id=42
      - All abrogation edges:     ?relation=abrogates
    """
    return service.list_citations(
        source_type=source_type,
        source_id=source_id,
        target_type=target_type,
        target_id=target_id,
        relation=relation,
        limit=limit,
        offset=offset,
    )
