"""Repository for the Moniteur ingestion pipeline.

Manages MoniteurIssue and MoniteurEntry lifecycle, pipeline
orchestration, and promotion of entries to LegalText.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import cast, desc, func, or_, select
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.types import String

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
    MoniteurEntry,
    MoniteurIssue,
)
from services.corpus.repository import CorpusRepository
from services.corpus.themes import suggest_themes
from services.ingestion.article_split import split_into_articles, split_preamble
from services.ingestion.moniteur.parser import ParsedCandidate, run_pipeline
from services.ingestion.ocr import extract_text_from_pdf


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
                selectinload(MoniteurIssue.entries).selectinload(
                    MoniteurEntry.promoted_legal_text
                )
            )
            .offset(offset)
            .limit(limit)
        )
        rows = list(self.session.execute(stmt).scalars().all())
        return rows, total

    def search_issues(
        self,
        q: str,
        *,
        limit: int = 10,
        published_only: bool = True,
    ) -> Tuple[List[MoniteurIssue], int]:
        """Substring match across the issue's identifier-ish fields.

        Used by the global /search endpoint to surface a Moniteur issue
        directly when a visitor types a number or part of an edition
        label. We don't run FTS here — the search surface is short
        (number, edition label, year) and ILIKE on a tiny corpus is
        plenty fast and predictable.
        """
        limit = max(1, min(limit, 50))
        needle = f"%{q.strip()}%"

        clauses = [
            MoniteurIssue.number.ilike(needle),
            MoniteurIssue.edition_label.ilike(needle),
            cast(MoniteurIssue.year, String).ilike(needle),
        ]

        stmt = select(MoniteurIssue).where(or_(*clauses))
        if published_only:
            stmt = stmt.where(
                MoniteurIssue.processing_status == MoniteurIssueStatus.published
            )

        total = int(
            self.session.execute(
                select(func.count()).select_from(stmt.subquery())
            ).scalar_one()
        )

        stmt = stmt.order_by(
            desc(MoniteurIssue.publication_date),
            desc(MoniteurIssue.id),
        ).limit(limit)
        rows = list(self.session.execute(stmt).scalars().all())
        return rows, total

    def count_published_issues(self) -> int:
        """Count Moniteur issues whose processing pipeline finished and
        whose status is published — i.e., what the public site shows."""
        return int(
            self.session.execute(
                select(func.count())
                .select_from(MoniteurIssue)
                .where(
                    MoniteurIssue.processing_status == MoniteurIssueStatus.published
                )
            ).scalar_one()
        )

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
    # Entries
    # -------------------------------------------------------------------

    def get_issue_with_entries(
        self, issue_id: int
    ) -> Optional[MoniteurIssue]:
        stmt = (
            select(MoniteurIssue)
            .where(MoniteurIssue.id == issue_id)
            .options(
                selectinload(MoniteurIssue.entries).selectinload(
                    MoniteurEntry.promoted_legal_text
                )
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def get_entry(self, entry_id: int) -> Optional[MoniteurEntry]:
        stmt = (
            select(MoniteurEntry)
            .where(MoniteurEntry.id == entry_id)
            .options(selectinload(MoniteurEntry.promoted_legal_text))
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def replace_entries(
        self, issue: MoniteurIssue, parsed: List[ParsedCandidate]
    ) -> List[MoniteurEntry]:
        """Drop existing unpromoted entries and write new parser output."""
        for old in list(issue.entries):
            if old.promoted_legal_text_id is None:
                self.session.delete(old)
        self.session.flush()

        out: list[MoniteurEntry] = []
        for i, p in enumerate(parsed):
            row = MoniteurEntry(
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

    def set_sommaire_entries(
        self,
        issue: MoniteurIssue,
        sommaire: List[dict],
    ) -> List[MoniteurEntry]:
        """Replace pending entries with editor-supplied sommaire stubs.

        Each `sommaire` dict is expected to carry at least
        `detected_category`, `page_from`, `page_to`, and optionally
        `detected_title` / `detected_number`. The resulting entries
        have no `raw_text` yet — the parser will fill that from
        scoped OCR over the declared page range.

        Promoted entries are kept as-is; only pending entries are
        cleared, mirroring `replace_entries`.
        """
        for old in list(issue.entries):
            if old.promoted_legal_text_id is None:
                self.session.delete(old)
        self.session.flush()

        out: list[MoniteurEntry] = []
        for i, item in enumerate(sommaire):
            row = MoniteurEntry(
                issue_id=issue.id,
                position=i,
                detected_category=item.get("detected_category"),
                detected_title=item.get("detected_title"),
                detected_number=item.get("detected_number"),
                page_from=item.get("page_from"),
                page_to=item.get("page_to"),
                raw_text="",  # filled by run_parse_for_issue
            )
            self.session.add(row)
            out.append(row)
        self.session.flush()
        return out

    def fill_entries_from_pages(
        self,
        issue: MoniteurIssue,
        pages: List[str],
    ) -> List[MoniteurEntry]:
        """Populate raw_text + provenance for pre-filled sommaire entries.

        Pages are 1-indexed in the Moniteur's printed numbering, so we
        translate to the 0-indexed pages array. If page_from / page_to
        are out of range we silently clamp — the editor will see the
        anomaly on review.
        """
        total = len(pages)
        for entry in issue.entries:
            if entry.promoted_legal_text_id is not None:
                continue  # don't disturb already-promoted entries
            pf = entry.page_from or 1
            pt = entry.page_to or pf
            lo = max(1, min(pf, total))
            hi = max(lo, min(pt, total))
            chunk = "\n\n".join(
                pages[i] for i in range(lo - 1, hi) if pages[i].strip()
            )
            entry.raw_text = chunk
            # Confidence is high — the boundaries were declared, not guessed.
            entry.confidence = None
        self.session.flush()
        return list(issue.entries)

    # -------------------------------------------------------------------
    # Pipeline orchestration
    # -------------------------------------------------------------------

    def run_parse_for_issue(self, issue: MoniteurIssue) -> MoniteurIssue:
        """OCR + parse the issue's PDF, write entries, update status.

        Two flows depending on whether the editor pre-filled the sommaire:

        - **Pre-filled path** — pending entries already exist with declared
          `page_from`/`page_to`. We OCR the whole PDF once, then slice the
          OCR output per entry. No boundary detection.

        - **Heuristic path** — no pending entries. OCR + heuristic
          boundary detection via `run_pipeline`, then create entries from
          the parser's candidates.
        """
        if not issue.file_url:
            issue.processing_status = MoniteurIssueStatus.failed
            issue.processing_error = "No file uploaded for this issue."
            self.session.flush()
            return issue

        issue.processing_status = MoniteurIssueStatus.ocr_pending
        self.session.flush()

        # Pending = pre-filled by the editor; promoted = already accepted
        # and turned into a LegalText. We only consider the pending bucket
        # when deciding which path to take.
        pending_entries = [
            e for e in issue.entries if e.promoted_legal_text_id is None
        ]

        try:
            if pending_entries:
                pages = extract_text_from_pdf(issue.file_url)
                self.fill_entries_from_pages(issue, pages)
            else:
                parsed = run_pipeline(issue.file_url)
                self.replace_entries(issue, parsed)
            issue.processing_status = MoniteurIssueStatus.parsed
            issue.processing_error = None
            issue.parsed_at = datetime.now(timezone.utc)
        except Exception as e:  # noqa: BLE001
            issue.processing_status = MoniteurIssueStatus.failed
            issue.processing_error = f"{type(e).__name__}: {e}"
        self.session.flush()
        return issue

    # -------------------------------------------------------------------
    # Promotion: entry -> LegalText
    # -------------------------------------------------------------------

    def promote_entry(
        self,
        entry: MoniteurEntry,
        *,
        slug: str,
        title_fr: str,
        category: LegalCategory,
        description_fr: Optional[str] = None,
        publication_date=None,
    ) -> LegalText:
        """Create a draft LegalText from an entry and link it back."""
        split = split_into_articles(entry.raw_text or "")
        has_articles = len(split.articles) > 0
        parts = split_preamble(split.preamble)
        legal_text = LegalText(
            slug=slug,
            category=category,
            jurisdiction="HT",
            title_fr=title_fr,
            description_fr=description_fr or (
                None if has_articles else (entry.raw_text or "")[:500]
            ),
            preamble_fr=parts.preamble,
            visas_fr=parts.visas,
            considerants_fr=parts.considerants,
            enacting_formula_fr=parts.enacting_formula,
            publication_date=publication_date or entry.detected_date,
            status=LegalStatus.in_force,
            editorial_status=EditorialStatus.draft,
            moniteur_issue_id=entry.issue_id,
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
                confidence=entry.confidence,
            )
            self.session.add(version)
            self.session.flush()
            article.current_version_id = version.id
        if has_articles:
            self.session.flush()

        # Auto-tag themes from title + description (and bodies for codes /
        # constitutions; lois/décrets get title-only matching). The editor
        # confirms or overrides on the law detail page; auto tags remain
        # visible in /lois?theme=… until promoted or removed.
        article_bodies = (
            [v.text_fr for a in legal_text.articles for v in a.versions if v.text_fr]
            if has_articles
            else []
        )
        theme_matches = suggest_themes(
            title_fr=legal_text.title_fr,
            title_ht=legal_text.title_ht,
            description_fr=legal_text.description_fr,
            description_ht=legal_text.description_ht,
            category=legal_text.category,
            article_bodies=article_bodies,
        )
        if theme_matches:
            CorpusRepository(self.session).upsert_auto_theme_tags(
                legal_text.id,
                [(m.theme, float(m.confidence)) for m in theme_matches],
            )

        entry.promoted_legal_text_id = legal_text.id
        entry.review_status = MoniteurCandidateStatus.accepted
        entry.reviewed_at = datetime.now(timezone.utc)
        self.session.flush()
        return legal_text

    def update_entry_review(
        self,
        entry: MoniteurEntry,
        *,
        review_status: MoniteurCandidateStatus,
        review_notes: Optional[str] = None,
    ) -> MoniteurEntry:
        entry.review_status = review_status
        if review_notes is not None:
            entry.review_notes = review_notes
        entry.reviewed_at = datetime.now(timezone.utc)
        self.session.flush()
        return entry


def _slugify_article_number(num: str) -> str:
    """Article-number -> slug-safe ASCII."""
    s = num.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s or "n"
