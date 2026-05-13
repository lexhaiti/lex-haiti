"""Repository for the Moniteur ingestion pipeline.

Manages MoniteurIssue and MoniteurEntry lifecycle, pipeline
orchestration, and promotion of entries to LegalText.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import cast, desc, func, or_, select
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.types import String

from packages.schemas.enums import (
    BlockKind,
    EditorialStatus,
    LegalCategory,
    LegalStatus,
    MoniteurCandidateStatus,
    MoniteurIssueStatus,
    PROMOTABLE_TYPES,
    ParserProfile,
)
from services.corpus.models import (
    Article,
    ArticleVersion,
    LegalHeading,
    LegalText,
    MoniteurEntry,
    MoniteurIssue,
)
from services.corpus.repository import CorpusRepository
from services.corpus.themes import suggest_themes
from services.ingestion.article_split import split_preamble
from services.ingestion.document_parser import parse_document
from services.ingestion.moniteur.parser import (
    ParsedCandidate,
    detect_law_candidates,
    run_pipeline,
)
from services.ingestion.ocr import extract_text_from_pdf
from services.ingestion.parsers import (
    ParserContext,
    ParserOutput,
    get_parser,
    profile_for_category,
)


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
        director: Optional[str] = None,
        director_role: Optional[str] = None,
        uploaded_by: Optional[int] = None,
    ) -> MoniteurIssue:
        issue = MoniteurIssue(
            number=number,
            year=year,
            publication_date=publication_date,
            edition_label=edition_label,
            director=director,
            director_role=director_role,
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
        """Substring + fuzzy-trigram match across the issue's identifier-ish
        fields (number, edition label, year) and the loi numbers carried
        by its child entries (detected_number).

        Two layers compose:
          • ILIKE  — strict substring match. Catches "Spécial",
            "Spécial 5", partial entry numbers, year prefixes.
          • pg_trgm `%` similarity — fuzzy fallback for typo'd
            identifiers (default 0.3 threshold). "CL-007-07-09" still
            finds an issue whose entry carries "CL-007-09-09" — same
            as the law search's `identifier_matches` branch.

        Both layers OR together so the editor's homepage search picks
        up issues whether they typed the loi number cleanly, with a
        digit off, or with a partial label.

        We deliberately don't run full-text on this surface — the
        searchable surface is short identifiers, FTS would tokenize
        oddly (hyphens split CL-007 into 'cl' + '007') and trigrams
        already match those cases.
        """
        limit = max(1, min(limit, 50))
        q_clean = q.strip()
        needle = f"%{q_clean}%"

        # Fuzzy clauses only fire for identifier-like queries — short,
        # alphanumeric, no spaces. Otherwise a query like "constitution"
        # would noisily fuzzy-match every short field on the table.
        identifier_like = bool(q_clean) and (
            "-" in q_clean
            or (len(q_clean) <= 24 and all(c.isalnum() or c in "./_-" for c in q_clean))
        )

        clauses = [
            MoniteurIssue.number.ilike(needle),
            MoniteurIssue.edition_label.ilike(needle),
            cast(MoniteurIssue.year, String).ilike(needle),
            # Strict-substring match against an entry's loi number —
            # surfaces the issue when the visitor types the law
            # identifier exactly (e.g. "CL-007-09-09" → "Spécial N° 5").
            select(1)
            .select_from(MoniteurEntry)
            .where(
                MoniteurEntry.issue_id == MoniteurIssue.id,
                MoniteurEntry.detected_number.ilike(needle),
            )
            .exists(),
        ]

        if identifier_like:
            # Fuzzy on the issue's own number (typo'd issue numbers like
            # "Special 5" without the accent — trigram similarity catches
            # the swapped-character case the law search already handles).
            clauses.append(
                func.similarity(
                    func.coalesce(MoniteurIssue.number, ""), q_clean
                )
                > 0.3
            )
            # Fuzzy on the child entry's detected_number — the typo case
            # the user flagged ("CL-007-07-09" finds "CL-007-09-09").
            clauses.append(
                select(1)
                .select_from(MoniteurEntry)
                .where(
                    MoniteurEntry.issue_id == MoniteurIssue.id,
                    MoniteurEntry.detected_number.is_not(None),
                    func.similarity(MoniteurEntry.detected_number, q_clean)
                    > 0.3,
                )
                .exists()
            )

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

    # Inverse French-month map for slug parsing. Mirrors the one in
    # ``packages.schemas.moniteur`` so slugs round-trip cleanly.
    _SLUG_MONTHS = {
        "janvier": 1, "fevrier": 2, "fevrier": 2, "mars": 3,
        "avril": 4, "mai": 5, "juin": 6, "juillet": 7,
        "aout": 8, "septembre": 9, "octobre": 10,
        "novembre": 11, "decembre": 12,
    }

    def get_issue_by_slug_with_entries(
        self, slug: str
    ) -> Optional[MoniteurIssue]:
        """Resolve a date-based slug (e.g. ``28-avril-1987``) to its
        MoniteurIssue. Returns the issue with eager-loaded entries, the
        same shape ``get_issue_with_entries`` returns by ID.

        Slug grammar: ``{day}-{month_fr}-{year}``. Parsing is lenient
        on case + extra trailing parts (the route allows future
        ``28-avril-1987-extraordinaire``-style disambiguators without
        breaking older links). When multiple issues share the same
        publication_date — rare but possible for paired regular +
        special issues — returns the first by ascending ``id``.
        Returns None on parse failure or no match.
        """
        from datetime import date as _date

        parts = slug.strip().lower().split("-")
        if len(parts) < 3:
            return None
        try:
            day = int(parts[0])
            year = int(parts[2])
        except ValueError:
            return None
        month_name = parts[1]
        month = self._SLUG_MONTHS.get(month_name)
        if month is None:
            return None
        try:
            target_date = _date(year, month, day)
        except ValueError:
            return None
        stmt = (
            select(MoniteurIssue)
            .where(MoniteurIssue.publication_date == target_date)
            .order_by(MoniteurIssue.id)
            .options(
                selectinload(MoniteurIssue.entries).selectinload(
                    MoniteurEntry.promoted_legal_text
                )
            )
        )
        return self.session.execute(stmt).scalars().first()

    def get_entry(self, entry_id: int) -> Optional[MoniteurEntry]:
        stmt = (
            select(MoniteurEntry)
            .where(MoniteurEntry.id == entry_id)
            .options(
                selectinload(MoniteurEntry.promoted_legal_text),
                selectinload(MoniteurEntry.translation_issue),
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def update_entry_translation(
        self,
        entry: MoniteurEntry,
        *,
        translation_issue_id: Optional[int],
        translation_detected_number: Optional[str],
        translation_title_ht: Optional[str],
        translation_page_from: Optional[int],
        translation_page_to: Optional[int],
        translation_summary_ht: Optional[str],
        companion_documents: Optional[list[dict]],
    ) -> MoniteurEntry:
        """Attach (or clear) the translation pointer on an entry.

        Every field is overwritten — passing None to a field clears it.
        Use this as the single source of truth for the FR-entry-side
        translation metadata; the actual translated content lives on
        the promoted legal_text's article_versions.text_ht.
        """
        entry.translation_issue_id = translation_issue_id
        entry.translation_detected_number = translation_detected_number
        entry.translation_title_ht = translation_title_ht
        entry.translation_page_from = translation_page_from
        entry.translation_page_to = translation_page_to
        entry.translation_summary_ht = translation_summary_ht
        entry.companion_documents = companion_documents
        self.session.flush()
        return entry

    def replace_entries(
        self, issue: MoniteurIssue, parsed: List[ParsedCandidate]
    ) -> List[MoniteurEntry]:
        """Drop existing unpromoted entries and write new parser output.

        For each newly-created entry, also run the typ-specific parser
        on its sliced ``raw_text`` and persist the structured output as
        ``content_ast`` — same logic as the pre-filled path, just on
        chunks produced by the heuristic boundary detector instead of
        the editor's declared page ranges.
        """
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
            self.session.flush()  # materialise so .id exists for later refs
            self.run_typed_parser_for_entry(row, p.raw_text)
            out.append(row)
        self.session.flush()
        return out

    def import_from_json(
        self,
        *,
        issue_data: dict,
        entries: list[dict],
        uploaded_by: Optional[int] = None,
    ) -> MoniteurIssue:
        """Dev-only path that bypasses the OCR / heuristic parser.

        Idempotent on ``(number, year)`` — if an issue with that pair
        already exists, its metadata is patched in place and pending
        entries are replaced with the new structured data. Promoted
        entries are kept untouched (same rule as
        ``set_sommaire_entries`` / ``replace_entries``).

        After this returns, the issue's ``processing_status`` is set
        to ``parsed`` so it shows up in the review queue alongside
        OCR-derived issues — the editor can review + promote with
        the same workflow.
        """
        existing = (
            self.session.query(MoniteurIssue)
            .filter(
                MoniteurIssue.number == issue_data["number"],
                MoniteurIssue.year == issue_data["year"],
            )
            .one_or_none()
        )
        if existing is not None:
            issue = existing
            # Patch in place — only overwrite non-None values so the
            # caller can omit fields they don't want changed.
            for field in (
                "publication_date",
                "edition_label",
                "director",
                "director_role",
            ):
                if field in issue_data and issue_data[field] is not None:
                    setattr(issue, field, issue_data[field])
            # Drop only the pending entries — promoted rows survive.
            for old in list(issue.entries):
                if old.promoted_legal_text_id is None:
                    self.session.delete(old)
            self.session.flush()
        else:
            issue = MoniteurIssue(
                number=issue_data["number"],
                year=issue_data["year"],
                publication_date=issue_data.get("publication_date"),
                edition_label=issue_data.get("edition_label"),
                director=issue_data.get("director"),
                director_role=issue_data.get("director_role"),
                uploaded_by=uploaded_by,
                processing_status=MoniteurIssueStatus.uploaded,
            )
            self.session.add(issue)
            self.session.flush()

        # Append new entries with the editor-supplied structure. No
        # parser invocation — caller is responsible for the content.
        # ``content`` (the inline JsonImportLegalText) is not stored on
        # the entry row; the route/CLI layer drives auto-promotion
        # against the matching payload entry after this method returns.
        for i, item in enumerate(entries):
            row = MoniteurEntry(
                issue_id=issue.id,
                position=i,
                detected_category=item.get("detected_category"),
                detected_title=item.get("detected_title"),
                detected_number=item.get("detected_number"),
                detected_date=item.get("detected_date"),
                page_from=item.get("page_from"),
                page_to=item.get("page_to"),
                raw_text=item.get("raw_text") or "",
                content_ast=item.get("content_ast"),
            )
            self.session.add(row)
        self.session.flush()

        # Skip the OCR-flavoured ``ocr_pending`` state — there was no
        # OCR. The issue lands directly in ``parsed`` so editors can
        # review it through the standard /editorial/moniteur/{id}
        # review page.
        issue.processing_status = MoniteurIssueStatus.parsed
        self.session.flush()
        return issue

    def auto_promote_from_content(
        self,
        entry: MoniteurEntry,
        content: dict,
        *,
        actor,
    ) -> LegalText:
        """Promote a JSON-imported entry whose ``content`` block carries
        a full structured legal text. Bypasses the editorial-review
        flow — the caller is asserting the structure is correct.

        Uses ``EditorialService.create_legal_text`` so headings, articles,
        signers, and theme auto-tagging follow the same path as the
        regular editorial create endpoint. After the text is created,
        links it to the parent Moniteur issue (the FK that
        ``promote_entry`` also maintains) and marks the entry as
        accepted + promoted so the issue lifecycle rolls forward to
        ``published`` once every entry is in a terminal state.
        """
        from packages.schemas.legal_text import LegalTextCreate
        from services.editorial.service import EditorialService

        service = EditorialService(self.session)
        payload = LegalTextCreate.model_validate(content)
        created = service.create_legal_text(payload, actor=actor)

        legal_text = self.session.get(LegalText, created.id)
        if legal_text is not None:
            legal_text.moniteur_issue_id = entry.issue_id

        entry.promoted_legal_text_id = created.id
        entry.review_status = MoniteurCandidateStatus.accepted
        entry.reviewed_at = datetime.now(timezone.utc)
        self.session.flush()

        issue = self.get_issue(entry.issue_id)
        if issue is not None:
            self.recompute_issue_status(issue)
        return legal_text if legal_text is not None else self.session.get(
            LegalText, created.id
        )

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
                detected_date=item.get("detected_date"),
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
        """Populate raw_text + content_ast for pre-filled sommaire entries.

        Pages are 1-indexed in the Moniteur's printed numbering, so we
        translate to the 0-indexed pages array. If page_from / page_to
        are out of range we silently clamp — the editor will see the
        anomaly on review.

        After slicing each entry's text out of the page range, runs the
        typ-specific parser for that entry's category (or its
        editor-overridden ``parser_profile``) and persists the structured
        ``ParserOutput`` as ``content_ast``. This is the bridge between
        "the sommaire knows the type and page range" and "the typed
        parser registry exists" — the type hint becomes a real parser
        invocation, not just a label.
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
            # Run the typ-specific parser on the sliced chunk.
            self.run_typed_parser_for_entry(entry, chunk)
            # Confidence is high — the boundaries were declared, not guessed.
            entry.confidence = None
        self.session.flush()
        return list(issue.entries)

    def run_typed_parser_for_entry(
        self, entry: MoniteurEntry, text: str
    ) -> Optional[ParserOutput]:
        """Run the parser profile associated with this entry on ``text``
        and persist the structured output on ``entry.content_ast``.

        Profile precedence:
          1. ``entry.parser_profile`` (editor override) when set
          2. ``profile_for_category(entry.detected_category)`` otherwise

        Failures are swallowed and recorded as a warning in
        ``content_ast.warnings`` — a parse error on one entry must not
        abort the whole issue. Returns the ``ParserOutput`` for callers
        that want to use it inline (e.g. backfilling
        ``detected_title``).
        """
        if not text or not text.strip():
            entry.content_ast = None
            return None

        profile = entry.parser_profile or profile_for_category(
            entry.detected_category
        )
        try:
            parser = get_parser(profile)
            output = parser.parse(ParserContext(normalized_text=text))
        except Exception as exc:  # noqa: BLE001 — per-entry fault isolation
            entry.content_ast = {
                "profile": profile.value,
                "warnings": [f"{type(exc).__name__}: {exc}"],
                "parser_confidence": 0.0,
            }
            return None

        entry.content_ast = output.to_dict()
        # Auto-fill detected_title when blank and the parser found one.
        if not entry.detected_title and output.title_fr:
            entry.detected_title = output.title_fr[:240]
        return output

    # -------------------------------------------------------------------
    # Pipeline orchestration
    # -------------------------------------------------------------------

    @staticmethod
    def _is_docx(file_url: str) -> bool:
        return file_url.lower().endswith(".docx")

    @staticmethod
    def _extract_pages_from_docx(file_url: str) -> List[str]:
        """Extract text from a DOCX file and return it as a single-element
        page list.

        DOCX files have no physical "pages" — the entire text is returned as
        one logical page.  This keeps the downstream pipeline compatible:
        `fill_entries_from_pages` and `detect_law_candidates` both expect a
        `List[str]` of page texts.
        """
        from services.ingestion.document_parser import extract_text_from_file  # noqa: PLC0415

        text, _warnings = extract_text_from_file(file_url)
        # Return as a single page so page_from/page_to both resolve to 1.
        return [text] if text.strip() else []

    def _extract_pages(self, file_url: str) -> List[str]:
        """Extract text pages from a file — DOCX or PDF."""
        if self._is_docx(file_url):
            return self._extract_pages_from_docx(file_url)
        return extract_text_from_pdf(file_url)

    def run_parse_for_issue(self, issue: MoniteurIssue) -> MoniteurIssue:
        """Extract text + parse the issue's file, write entries, update status.

        Supports both PDF (OCR pipeline) and DOCX (python-docx text
        extraction — no OCR needed).

        When the issue has a ``transcript_url`` (a pre-transcribed
        PDF/DOCX), text is read from the transcript instead of running
        OCR on the original scan.

        Two flows depending on whether the editor pre-filled the sommaire:

        - **Pre-filled path** — pending entries already exist with declared
          `page_from`/`page_to`. We extract text once, then slice per entry.
          No boundary detection.

        - **Heuristic path** — no pending entries. Extract text + heuristic
          boundary detection, then create entries from the parser's candidates.
        """
        if not issue.file_url and not issue.transcript_url:
            issue.processing_status = MoniteurIssueStatus.failed
            issue.processing_error = "No file uploaded for this issue."
            self.session.flush()
            return issue

        issue.processing_status = MoniteurIssueStatus.ocr_pending
        self.session.flush()

        # If the editor uploaded a pre-transcribed file, read text from
        # that instead of OCR'ing the original scan.
        text_source = issue.transcript_url or issue.file_url
        is_docx = self._is_docx(text_source)

        # Pending = pre-filled by the editor; promoted = already accepted
        # and turned into a LegalText. We only consider the pending bucket
        # when deciding which path to take.
        pending_entries = [
            e for e in issue.entries if e.promoted_legal_text_id is None
        ]

        try:
            if pending_entries:
                pages = self._extract_pages(text_source)
                self.fill_entries_from_pages(issue, pages)
            else:
                if is_docx or issue.transcript_url:
                    # DOCX or transcript — text already available, just
                    # run boundary detection (no OCR).
                    pages = self._extract_pages(text_source)
                    parsed = detect_law_candidates(pages)
                else:
                    # Original scanned PDF — run_pipeline does OCR + detection.
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
        """Create a draft LegalText from an entry and link it back.

        Two parsing paths, the first one preferred:

        - **AST-driven** — when ``entry.content_ast`` was produced by a
          typ-specific parser at parse time. We read the structured
          formal blocks, structural headings, and articles straight out
          of the AST. This is the path that benefits from profile-aware
          quirks (CodeParser strips formal blocks, ConstitutionParser
          handles DISPOSITIONS TRANSITOIRES as annex, etc.).
        - **Legacy** — when no AST is available (older entries from
          before 0018, or entries whose typed parser failed). Falls back
          to the generic ``parse_document`` + ``split_preamble`` flow.
        """
        ast = entry.content_ast or None
        if ast and (ast.get("articles") or ast.get("toc")):
            promotion = _promotion_from_ast(ast)
        else:
            promotion = _promotion_from_legacy(entry.raw_text or "")

        has_articles = len(promotion.articles) > 0
        # publication_date precedence:
        # 1. explicit ``publication_date`` arg from the caller
        # 2. parser-detected date on this entry
        # 3. the parent Moniteur issue's publication_date — every
        #    promoted text was published IN the Moniteur, so this is
        #    always meaningful when the first two are missing. Used
        #    to be missing, which left the hero "Année" stat at "—"
        #    for the 1987 Constitution.
        issue_pub_date = (
            entry.issue.publication_date if entry.issue is not None else None
        )
        effective_pub_date = (
            publication_date or entry.detected_date or issue_pub_date
        )
        legal_text = LegalText(
            slug=slug,
            category=category,
            jurisdiction="HT",
            title_fr=title_fr,
            description_fr=description_fr or (
                None if has_articles else (entry.raw_text or "")[:500]
            ),
            preamble_fr=promotion.preamble,
            visas_fr=promotion.visas,
            considerants_fr=promotion.considerants,
            enacting_formula_fr=promotion.enacting_formula,
            official_formula=promotion.official_formula,
            publication_date=effective_pub_date,
            status=LegalStatus.in_force,
            editorial_status=EditorialStatus.draft,
            moniteur_issue_id=entry.issue_id,
        )
        self.session.add(legal_text)
        self.session.flush()

        # --- Structural headings (Titre / Chapitre / Section / …) ---
        # The parser keys headings by ``level-number`` (e.g. "chapter-i").
        # Real corpora reuse the same numbers across siblings: a
        # constitution has CHAPITRE I under TITRE I and a separate
        # CHAPITRE I under TITRE II — same key, two distinct rows.
        # uq_legal_headings_text_key forbids collisions; we dedupe the
        # DB key with a ``--N`` suffix and keep an ``original → db``
        # map so a child heading's ``parent_key`` still resolves to
        # the correct parent row after dedup. Article rows below use
        # the same strategy.
        key_to_id: dict[str, int] = {}
        original_to_db_key: dict[str, str] = {}
        seen_db_keys: set[str] = set()
        for h in promotion.headings:
            db_key = h.key
            counter = 1
            while db_key in seen_db_keys:
                counter += 1
                db_key = f"{h.key}--{counter}"
            seen_db_keys.add(db_key)
            original_to_db_key[h.key] = db_key

            parent_db_key = (
                original_to_db_key.get(h.parent_key) if h.parent_key else None
            )
            parent_id = (
                key_to_id.get(parent_db_key) if parent_db_key else None
            )
            heading = LegalHeading(
                legal_text_id=legal_text.id,
                parent_id=parent_id,
                level=h.level,
                key=db_key,
                number=h.number,
                title_fr=h.title_fr,
                position=h.position,
            )
            self.session.add(heading)
            self.session.flush()
            key_to_id[db_key] = heading.id

        # --- Articles (linked to their nearest heading) ---
        seen_slugs: set[str] = set()
        for position, parsed in enumerate(promotion.articles):
            base_slug = f"art-{_slugify_article_number(parsed.number)}"
            # Deduplicate: the Constitution has sub-articles (60, 60-1)
            # whose numbers can collide after slugification. Use `--`
            # separator so "art-60--2" can't collide with "art-60-2".
            article_slug = base_slug
            counter = 1
            while article_slug in seen_slugs:
                counter += 1
                article_slug = f"{base_slug}--{counter}"
            seen_slugs.add(article_slug)

            # Resolve the article's parent heading through the same
            # original→db key map used during heading insertion, so
            # post-dedup links stay correct.
            heading_db_key = (
                original_to_db_key.get(parsed.heading_key)
                if parsed.heading_key
                else None
            )
            heading_id = (
                key_to_id.get(heading_db_key) if heading_db_key else None
            )
            article = Article(
                legal_text_id=legal_text.id,
                heading_id=heading_id,
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
                text_fr=parsed.content_fr,
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
        # Promoting was the final missing piece for this entry; recompute
        # the parent issue's status so it rolls forward to ``reviewed``
        # or ``published`` if this completes the issue's editorial pass.
        issue = self.get_issue(entry.issue_id)
        if issue is not None:
            self.recompute_issue_status(issue)
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
        # Roll forward the parent issue's processing_status — when the
        # last pending entry transitions to accepted/rejected the issue
        # moves to ``reviewed`` (or ``published`` when all promotables
        # are promoted). See ``recompute_issue_status`` for the rules.
        if entry.issue_id is not None:
            issue = self.get_issue(entry.issue_id)
            if issue is not None:
                self.recompute_issue_status(issue)
        return entry

    # -------------------------------------------------------------------
    # Issue processing-status lifecycle
    # -------------------------------------------------------------------

    def recompute_issue_status(
        self, issue: MoniteurIssue
    ) -> MoniteurIssueStatus:
        """Recompute the issue's processing_status from its entries.

        Lifecycle inflection points (called after every entry mutation):

          - **parsed**: at least one entry is still ``pending`` or
            ``deferred`` — the editorial review isn't complete.
          - **reviewed**: every entry is either ``accepted`` or
            ``rejected`` (no pending, no deferred). The editor has made
            a verdict on every candidate, but not every accepted entry
            has been promoted to a LegalText yet (or some accepted
            entries are non-promotable categories that ride along with
            a parent).
          - **published**: every accepted promotable entry has a
            ``promoted_legal_text_id``. This is the terminal state for
            an issue — the structured corpus is fully extracted.

        States *before* the editorial pipeline (``uploaded``,
        ``ocr_pending``, ``failed``) are never overridden — they
        represent earlier-stage processing and the entry-review
        machinery isn't involved.
        """
        # Don't roll forward issues that haven't even been parsed yet.
        if issue.processing_status in (
            MoniteurIssueStatus.uploaded,
            MoniteurIssueStatus.ocr_pending,
            MoniteurIssueStatus.failed,
        ):
            return issue.processing_status

        entries = list(issue.entries)
        if not entries:
            # An issue with no entries can't progress past `parsed`.
            issue.processing_status = MoniteurIssueStatus.parsed
            return issue.processing_status

        any_pending = any(
            e.review_status == MoniteurCandidateStatus.pending
            or e.review_status == MoniteurCandidateStatus.deferred
            for e in entries
        )
        if any_pending:
            issue.processing_status = MoniteurIssueStatus.parsed
            return issue.processing_status

        # Every entry is now in a terminal state (accepted / rejected).
        # Check if all promotable accepted entries actually got promoted.
        unfinished_promotion = any(
            e.review_status == MoniteurCandidateStatus.accepted
            and e.detected_category in PROMOTABLE_TYPES
            and e.promoted_legal_text_id is None
            for e in entries
        )
        if unfinished_promotion:
            issue.processing_status = MoniteurIssueStatus.reviewed
        else:
            issue.processing_status = MoniteurIssueStatus.published
            issue.published_at = datetime.now(timezone.utc)
        self.session.flush()
        return issue.processing_status


def _slugify_article_number(num: str) -> str:
    """Article-number -> slug-safe ASCII."""
    s = num.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s or "n"


# ---------------------------------------------------------------------------
# Promotion bridge — feeds `promote_entry` from either content_ast or legacy
# ---------------------------------------------------------------------------


@dataclass
class _PromotionHeading:
    key: str
    level: str
    number: str
    title_fr: Optional[str]
    parent_key: Optional[str]
    position: int


@dataclass
class _PromotionArticle:
    number: str
    content_fr: Optional[str]
    title: Optional[str]
    heading_key: Optional[str]


@dataclass
class _PromotionPayload:
    """Shape consumed by ``promote_entry``. Produced either from the
    typed parser's ``content_ast`` or from the legacy ``parse_document``
    flow — both paths populate the same fields so the promotion loop
    doesn't need to know which path it came from."""

    preamble: Optional[str] = None
    visas: Optional[str] = None
    considerants: Optional[str] = None
    enacting_formula: Optional[str] = None
    official_formula: Optional[str] = None
    headings: list[_PromotionHeading] = field(default_factory=list)
    articles: list[_PromotionArticle] = field(default_factory=list)


def _promotion_from_ast(ast: dict) -> _PromotionPayload:
    """Build a ``_PromotionPayload`` straight from a stored
    ``ParserOutput`` (the JSONB dict on ``MoniteurEntry.content_ast``).

    Filters the TOC by block_kind to lift the four formal blocks plus
    structural headings; maps articles 1:1. No heuristic fallback —
    the typed parser already did the work.
    """
    payload = _PromotionPayload()
    toc = ast.get("toc") or []

    def _first_body(kind: str) -> Optional[str]:
        for node in toc:
            if node.get("block_kind") == kind:
                body = node.get("body_fr")
                if body and body.strip():
                    return body
        return None

    payload.preamble = _first_body(BlockKind.preamble.value)
    payload.visas = _first_body(BlockKind.visa.value)
    payload.considerants = _first_body(BlockKind.considerant.value)
    payload.enacting_formula = _first_body(BlockKind.enacting_formula.value)
    payload.official_formula = _first_body(BlockKind.closing_formula.value)

    if payload.preamble and _is_heading_only(payload.preamble):
        payload.preamble = None

    for node in toc:
        if node.get("block_kind") != BlockKind.structural.value:
            continue
        payload.headings.append(
            _PromotionHeading(
                key=node.get("key") or "",
                level=node.get("level") or "",
                number=node.get("number") or "",
                title_fr=node.get("title_fr"),
                parent_key=node.get("parent_key"),
                position=int(node.get("position") or 0),
            )
        )

    for a in ast.get("articles") or []:
        payload.articles.append(
            _PromotionArticle(
                number=a.get("number") or "",
                content_fr=a.get("text_fr"),
                title=a.get("title_fr"),
                heading_key=a.get("toc_node_key"),
            )
        )

    return payload


def _promotion_from_legacy(raw_text: str) -> _PromotionPayload:
    """Legacy path: feed the raw OCR text through ``parse_document`` +
    ``split_preamble`` and adapt the result into the same payload
    shape. Used when ``content_ast`` is empty (older entries from
    before migration 0018) or the typed parser failed."""
    doc = parse_document(raw_text)
    parts = split_preamble(doc.preamble)
    if parts.preamble and _is_heading_only(parts.preamble):
        parts.preamble = None

    payload = _PromotionPayload(
        preamble=parts.preamble,
        visas=parts.visas,
        considerants=parts.considerants,
        enacting_formula=parts.enacting_formula,
        official_formula=doc.official_formula,
        headings=[
            _PromotionHeading(
                key=h.key,
                level=h.level,
                number=h.number,
                title_fr=h.title_fr,
                parent_key=h.parent_key,
                position=h.position,
            )
            for h in doc.headings
        ],
        articles=[
            _PromotionArticle(
                number=a.number,
                content_fr=a.content_fr,
                title=a.title,
                heading_key=a.heading_key,
            )
            for a in doc.articles
        ],
    )
    return payload


_HEADING_KEYWORD_RE = re.compile(
    r"^\s*(TITRE|Titre|CHAPITRE|Chapitre|SECTION|Section|"
    r"LIVRE|Livre|SOUS-SECTION|Sous-section|"
    r"DISPOSITIONS?\s+G[ÉE]N[ÉE]RALES?)\b",
)


def _is_heading_only(text: str) -> bool:
    """True when every non-blank line is a structural heading or a
    short ALL-CAPS title (like "DES ETRANGERS"). Means the splitter
    preamble is just heading labels, not real prose."""
    for line in text.strip().splitlines():
        s = line.strip()
        if not s:
            continue
        if _HEADING_KEYWORD_RE.match(s):
            continue
        if len(s) < 100 and s == s.upper():
            continue
        return False
    return True
