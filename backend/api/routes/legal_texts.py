import re
from typing import List, Literal, Optional

from fastapi import APIRouter, Query
from fastapi.responses import Response

from api.config import get_settings
from api.deps import CorpusServiceDep, SearchServiceDep
from packages.schemas.article import ArticleListItem, ArticleWithHistoryRead
from packages.schemas.common import PaginatedResponse
from packages.schemas.enums import (
    CodeSubcategory,
    EditorialStatus,
    LegalCategory,
    LegalStatus,
    LegalTheme,
    ThemeSource,
)
from packages.schemas.heading import TocNode
from packages.schemas.legal_text import LegalTextListItem, LegalTextRead
from packages.schemas.search import PaginatedSearchResponse
from services.corpus.export import render_docx, render_pdf

router = APIRouter(prefix="/legal-texts", tags=["legal-texts"])

IncludeMode = Optional[Literal["toc", "all"]]


@router.get("", response_model=PaginatedResponse[LegalTextListItem])
def list_legal_texts(
    service: CorpusServiceDep,
    q: Optional[str] = Query(
        None, description="Search text. Combined with q_field and q_mode."
    ),
    q_field: Literal["all", "title", "description"] = Query(
        "all",
        description=(
            "Where the search text is matched: 'all' (titles + descriptions + "
            "Moniteur ref), 'title' (titles only), 'description' (descriptions only)."
        ),
    ),
    q_mode: Literal["all", "exact", "any", "exclude"] = Query(
        "all",
        description=(
            "How the search text is matched: 'all' (every word must match), "
            "'exact' (full phrase substring), 'any' (at least one word), "
            "'exclude' (none of the words)."
        ),
    ),
    category: Optional[LegalCategory] = None,
    code_subcategory: Optional[CodeSubcategory] = None,
    legal_status: Optional[LegalStatus] = Query(None, alias="status"),
    editorial_status: Optional[EditorialStatus] = Query(
        EditorialStatus.published,
        description="Editorial workflow filter; defaults to published.",
    ),
    year_from: Optional[int] = Query(
        None,
        ge=1700,
        le=2200,
        description="Inclusive lower bound on publication_date year.",
    ),
    year_to: Optional[int] = Query(
        None,
        ge=1700,
        le=2200,
        description="Inclusive upper bound on publication_date year.",
    ),
    theme: Optional[List[LegalTheme]] = Query(
        None,
        description=(
            "Filter by one or more themes (cross-cutting legal-domain tags). "
            "ANY-match: a text qualifies if it carries any of the requested "
            "themes. Repeat the param for multi-theme filters: "
            "?theme=droit_famille&theme=successions."
        ),
    ),
    theme_source: Optional[ThemeSource] = Query(
        None,
        description=(
            "Restrict theme matches to a given provenance. 'editor' shows "
            "only editor-confirmed tags (strict); 'auto' shows only "
            "suggester-only tags (review queue). Omit for both."
        ),
    ),
    sort: Literal[
        "publication_date",
        "recently_updated",
        "recently_added",
        "recently_published",
        "oldest",
        "alphabetical",
    ] = Query(
        "publication_date",
        description=(
            "Result ordering. 'publication_date' (default) sorts by historical "
            "publication date (newest first). 'recently_updated' sorts by "
            "updated_at — the right choice for editorial activity feeds. "
            "'recently_added' sorts by created_at. 'recently_published' "
            "sorts by published_at. 'oldest' is publication_date ascending. "
            "'alphabetical' sorts by title_fr."
        ),
    ),
    with_snippets: bool = Query(
        False,
        description=(
            "If true and q is set with q_field=all, each item gets up to 2 "
            "highlighted article snippets (`<mark>...</mark>`) showing where "
            "the query matched in the article body."
        ),
    ),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    return service.list_texts(
        q=q,
        q_field=q_field,
        q_mode=q_mode,
        category=category,
        code_subcategory=code_subcategory,
        legal_status=legal_status,
        editorial_status=editorial_status,
        year_from=year_from,
        year_to=year_to,
        themes=theme,
        theme_source=theme_source,
        sort=sort,
        with_snippets=with_snippets,
        limit=limit,
        offset=offset,
    )


@router.get("/quick-access", response_model=List[LegalTextListItem])
def quick_access(service: CorpusServiceDep):
    return service.get_quick_access()


@router.get("/search", response_model=PaginatedSearchResponse)
def search_legal_texts(
    service: SearchServiceDep,
    q: str = Query(..., min_length=1, description="Free-text search query."),
    category: Optional[LegalCategory] = None,
    code_subcategory: Optional[CodeSubcategory] = None,
    legal_status: Optional[LegalStatus] = Query(None, alias="status"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Hybrid lexical search across legal-text titles and article content.

    Returns ranked legal texts with up to 3 highlighted article snippets each.
    """
    return service.search_texts(
        q,
        category=category,
        code_subcategory=code_subcategory,
        legal_status=legal_status,
        limit=limit,
        offset=offset,
    )


@router.get("/{slug}", response_model=LegalTextRead)
def get_legal_text(
    slug: str,
    service: CorpusServiceDep,
    include: IncludeMode = Query(
        None,
        description="Optional includes: 'toc' (headings only) or 'all' (headings + articles + signers).",
    ),
):
    return service.get_text_by_slug(slug, include=include)


@router.get("/{slug}/toc", response_model=List[TocNode])
def get_toc(slug: str, service: CorpusServiceDep):
    return service.get_toc_by_slug(slug)


@router.get(
    "/{slug}/amendments",
    response_model=List[ArticleWithHistoryRead],
)
def get_amendments(slug: str, service: CorpusServiceDep):
    """Articles in the given legal text that have more than one version.

    Powers the constitutional-amendments page: each item is an article with
    its full version history embedded (sorted by version_number). The
    frontend renders the timeline; the API doesn't pre-compute diffs.
    """
    return service.list_amendments_by_text_slug(slug)


@router.get(
    "/{slug}/articles",
    response_model=PaginatedResponse[ArticleListItem],
)
def list_articles_in_text(
    slug: str,
    service: CorpusServiceDep,
    heading_id: Optional[int] = Query(None, description="Filter by heading id"),
    heading_key: Optional[str] = Query(
        None, description="Filter by heading key (recommended for the frontend)"
    ),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    return service.list_articles_by_text_slug(
        slug,
        heading_id=heading_id,
        heading_key=heading_key,
        limit=limit,
        offset=offset,
    )


# Filename-safe slug — drops accents/punctuation, keeps the ASCII spine that
# survives every browser's Content-Disposition handling without needing
# RFC 5987 percent-encoding.
_FILENAME_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _filename_for(text: LegalTextRead, lang: str, ext: str) -> str:
    base = _FILENAME_SAFE.sub("-", text.slug).strip("-") or "document"
    return f"lexhaiti-{base}-{lang}.{ext}"


_EXPORT_FORMATS = {
    "pdf": ("application/pdf", "pdf", render_pdf),
    "docx": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "docx",
        render_docx,
    ),
}


@router.get("/{slug}/export", response_class=Response)
def export_legal_text(
    slug: str,
    service: CorpusServiceDep,
    format: Literal["pdf", "docx"] = Query(
        "pdf", description="Output format. Defaults to PDF."
    ),
    lang: Literal["fr", "ht"] = Query(
        "fr", description="Language for labels and content (FR fallback if HT empty)."
    ),
):
    """Generate a citable PDF or DOCX of the legal text.

    The exported document carries a cover page (brand identity + metadata),
    the structured body (headings + articles), and a per-page provenance
    footer with the canonical permalink + version date — so a printed copy
    is always verifiable on lexhaiti.ht.
    """
    text = service.get_text_by_slug(slug, include="all")

    media_type, ext, renderer = _EXPORT_FORMATS[format]
    payload = renderer(
        text, lang=lang, base_url=get_settings().public_site_url
    )
    filename = _filename_for(text, lang, ext)
    return Response(
        content=payload,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # Cache invalidates whenever the editorial layer republishes.
            "Cache-Control": "public, max-age=300",
        },
    )
