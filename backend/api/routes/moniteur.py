"""Moniteur ingestion pipeline routes.

Two halves:
  - PUBLIC reads — list/get issues for the homepage and /moniteur archive.
  - EDITOR writes — upload PDF, trigger parse, review candidates, promote.

The split lives in this single file (using `EditorialUser` dependency on
the writer endpoints) rather than a separate `moniteur_editor.py` because
the surface is small and the entity context is shared.
"""
from __future__ import annotations

import os
import re
import shutil
from datetime import date, datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session
from starlette.status import HTTP_404_NOT_FOUND, HTTP_409_CONFLICT

from api.deps import DbSession, EditorialUser
from packages.schemas.common import PaginatedResponse
from packages.schemas.enums import (
    LegalCategory,
    MoniteurCandidateStatus,
    MoniteurIssueStatus,
)
from packages.schemas.moniteur import (
    CandidateReviewInput,
    MoniteurIssueCreate,
    MoniteurIssueRead,
    MoniteurIssueUpdate,
    MoniteurIssueWithCandidates,
    MoniteurLawCandidateRead,
)
from services.ingestion.moniteur.repository import MoniteurRepository

router = APIRouter(prefix="/moniteur", tags=["moniteur"])


# ---------------------------------------------------------------------------
# File storage — local filesystem for v1. Swap to MinIO/S3 by replacing
# `_save_uploaded_pdf` and `_pdf_storage_root`.
# ---------------------------------------------------------------------------


def _pdf_storage_root() -> Path:
    """Where to write uploaded Moniteur PDFs.

    Defaults to `{cwd}/var/moniteur/`. Override with the
    `MONITEUR_PDF_DIR` env var when deploying.
    """
    raw = os.environ.get("MONITEUR_PDF_DIR")
    root = Path(raw) if raw else Path.cwd() / "var" / "moniteur"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_filename(year: int, number: str) -> str:
    """Slugify the (year, number) pair into a filesystem-safe stem."""
    safe_number = re.sub(r"[^\w-]+", "-", number).strip("-") or "issue"
    return f"moniteur-{year}-{safe_number}.pdf"


def _save_uploaded_pdf(upload: UploadFile, year: int, number: str) -> str:
    """Write the upload to disk and return its absolute path.

    Returned string is what we store in `moniteur_issues.file_url`. When
    we swap to s3 this becomes an `s3://...` URL.
    """
    target = _pdf_storage_root() / _safe_filename(year, number)
    with target.open("wb") as fh:
        shutil.copyfileobj(upload.file, fh)
    return str(target)


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def _to_read(issue) -> MoniteurIssueRead:
    payload = MoniteurIssueRead.model_validate(issue)
    payload.candidates_count = len(getattr(issue, "candidates", []) or [])
    payload.accepted_count = sum(
        1
        for c in (getattr(issue, "candidates", []) or [])
        if c.review_status == MoniteurCandidateStatus.accepted
    )
    return payload


# ---------------------------------------------------------------------------
# Public reads
# ---------------------------------------------------------------------------


