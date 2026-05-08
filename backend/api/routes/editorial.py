"""Editorial endpoints — `/api/v1/editorial/*`.

All routes require an editor role (admin, reviewer, or editor). Backed by
EditorialService which writes to the editorial_actions audit log on every
mutation.
"""
from __future__ import annotations

import logging
import tempfile
from datetime import date
from pathlib import Path
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, Query, UploadFile, File as FastAPIFile
from pydantic import BaseModel, Field

from api.deps import (
    DbSession,
    EditorialUser,
)
from packages.schemas.article import ArticleContentUpdate, ArticleEmbed
from packages.schemas.common import PaginatedResponse
from packages.schemas.enums import (
    CodeSubcategory,
    EditorialStatus,
    LegalCategory,
    LegalStatus,
)
from packages.schemas.legal_text import LegalTextCreate, LegalTextListItem, LegalTextRead
from services.editorial.service import EditorialService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/editorial", tags=["editorial"])


def get_editorial_service(db: DbSession) -> EditorialService:
    return EditorialService(db)


# Annotated dep — mixing this with old-style `= Depends(...)` confuses
# FastAPI's query-param inference on subsequent function arguments
# (it silently drops Optional[Enum] params from the OpenAPI schema).
EditorialServiceDep = Annotated[EditorialService, Depends(get_editorial_service)]


class CommentRequest(BaseModel):
    comment: str = Field(..., min_length=1, max_length=2000)


# -----------------------------------------------------------------------
# Response schemas for document parsing
# -----------------------------------------------------------------------


class ParsedHeadingResponse(BaseModel):
    key: str
    level: str
    number: str
    title_fr: str
    parent_key: Optional[str] = None
    position: int = 0


class ParsedArticleResponse(BaseModel):
    number: str
    content_fr: str
    heading_path: List[str] = []
    heading_key: Optional[str] = None
    title: Optional[str] = None


class DocumentParseResponse(BaseModel):
    headings: List[ParsedHeadingResponse]
    articles: List[ParsedArticleResponse]
    preamble: str
    parser_confidence: float
    warnings: List[str]


# -----------------------------------------------------------------------
# Create a new legal text (editorial import)
# -----------------------------------------------------------------------


@router.post(
    "/legal-texts",
    response_model=LegalTextRead,
    status_code=201,
    summary="Create a new draft legal text with headings and articles",
)
def create_legal_text(
    body: LegalTextCreate,
    db: DbSession,
    user: EditorialUser,
    service: EditorialServiceDep,
):
    """Create a draft LegalText with optional headings, articles, and signers.

    This is the commit step of the editorial import flow: the editor has
    already parsed the document, reviewed the structure, and is now saving
    the result as a draft.
    """
    result = service.create_legal_text(body, actor=user)
    db.commit()
    return result


# -----------------------------------------------------------------------
# Parse a document file into structured headings + articles
# -----------------------------------------------------------------------


@router.post(
    "/parse-document",
    response_model=DocumentParseResponse,
    summary="Parse a legal document (PDF/DOCX/TXT) into headings + articles",
)
async def parse_document(
    user: EditorialUser,
    file: UploadFile = FastAPIFile(
        ..., description="Legal document to parse (PDF, DOCX, or TXT)"
    ),
):
    """Upload a legal document and parse it into a structured preview.

    The parser detects headings (LIVRE, TITRE, CHAPITRE, SECTION),
    splits articles, and assigns each article to its nearest heading.
    The editor reviews the result and then commits via POST /legal-texts.

    No data is persisted — this is a stateless analysis endpoint.
    """
    from services.ingestion.document_parser import parse_file  # noqa: PLC0415

    # Determine the suffix from the upload's content-type or filename
    suffix = Path(file.filename or "").suffix.lower() or ".txt"
    content_type = file.content_type

    # Write to a temp file so the parser can use the existing OCR pipeline
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        result = parse_file(tmp_path, content_type=content_type)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    return DocumentParseResponse(
        headings=[
            ParsedHeadingResponse(
                key=h.key,
                level=h.level,
                number=h.number,
                title_fr=h.title_fr,
                parent_key=h.parent_key,
                position=h.position,
            )
            for h in result.headings
        ],
        articles=[
            ParsedArticleResponse(
                number=a.number,
                content_fr=a.content_fr,
                heading_path=a.heading_path,
                heading_key=a.heading_key,
                title=a.title,
            )
            for a in result.articles
        ],
        preamble=result.preamble,
        parser_confidence=result.parser_confidence,
        warnings=result.warnings,
    )


