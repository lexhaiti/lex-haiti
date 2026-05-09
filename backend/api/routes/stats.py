"""Public corpus statistics — drives the homepage stats strip.

Composes counts from corpus + ingestion at the api layer because the
two services are required to stay independent by the import-linter
contracts in pyproject.toml. Costs a handful of count(*) queries per
request — cached for 5 minutes so the homepage doesn't hammer the DB.
"""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response

from api.deps import DbSession
from packages.schemas.common import CorpusStats
from services.corpus.repository import CorpusRepository
from services.ingestion.moniteur.repository import MoniteurRepository

router = APIRouter(tags=["stats"])


@router.get("/stats", response_model=CorpusStats)
def get_corpus_stats(db: DbSession, response: Response):
    """Aggregated corpus counts: published legal texts, articles, and
    Moniteur issues. Cached 5 min via Cache-Control."""
    corpus = CorpusRepository(db)
    moniteur = MoniteurRepository(db)
    payload = CorpusStats(
        legal_texts=corpus.count_published_legal_texts(),
        articles=corpus.count_published_articles(),
        moniteur_issues=moniteur.count_published_issues(),
    )
    response.headers["Cache-Control"] = "public, max-age=300"
    return payload
