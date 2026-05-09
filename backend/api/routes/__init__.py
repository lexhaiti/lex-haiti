"""Aggregate router — all v1 endpoints mount under /api/v1."""
from fastapi import APIRouter

from api.routes import (
    articles,
    citations,
    decisions,
    editorial,
    legal_texts,
    moniteur,
    search,
)

api_router = APIRouter()
api_router.include_router(legal_texts.router)
api_router.include_router(articles.router)
api_router.include_router(decisions.router)
api_router.include_router(citations.router)
api_router.include_router(editorial.router)
api_router.include_router(moniteur.router)
api_router.include_router(search.router)