class LegalTextMetadataUpdate(BaseModel):
    """Editor-editable metadata. Omit a key to leave it unchanged; pass null
    to clear nullable fields. `title_fr` is non-nullable and rejects empty.
    """

    model_config = {"extra": "forbid"}

    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    description_fr: Optional[str] = None
    description_ht: Optional[str] = None
    promulgation_date: Optional[date] = None
    publication_date: Optional[date] = None
    moniteur_ref: Optional[str] = None
    category: Optional[LegalCategory] = None
    code_subcategory: Optional[CodeSubcategory] = None
    status: Optional[LegalStatus] = None
    comment: Optional[str] = Field(default=None, max_length=2000)


# -----------------------------------------------------------------------
# Reads — see all statuses (drafts + published + rejected)
# -----------------------------------------------------------------------


@router.get(
    "/legal-texts",
    response_model=PaginatedResponse[LegalTextListItem],
)
def list_all_legal_texts(
    user: EditorialUser,
    service: EditorialServiceDep,
    q: Optional[str] = Query(
        None, description="Free-text search across title/description/Moniteur ref"
    ),
    category: Optional[LegalCategory] = None,
    code_subcategory: Optional[CodeSubcategory] = None,
    legal_status: Optional[LegalStatus] = Query(None, alias="status"),
    editorial_status: Optional[EditorialStatus] = Query(
        None,
        description=(
            "Editorial workflow filter; default = no filter (all statuses). "
            "Pass `published`, `draft`, `pending_review`, or `rejected` to narrow."
        ),
    ),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    return service.list_all(
        q=q,
        category=category,
        code_subcategory=code_subcategory,
        legal_status=legal_status,
        editorial_status=editorial_status,
        limit=limit,
        offset=offset,
    )


@router.get("/legal-texts/{slug}", response_model=LegalTextRead)
def get_legal_text(
    slug: str,
    user: EditorialUser,
    service: EditorialServiceDep,
    include: Optional[str] = Query("all"),
):
    return service.get_text(slug, include=include)


# -----------------------------------------------------------------------
# Metadata edit
# -----------------------------------------------------------------------


@router.patch("/legal-texts/{slug}/metadata", response_model=LegalTextRead)
def update_legal_text_metadata(
    slug: str,
    body: LegalTextMetadataUpdate,
    db: DbSession,
    user: EditorialUser,
    service: EditorialServiceDep,
):
    """Update editor-editable metadata fields. Only fields explicitly sent are
    written; unset fields stay untouched. Audited as `update_metadata`.
    """
    payload = body.model_dump(exclude_unset=True)
    comment = payload.pop("comment", None)
    result = service.update_legal_text_metadata(
        slug, actor=user, updates=payload, comment=comment
    )
    db.commit()
    return result


# -----------------------------------------------------------------------
# Article content edit (single-article inline editing)
# -----------------------------------------------------------------------


@router.patch("/articles/{article_id}/content", response_model=ArticleEmbed)
def update_article_content(
    article_id: int,
    body: ArticleContentUpdate,
    db: DbSession,
    user: EditorialUser,
    service: EditorialServiceDep,
):
    """Edit an article's bilingual content (title + body, FR + HT).

    Versioning policy: a draft version is mutated in place; a published
    version is superseded by a new draft version pointing at the same
    article (so the article ID and slug stay stable forever — see
    CLAUDE.md "permalinks are forever").
    """
    payload = body.model_dump(exclude_unset=True)
    comment = payload.pop("comment", None)
    result = service.update_article_content(
        article_id, actor=user, updates=payload, comment=comment
    )
    db.commit()
    return result


# -----------------------------------------------------------------------
# State transitions
# -----------------------------------------------------------------------


@router.post("/legal-texts/{slug}/publish", response_model=LegalTextRead)
def publish_legal_text(
    slug: str,
    db: DbSession,
    user: EditorialUser,
    service: EditorialServiceDep,
):
    """Promote a draft to published. Idempotent if already published."""
    result = service.publish_legal_text(slug, actor=user)
    db.commit()
    return result


@router.post("/legal-texts/{slug}/unpublish")
def unpublish_legal_text(
    slug: str,
    body: CommentRequest,
    db: DbSession,
    user: EditorialUser,
    service: EditorialServiceDep,
):
    """Demote a published text back to draft. Comment is required."""
    service.unpublish_legal_text(slug, actor=user, comment=body.comment)
    db.commit()
    return {"ok": True, "slug": slug}


@router.post("/legal-texts/{slug}/request-changes")
def request_changes(
    slug: str,
    body: CommentRequest,
    db: DbSession,
    user: EditorialUser,
    service: EditorialServiceDep,
):
    """Leave a comment requesting modifications. Status stays draft."""
    result = service.request_changes(slug, actor=user, comment=body.comment)
    db.commit()
    return result


# -----------------------------------------------------------------------
# Caller identity (used by the frontend EditorBar to show "logged in as ...")
# -----------------------------------------------------------------------


@router.get("/me")
def whoami(user: EditorialUser):
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role.value if hasattr(user.role, "value") else user.role,
    }
