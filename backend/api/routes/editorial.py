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

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File as FastAPIFile
from pydantic import BaseModel, Field

from api.deps import (
    DbSession,
    EditorialUser,
)
from schemas.article import (
    ArticleContentUpdate,
    ArticleEmbed,
    ArticleInsertInput,
    ArticleVersionAddInput,
    ArticleVersionRead,
    ArticleVersionStatusUpdate,
)
from schemas.block_version import (
    BlockVersionAddInput,
    BlockVersionRead,
)
from schemas.common import PaginatedResponse
from schemas.enums import (
    BlockKind,
    CodeSubcategory,
    EditorialStatus,
    LegalCategory,
    LegalStatus,
    LegalTheme,
)
from schemas.heading import (
    LegalHeadingInsertInput,
    LegalHeadingPatch,
    LegalHeadingRead,
)
from schemas.legal_text import LegalTextCreate, LegalTextListItem, LegalTextRead
from schemas.signer import (
    LegalSignerBulkInput,
    LegalSignerCreate,
    LegalSignerRead,
    LegalSignerUpdate,
)
from schemas.theme import LegalThemeTagWrite
from services.corpus.repository import CorpusRepository
from services.corpus.service import article_to_embed
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
    # When the parse is bilingual, content_ht holds the matched HT text
    # (matched by article number). Null when no HT version was uploaded
    # or no matching HT article was found.
    content_ht: Optional[str] = None
    heading_path: List[str] = []
    heading_key: Optional[str] = None
    title: Optional[str] = None
    title_ht: Optional[str] = None


class DocumentParseResponse(BaseModel):
    headings: List[ParsedHeadingResponse]
    articles: List[ParsedArticleResponse]
    preamble: str
    preamble_ht: Optional[str] = None
    parser_confidence: float
    warnings: List[str]
    # Page-1 + post-dispositif metadata extracted by the parser. Editor
    # confirms these on the preview screen before committing the import.
    official_number: Optional[str] = None
    issuing_authority: Optional[str] = None
    official_formula: Optional[str] = None
    # Bilingual alignment counters — non-zero when an HT file was uploaded
    # alongside the FR. Drives the "47 FR / 46 HT (45 matched)" summary
    # in the import preview.
    fr_article_count: int = 0
    ht_article_count: int = 0
    matched_count: int = 0


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


async def _save_and_parse(upload: UploadFile):
    """Persist an UploadFile to a temp path, call parse_file, then clean up."""
    from services.ingestion.document_parser import parse_file  # noqa: PLC0415

    suffix = Path(upload.filename or "").suffix.lower() or ".txt"
    content_type = upload.content_type
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await upload.read())
        tmp_path = tmp.name
    try:
        return parse_file(tmp_path, content_type=content_type)
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@router.post(
    "/parse-document",
    response_model=DocumentParseResponse,
    summary="Parse a legal document (PDF/DOCX/TXT) into headings + articles",
)
async def parse_document(
    user: EditorialUser,
    file: UploadFile = FastAPIFile(
        ..., description="Legal document to parse — French version"
    ),
    file_ht: Optional[UploadFile] = FastAPIFile(
        default=None,
        description="Optional Kreyòl version. When provided, articles from "
        "both files are aligned by their numbers and returned with "
        "content_fr + content_ht populated where matches exist.",
    ),
):
    """Upload one or two legal-document files and parse them into a structured
    preview.

    The parser detects headings (LIVRE, TITRE, CHAPITRE, SECTION), splits
    articles, and assigns each article to its nearest heading. When an HT
    companion file is provided, ``bilingual_align`` matches articles across
    the two parses by their numbers and returns a unified preview.

    No data is persisted — this is a stateless analysis endpoint. The
    editor reviews the result and then commits via POST /legal-texts.
    """
    from services.ingestion.bilingual_align import align_bilingual  # noqa: PLC0415

    fr_result = await _save_and_parse(file)
    ht_result = await _save_and_parse(file_ht) if file_ht is not None else None
    aligned = align_bilingual(fr_result, ht_result)

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
            for h in aligned.headings
        ],
        articles=[
            ParsedArticleResponse(
                number=a.number,
                content_fr=a.content_fr,
                content_ht=a.content_ht,
                heading_path=a.heading_path,
                heading_key=a.heading_key,
                title=a.title_fr,
                title_ht=a.title_ht,
            )
            for a in aligned.articles
        ],
        preamble=aligned.preamble_fr,
        preamble_ht=aligned.preamble_ht,
        parser_confidence=aligned.parser_confidence,
        warnings=aligned.warnings,
        official_number=aligned.official_number,
        issuing_authority=aligned.issuing_authority,
        official_formula=aligned.official_formula,
        fr_article_count=aligned.fr_article_count,
        ht_article_count=aligned.ht_article_count,
        matched_count=aligned.matched_count,
    )


