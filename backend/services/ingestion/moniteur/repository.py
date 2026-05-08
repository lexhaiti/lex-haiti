"""Repository for the Moniteur ingestion pipeline.

Manages MoniteurIssue and MoniteurLawCandidate lifecycle, pipeline
orchestration, and promotion of candidates to LegalText.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, selectinload

from packages.schemas.enums import (
    EditorialStatus,
    LegalCategory,
    LegalStatus,
    MoniteurCandidateStatus,
    MoniteurIssueStatus,
)
from services.corpus.models import (
    Article,
    ArticleVersion,
    LegalText,
    MoniteurIssue,
    MoniteurLawCandidate,
)
from services.ingestion.article_split import split_into_articles
from services.ingestion.moniteur.parser import ParsedCandidate, run_pipeline


class MoniteurRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    # -------------------------------------------------------------------
    # Issues
    # -------------------------------------------------------------------

    def create_issue(
        self,
        *,
        number: str,
        year: int,
        publication_date=None,
        edition_label: Optional[str] = None,
        uploaded_by: Optional[int] = None,
    ) -> MoniteurIssue:
        issue = MoniteurIssue(
            number=number,
            year=year,
            publication_date=publication_date,
            edition_label=edition_label,
            uploaded_by=uploaded_by,
            processing_status=MoniteurIssueStatus.uploaded,
        )
        self.session.add(issue)
        self.session.flush()
        return issue

    def get_issue(self, issue_id: int) -> Optional[MoniteurIssue]:
        return self.session.get(MoniteurIssue, issue_id)

    def list_issues(
        self, *, limit: int = 50, offset: int = 0, published_only: bool = False
    ) -> Tuple[List[MoniteurIssue], int]:
        limit = max(1, min(limit, 100))
        offset = max(0, offset)

        stmt = select(MoniteurIssue)
        if published_only:
            stmt = stmt.where(
                MoniteurIssue.processing_status == MoniteurIssueStatus.published
            )

        total = int(
            self.session.execute(
                select(func.count()).select_from(stmt.subquery())
            ).scalar_one()
        )

        stmt = (
            stmt.order_by(
                desc(MoniteurIssue.publication_date),
                desc(MoniteurIssue.id),
            )
            .options(
                selectinload(MoniteurIssue.candidates).selectinload(
                    MoniteurLawCandidate.promoted_legal_text
                )
            )
            .offset(offset)
            .limit(limit)
        )
        rows = list(self.session.execute(stmt).scalars().all())
        return rows, total

    def update_issue(
        self, issue: MoniteurIssue, **fields
    ) -> MoniteurIssue:
        for k, v in fields.items():
            setattr(issue, k, v)
        self.session.flush()
        return issue

    def attach_file(
        self, issue: MoniteurIssue, *, file_url: str, page_count: Optional[int]
    ) -> MoniteurIssue:
        issue.file_url = file_url
        if page_count is not None:
            issue.page_count = page_count
        issue.processing_status = MoniteurIssueStatus.uploaded
        issue.processing_error = None
        issue.parsed_at = None
        self.session.flush()
        return issue

    def delete_issue(self, issue: MoniteurIssue) -> None:
        self.session.delete(issue)
        self.session.flush()

    # -------------------------------------------------------------------
    # Candidates
    # -------------------------------------------------------------------

    def get_issue_with_candidates(
        self, issue_id: int
    ) -> Optional[MoniteurIssue]:
        stmt = (
            select(MoniteurIssue)
            .where(MoniteurIssue.id == issue_id)
            .options(
                selectinload(MoniteurIssue.candidates).selectinload(
                    MoniteurLawCandidate.promoted_legal_text
                )
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def get_candidate(self, candidate_id: int) -> Optional[MoniteurLawCandidate]:
        stmt = (
            select(MoniteurLawCandidate)
            .where(MoniteurLawCandidate.id == candidate_id)
            .options(selectinload(MoniteurLawCandidate.promoted_legal_text))
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def replace_candidates(
        self, issue: MoniteurIssue, parsed: List[ParsedCandidate]
    ) -> List[MoniteurLawCandidate]:
        """Drop existing unpromoted candidates and write new parser output."""
        for old in list(issue.candidates):
            if old.promoted_legal_text_id is None:
                self.session.delete(old)
        self.session.flush()

        out: list[MoniteurLawCandidate] = []
        for i, p in enumerate(parsed):
            row = MoniteurLawCandidate(
                issue_id=issue.id,
                position=i,
                detected_category=p.detected_category,
                detected_title=p.detected_title,
                detected_number=p.detected_number,
                detected_date=p.detected_date,
                raw_text=p.raw_text,
                confidence=p.confidence,
                page_from=p.page_from,
                page_to=p.page_to,
            )
            self.session.add(row)
            out.append(row)
        self.session.flush()
        return out

    # -------------------------------------------------------------------
    # Pipeline orchestration
    # -------------------------------------------------------------------

    def run_parse_for_issue(self, issue: MoniteurIssue) -> MoniteurIssue:
        """OCR + parse the issue's PDF, write candidates, update status."""
        if not issue.file_url:
            issue.processing_status = MoniteurIssueStatus.failed
            issue.processing_error = "No file uploaded for this issue."
            self.session.flush()
            return issue

        issue.processing_status = MoniteurIssueStatus.ocr_pending
        self.session.flush()

        try:
            parsed = run_pipeline(issue.file_url)
            self.replace_candidates(issue, parsed)
            issue.processing_status = MoniteurIssueStatus.parsed
            issue.processing_error = None
            issue.parsed_at = datetime.now(timezone.utc)
        except Exception as e:  # noqa: BLE001
            issue.processing_status = MoniteurIssueStatus.failed
            issue.processing_error = f"{type(e).__name__}: {e}"
        self.session.flush()
        return issue

    # -------------------------------------------------------------------
    # Promotion: candidate -> LegalText
    # -------------------------------------------------------------------

    def promote_candidate(
        self,
        candidate: MoniteurLawCandidate,
        *,
        slug: str,
        title_fr: str,
        category: LegalCategory,
        description_fr: Optional[str] = None,
        publication_date=None,
    ) -> LegalText:
        """Create a draft LegalText from a candidate and link it back."""
        split = split_into_articles(candidate.raw_text or "")
        has_articles = len(split.articles) > 0
        legal_text = LegalText(
            slug=slug,
            category=category,
            jurisdiction="HT",
            title_fr=title_fr,
            description_fr=description_fr or (
                None if has_articles else (candidate.raw_text or "")[:500]
            ),
            preamble_fr=split.preamble or None,
            publication_date=publication_date or candidate.detected_date,
            status=LegalStatus.in_force,
            editorial_status=EditorialStatus.draft,
            moniteur_issue_id=candidate.issue_id,
        )
        self.session.add(legal_text)
        self.session.flush()

        for position, parsed in enumerate(split.articles):
            article_slug = f"art-{_slugify_article_number(parsed.number)}"
            article = Article(
                legal_text_id=legal_text.id,
                number=parsed.number,
                slug=article_slug,
                position=position,
            )
            self.session.add(article)
            self.session.flush()
            version = ArticleVersion(
                article_id=article.id,
                version_number=1,
                title_fr=parsed.title,
                text_fr=parsed.body,
                editorial_status=EditorialStatus.draft,
                confidence=candidate.confidence,
            )
            self.session.add(version)
            self.session.flush()
            article.current_version_id = version.id
        if has_articles:
            self.session.flush()

        candidate.promoted_legal_text_id = legal_text.id
        candidate.review_status = MoniteurCandidateStatus.accepted
        candidate.reviewed_at = datetime.now(timezone.utc)
        self.session.flush()
        return legal_text

    def update_candidate_review(
        self,
        candidate: MoniteurLawCandidate,
        *,
        review_status: MoniteurCandidateStatus,
        review_notes: Optional[str] = None,
    ) -> MoniteurLawCandidate:
        candidate.review_status = review_status
        if review_notes is not None:
            candidate.review_notes = review_notes
        candidate.reviewed_at = datetime.now(timezone.utc)
        self.session.flush()
        return candidate


def _slugify_article_number(num: str) -> str:
    """Article-number -> slug-safe ASCII."""
    s = num.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s or "n"
