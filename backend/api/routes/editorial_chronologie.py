"""Editorial routes for the Chronologie de la législation haïtienne.

The ``legislation_index_entries`` table (migration 0030) holds
historical references extracted from the 2001 Ministère de la
Justice ``Index Chronologique de la Législation Haïtienne
(1804-2000)``. The editorial UI is the only consumer for now —
public surfacing is intentionally deferred until enough entries
have been verified (``in_force_status != 'unknown'``).

Endpoints under the existing ``/editorial`` prefix:

  * ``GET    /editorial/chronologie/stats``  dashboard counters
  * ``GET    /editorial/chronologie``        paginated, filterable list
  * ``GET    /editorial/chronologie/{id}``   single entry
  * ``PATCH  /editorial/chronologie/{id}``   editor mutations
      — ``in_force_status``, ``in_force_notes``, ``notes``,
        ``legal_text_id`` (link to ingested text),
        ``moniteur_issue_id`` (link to a Moniteur issue).

The mutation payload deliberately omits index-derived fields
(``description_fr``, ``act_date``, ``moniteur_*``) — those are
seeded from the source PDF and re-running the seeder must not be
clobbered by hand-edits.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select

from api.deps import DbSession, EditorialUser
from schemas.enums import LegalCategory, LegislationInForceStatus
from services.corpus.models import (
    LegalText,
    LegislationIndexEntry,
    MoniteurIssue,
)


router = APIRouter(prefix="/editorial", tags=["editorial"])


# ----------------------------------------------------------------------
# Pydantic shapes
# ----------------------------------------------------------------------


class LegislationIndexEntryRead(BaseModel):
    """Editorial read shape for a chronologie row."""

    id: int
    source: str
    source_page: Optional[int] = None
    display_order: int
    chapter: Optional[str] = None
    section: Optional[str] = None
    description_fr: str
    detected_category: Optional[LegalCategory] = None
    act_date: Optional[date] = None
    act_date_raw: Optional[str] = None
    moniteur_number: Optional[str] = None
    moniteur_year: Optional[int] = None
    moniteur_date: Optional[date] = None
    moniteur_date_raw: Optional[str] = None
    in_force_status: LegislationInForceStatus
    in_force_notes: Optional[str] = None
    in_force_verified_at: Optional[datetime] = None
    notes: Optional[str] = None
    legal_text_id: Optional[int] = None
    moniteur_issue_id: Optional[int] = None

    # Hydrated link metadata so the UI can render the cross-link
    # without a second roundtrip per row.
    legal_text_slug: Optional[str] = None
    legal_text_title_fr: Optional[str] = None

    model_config = {"from_attributes": True}


class LegislationIndexEntryUpdate(BaseModel):
    """Editor-mutable subset. Anything not listed here is read-only."""

    in_force_status: Optional[LegislationInForceStatus] = None
    in_force_notes: Optional[str] = Field(default=None, max_length=4000)
    notes: Optional[str] = Field(default=None, max_length=4000)
    legal_text_id: Optional[int] = None
    moniteur_issue_id: Optional[int] = None


class LegislationIndexStats(BaseModel):
    """High-level counters for the chronologie dashboard."""

    total: int
    sections: int
    by_section: dict[str, int]
    by_in_force_status: dict[str, int]
    with_act_date: int
    with_moniteur_ref: int
    imported: int  # rows with legal_text_id set
    year_min: Optional[int] = None
    year_max: Optional[int] = None


class LegislationIndexListResponse(BaseModel):
    items: List[LegislationIndexEntryRead]
    total: int
    limit: int
    offset: int


# ----------------------------------------------------------------------
# Endpoints
# ----------------------------------------------------------------------


@router.get("/chronologie/stats", response_model=LegislationIndexStats)
def chronologie_stats(db: DbSession, user: EditorialUser):  # noqa: ARG001
    """Counters for the editorial chronologie dashboard."""
    total = db.scalar(select(func.count()).select_from(LegislationIndexEntry)) or 0
    rows = db.execute(
        select(
            LegislationIndexEntry.section,
            func.count(),
        ).group_by(LegislationIndexEntry.section)
    ).all()
    by_section = {row[0] or "(no section)": row[1] for row in rows}

    rows = db.execute(
        select(
            LegislationIndexEntry.in_force_status,
            func.count(),
        ).group_by(LegislationIndexEntry.in_force_status)
    ).all()
    by_status = {row[0].value: row[1] for row in rows}

    with_act_date = (
        db.scalar(
            select(func.count()).where(
                LegislationIndexEntry.act_date.is_not(None)
            )
        )
        or 0
    )
    with_moniteur_ref = (
        db.scalar(
            select(func.count()).where(
                LegislationIndexEntry.moniteur_number.is_not(None)
            )
        )
        or 0
    )
    imported = (
        db.scalar(
            select(func.count()).where(
                LegislationIndexEntry.legal_text_id.is_not(None)
            )
        )
        or 0
    )

    year_min, year_max = db.execute(
        select(
            func.min(func.extract("year", LegislationIndexEntry.act_date)),
            func.max(func.extract("year", LegislationIndexEntry.act_date)),
        )
    ).first() or (None, None)

    return LegislationIndexStats(
        total=total,
        sections=len([k for k in by_section if k != "(no section)"]),
        by_section=by_section,
        by_in_force_status=by_status,
        with_act_date=with_act_date,
        with_moniteur_ref=with_moniteur_ref,
        imported=imported,
        year_min=int(year_min) if year_min is not None else None,
        year_max=int(year_max) if year_max is not None else None,
    )


def _hydrate(rows: list[LegislationIndexEntry], db) -> list[LegislationIndexEntryRead]:
    """Attach the linked LegalText title/slug so the UI renders cross-links."""
    ids = {r.legal_text_id for r in rows if r.legal_text_id is not None}
    by_id: dict[int, LegalText] = {}
    if ids:
        for lt in db.scalars(select(LegalText).where(LegalText.id.in_(ids))).all():
            by_id[lt.id] = lt
    out: list[LegislationIndexEntryRead] = []
    for r in rows:
        item = LegislationIndexEntryRead.model_validate(r)
        if r.legal_text_id and r.legal_text_id in by_id:
            lt = by_id[r.legal_text_id]
            item.legal_text_slug = lt.slug
            item.legal_text_title_fr = lt.official_title_fr or lt.title_fr
        out.append(item)
    return out


@router.get("/chronologie", response_model=LegislationIndexListResponse)
def list_chronologie(
    db: DbSession,
    user: EditorialUser,  # noqa: ARG001
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    section: Optional[str] = None,
    in_force_status: Optional[LegislationInForceStatus] = None,
    year_from: Optional[int] = Query(None, ge=1700, le=2100),
    year_to: Optional[int] = Query(None, ge=1700, le=2100),
    only_imported: Optional[bool] = None,
    q: Optional[str] = Query(None, description="Substring search in description_fr"),
):
    """Filterable, paginated list of chronologie entries."""
    base = select(LegislationIndexEntry)
    count_base = select(func.count()).select_from(LegislationIndexEntry)

    filters = []
    if section is not None:
        filters.append(LegislationIndexEntry.section == section)
    if in_force_status is not None:
        filters.append(LegislationIndexEntry.in_force_status == in_force_status)
    if year_from is not None:
        filters.append(
            or_(
                LegislationIndexEntry.act_date.is_(None),
                func.extract("year", LegislationIndexEntry.act_date) >= year_from,
            )
            if year_from <= 1804
            else func.extract("year", LegislationIndexEntry.act_date) >= year_from
        )
    if year_to is not None:
        filters.append(
            func.extract("year", LegislationIndexEntry.act_date) <= year_to
        )
    if only_imported is True:
        filters.append(LegislationIndexEntry.legal_text_id.is_not(None))
    elif only_imported is False:
        filters.append(LegislationIndexEntry.legal_text_id.is_(None))
    if q:
        filters.append(LegislationIndexEntry.description_fr.ilike(f"%{q}%"))

    if filters:
        base = base.where(and_(*filters))
        count_base = count_base.where(and_(*filters))

    total = db.scalar(count_base) or 0
    rows = db.scalars(
        base.order_by(LegislationIndexEntry.display_order).limit(limit).offset(offset)
    ).all()

    return LegislationIndexListResponse(
        items=_hydrate(list(rows), db),
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/chronologie/{entry_id}", response_model=LegislationIndexEntryRead)
def get_chronologie_entry(
    entry_id: int, db: DbSession, user: EditorialUser  # noqa: ARG001
):
    row = db.get(LegislationIndexEntry, entry_id)
    if row is None:
        raise HTTPException(status_code=404, detail="entry not found")
    return _hydrate([row], db)[0]


@router.patch("/chronologie/{entry_id}", response_model=LegislationIndexEntryRead)
def update_chronologie_entry(
    entry_id: int,
    payload: LegislationIndexEntryUpdate,
    db: DbSession,
    user: EditorialUser,  # noqa: ARG001
):
    row = db.get(LegislationIndexEntry, entry_id)
    if row is None:
        raise HTTPException(status_code=404, detail="entry not found")

    if payload.legal_text_id is not None and payload.legal_text_id > 0:
        if db.get(LegalText, payload.legal_text_id) is None:
            raise HTTPException(
                status_code=400, detail="legal_text_id does not exist"
            )
    if payload.moniteur_issue_id is not None and payload.moniteur_issue_id > 0:
        if db.get(MoniteurIssue, payload.moniteur_issue_id) is None:
            raise HTTPException(
                status_code=400, detail="moniteur_issue_id does not exist"
            )

    data = payload.model_dump(exclude_unset=True)
    # ``legal_text_id`` / ``moniteur_issue_id`` set to 0 is the
    # "unlink" sentinel — translate to NULL.
    for fk in ("legal_text_id", "moniteur_issue_id"):
        if fk in data and data[fk] == 0:
            data[fk] = None

    status_changed = (
        "in_force_status" in data
        and data["in_force_status"] != row.in_force_status
    )

    for k, v in data.items():
        setattr(row, k, v)

    if status_changed:
        row.in_force_verified_at = datetime.utcnow()

    db.commit()
    db.refresh(row)
    return _hydrate([row], db)[0]
