"""Aggregate router — all v1 endpoints mount under /api/v1."""
from fastapi import APIRouter

from api.routes import (
    admin_users,
    articles,
    citations,
    decisions,
    editorial,
    editorial_translations,
    legal_texts,
    moniteur,
    promulgations,
    search,
    stats,
)

api_router = APIRouter()
api_router.include_router(legal_texts.router)
api_router.include_router(articles.router)
api_router.include_router(decisions.router)
api_router.include_router(citations.router)
api_router.include_router(editorial.router)
# Split out of editorial.py — translation-pipeline dashboard +
# worklist. Same /editorial prefix and tag so the URL surface is
# unchanged from the client's perspective.
api_router.include_router(editorial_translations.router)
api_router.include_router(moniteur.router)
api_router.include_router(promulgations.router)
api_router.include_router(search.router)
api_router.include_router(stats.router)
api_router.include_router(admin_users.router)
