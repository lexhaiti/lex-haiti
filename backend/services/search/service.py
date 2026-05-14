"""Search service — composes the retrieval pipeline and exposes typed results."""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from schemas.article import ArticleListItem
from schemas.enums import CodeSubcategory, LegalCategory, LegalStatus
from schemas.legal_text import LegalTextListItem
from schemas.search import (
    PaginatedSearchResponse,
    SearchHit,
    SearchSnippet,
)
from services.search.repository import SearchRepository


class SearchService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.repo = SearchRepository(session)

    def search_texts(
        self,
        q: str,
        *,
        category: Optional[LegalCategory] = None,
        code_subcategory: Optional[CodeSubcategory] = None,
        legal_status: Optional[LegalStatus] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> PaginatedSearchResponse:
        q_clean = (q or "").strip()
        page = (offset // max(limit, 1)) + 1

        if not q_clean:
            return PaginatedSearchResponse(
                items=[], total=0, page=page, size=limit, query=""
            )

        rows, total = self.repo.search_texts(
            q_clean,
            category=category,
            code_subcategory=code_subcategory,
            legal_status=legal_status,
            limit=limit,
            offset=offset,
        )
        if not rows:
            return PaginatedSearchResponse(
                items=[], total=0, page=page, size=limit, query=q_clean
            )

        text_ids = [int(r["id"]) for r in rows]
        snippets_by_text = self.repo.fetch_snippets_for_texts(text_ids, q_clean)

        items: list[SearchHit] = []
        for r in rows:
            text_item = LegalTextListItem(
                id=r["id"],
                slug=r["slug"],
                title_fr=r["title_fr"],
                title_ht=r["title_ht"],
                category=r["category"],
                code_subcategory=r["code_subcategory"],
                status=r["status"],
                editorial_status=r["editorial_status"],
                moniteur_ref=r["moniteur_ref"],
                publication_date=r["publication_date"],
                description_fr=r["description_fr"],
                description_ht=r["description_ht"],
            )

            snippets: list[SearchSnippet] = []
            for s in snippets_by_text.get(int(r["id"]), []):
                article = ArticleListItem(
                    id=s["article_id"],
                    legal_text_id=int(r["id"]),
                    heading_id=s["heading_id"],
                    number=s["number"],
                    slug=s["article_slug"],
                    position=s["position"],
                    domain_tags=list(s["domain_tags"] or []),
                )
                snippets.append(
                    SearchSnippet(
                        article=article,
                        snippet_fr=s["snippet_fr"] or "",
                        snippet_ht=s["snippet_ht"] or "",
                    )
                )

            items.append(
                SearchHit(
                    text=text_item,
                    matched_articles=int(r["matched_articles"] or 0),
                    snippets=snippets,
                )
            )

        return PaginatedSearchResponse(
            items=items,
            total=total,
            page=page,
            size=limit,
            query=q_clean,
        )