@router.get("/issues", response_model=PaginatedResponse[MoniteurIssueRead])
def list_issues(
    db: DbSession,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    only_published: bool = Query(
        True,
        description=(
            "Public mode (default): only return issues that have at least "
            "one published LegalText. Editors call with false to see drafts."
        ),
    ),
):
    """List Moniteur issues, newest first."""
    repo = MoniteurRepository(db)
    rows, total = repo.list_issues(
        limit=limit,
        offset=offset,
        published_only=only_published,
    )
    items = [_to_read(r) for r in rows]
    return PaginatedResponse(
        items=items,
        total=total,
        page=(offset // max(limit, 1)) + 1,
        size=limit,
    )


@router.get(
    "/issues/{issue_id}",
    response_model=MoniteurIssueWithCandidates,
)
def get_issue(issue_id: int, db: DbSession):
    """Full issue + candidates payload."""
    repo = MoniteurRepository(db)
    issue = repo.get_issue_with_candidates(issue_id)
    if not issue:
        raise HTTPException(HTTP_404_NOT_FOUND, "Moniteur issue not found")
    payload = MoniteurIssueWithCandidates.model_validate(issue)
    payload.candidates_count = len(issue.candidates)
    payload.accepted_count = sum(
        1
        for c in issue.candidates
        if c.review_status == MoniteurCandidateStatus.accepted
    )
    payload.candidates = [
        MoniteurLawCandidateRead.model_validate(c) for c in issue.candidates
    ]
    return payload


# ---------------------------------------------------------------------------
# Editor writes (require sign-in + editor role)
# ---------------------------------------------------------------------------


@router.post("/extract-metadata")
def extract_metadata_from_pdf(
    db: DbSession,  # noqa: ARG001 — kept for parity with other writes
    user: EditorialUser,  # noqa: ARG001 — gate behind editor session
    file: UploadFile = File(...),
):
    """Preview the issue metadata for an uploaded Moniteur PDF.

    Saves the upload to a temp path, runs the cover-page extractor (OCR
    + regex over the first 1-2 pages), returns proposed `number / year /
    publication_date / edition_label` plus per-field confidence. **Does
    not create a DB row** — the editor reviews the proposal in the UI,
    edits, then submits the actual create-issue + upload + parse flow.
    """
    import tempfile
    from services.ingestion.moniteur.metadata import extract_issue_metadata

    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(400, "Only .pdf files are accepted")

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    try:
        md = extract_issue_metadata(tmp_path)
    except Exception as e:  # noqa: BLE001 — surface the actual cause to the editor
        import logging
        logging.getLogger(__name__).exception("metadata extraction failed")
        raise HTTPException(500, f"Extraction failed: {type(e).__name__}: {e}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    return {
        "number": md.number,
        "year": md.year,
        "publication_date": (
            md.publication_date.isoformat() if md.publication_date else None
        ),
        "edition_label": md.edition_label,
        "confidence": md.confidence,
    }


@router.post(
    "/issues",
    response_model=MoniteurIssueRead,
    status_code=201,
)
def create_issue(
    payload: MoniteurIssueCreate,
    db: DbSession,
    user: EditorialUser,
):
    """Create a new Moniteur issue (metadata only — upload happens next)."""
    repo = MoniteurRepository(db)
    try:
        issue = repo.create_issue(
            number=payload.number,
            year=payload.year,
            publication_date=payload.publication_date,
            edition_label=payload.edition_label,
            uploaded_by=user.id,
        )
        db.commit()
    except Exception as e:  # noqa: BLE001 — convert unique-violation to 409
        db.rollback()
        msg = str(e).lower()
        if "uq_moniteur_issues_year_number" in msg or "unique" in msg:
            raise HTTPException(
                HTTP_409_CONFLICT,
                f"Moniteur issue {payload.year} n° {payload.number} already exists",
            )
        raise
    return _to_read(issue)


@router.patch("/issues/{issue_id}", response_model=MoniteurIssueRead)
def update_issue(
    issue_id: int,
    payload: MoniteurIssueUpdate,
    db: DbSession,
    user: EditorialUser,
):
    repo = MoniteurRepository(db)
    issue = repo.get_issue(issue_id)
    if not issue:
        raise HTTPException(HTTP_404_NOT_FOUND, "Moniteur issue not found")
    fields = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if fields:
        repo.update_issue(issue, **fields)
    db.commit()
    db.refresh(issue)
    return _to_read(issue)


@router.delete("/issues/{issue_id}", status_code=204)
def delete_issue(
    issue_id: int,
    db: DbSession,
    user: EditorialUser,  # noqa: ARG001 — gate behind editor session
):
    """Hard-delete a Moniteur issue plus its candidates and uploaded PDF.

    Useful when the editor uploads the wrong file or wants to re-test the
    pipeline. Cascades to `moniteur_law_candidates` via the FK definition;
    the on-disk PDF is unlinked best-effort.
    """
    repo = MoniteurRepository(db)
    issue = repo.get_issue(issue_id)
    if not issue:
        raise HTTPException(HTTP_404_NOT_FOUND, "Moniteur issue not found")
    file_url = issue.file_url
    db.delete(issue)
    db.commit()
    if file_url and os.path.exists(file_url):
        try:
            os.unlink(file_url)
        except OSError:
            pass  # Stale file is harmless; DB row is already gone.
    return None


@router.post(
    "/issues/{issue_id}/upload",
    response_model=MoniteurIssueRead,
)
def upload_pdf(
    issue_id: int,
    db: DbSession,
    user: EditorialUser,
    file: UploadFile = File(...),
):
    """Attach (or replace) the source PDF for an issue."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only .pdf uploads are accepted")

    repo = MoniteurRepository(db)
    issue = repo.get_issue(issue_id)
    if not issue:
        raise HTTPException(HTTP_404_NOT_FOUND, "Moniteur issue not found")

    file_path = _save_uploaded_pdf(file, issue.year, issue.number)
    repo.attach_file(issue, file_url=file_path, page_count=None)
    db.commit()
    db.refresh(issue)
    return _to_read(issue)


@router.post(
    "/issues/{issue_id}/parse",
    response_model=MoniteurIssueWithCandidates,
)
def parse_issue(
    issue_id: int,
    db: DbSession,
    user: EditorialUser,
):
    """Enqueue OCR + heuristic parsing for the issue.

    Returns the issue immediately with `processing_status='ocr_pending'`.
    The actual work runs in the RQ worker; the editor polls the issue's
    status to see candidates land. For the rare degenerate case where
    Redis is down, we fall through to a synchronous in-request parse
    (1-page text-layered PDFs work fine; large scans will time out).
    """
    repo = MoniteurRepository(db)
    issue = repo.get_issue(issue_id)
    if not issue:
        raise HTTPException(HTTP_404_NOT_FOUND, "Moniteur issue not found")
    if not issue.file_url:
        raise HTTPException(400, "No file uploaded for this issue.")

    # Mark `ocr_pending` immediately so the dashboard reflects "queued"
    # before the worker picks it up. The worker overwrites this on
    # success/failure; if it never runs (Redis down), the row is at
    # least honest.
    issue.processing_status = MoniteurIssueStatus.ocr_pending
    issue.processing_error = None
    db.commit()

    try:
        from workers.queue import get_queue
        from workers.jobs import parse_moniteur_issue

        get_queue().enqueue(parse_moniteur_issue, issue_id, job_timeout=60 * 60)
    except Exception as e:  # noqa: BLE001
        # Redis unreachable / RQ broken — fall back to synchronous parse
        # so a one-off dev session without Redis still works on small PDFs.
        # Big scans will exceed the HTTP timeout; that's acceptable for the
        # fallback path since the deploy environment always has Redis up.
        import logging
        logging.getLogger(__name__).warning(
            "RQ enqueue failed (%s) — running parse synchronously", e
        )
        try:
            repo.run_parse_for_issue(issue)
            db.commit()
        except Exception:
            db.rollback()
            raise

    full = repo.get_issue_with_candidates(issue.id)
    payload = MoniteurIssueWithCandidates.model_validate(full)
    payload.candidates_count = len(full.candidates)
    payload.accepted_count = sum(
        1
        for c in full.candidates
        if c.review_status == MoniteurCandidateStatus.accepted
    )
    payload.candidates = [
        MoniteurLawCandidateRead.model_validate(c) for c in full.candidates
    ]
    return payload


@router.patch(
    "/candidates/{candidate_id}",
    response_model=MoniteurLawCandidateRead,
)
def review_candidate(
    candidate_id: int,
    payload: CandidateReviewInput,
    db: DbSession,
    user: EditorialUser,
):
    """Editor's verdict on a candidate.

    For `accepted`, prefer the dedicated `/promote` endpoint which also
    creates the LegalText. This endpoint just updates review fields.
    """
    repo = MoniteurRepository(db)
    candidate = repo.get_candidate(candidate_id)
    if not candidate:
        raise HTTPException(HTTP_404_NOT_FOUND, "Candidate not found")

    # Apply detected-field overrides if supplied.
    for k in (
        "detected_category",
        "detected_title",
        "display_title",
        "detected_number",
        "detected_date",
        "parent_candidate_id",
    ):
        v = getattr(payload, k)
        if v is not None:
            setattr(candidate, k, v)

    # Only touch review state when the editor explicitly changed it. This
    # lets the inline "Edit fields" UI patch detected_* without flipping
    # the candidate from `pending` to something else accidentally.
    if payload.review_status is not None:
        repo.update_candidate_review(
            candidate,
            review_status=payload.review_status,
            review_notes=payload.review_notes,
        )
    elif payload.review_notes is not None:
        candidate.review_notes = payload.review_notes
    db.commit()
    db.refresh(candidate)
    return MoniteurLawCandidateRead.model_validate(candidate)


@router.post(
    "/candidates/{candidate_id}/promote",
    response_model=MoniteurLawCandidateRead,
)
def promote_candidate(
    candidate_id: int,
    db: DbSession,
    user: EditorialUser,
):
    """Promote a candidate to a draft `LegalText`.

    Uses the candidate's editor-corrected fields (title / category / date /
    number) to create the LegalText with `editorial_status='draft'`. The
    editor still has to publish it from the regular law-edit flow before
    it appears on /lois.
    """
    repo = MoniteurRepository(db)
    candidate = repo.get_candidate(candidate_id)
    if not candidate:
        raise HTTPException(HTTP_404_NOT_FOUND, "Candidate not found")

    if not candidate.detected_title:
        raise HTTPException(
            400, "Candidate has no title — set one before promoting."
        )
    if not candidate.detected_category:
        raise HTTPException(
            400, "Candidate has no category — set one before promoting."
        )

    slug = _slugify(
        candidate.detected_title,
        fallback=f"moniteur-{candidate.issue_id}-cand-{candidate.id}",
    )

    # Avoid slug collisions with existing texts.
    from sqlalchemy import select
    from services.corpus.models import LegalText

    counter = 0
    candidate_slug = slug
    while db.execute(
        select(LegalText.id).where(LegalText.slug == candidate_slug)
    ).first():
        counter += 1
        candidate_slug = f"{slug}-{counter}"

    repo.promote_candidate(
        candidate,
        slug=candidate_slug,
        title_fr=candidate.detected_title,
        category=candidate.detected_category,
        publication_date=candidate.detected_date,
    )
    db.commit()
    db.refresh(candidate)
    return MoniteurLawCandidateRead.model_validate(candidate)


def _slugify(text: str, *, fallback: str) -> str:
    s = text.lower()
    s = re.sub(r"[àâäéèêëîïôöùûüÿç]", lambda m: _STRIP[m.group()], s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:80] or fallback


_STRIP = {
    "à": "a", "â": "a", "ä": "a", "é": "e", "è": "e", "ê": "e", "ë": "e",
    "î": "i", "ï": "i", "ô": "o", "ö": "o", "ù": "u", "û": "u", "ü": "u",
    "ÿ": "y", "ç": "c",
}
