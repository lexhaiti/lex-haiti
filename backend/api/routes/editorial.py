"""Editorial endpoints — `/api/v1/editorial/*`.

All routes require an editor role (admin, reviewer, or editor). Backed by
EditorialService which writes to the editorial_actions audit log on every
mutation.
"""
from __future__ import annotations

from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
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
from packages.schemas.legal_text import LegalTextListItem, LegalTextRead
from services.editorial.service import EditorialService

router = APIRouter(prefix="/editorial", tags=["editorial"])


def get_editorial_service(db: DbSession) -> EditorialService:
    return EditorialService(db)


# Annotated dep — mixing this with old-style `= Depends(...)` confuses
# FastAPI's query-param inference on subsequent function arguments
# (it silently drops Optional[Enum] params from the OpenAPI schema).
EditorialServiceDep = Annotated[EditorialService, Depends(get_editorial_service)]


class CommentRequest(BaseModel):
    comment: str = Field(..., min_length=1, max_length=2000)


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