class LegalTextMetadataUpdate(BaseModel):
    """Editor-editable metadata. Omit a key to leave it unchanged; pass null
    to clear nullable fields. `title_fr` is non-nullable and rejects empty.
    """

    model_config = {"extra": "forbid"}

    # Slug — editor override for the auto-generated permalink slug.
    # The service validates format + uniqueness. CLAUDE.md says
    # "permalinks are forever"; once published, the slug change is
    # silent and the audit log captures the before/after.
    slug: Optional[str] = None
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
    # Page-1 + post-dispositif metadata. Editor can edit each
    # independently; pass empty string or null to clear.
    official_number: Optional[str] = None
    issuing_authority: Optional[str] = None
    official_formula: Optional[str] = None
    # Formal blocks — Phase 1 makes these editable in-place via the
    # frontend's EditableFormalBlock component. Each is bilingual.
    preamble_fr: Optional[str] = None
    preamble_ht: Optional[str] = None
    visas_fr: Optional[str] = None
    visas_ht: Optional[str] = None
    considerants_fr: Optional[str] = None
    considerants_ht: Optional[str] = None
    mentions_procedurales_fr: Optional[str] = None
    mentions_procedurales_ht: Optional[str] = None
    enacting_formula_fr: Optional[str] = None
    enacting_formula_ht: Optional[str] = None
    # 'left' (default) or 'center' — display alignment for the
    # enacting-formula block on the reader page.
    enacting_formula_align: Optional[str] = None
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


@router.delete(
    "/legal-texts/{slug}",
    status_code=204,
    summary="Delete a draft legal text (and cascade its dependents)",
)
def delete_legal_text(
    slug: str,
    db: DbSession,
    user: EditorialUser,  # noqa: ARG001 — auth gate
):
    """Hard-delete a draft legal text + everything that depends on it
    (headings, articles, signers, theme tags). Refuses to act on
    published texts — promotion to ``published`` is a signal that
    permalinks may be in use externally, and silently breaking those
    is the worst thing this platform can do (per CLAUDE.md
    "Permalinks are forever").

    The Moniteur source entry that promoted this text keeps its
    ``promoted_legal_text_id`` set to NULL (FK is ON DELETE SET NULL),
    so the editor can re-promote from the original sommaire entry
    after the failed draft is gone.
    """
    repo = CorpusRepository(db)
    text = repo.get_text_by_slug(slug, editorial_status=None)
    if text is None:
        raise HTTPException(404, "Legal text not found")
    if text.editorial_status == EditorialStatus.published:
        raise HTTPException(
            409,
            "Refusing to delete a published legal text. Unpublish first "
            "(POST /editorial/legal-texts/{slug}/unpublish), then delete.",
        )
    repo.delete_text(text)
    db.commit()
    return None


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


@router.patch(
    "/articles/{article_id}/version-status",
    response_model=ArticleEmbed,
    summary="Flip the current version's lifecycle status (in_force / abrogated / …)",
)
def update_article_version_status(
    article_id: int,
    body: ArticleVersionStatusUpdate,
    db: DbSession,
    user: EditorialUser,
    service: EditorialServiceDep,
):
    """Set the article's current version status directly — no new
    version, no amending-law required. Use this to mark an article
    ``abrogé`` after the amending law's effects have already been
    captured elsewhere, or to flip a ``suspended`` row back to
    ``in_force`` when the suspension is lifted.

    For "this incoming law amended the article" use POST
    /articles/{id}/versions instead — that path creates the new
    versioned row and writes the LegalChange graph edge.
    """
    result = service.update_article_version_status(
        article_id,
        actor=user,
        status=body.status,
        effective_to=body.effective_to,
        comment=body.comment,
    )
    db.commit()
    return result


