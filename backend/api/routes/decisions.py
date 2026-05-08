from datetime import date
from typing import Optional

from fastapi import APIRouter, Query

from api.deps import CorpusServiceDep
from packages.schemas.common import PaginatedResponse
from packages.schemas.decision import DecisionListItem, DecisionRead
from packages.schemas.enums import CourtType

router = APIRouter(prefix="/decisions", tags=["decisions"])


@router.get("", response_model=PaginatedResponse[DecisionListItem])
def list_decisions(
    service: CorpusServiceDep,
    q: Optional[str] = Query(
        None, description="Search summary, headnotes, case number"
    ),
    court: Optional[CourtType] = None,
    date_from: Optional[date] = Query(None, alias="from"),
    date_to: Optional[date] = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    return service.list_decisions(
        q=q,
        court=court,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@router.get("/{slug}", response_model=DecisionRead)
def get_decision(slug: str, service: CorpusServiceDep):
    return service.get_decision_by_slug(slug)
