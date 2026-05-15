"""Translation-pipeline routes for the editorial dashboard.

Split out of the monolithic ``editorial.py`` (which still hosts the
legal-text CRUD, articles, headings, signers, themes, and identity
endpoints). Same ``/editorial`` prefix and same ``editorial`` OpenAPI
tag so the public URL surface doesn't move.

  * ``GET /editorial/translations/stats``   — dashboard counters
  * ``GET /editorial/translations``          — worklist of legal texts
                                              ordered by translation gap

Mounted by ``api/routes/__init__.py`` alongside the original editorial
router.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import case, func, select

from api.deps import DbSession, EditorialUser
from services.corpus.models import (
    Article,
    ArticleVersion,
    LegalText,
    MoniteurEntry,
)


router = APIRouter(prefix="/editorial", tags=["editorial"])


# ----------------------------------------------------------------------
# Pydantic shapes
# ----------------------------------------------------------------------


class TranslationStats(BaseModel):
    """High-level translation coverage stats for the editorial dashboard."""

    legal_texts_total: int
    legal_texts_with_ht: int      # at least one article has text_ht
    legal_texts_fully_translated: int  # every article has text_ht
    legal_texts_fr_only: int      # no article has text_ht
    articles_total: int
    articles_translated: int
    moniteur_entries_total: int
    moniteur_entries_with_translation_pointer: int
    moniteur_entries_pending_translation: int  # promoted but no pointer


class TranslationWorklistItem(BaseModel):
    """One legal_text on the translation worklist."""

    id: int
    slug: str
    title_fr: str
    category: str
    editorial_status: str
    total_articles: int
    translated_articles: int
    pct: int  # 0-100


# ----------------------------------------------------------------------
# Endpoints
# ----------------------------------------------------------------------


@router.get("/translations/stats", response_model=TranslationStats)
def translation_stats(db: DbSession, user: EditorialUser):  # noqa: ARG001
    """Translation-pipeline counters for the editorial dashboard.

    Two SQL aggregates: one for the per-text coverage buckets, one for
    the global article + moniteur-entry counters. Was 7 separate
    count(*) round trips before — see commit history for the change
    log. Scales past 100K texts without revisiting.
    """
    is_translated = (ArticleVersion.text_ht.is_not(None)) & (
        func.length(func.trim(ArticleVersion.text_ht)) > 0
    )

    text_stats = (
        select(
            LegalText.id.label("text_id"),
            func.count(Article.id).label("total"),
            func.sum(case((is_translated, 1), else_=0)).label("translated"),
        )
        .join(Article, Article.legal_text_id == LegalText.id, isouter=True)
        .join(
            ArticleVersion,
            ArticleVersion.id == Article.current_version_id,
            isouter=True,
        )
        .group_by(LegalText.id)
        .subquery()
    )

    coverage_row = db.execute(
        select(
            func.count(text_stats.c.text_id).label("total"),
            func.sum(
                case(
                    ((text_stats.c.translated > 0), 1),
                    else_=0,
                )
            ).label("with_ht"),
            func.sum(
                case(
                    (
                        (text_stats.c.total > 0)
                        & (text_stats.c.translated == text_stats.c.total),
                        1,
                    ),
                    else_=0,
                )
            ).label("fully"),
            func.sum(
                case(
                    (
                        (text_stats.c.total > 0)
                        & (text_stats.c.translated == 0),
                        1,
                    ),
                    else_=0,
                )
            ).label("fr_only"),
        )
    ).one()

    counters_row = db.execute(
        select(
            func.count(Article.id).label("articles_total"),
            func.coalesce(
                func.sum(case((is_translated, 1), else_=0)),
                0,
            ).label("articles_translated"),
        )
        .select_from(Article)
        .join(
            ArticleVersion,
            ArticleVersion.id == Article.current_version_id,
            isouter=True,
        )
    ).one()
    moniteur_row = db.execute(
        select(
            func.count(MoniteurEntry.id).label("total"),
            func.sum(
                case(
                    (MoniteurEntry.translation_issue_id.is_not(None), 1),
                    else_=0,
                )
            ).label("with_pointer"),
            func.sum(
                case(
                    (
                        (MoniteurEntry.promoted_legal_text_id.is_not(None))
                        & (MoniteurEntry.translation_issue_id.is_(None)),
                        1,
                    ),
                    else_=0,
                )
            ).label("pending"),
        )
    ).one()

    return TranslationStats(
        legal_texts_total=int(coverage_row.total or 0),
        legal_texts_with_ht=int(coverage_row.with_ht or 0),
        legal_texts_fully_translated=int(coverage_row.fully or 0),
        legal_texts_fr_only=int(coverage_row.fr_only or 0),
        articles_total=int(counters_row.articles_total or 0),
        articles_translated=int(counters_row.articles_translated or 0),
        moniteur_entries_total=int(moniteur_row.total or 0),
        moniteur_entries_with_translation_pointer=int(moniteur_row.with_pointer or 0),
        moniteur_entries_pending_translation=int(moniteur_row.pending or 0),
    )


@router.get(
    "/translations",
    response_model=List[TranslationWorklistItem],
    summary="List legal texts ordered by translation gap (most missing first)",
)
def translation_worklist(
    db: DbSession,
    user: EditorialUser,  # noqa: ARG001
    coverage: str = Query(
        "all",
        description="Filter: all | none (no HT) | partial | complete",
    ),
    limit: int = Query(50, ge=1, le=200),
):
    """Worklist for the translation editor — every legal_text with its
    current HT coverage. Sorted by gap (least translated first) by
    default so the editor sees the most urgent texts.
    """
    translated_expr = func.sum(
        case(
            (
                (ArticleVersion.text_ht.is_not(None))
                & (func.length(func.trim(ArticleVersion.text_ht)) > 0),
                1,
            ),
            else_=0,
        )
    )

    stmt = (
        select(
            LegalText.id,
            LegalText.slug,
            LegalText.title_fr,
            LegalText.category,
            LegalText.editorial_status,
            func.count(Article.id).label("total"),
            translated_expr.label("translated"),
        )
        .join(Article, Article.legal_text_id == LegalText.id, isouter=True)
        .join(
            ArticleVersion,
            ArticleVersion.id == Article.current_version_id,
            isouter=True,
        )
        .group_by(
            LegalText.id,
            LegalText.slug,
            LegalText.title_fr,
            LegalText.category,
            LegalText.editorial_status,
        )
    )

    rows = db.execute(stmt).all()
    items: list[TranslationWorklistItem] = []
    for r in rows:
        total = r.total or 0
        translated = r.translated or 0
        pct = int((translated / total) * 100) if total > 0 else 0
        if coverage == "none" and translated > 0:
            continue
        if coverage == "partial" and (translated == 0 or translated == total):
            continue
        if coverage == "complete" and (total == 0 or translated < total):
            continue
        items.append(
            TranslationWorklistItem(
                id=r.id,
                slug=r.slug,
                title_fr=r.title_fr,
                category=r.category.value if hasattr(r.category, "value") else r.category,
                editorial_status=(
                    r.editorial_status.value
                    if hasattr(r.editorial_status, "value")
                    else r.editorial_status
                ),
                total_articles=total,
                translated_articles=translated,
                pct=pct,
            )
        )

    # Worklist sort: least translated first, then by title for stability.
    items.sort(key=lambda x: (x.pct, x.title_fr.lower()))
    return items[:limit]