@router.post(
    "/articles/{article_id}/versions",
    response_model=ArticleVersionRead,
    status_code=201,
    summary="Add a new version of an article caused by an amending legal text",
)
def add_article_version(
    article_id: int,
    body: ArticleVersionAddInput,
    db: DbSession,
    user: EditorialUser,
    service: EditorialServiceDep,
):
    """Add a new version of an article, anchored to the amending law.

    Distinct from PATCH /articles/{id}/content (editorial corrections):
    the editor here is declaring "this amending text introduces a new
    version of the article". A ``LegalChange`` graph row is written
    alongside the new ``ArticleVersion`` so the bidirectional history
    (all laws that amended X; all articles amended by Y) is queryable.

    The new version becomes the article's current_version. The previous
    version's ``effective_to`` is auto-stamped to the new version's
    ``effective_from`` so the timeline is gap-free.
    """
    payload = body.model_dump(exclude_unset=False)
    new_version = service.add_article_version(
        article_id, actor=user, payload=payload
    )
    db.commit()
    db.refresh(new_version)
    return ArticleVersionRead.model_validate(new_version)


@router.post(
    "/legal-texts/{slug}/blocks/{block_kind}/versions",
    response_model=BlockVersionRead,
    status_code=201,
    summary="Add a new version of a formal block, anchored to an amending law",
)
def add_block_version(
    slug: str,
    block_kind: BlockKind,
    body: BlockVersionAddInput,
    db: DbSession,
    user: EditorialUser,
    service: EditorialServiceDep,
):
    """Add a new version of one of the four formal blocks of a legal
    text (preamble, visas, considérants, enacting formula).

    Symmetric with ``POST /editorial/articles/{id}/versions`` but for
    block-typed content. Writes the new ``LegalTextBlockVersion`` row,
    denormalises onto the corresponding ``legal_texts`` column (so the
    public read path stays unchanged), and writes a ``LegalChange``
    row pointing at the amending law via ``new_block_version_id`` so
    the "Modifications apportées" panel picks it up.
    """
    payload = body.model_dump(exclude_unset=False)
    new_version = service.add_block_version(
        slug, block_kind, actor=user, payload=payload
    )
    db.commit()
    db.refresh(new_version)
    return BlockVersionRead.model_validate(new_version)


@router.delete(
    "/articles/{article_id}",
    status_code=204,
    summary="Hard-delete an article and its versions (parser-error cleanup)",
)
def delete_article(
    article_id: int,
    db: DbSession,
    user: EditorialUser,
    service: EditorialServiceDep,
):
    """Hard-delete a phantom article that the OCR/parser produced
    but doesn't exist in the source text.

    Wipes the article + all its versions (CASCADE) + any
    ``LegalChange`` rows targeting it (CASCADE). The audit log
    captures the article number + version count for the record.
    Irreversible — UI should warn the editor with a ConfirmDialog.
    """
    service.delete_article(article_id, actor=user)
    db.commit()
    return None


@router.delete(
    "/articles/{article_id}/versions/{version_id}",
    status_code=204,
    summary="Delete one version of an article (history cleanup)",
)
def delete_article_version(
    article_id: int,
    version_id: int,
    db: DbSession,
    user: EditorialUser,
    service: EditorialServiceDep,
):
    """Remove a single ``article_versions`` row from an article's
    timeline.

    Rejects deletion of the only remaining version (use
    ``DELETE /articles/{id}`` for that). If the deleted row was the
    current version, the highest-numbered remaining version is
    promoted to current so the article stays readable.

    Use case: an editor created a v2 by mistake (e.g. typed ``abrogé``
    as the new content for an article that should have stayed at v1
    with just a status flip) — this lets them remove it without
    nuking the whole article.
    """
    service.delete_article_version(article_id, version_id, actor=user)
    db.commit()
    return None


