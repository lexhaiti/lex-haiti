"""Moniteur ingestion pipeline routes.

Two halves:
  - PUBLIC reads — list/get issues for the homepage and /moniteur archive.
  - EDITOR writes — upload PDF, trigger parse, review entries, promote.

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
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy.orm import selectinload
from starlette.status import HTTP_404_NOT_FOUND, HTTP_409_CONFLICT

from api.deps import DbSession, EditorialUser
from schemas.common import PaginatedResponse
from schemas.enums import (
    LegalCategory,
    MoniteurCandidateStatus,
    MoniteurIssueStatus,
    PROMOTABLE_TYPES,
)
from schemas.moniteur import (
    EntryReviewInput,
    MoniteurEntryParserProfileUpdate,
    MoniteurEntryRead,
    MoniteurEntryTranslationUpdate,
    MoniteurIssueCreate,
    MoniteurIssueRead,
    MoniteurIssueUpdate,
    MoniteurIssueWithEntries,
    MoniteurJsonImport,
    SommaireBulkInput,
    SommaireEntry,
    TranscriptArticlePreview,
    TranscriptPreview,
    TranscriptPreviewInput,
)
from api.config import get_settings
from services.ingestion.article_split import split_into_articles, split_preamble
from services.ingestion.moniteur.export import render_issue_pdf
from services.ingestion.moniteur.repository import MoniteurRepository

router = APIRouter(prefix="/moniteur", tags=["moniteur"])


# ---------------------------------------------------------------------------
# File storage — local filesystem for v1. Swap to MinIO/S3 by replacing
# `_save_uploaded_file` and `_file_storage_root`.
# ---------------------------------------------------------------------------

_ACCEPTED_EXTENSIONS = (".pdf", ".docx")


def _file_storage_root() -> Path:
    """Where to write uploaded Moniteur files (PDF or DOCX).

    Defaults to `{cwd}/var/moniteur/`. Override with the
    `MONITEUR_PDF_DIR` env var when deploying.
    """
    raw = os.environ.get("MONITEUR_PDF_DIR")
    root = Path(raw) if raw else Path.cwd() / "var" / "moniteur"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _is_within(child: Path, parent: Path) -> bool:
    """True iff ``child`` resolves to a path inside ``parent``. Both
    paths must already be ``.resolve()``-d by the caller. Used as the
    path-traversal guard on the scan-download endpoint."""
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def _static_scans_root() -> Path:
    """Where committed historical Moniteur scans live.

    Distinct from ``_file_storage_root()`` (which is ephemeral and
    holds editor-uploaded files) — this is the path the Docker image
    bakes-in for archival historical PDFs (e.g. N° 36 / N° 36-A
    Constitution scans). Resolves to ``backend/data/scans/`` at the
    repo root locally, and to ``/app/data/scans/`` inside the
    container. Override with the ``STATIC_SCANS_DIR`` env var when
    pointing at a mounted volume or future Blob mount.
    """
    raw = os.environ.get("STATIC_SCANS_DIR")
    if raw:
        return Path(raw)
    # ``api/routes/moniteur.py`` → repo backend root is parent.parent.parent
    here = Path(__file__).resolve()
    return here.parent.parent.parent / "data" / "scans"


def _safe_filename(year: int, number: str, suffix: str = ".pdf") -> str:
    """Slugify the (year, number) pair into a filesystem-safe stem."""
    safe_number = re.sub(r"[^\w-]+", "-", number).strip("-") or "issue"
    return f"moniteur-{year}-{safe_number}{suffix}"


def _upload_suffix(filename: str | None) -> str:
    """Return the lowercased extension of an upload, or raise 400."""
    ext = Path(filename or "").suffix.lower()
    if ext not in _ACCEPTED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Accepted formats: {', '.join(_ACCEPTED_EXTENSIONS)}. Got: {ext or '(none)'}",
        )
    return ext


def _save_uploaded_file(upload: UploadFile, year: int, number: str) -> str:
    """Write the upload to disk and return its absolute path.

    Returned string is what we store in `moniteur_issues.file_url`. When
    we swap to s3 this becomes an `s3://...` URL.
    """
    ext = _upload_suffix(upload.filename)
    target = _file_storage_root() / _safe_filename(year, number, suffix=ext)
    with target.open("wb") as fh:
        shutil.copyfileobj(upload.file, fh)
    return str(target)


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def _to_read(issue) -> MoniteurIssueRead:
    payload = MoniteurIssueRead.model_validate(issue)
    entries = getattr(issue, "entries", []) or []
    payload.entries_count = len(entries)
    payload.accepted_count = sum(
        1 for e in entries
        if e.review_status == MoniteurCandidateStatus.accepted
    )
    payload.sommaire = [
        SommaireEntry(
            category=e.detected_category,
            number=e.detected_number,
            title=e.display_title or e.detected_title,
            promoted_slug=getattr(
                getattr(e, "promoted_legal_text", None), "slug", None
            ),
        )
        for e in entries
        if not e.parent_entry_id
    ]
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
    response_model=MoniteurIssueWithEntries,
)
def get_issue(issue_id: int, db: DbSession):
    """Full issue + entries payload."""
    repo = MoniteurRepository(db)
    issue = repo.get_issue_with_entries(issue_id)
    if not issue:
        raise HTTPException(HTTP_404_NOT_FOUND, "Moniteur issue not found")
    payload = MoniteurIssueWithEntries.model_validate(issue)
    payload.entries_count = len(issue.entries)
    payload.accepted_count = sum(
        1
        for e in issue.entries
        if e.review_status == MoniteurCandidateStatus.accepted
    )
    payload.entries = [
        MoniteurEntryRead.model_validate(e) for e in issue.entries
    ]
    return payload


@router.get(
    "/issues/by-slug/{slug}",
    response_model=MoniteurIssueWithEntries,
)
def get_issue_by_slug(slug: str, db: DbSession):
    """Resolve a date-based slug (``28-avril-1987``) to the full issue
    payload. Used by the public ``/moniteur/{slug}`` route — the
    numeric-ID route at ``/issues/{issue_id}`` keeps working as a
    permalink, but the public link generation now prefers the
    human-readable slug.
    """
    repo = MoniteurRepository(db)
    issue = repo.get_issue_by_slug_with_entries(slug)
    if not issue:
        raise HTTPException(HTTP_404_NOT_FOUND, "Moniteur issue not found")
    payload = MoniteurIssueWithEntries.model_validate(issue)
    payload.entries_count = len(issue.entries)
    payload.accepted_count = sum(
        1
        for e in issue.entries
        if e.review_status == MoniteurCandidateStatus.accepted
    )
    payload.entries = [
        MoniteurEntryRead.model_validate(e) for e in issue.entries
    ]
    return payload


@router.get(
    "/issues/{issue_id}/export",
    response_class=Response,
)
def export_issue_pdf(issue_id: int, db: DbSession):
    """LexHaïti-branded PDF of the Moniteur issue.

    Cover page → sommaire → one section per top-level entry. The PDF
    carries the lexhaiti.org permalink so a printed copy is always
    traceable back to the canonical web version. Public read — no
    auth needed; the page is also publicly browsable.
    """
    repo = MoniteurRepository(db)
    issue = repo.get_issue_with_entries(issue_id)
    if not issue:
        raise HTTPException(HTTP_404_NOT_FOUND, "Moniteur issue not found")

    payload = render_issue_pdf(
        issue, base_url=get_settings().public_site_url
    )
    safe_number = "".join(
        c if c.isalnum() else "-" for c in (issue.number or "")
    ).strip("-") or str(issue.id)
    filename = f"lexhaiti-moniteur-{safe_number}-{issue.year}.pdf"
    return Response(
        content=payload,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "public, max-age=300",
        },
    )


# ---------------------------------------------------------------------------
# Editor writes (require sign-in + editor role)
# ---------------------------------------------------------------------------


@router.post("/extract-metadata")
def extract_metadata(
    db: DbSession,  # noqa: ARG001 — kept for parity with other writes
    user: EditorialUser,  # noqa: ARG001 — gate behind editor session
    file: UploadFile = File(...),
):
    """Preview the issue metadata for an uploaded Moniteur file (PDF or DOCX).

    Saves the upload to a temp path, runs the cover-page extractor (OCR
    + regex over the first 1-2 pages), returns proposed `number / year /
    publication_date / edition_label` plus per-field confidence. **Does
    not create a DB row** — the editor reviews the proposal in the UI,
    edits, then submits the actual create-issue + upload + parse flow.
    """
    import tempfile
    from services.ingestion.moniteur.metadata import (
        extract_issue_metadata,
        extract_issue_metadata_from_text,
    )

    ext = _upload_suffix(file.filename)

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    try:
        if ext == ".docx":
            md = extract_issue_metadata_from_text(tmp_path)
        else:
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
        "director": md.director,
        "director_role": md.director_role,
        "confidence": md.confidence,
        "suggested_sommaire": [
            {
                "detected_category": s.detected_category,
                "detected_title": s.detected_title,
                "detected_number": s.detected_number,
                "page_from": s.page_from,
                "page_to": s.page_to,
            }
            for s in md.suggested_sommaire
        ],
    }


@router.post(
    "/issues/import-json",
    response_model=MoniteurIssueRead,
    status_code=201,
    summary="JSON-import a Moniteur issue (dev path, bypasses OCR)",
)
def import_issue_from_json(
    payload: MoniteurJsonImport,
    db: DbSession,
    user: EditorialUser,
):
    """Create or update a Moniteur issue + its entries from a
    structured JSON payload, bypassing the OCR / heuristic-parser
    pipeline.

    Idempotent on ``(year, number)``: re-importing the same issue
    updates its metadata in place and replaces the pending entries
    (promoted rows survive). The issue lands at
    ``processing_status='parsed'`` so editors can review and promote
    via the standard review page.

    When an entry carries an inline ``content`` block (a full
    structured ``JsonImportLegalText``), it is auto-promoted to a
    draft ``LegalText`` in the same transaction — no editorial
    review needed before promotion. The issue lifecycle still rolls
    forward via ``recompute_issue_status`` so a fully-populated
    payload lands on ``published`` (draft texts) without manual
    intervention.

    Intended for devs / batch importers — the UI counterpart on
    ``/editorial/import?type=json`` posts the same body.
    """
    repo = MoniteurRepository(db)
    # Strip the inline ``content`` block before handing entries to
    # the repository — MoniteurEntry has no column for it; the
    # promotion loop below uses the payload's typed shape instead.
    entry_dicts = [
        e.model_dump(exclude={"content"}) for e in payload.entries
    ]
    issue = repo.import_from_json(
        issue_data=payload.issue.model_dump(),
        entries=entry_dicts,
        uploaded_by=user.id,
    )

    # Auto-promote entries that carry a full ``content`` block. Match
    # payload entries to DB rows by position — both lists are in the
    # same order because the repo appends with ``position=i``.
    full = repo.get_issue_with_entries(issue.id)
    if full is not None:
        by_position = {e.position: e for e in full.entries}
        for i, payload_entry in enumerate(payload.entries):
            if payload_entry.content is None:
                continue
            db_entry = by_position.get(i)
            if db_entry is None or db_entry.promoted_legal_text_id is not None:
                continue
            repo.auto_promote_from_content(
                db_entry,
                payload_entry.content.model_dump(),
                actor=user,
            )

    db.commit()
    db.refresh(issue)
    return _to_read(issue)


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
            director=payload.director,
            director_role=payload.director_role,
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
    """Hard-delete a Moniteur issue plus its entries and uploaded PDF.

    Useful when the editor uploads the wrong file or wants to re-test the
    pipeline. Cascades to `moniteur_entries` via the FK definition;
    the on-disk PDF is unlinked best-effort.
    """
    repo = MoniteurRepository(db)
    issue = repo.get_issue(issue_id)
    if not issue:
        raise HTTPException(HTTP_404_NOT_FOUND, "Moniteur issue not found")
    file_url = issue.file_url
    transcript_url = issue.transcript_url
    db.delete(issue)
    db.commit()
    for path in (file_url, transcript_url):
        if path and os.path.exists(path):
            try:
                os.unlink(path)
            except OSError:
                pass  # Stale file is harmless; DB row is already gone.
    return None


@router.delete("/entries/{entry_id}", status_code=204)
def delete_entry(
    entry_id: int,
    db: DbSession,
    user: EditorialUser,  # noqa: ARG001 — gate behind editor session
):
    """Hard-delete a single moniteur entry. Used by the editor to drop
    promulgation / companion rows that don't belong, or to detach an
    over-eager parser candidate. Does NOT cascade to the promoted
    ``legal_text`` — that text continues to exist independently; only
    the bridge row in this issue's sommaire is removed.

    Returns 204 No Content on success, 404 if the entry doesn't exist.
    """
    repo = MoniteurRepository(db)
    entry = repo.get_entry(entry_id)
    if not entry:
        raise HTTPException(HTTP_404_NOT_FOUND, "Moniteur entry not found")
    db.delete(entry)
    db.commit()
    return None


@router.get("/issues/{issue_id}/scan")
def download_issue_scan(issue_id: int, db: DbSession):
    """Stream the original scanned PDF for this Moniteur issue.

    Public endpoint — anyone can download the source document of a
    published issue. ``moniteur_issues.file_url`` can be one of:
      * a full ``http(s)://…`` URL — we 302 to it so the caller hits
        the CDN / Azure Blob directly without proxying the bytes.
      * an absolute filesystem path — we serve it via ``FileResponse``.
        Only paths that resolve inside ``MONITEUR_PDF_DIR`` are accepted
        (defence against ``../`` traversal if someone ever pokes the
        column manually).
      * NULL — 404.

    Filename in the ``Content-Disposition`` header is
    ``lexhaiti-moniteur-{number}-{year}.pdf`` so readers' Downloads
    folder reads cleanly. Same shape used by the structured PDF
    export elsewhere.
    """
    repo = MoniteurRepository(db)
    issue = repo.get_issue(issue_id)
    if not issue:
        raise HTTPException(HTTP_404_NOT_FOUND, "Moniteur issue not found")
    if not issue.file_url:
        raise HTTPException(HTTP_404_NOT_FOUND, "No scan attached to this issue.")

    # Remote URL → redirect. Keeps the proxy off the request path
    # when the PDF lives in Azure Blob / B2 / a CDN.
    if issue.file_url.startswith(("http://", "https://")):
        return Response(
            status_code=302,
            headers={"Location": issue.file_url},
        )

    allowed_roots = [
        _file_storage_root().resolve(),
        _static_scans_root().resolve(),
    ]
    target = Path(issue.file_url).resolve()
    # Path-traversal guard: the resolved file must live inside one of
    # the configured roots. Lets the editor-upload directory and the
    # baked-in historical-scans directory both serve, while blocking
    # any ``../`` poking if someone ever sets ``file_url`` by hand.
    if not any(_is_within(target, root) for root in allowed_roots):
        raise HTTPException(
            500,
            "Stored file_url points outside the configured scan roots. "
            "Re-upload via the editor or fix the path manually.",
        )
    if not target.exists():
        raise HTTPException(
            HTTP_404_NOT_FOUND,
            f"Scan file is missing on disk: {target.name}",
        )

    safe_number = re.sub(r"[^\w-]+", "-", issue.number).strip("-") or "issue"
    download_name = f"lexhaiti-moniteur-{safe_number}-{issue.year}.pdf"
    return FileResponse(
        path=target,
        media_type="application/pdf",
        filename=download_name,
    )


@router.post(
    "/issues/{issue_id}/upload",
    response_model=MoniteurIssueRead,
)
def upload_file(
    issue_id: int,
    db: DbSession,
    user: EditorialUser,
    file: UploadFile = File(...),
):
    """Attach (or replace) the source file (PDF or DOCX) for an issue."""
    _upload_suffix(file.filename)  # validates extension; raises 400 if bad

    repo = MoniteurRepository(db)
    issue = repo.get_issue(issue_id)
    if not issue:
        raise HTTPException(HTTP_404_NOT_FOUND, "Moniteur issue not found")

    file_path = _save_uploaded_file(file, issue.year, issue.number)
    repo.attach_file(issue, file_url=file_path, page_count=None)
    db.commit()
    db.refresh(issue)
    return _to_read(issue)


@router.post(
    "/issues/{issue_id}/upload-transcript",
    response_model=MoniteurIssueRead,
)
def upload_transcript(
    issue_id: int,
    db: DbSession,
    user: EditorialUser,
    file: UploadFile = File(...),
):
    """Attach a pre-transcribed version of the Moniteur file.

    When present, the parse pipeline reads text from this file instead of
    running OCR on the original scan — useful when the editor already has
    a clean PDF/DOCX transcription. Pass a new file to replace; the
    previous transcript is overwritten on disk.
    """
    ext = _upload_suffix(file.filename)  # validates PDF/DOCX

    repo = MoniteurRepository(db)
    issue = repo.get_issue(issue_id)
    if not issue:
        raise HTTPException(HTTP_404_NOT_FOUND, "Moniteur issue not found")

    target = _file_storage_root() / _safe_filename(
        issue.year, issue.number, suffix=f"-transcript{ext}"
    )
    with target.open("wb") as fh:
        shutil.copyfileobj(file.file, fh)
    issue.transcript_url = str(target)
    db.commit()
    db.refresh(issue)
    return _to_read(issue)


@router.post(
    "/issues/{issue_id}/sommaire",
    response_model=MoniteurIssueWithEntries,
)
def set_sommaire(
    issue_id: int,
    payload: SommaireBulkInput,
    db: DbSession,
    user: EditorialUser,  # noqa: ARG001 — auth dep
):
    """Pre-fill the issue's sommaire from the editor's manual entry.

    Each entry becomes a `MoniteurEntry` row with empty `raw_text`. The
    next call to `/parse` will OCR the PDF and populate `raw_text` from
    the declared page range — no boundary detection needed.

    Replaces (not merges) any existing pending entries on the issue;
    promoted entries are kept untouched.
    """
    repo = MoniteurRepository(db)
    issue = repo.get_issue(issue_id)
    if not issue:
        raise HTTPException(HTTP_404_NOT_FOUND, "Moniteur issue not found")

    payload_entries = [e.model_dump() for e in payload.entries]
    repo.set_sommaire_entries(issue, payload_entries)
    db.commit()

    full = repo.get_issue_with_entries(issue.id)
    out = MoniteurIssueWithEntries.model_validate(full)
    out.entries_count = len(full.entries)
    out.accepted_count = sum(
        1 for e in full.entries
        if e.review_status == MoniteurCandidateStatus.accepted
    )
    out.entries = [
        MoniteurEntryRead.model_validate(e) for e in full.entries
    ]
    return out


@router.post(
    "/issues/{issue_id}/parse",
    response_model=MoniteurIssueWithEntries,
)
def parse_issue(
    issue_id: int,
    db: DbSession,
    user: EditorialUser,
):
    """Enqueue OCR + heuristic parsing for the issue.

    Returns the issue immediately with `processing_status='ocr_pending'`.
    The actual work runs in the RQ worker; the editor polls the issue's
    status to see entries land. For the rare degenerate case where
    Redis is down, we fall through to a synchronous in-request parse
    (1-page text-layered PDFs work fine; large scans will time out).
    """
    repo = MoniteurRepository(db)
    issue = repo.get_issue(issue_id)
    if not issue:
        raise HTTPException(HTTP_404_NOT_FOUND, "Moniteur issue not found")
    if not issue.file_url and not issue.transcript_url:
        raise HTTPException(400, "No file uploaded for this issue.")

    issue.processing_status = MoniteurIssueStatus.ocr_pending
    issue.processing_error = None
    db.commit()

    try:
        from workers.queue import get_queue
        from workers.jobs import parse_moniteur_issue

        get_queue().enqueue(parse_moniteur_issue, issue_id, job_timeout=60 * 60)
    except Exception as e:  # noqa: BLE001
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

    full = repo.get_issue_with_entries(issue.id)
    payload = MoniteurIssueWithEntries.model_validate(full)
    payload.entries_count = len(full.entries)
    payload.accepted_count = sum(
        1
        for e in full.entries
        if e.review_status == MoniteurCandidateStatus.accepted
    )
    payload.entries = [
        MoniteurEntryRead.model_validate(e) for e in full.entries
    ]
    return payload


@router.patch(
    "/candidates/{candidate_id}",
    response_model=MoniteurEntryRead,
)
def review_entry(
    candidate_id: int,
    payload: EntryReviewInput,
    db: DbSession,
    user: EditorialUser,
):
    """Editor's verdict on an entry.

    For `accepted`, prefer the dedicated `/promote` endpoint which also
    creates the LegalText. This endpoint just updates review fields.
    """
    repo = MoniteurRepository(db)
    entry = repo.get_entry(candidate_id)
    if not entry:
        raise HTTPException(HTTP_404_NOT_FOUND, "Entry not found")

    for k in (
        "detected_category",
        "detected_title",
        "display_title",
        "detected_number",
        "detected_date",
        "parent_entry_id",
        "summary_fr",
        "summary_ht",
        "raw_text",
    ):
        v = getattr(payload, k)
        if v is not None:
            setattr(entry, k, v)

    if payload.review_status is not None:
        repo.update_entry_review(
            entry,
            review_status=payload.review_status,
            review_notes=payload.review_notes,
        )
    elif payload.review_notes is not None:
        entry.review_notes = payload.review_notes
    db.commit()
    db.refresh(entry)
    return MoniteurEntryRead.model_validate(entry)


@router.patch(
    "/candidates/{candidate_id}/translation",
    response_model=MoniteurEntryRead,
    summary="Attach (or clear) translation-source metadata on a Moniteur entry",
)
def update_entry_translation(
    candidate_id: int,
    payload: MoniteurEntryTranslationUpdate,
    db: DbSession,
    user: EditorialUser,
):
    """Set the translation pointer on a Moniteur entry.

    When the HT version of this content appears in a companion issue
    (e.g. 36 → 36-a), the editor records that here rather than
    re-ingesting the HT issue's sommaire as duplicate candidates.

    Every field on the payload is overwritten. Pass null to clear.
    """
    repo = MoniteurRepository(db)
    entry = repo.get_entry(candidate_id)
    if not entry:
        raise HTTPException(HTTP_404_NOT_FOUND, "Entry not found")

    # Verify the companion issue exists (if provided) — return a 400
    # rather than letting the FK fail at flush time so the editor gets
    # a clean error.
    if payload.translation_issue_id is not None:
        companion = repo.get_issue(payload.translation_issue_id)
        if companion is None:
            raise HTTPException(400, "translation_issue_id refers to an unknown issue")
        if companion.id == entry.issue_id:
            raise HTTPException(
                400,
                "translation_issue_id must point to a different issue than the entry's own",
            )

    docs_payload = (
        [d.model_dump(exclude_none=True) for d in payload.companion_documents]
        if payload.companion_documents is not None
        else None
    )

    repo.update_entry_translation(
        entry,
        translation_issue_id=payload.translation_issue_id,
        translation_detected_number=payload.translation_detected_number,
        translation_title_ht=payload.translation_title_ht,
        translation_page_from=payload.translation_page_from,
        translation_page_to=payload.translation_page_to,
        translation_summary_ht=payload.translation_summary_ht,
        companion_documents=docs_payload,
    )
    db.commit()
    db.refresh(entry)
    return MoniteurEntryRead.model_validate(entry)


@router.patch(
    "/candidates/{candidate_id}/parser-profile",
    response_model=MoniteurEntryRead,
    summary="Override which parser profile runs on a Moniteur entry",
)
def update_entry_parser_profile(
    candidate_id: int,
    payload: MoniteurEntryParserProfileUpdate,
    db: DbSession,
    user: EditorialUser,  # noqa: ARG001 — auth dep
):
    """Set (or clear) the parser-profile override on a Moniteur entry.

    When the auto-classification picks the wrong profile (e.g. an
    arrêté that's structurally closer to a circulaire), the editor can
    pin a specific profile here. ``None`` clears the override and falls
    back to ``profile_for_category(detected_category)`` on the next
    parse.

    When ``rerun`` is true (default), the typed parser runs
    synchronously and ``content_ast`` is refreshed in the same request.
    Otherwise the override is saved but the AST stays stale until the
    next /parse run on the parent issue.
    """
    repo = MoniteurRepository(db)
    entry = repo.get_entry(candidate_id)
    if not entry:
        raise HTTPException(HTTP_404_NOT_FOUND, "Entry not found")
    if entry.promoted_legal_text_id is not None:
        raise HTTPException(
            400,
            "Entry has already been promoted — re-parsing is not allowed. "
            "Delete the promoted LegalText first if you need to re-parse.",
        )

    entry.parser_profile = payload.parser_profile
    if payload.rerun:
        repo.run_typed_parser_for_entry(entry, entry.raw_text or "")

    db.commit()
    db.refresh(entry)
    return MoniteurEntryRead.model_validate(entry)


@router.post(
    "/candidates/{candidate_id}/preview-split",
    response_model=TranscriptPreview,
)
def preview_entry_split(
    candidate_id: int,
    payload: TranscriptPreviewInput,
    db: DbSession,
    user: EditorialUser,  # noqa: ARG001 — auth dep
):
    """Preview how the entry's raw_text would be split at promotion time.

    Lets the review-page editor see immediately how their corrections
    will land in the structured legal blocks (préambule / visas /
    considérants / formule d'adoption / articles) before committing the
    promotion. The preview either reads the entry's stored raw_text or
    a hypothetical override sent in the body — useful for live preview
    while the editor is typing in the review page's edit mode.
    """
    repo = MoniteurRepository(db)
    entry = repo.get_entry(candidate_id)
    if not entry:
        raise HTTPException(HTTP_404_NOT_FOUND, "Entry not found")

    text = payload.raw_text if payload.raw_text is not None else (entry.raw_text or "")
    split = split_into_articles(text)
    parts = split_preamble(split.preamble)

    return TranscriptPreview(
        preamble=parts.preamble,
        visas=parts.visas,
        considerants=parts.considerants,
        enacting_formula=parts.enacting_formula,
        articles=[
            TranscriptArticlePreview(
                number=a.number,
                body_preview=a.body[:200],
                body_length=len(a.body),
            )
            for a in split.articles
        ],
    )


@router.post(
    "/candidates/{candidate_id}/promote",
    response_model=MoniteurEntryRead,
)
def promote_entry(
    candidate_id: int,
    db: DbSession,
    user: EditorialUser,
):
    """Promote an entry to a draft `LegalText`.

    Uses the entry's editor-corrected fields (title / category / date /
    number) to create the LegalText with `editorial_status='draft'`. The
    editor still has to publish it from the regular law-edit flow before
    it appears on /lois.
    """
    repo = MoniteurRepository(db)
    entry = repo.get_entry(candidate_id)
    if not entry:
        raise HTTPException(HTTP_404_NOT_FOUND, "Entry not found")

    if not entry.detected_category:
        raise HTTPException(
            400, "Entry has no category — set one before promoting."
        )

    if entry.detected_category not in PROMOTABLE_TYPES:
        raise HTTPException(
            400,
            f"Category '{entry.detected_category.value}' is not promotable "
            f"to a LegalText. Only normative types can be promoted.",
        )

    if not entry.detected_title:
        raise HTTPException(
            400, "Entry has no title — set one before promoting."
        )

    slug = _slugify(
        entry.detected_title,
        fallback=f"moniteur-{entry.issue_id}-entry-{entry.id}",
    )

    from sqlalchemy import select
    from services.corpus.models import LegalText

    counter = 0
    entry_slug = slug
    while db.execute(
        select(LegalText.id).where(LegalText.slug == entry_slug)
    ).first():
        counter += 1
        entry_slug = f"{slug}-{counter}"

    repo.promote_entry(
        entry,
        slug=entry_slug,
        title_fr=entry.detected_title,
        category=entry.detected_category,
        publication_date=entry.detected_date,
    )
    db.commit()
    db.refresh(entry)
    return MoniteurEntryRead.model_validate(entry)


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
