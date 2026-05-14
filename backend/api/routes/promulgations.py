"""Promulgation CRUD routes.

Promulgations are created by editors during Moniteur ingestion and
optionally linked to a LegalText when the law is promoted. Only
editorial users can write; public reads are open.

See ADR-002 for the full rationale.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from starlette.status import HTTP_404_NOT_FOUND, HTTP_409_CONFLICT

from api.deps import DbSession, EditorialUser
from schemas.promulgation import (
    PromulgationCreate,
    PromulgationRead,
    PromulgationUpdate,
)
from services.corpus.models import (
    MoniteurIssue,
    Promulgation,
    PromulgationSigner,
)

router = APIRouter(prefix="/promulgations", tags=["promulgations"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_EAGER = [selectinload(Promulgation.signers)]


def _get_or_404(db: Session, promulgation_id: int) -> Promulgation:
    stmt = (
        select(Promulgation)
        .options(*_EAGER)
        .where(Promulgation.id == promulgation_id)
    )
    prom = db.execute(stmt).scalar_one_or_none()
    if prom is None:
        raise HTTPException(HTTP_404_NOT_FOUND, "promulgation not found")
    return prom


def _sync_signers(
    db: Session, promulgation: Promulgation, signers_in
) -> None:
    """Replace all signers with the supplied list (delete + re-add)."""
    for old in list(promulgation.signers):
        db.delete(old)
    db.flush()
    for s in signers_in:
        db.add(
            PromulgationSigner(
                promulgation_id=promulgation.id,
                name=s.name,
                function_fr=s.function_fr,
                function_ht=s.function_ht,
                position=s.position,
            )
        )


# ---------------------------------------------------------------------------
# Public reads
# ---------------------------------------------------------------------------


@router.get("/{promulgation_id}", response_model=PromulgationRead)
def get_promulgation(promulgation_id: int, db: DbSession):
    """Get a single promulgation by ID."""
    return PromulgationRead.model_validate(_get_or_404(db, promulgation_id))


@router.get(
    "/by-issue/{issue_id}",
    response_model=List[PromulgationRead],
)
def list_by_issue(issue_id: int, db: DbSession):
    """All promulgations in a given Moniteur issue."""
    stmt = (
        select(Promulgation)
        .options(*_EAGER)
        .where(Promulgation.moniteur_issue_id == issue_id)
        .order_by(Promulgation.page_from.asc().nullslast(), Promulgation.id)
    )
    rows = db.execute(stmt).scalars().all()
    return [PromulgationRead.model_validate(r) for r in rows]


@router.get(
    "/by-legal-text/{legal_text_id}",
    response_model=Optional[PromulgationRead],
)
def get_by_legal_text(legal_text_id: int, db: DbSession):
    """The promulgation linked to a specific legal text, if any."""
    stmt = (
        select(Promulgation)
        .options(*_EAGER)
        .where(Promulgation.legal_text_id == legal_text_id)
    )
    row = db.execute(stmt).scalar_one_or_none()
    if row is None:
        return None
    return PromulgationRead.model_validate(row)


# ---------------------------------------------------------------------------
# Editorial writes
# ---------------------------------------------------------------------------


@router.post("", response_model=PromulgationRead, status_code=201)
def create_promulgation(
    body: PromulgationCreate,
    db: DbSession,
    _user: EditorialUser,
):
    """Create a new promulgation attached to a Moniteur issue."""
    # Verify the issue exists.
    if db.get(MoniteurIssue, body.moniteur_issue_id) is None:
        raise HTTPException(HTTP_404_NOT_FOUND, "moniteur issue not found")

    # Enforce uniqueness: one promulgation per legal text.
    if body.legal_text_id is not None:
        existing = db.execute(
            select(Promulgation).where(
                Promulgation.legal_text_id == body.legal_text_id
            )
        ).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(
                HTTP_409_CONFLICT,
                f"legal text {body.legal_text_id} already has promulgation {existing.id}",
            )

    prom = Promulgation(
        moniteur_issue_id=body.moniteur_issue_id,
        legal_text_id=body.legal_text_id,
        content_fr=body.content_fr,
        content_ht=body.content_ht,
        promulgation_date=body.promulgation_date,
        location=body.location,
        page_from=body.page_from,
        page_to=body.page_to,
    )
    db.add(prom)
    db.flush()

    for s in body.signers:
        db.add(
            PromulgationSigner(
                promulgation_id=prom.id,
                name=s.name,
                function_fr=s.function_fr,
                function_ht=s.function_ht,
                position=s.position,
            )
        )
    db.flush()

    # Re-fetch with eager-loaded signers for the response.
    return PromulgationRead.model_validate(_get_or_404(db, prom.id))


@router.patch("/{promulgation_id}", response_model=PromulgationRead)
def update_promulgation(
    promulgation_id: int,
    body: PromulgationUpdate,
    db: DbSession,
    _user: EditorialUser,
):
    """Update promulgation fields. Passing `signers` replaces them all."""
    prom = _get_or_404(db, promulgation_id)

    # Apply scalar updates.
    for field in (
        "content_fr",
        "content_ht",
        "promulgation_date",
        "location",
        "page_from",
        "page_to",
        "legal_text_id",
    ):
        value = getattr(body, field)
        if value is not None:
            setattr(prom, field, value)

    # Uniqueness check when re-linking.
    if body.legal_text_id is not None and body.legal_text_id != prom.legal_text_id:
        existing = db.execute(
            select(Promulgation).where(
                Promulgation.legal_text_id == body.legal_text_id,
                Promulgation.id != prom.id,
            )
        ).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(
                HTTP_409_CONFLICT,
                f"legal text {body.legal_text_id} already has promulgation {existing.id}",
            )

    if body.signers is not None:
        _sync_signers(db, prom, body.signers)

    db.flush()
    return PromulgationRead.model_validate(_get_or_404(db, prom.id))


@router.delete("/{promulgation_id}", status_code=204)
def delete_promulgation(
    promulgation_id: int,
    db: DbSession,
    _user: EditorialUser,
):
    """Remove a promulgation and its signers (cascade)."""
    prom = _get_or_404(db, promulgation_id)
    db.delete(prom)
    db.flush()