@router.delete(
    "/headings/{heading_id}",
    status_code=204,
    summary="Delete a TOC node (Titre / Chapitre / Section / …)",
)
def delete_heading(
    heading_id: int,
    db: DbSession,
    user: EditorialUser,
    service: EditorialServiceDep,
    reparent_children: bool = Query(
        False,
        description=(
            "When true, lift this heading's articles + sub-headings to "
            "its parent (or to the text root) before deletion. When "
            "false (default), refuse the delete if the heading is not "
            "empty so the editor consciously chooses the cascade."
        ),
    ),
):
    """Delete a TOC node — used by the editor to clean up parser
    output that produced phantom headings or duplicate Titres /
    Chapitres / Sections.

    Default (``reparent_children=false``) refuses non-empty headings
    so the editor must explicitly opt in to either: (a) clear the
    subtree first, or (b) re-parent via ``reparent_children=true``.
    """
    service.delete_heading(
        heading_id, actor=user, reparent_children=reparent_children
    )
    db.commit()
    return None


@router.post(
    "/legal-texts/{slug}/articles",
    response_model=ArticleEmbed,
    status_code=201,
    summary="Insert a new article into a legal text (amendment insertion)",
)
def insert_article(
    slug: str,
    body: ArticleInsertInput,
    db: DbSession,
    user: EditorialUser,
    service: EditorialServiceDep,
):
    """Insert a brand-new article (e.g. "9-1" or "9 bis") between two
    existing articles, anchored to the amending law that introduced it.

    Position is computed server-side from ``after_article_id``: the
    new article inherits that article's TOC node (``heading_id``) and
    slots at ``after.position + 1``, with all later siblings in the
    same heading bumped by one. Pass only ``heading_id`` to insert at
    position 0 of that heading.

    Writes a ``LegalChange`` row with ``change_kind=add`` so the
    amending law's "Modifications apportées" panel lists the
    insertion alongside its other edits.
    """
    payload = body.model_dump(exclude_unset=False)
    article = service.insert_article(slug, actor=user, payload=payload)
    db.commit()
    db.refresh(article)
    return article_to_embed(article)


# -----------------------------------------------------------------------
# Translation parsing — late-binding Kreyòl import for an existing text
# -----------------------------------------------------------------------


class TranslationMatchResponse(BaseModel):
    """One FR article paired with its HT match (if any) from the
    parsed translation file. Returned by /parse-translation so the
    UI can render a side-by-side preview before the editor commits."""

    article_id: int
    article_number: str
    article_slug: str
    existing_text_fr: Optional[str] = None
    existing_text_ht: Optional[str] = None
    parsed_content_ht: Optional[str] = None
    parsed_title_ht: Optional[str] = None
    # status: 'matched' | 'fr_only' (no HT counterpart in the parsed
    # file) | 'existing_ht' (existing text_ht would be overwritten)
    status: str


class TranslationParseResponse(BaseModel):
    """Bulk-translation preview returned by /parse-translation."""

    legal_text_slug: str
    matches: List[TranslationMatchResponse]
    warnings: List[str] = []
    fr_article_count: int = 0
    parsed_ht_count: int = 0
    matched_count: int = 0
    preamble_ht: Optional[str] = None


# -----------------------------------------------------------------------
# Heading-title inline edit
# -----------------------------------------------------------------------


class HeadingTitleUpdate(BaseModel):
    """Editor input for inline-editing a heading title in the TOC.

    Either field can be set independently — editors typically fix the
    French first; the Kreyòl title is filled later during translation
    review. ``None`` means "leave untouched"; empty string clears.
    """

    title_fr: Optional[str] = None
    title_ht: Optional[str] = None


@router.patch(
    "/headings/{heading_id}/title",
    response_model=LegalHeadingRead,
    summary="Edit a structural heading title (TOC inline edit)",
)
def update_heading_title(
    heading_id: int,
    body: HeadingTitleUpdate,
    db: DbSession,
    user: EditorialUser,  # noqa: ARG001 — auth gate
):
    """Inline edit for a TOC heading title (TITRE / CHAPITRE / SECTION).

    Editors trigger this from the table-of-contents tree on the law
    detail page when the parser-detected title is off (truncated by
    OCR, wrong language, or simply not what the official text uses).
    Body and TOC structure (parent, position, level) are NOT editable
    here — that's a separate flow that goes through the structural
    review page.
    """
    repo = CorpusRepository(db)
    heading = repo.get_heading_by_id(heading_id)
    if heading is None:
        raise HTTPException(404, "Heading not found")
    repo.update_heading_titles(
        heading,
        title_fr=body.title_fr,
        title_ht=body.title_ht,
    )
    db.commit()
    db.refresh(heading)
    return LegalHeadingRead.model_validate(heading)


@router.post(
    "/legal-texts/{slug}/headings",
    response_model=LegalHeadingRead,
    status_code=201,
    summary="Insert a new TOC heading (Titre / Chapitre / Section / …)",
)
def insert_heading(
    slug: str,
    body: LegalHeadingInsertInput,
    db: DbSession,
    user: EditorialUser,
    service: EditorialServiceDep,
):
    """Insert a new structural heading into a legal text — used to
    fix parser output that missed a structural break.

    Anchor is either ``after_heading_id`` (slot after that heading,
    inherit its parent) or ``parent_id`` (append to end of that
    parent's children). The ``key`` field must be unique within the
    text — backend rejects duplicates with a 409-style InvalidInput.
    """
    payload = body.model_dump(exclude_unset=False)
    heading = service.insert_heading(slug, actor=user, payload=payload)
    db.commit()
    db.refresh(heading)
    return LegalHeadingRead.model_validate(heading)


@router.patch(
    "/headings/{heading_id}",
    response_model=LegalHeadingRead,
    summary="Full update of a heading (re-parent, renumber, change level…)",
)
def update_heading(
    heading_id: int,
    body: LegalHeadingPatch,
    db: DbSession,
    user: EditorialUser,
    service: EditorialServiceDep,
):
    """Patch the full set of editor-writable heading fields. Distinct
    from ``PATCH /headings/{id}/title`` which is title-only. Use this
    one when:
    - the parser mis-classified a section as a chapter (``level``)
    - a heading needs to move under a different parent (``parent_id``)
    - the displayed number is wrong (``number``)
    - position needs manual reordering (``position``)
    """
    payload = body.model_dump(exclude_unset=True)
    if not payload:
        # No-op patch — return the heading as-is rather than touching
        # the audit log with a zero-diff entry.
        repo = CorpusRepository(db)
        heading = repo.get_heading_by_id(heading_id)
        if heading is None:
            raise HTTPException(404, "Heading not found")
        return LegalHeadingRead.model_validate(heading)
    heading = service.update_heading_full(
        heading_id, actor=user, updates=payload
    )
    db.commit()
    db.refresh(heading)
    return LegalHeadingRead.model_validate(heading)


# -----------------------------------------------------------------------
# Signers — manual CRUD for the editor
# -----------------------------------------------------------------------


@router.get(
    "/legal-texts/{slug}/signers",
    response_model=List[LegalSignerRead],
    summary="List signers attached to a legal text",
)
def list_signers(slug: str, db: DbSession, user: EditorialUser):  # noqa: ARG001
    """Editor-facing list (no public mirror). The public detail endpoint
    already includes signers inline on the LegalText payload — this
    route only exists so the manual editor UI can refetch the list
    after add/edit/delete without re-pulling the whole law payload.
    """
    repo = CorpusRepository(db)
    # editorial_status=None → editor sees drafts, pending, published,
    # rejected — the editorial UI lives on draft texts most of the
    # time. The default in get_text_by_slug is "published only" which
    # is the public read path, not the editorial one.
    text = repo.get_text_by_slug(slug, editorial_status=None)
    if text is None:
        raise HTTPException(404, "Legal text not found")
    rows = repo.list_signers_by_text(text.id)
    return [LegalSignerRead.model_validate(r) for r in rows]


@router.post(
    "/legal-texts/{slug}/signers",
    response_model=LegalSignerRead,
    status_code=201,
    summary="Add a signer to a legal text (editor-driven, not parser-driven)",
)
def create_signer(
    slug: str,
    body: LegalSignerCreate,
    db: DbSession,
    user: EditorialUser,  # noqa: ARG001
):
    """Add one signer to a legal text. Used when the parser missed
    structured signatories (typical for the 1987 Constitution and
    other non-standard closing-formula layouts) and the editor wants
    to enter them by hand.

    Position defaults to "append to the end" when not specified — most
    editor workflows want chronological insertion order, not arbitrary
    re-shuffling of existing signers.
    """
    repo = CorpusRepository(db)
    text = repo.get_text_by_slug(slug, editorial_status=None)
    if text is None:
        raise HTTPException(404, "Legal text not found")
    payload = body.model_dump(exclude_unset=True)
    signer = repo.create_signer(text.id, payload)
    db.commit()
    db.refresh(signer)
    return LegalSignerRead.model_validate(signer)


@router.post(
    "/legal-texts/{slug}/signers/bulk",
    response_model=List[LegalSignerRead],
    status_code=201,
    summary="Bulk-add signers from a pasted JSON list (Constituante use case)",
)
def bulk_create_signers(
    slug: str,
    body: LegalSignerBulkInput,
    db: DbSession,
    user: EditorialUser,  # noqa: ARG001
):
    """Bulk-append signers to a legal text. The 1987 Constitution has
    ~60 Constituante members; entering them one row at a time through
    the manual editor is impractical, so the editor pastes a JSON list
    and they are all appended in order.

    Each entry is treated like ``POST /signers`` — ``create_signer``
    auto-assigns a position past the current tail, so order is preserved
    in submission order. The whole batch commits atomically (one
    rollback on validation failure, never half-loaded).
    """
    repo = CorpusRepository(db)
    text = repo.get_text_by_slug(slug, editorial_status=None)
    if text is None:
        raise HTTPException(404, "Legal text not found")
    created = []
    for item in body.signers:
        payload = item.model_dump(exclude_unset=True)
        signer = repo.create_signer(text.id, payload)
        created.append(signer)
    db.commit()
    for s in created:
        db.refresh(s)
    return [LegalSignerRead.model_validate(s) for s in created]


@router.patch(
    "/signers/{signer_id}",
    response_model=LegalSignerRead,
    summary="Edit a signer's name / function / capacity / chamber",
)
def update_signer(
    signer_id: int,
    body: LegalSignerUpdate,
    db: DbSession,
    user: EditorialUser,  # noqa: ARG001
):
    """Partial update. Only the fields the editor actually changed
    flow through (``exclude_unset=True``)."""
    repo = CorpusRepository(db)
    signer = repo.get_signer_by_id(signer_id)
    if signer is None:
        raise HTTPException(404, "Signer not found")
    patch = body.model_dump(exclude_unset=True)
    if patch:
        repo.update_signer(signer, patch)
    db.commit()
    db.refresh(signer)
    return LegalSignerRead.model_validate(signer)


@router.delete(
    "/signers/{signer_id}",
    status_code=204,
    summary="Remove a signer from a legal text",
)
def delete_signer(
    signer_id: int,
    db: DbSession,
    user: EditorialUser,  # noqa: ARG001
):
    repo = CorpusRepository(db)
    signer = repo.get_signer_by_id(signer_id)
    if signer is None:
        raise HTTPException(404, "Signer not found")
    repo.delete_signer(signer)
    db.commit()
    return None


@router.post(
    "/legal-texts/{slug}/parse-translation",
    response_model=TranslationParseResponse,
    summary="Parse a Kreyòl translation DOCX and align against existing FR articles",
)
async def parse_translation(
    slug: str,
    db: DbSession,
    user: EditorialUser,
    file: UploadFile = FastAPIFile(
        ...,
        description="Kreyòl translation file (PDF/DOCX/TXT) to align against "
        "the existing FR articles of this legal text",
    ),
):
    """Stateless preview — parse the uploaded HT file, then align by
    article number against the legal_text's current FR articles.

    Returns a TranslationParseResponse with one entry per FR article,
    annotated with the matched HT text where applicable. Persistence
    happens in a separate step (POST /legal-texts/{slug}/apply-
    translation) once the editor confirms the alignment.
    """
    from services.corpus.repository import CorpusRepository  # noqa: PLC0415
    from services.ingestion.article_split import _normalize_number  # noqa: PLC0415

    repo = CorpusRepository(db)
    text = repo.get_text_by_slug(
        slug,
        editorial_status=None,
        with_articles=True,
    )
    if text is None:
        raise HTTPException(404, f"LegalText not found: {slug}")

    ht_result = await _save_and_parse(file)

    ht_by_number: dict[str, object] = {}
    duplicate_ht: set[str] = set()
    for ha in ht_result.articles:
        key = _normalize_number(ha.number)
        if key in ht_by_number:
            duplicate_ht.add(key)
        ht_by_number[key] = ha

    matches: list[TranslationMatchResponse] = []
    matched = 0
    matched_keys: set[str] = set()
    for art in text.articles:
        # Each article's current version holds the live text_fr/text_ht
        cur = getattr(art, "current_version", None)
        fr_text = getattr(cur, "text_fr", None) if cur else None
        ht_text = getattr(cur, "text_ht", None) if cur else None
        key = _normalize_number(art.number)
        ha = ht_by_number.get(key)
        status = "fr_only"
        parsed_ht: Optional[str] = None
        parsed_title_ht: Optional[str] = None
        if ha is not None:
            matched += 1
            matched_keys.add(key)
            parsed_ht = getattr(ha, "content_fr", None)  # parser stores raw text in content_fr regardless of language
            parsed_title_ht = getattr(ha, "title", None)
            status = "existing_ht" if ht_text else "matched"
        matches.append(
            TranslationMatchResponse(
                article_id=art.id,
                article_number=art.number,
                article_slug=art.slug,
                existing_text_fr=fr_text,
                existing_text_ht=ht_text,
                parsed_content_ht=parsed_ht,
                parsed_title_ht=parsed_title_ht,
                status=status,
            )
        )

    warnings: list[str] = list(ht_result.warnings)
    orphan = len(ht_result.articles) - len(matched_keys)
    if orphan > 0:
        warnings.append(
            f"{orphan} article(s) HT du fichier sans équivalent FR — vérifier la numérotation."
        )
    if duplicate_ht:
        warnings.append(
            "Numéros d'article dupliqués dans le fichier HT: "
            + ", ".join(sorted(duplicate_ht))
        )

    return TranslationParseResponse(
        legal_text_slug=slug,
        matches=matches,
        warnings=warnings,
        fr_article_count=len(text.articles),
        parsed_ht_count=len(ht_result.articles),
        matched_count=matched,
        preamble_ht=ht_result.preamble or None,
    )


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


@router.put(
    "/legal-texts/{slug}/themes",
    response_model=LegalTextRead,
)
def update_themes(
    slug: str,
    body: LegalThemeTagWrite,
    db: DbSession,
    user: EditorialUser,
    service: EditorialServiceDep,
):
    """Replace the editor-confirmed theme set on a legal text.

    Auto suggester tags coexist alongside; a matching auto tag is promoted
    to editor instead of being duplicated. To remove all editor tags, send
    an empty list.
    """
    result = service.replace_theme_tags(slug, themes=body.themes, actor=user)
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


# The translation-pipeline routes — /translations/stats and
# /translations — used to live below this point. They were lifted into
# ``api/routes/editorial_translations.py`` (same /editorial prefix +
# editorial tag, so the public URLs didn't move) to keep this file
# trim. Other groups (legal_texts CRUD, articles, headings, signers,
# themes, identity) still live here; another split pass can lift them
# the same way once they grow.
