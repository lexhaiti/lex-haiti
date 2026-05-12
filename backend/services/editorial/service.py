"""Editorial state transitions.

Every mutation writes one row to public_corpus.editorial_actions — the
append-only audit log. Reviews and rollbacks read from there.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Any, List, Optional

from sqlalchemy.orm import Session

from packages.schemas.enums import (
    CodeSubcategory,
    EditorialStatus,
    LegalCategory,
    LegalStatus,
    LegalTheme,
)
from packages.schemas.article import ArticleCreate, ArticleEmbed
from packages.schemas.heading import LegalHeadingCreate
from packages.schemas.legal_text import LegalTextCreate, LegalTextRead
from packages.schemas.signer import LegalSignerCreate
from services.auth.models import User
from services.corpus.exceptions import AlreadyExists, InvalidInput, NotFound
from services.corpus.models import (
    Article,
    ArticleVersion,
    EditorialAction,
    LegalHeading,
    LegalSigner,
    LegalText,
)
from services.corpus.repository import CorpusRepository
from services.corpus.service import CorpusService, article_to_embed
from services.corpus.themes import suggest_themes

# Fields the metadata editor is allowed to write. Excludes `slug` (permalink
# stability), `editorial_status` (use publish/unpublish), and
# `jurisdiction` (always HT for now). Formal-block fields (preamble /
# visas / considérants / enacting_formula) were promoted into this list
# in Phase 1 so the in-place EditableFormalBlock editor can write to
# them. Each is bilingual; pass null to clear.
_METADATA_FIELDS: tuple[str, ...] = (
    "title_fr",
    "title_ht",
    "description_fr",
    "description_ht",
    "promulgation_date",
    "publication_date",
    "moniteur_ref",
    "category",
    "code_subcategory",
    "status",
    # Page-1 + post-dispositif official metadata.
    "official_number",
    "issuing_authority",
    "official_formula",
    # Formal blocks — editable in-place via /editorial/legal-texts/
    # {slug}/metadata (PATCH).
    "preamble_fr",
    "preamble_ht",
    "visas_fr",
    "visas_ht",
    "considerants_fr",
    "considerants_ht",
    "enacting_formula_fr",
    "enacting_formula_ht",
)


def _audit(
    session: Session,
    *,
    actor: User,
    action: str,
    target_type: str,
    target_id: int,
    diff: Optional[dict] = None,
    comment: Optional[str] = None,
) -> None:
    session.add(
        EditorialAction(
            actor=actor.email or f"user-{actor.id}",
            actor_user_id=actor.id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            diff=diff,
            comment=comment,
        )
    )


class EditorialService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.repo = CorpusRepository(session)
        self.corpus = CorpusService(session)

    # -------------------------------------------------------------------
    # Create a new LegalText with headings + articles
    # -------------------------------------------------------------------

    def create_legal_text(
        self,
        data: LegalTextCreate,
        *,
        actor: User,
    ) -> LegalTextRead:
        """Create a draft LegalText with optional headings, articles, and signers.

        This is the backend for the editorial import panel. The flow:
          1. Validate inputs (slug uniqueness, required fields)
          2. Create LegalText row (always draft)
          3. Create LegalHeading rows (resolve parent_key → parent_id)
          4. Create Article + ArticleVersion rows (resolve heading_key → heading_id)
          5. Create LegalSigner rows
          6. Audit the action
          7. Return the full LegalTextRead shape

        Callers: POST /api/v1/editorial/legal-texts
        """
        # --- Validation ---
        if not data.slug or not data.slug.strip():
            raise InvalidInput("slug is required")
        if not data.title_fr or not data.title_fr.strip():
            raise InvalidInput("title_fr is required")

        slug = _slugify(data.slug)
        existing = self.repo.get_text_by_slug(slug, editorial_status=None)
        if existing is not None:
            raise AlreadyExists(f"A legal text with slug '{slug}' already exists")

        # --- Create the legal text ---
        legal_text = LegalText(
            slug=slug,
            category=data.category,
            code_subcategory=data.code_subcategory,
            jurisdiction=data.jurisdiction or "HT",
            title_fr=data.title_fr.strip(),
            title_ht=data.title_ht,
            description_fr=data.description_fr,
            description_ht=data.description_ht,
            visas_fr=data.visas_fr,
            visas_ht=data.visas_ht,
            considerants_fr=data.considerants_fr,
            considerants_ht=data.considerants_ht,
            enacting_formula_fr=data.enacting_formula_fr,
            enacting_formula_ht=data.enacting_formula_ht,
            preamble_fr=data.preamble_fr,
            preamble_ht=data.preamble_ht,
            promulgation_date=data.promulgation_date,
            publication_date=data.publication_date,
            moniteur_ref=data.moniteur_ref,
            official_number=data.official_number,
            issuing_authority=data.issuing_authority,
            official_formula=data.official_formula,
            status=data.status,
            editorial_status=EditorialStatus.draft,  # always draft on create
        )
        self.session.add(legal_text)
        self.session.flush()

        # --- Create headings (resolve parent_key → parent_id) ---
        # Dedupe heading keys: a constitution / code reuses the same
        # Roman numbers across siblings (CHAPITRE I under TITRE I + under
        # TITRE II), and ``uq_legal_headings_text_key`` forbids
        # collisions per (legal_text_id, key). Suffix with ``--N`` on
        # collision; carry an ``original_to_db_key`` map so child
        # headings' ``parent_key`` (and articles' ``heading_key``)
        # resolve to the correct parent after dedup. Same strategy as
        # ``MoniteurRepository.promote_entry``.
        key_to_id: dict[str, int] = {}
        original_to_db_key: dict[str, str] = {}
        seen_db_keys: set[str] = set()
        if data.headings:
            for h in data.headings:
                db_key = h.key
                counter = 1
                while db_key in seen_db_keys:
                    counter += 1
                    db_key = f"{h.key}--{counter}"
                seen_db_keys.add(db_key)
                original_to_db_key[h.key] = db_key

                parent_db_key = (
                    original_to_db_key.get(h.parent_key)
                    if h.parent_key
                    else None
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
                    title_ht=h.title_ht,
                    content_fr=h.content_fr,
                    content_ht=h.content_ht,
                    position=h.position,
                )
                self.session.add(heading)
                self.session.flush()
                key_to_id[db_key] = heading.id

        # --- Create articles (resolve heading_key → heading_id) ---
        if data.articles:
            for position, art in enumerate(data.articles):
                # Same original-to-db key mapping as headings — keeps
                # article→heading links intact after dedup.
                heading_db_key = (
                    original_to_db_key.get(art.heading_key)
                    if art.heading_key
                    else None
                )
                heading_id = (
                    key_to_id.get(heading_db_key) if heading_db_key else None
                )
                article = Article(
                    legal_text_id=legal_text.id,
                    heading_id=heading_id,
                    number=art.number,
                    slug=art.slug,
                    domain_tags=art.domain_tags or [],
                    position=art.position if art.position else position,
                )
                self.session.add(article)
                self.session.flush()

                version = ArticleVersion(
                    article_id=article.id,
                    version_number=art.version.version_number,
                    title_fr=art.version.title_fr,
                    title_ht=art.version.title_ht,
                    text_fr=art.version.text_fr,
                    text_ht=art.version.text_ht,
                    editorial_status=EditorialStatus.draft,
                    effective_from=art.version.effective_from,
                    effective_to=art.version.effective_to,
                    status=art.version.status,
                    confidence=art.version.confidence,
                )
                self.session.add(version)
                self.session.flush()
                article.current_version_id = version.id

            self.session.flush()

        # --- Create signers ---
        if data.signers:
            for s in data.signers:
                signer = LegalSigner(
                    legal_text_id=legal_text.id,
                    name=s.name,
                    function_fr=s.function_fr,
                    function_ht=s.function_ht,
                    signing_capacity=s.signing_capacity,
                    chamber=s.chamber,
                    signed_at=s.signed_at,
                    position=s.position,
                )
                self.session.add(signer)
            self.session.flush()

        # --- Auto-tag themes from title + description (and bodies for codes) ---
        article_bodies = (
            [v.text_fr for a in legal_text.articles for v in a.versions if v.text_fr]
            if data.articles
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
            self.repo.upsert_auto_theme_tags(
                legal_text.id,
                [(m.theme, float(m.confidence)) for m in theme_matches],
            )

        # --- Audit ---
        _audit(
            self.session,
            actor=actor,
            action="create",
            target_type="legal_text",
            target_id=legal_text.id,
            diff={
                "slug": slug,
                "title_fr": data.title_fr,
                "headings_count": len(data.headings or []),
                "articles_count": len(data.articles or []),
                "auto_themes": [m.theme.value for m in theme_matches],
            },
        )
        self.session.flush()

        return self.get_text(slug, include="all")

    # -------------------------------------------------------------------
    # State transitions on LegalText
    # -------------------------------------------------------------------

    def publish_legal_text(self, slug: str, *, actor: User) -> LegalTextRead:
        text = self.repo.get_text_by_slug(slug, editorial_status=None)
        if text is None:
            raise NotFound(f"LegalText not found: {slug}")

        before = text.editorial_status.value
        if text.editorial_status != EditorialStatus.published:
            text.editorial_status = EditorialStatus.published
            text.published_at = datetime.now(timezone.utc)

        _audit(
            self.session,
            actor=actor,
            action="publish",
            target_type="legal_text",
            target_id=text.id,
            diff={"editorial_status": {"before": before, "after": "published"}},
        )
        self.session.flush()
        return self.corpus.get_text_by_slug(slug, include="all")

    def unpublish_legal_text(
        self, slug: str, *, actor: User, comment: str
    ) -> LegalTextRead:
        if not comment.strip():
            raise InvalidInput("comment is required when unpublishing")

        text = self.repo.get_text_by_slug(slug, editorial_status=None)
        if text is None:
            raise NotFound(f"LegalText not found: {slug}")

        before = text.editorial_status.value
        text.editorial_status = EditorialStatus.draft
        text.published_at = None

        _audit(
            self.session,
            actor=actor,
            action="unpublish",
            target_type="legal_text",
            target_id=text.id,
            diff={"editorial_status": {"before": before, "after": "draft"}},
            comment=comment,
        )
        self.session.flush()
        # The corpus service filters by published; re-fetch unfiltered.
        text = self.repo.get_text_by_slug(slug, editorial_status=None)
        # Use getattr with a sentinel so missing attributes (newly-added
        # schema fields like theme_tags / moniteur_issue_* on a partial mock)
        # are skipped — Pydantic then uses the schema's own default ([] / None).
        # A fresh corpus.get_text_by_slug call on the next page-load
        # rehydrates them properly.
        skip = {"headings", "articles", "signers"}
        sentinel = object()
        payload: dict = {"headings": [], "articles": [], "signers": []}
        for k in LegalTextRead.model_fields:
            if k in skip:
                continue
            value = getattr(text, k, sentinel)
            if value is sentinel:
                continue
            payload[k] = value
        return LegalTextRead.model_validate(payload)

    def request_changes(
        self, slug: str, *, actor: User, comment: str
    ) -> dict:
        if not comment.strip():
            raise InvalidInput("comment is required to request changes")

        text = self.repo.get_text_by_slug(slug, editorial_status=None)
        if text is None:
            raise NotFound(f"LegalText not found: {slug}")

        _audit(
            self.session,
            actor=actor,
            action="request_changes",
            target_type="legal_text",
            target_id=text.id,
            comment=comment,
        )
        self.session.flush()
        return {"ok": True, "slug": slug, "comment": comment}

    # -------------------------------------------------------------------
    # Metadata edit
    # -------------------------------------------------------------------

    def update_legal_text_metadata(
        self,
        slug: str,
        *,
        actor: User,
        updates: dict[str, Any],
        comment: Optional[str] = None,
    ) -> LegalTextRead:
        """Patch editor-editable metadata on a legal text.

        `updates` is the partial dict — only keys actually provided by the
        caller (Pydantic `exclude_unset=True`). Unknown keys raise InvalidInput.
        title_fr is non-nullable in the schema; reject empty strings.
        """
        text = self.repo.get_text_by_slug(slug, editorial_status=None)
        if text is None:
            raise NotFound(f"LegalText not found: {slug}")

        bad = [k for k in updates if k not in _METADATA_FIELDS]
        if bad:
            raise InvalidInput(f"unknown metadata fields: {sorted(bad)}")

        if "title_fr" in updates:
            value = (updates["title_fr"] or "").strip()
            if not value:
                raise InvalidInput("title_fr cannot be empty")
            updates["title_fr"] = value

        diff: dict[str, dict[str, Any]] = {}
        for field, new_value in updates.items():
            old = getattr(text, field)
            old_norm = old.value if hasattr(old, "value") else (
                old.isoformat() if isinstance(old, date) else old
            )
            new_norm = new_value.value if hasattr(new_value, "value") else (
                new_value.isoformat() if isinstance(new_value, date) else new_value
            )
            if old_norm == new_norm:
                continue
            setattr(text, field, new_value)
            diff[field] = {"before": old_norm, "after": new_norm}

        if not diff:
            # Nothing changed → no audit row, just return current state.
            return self.get_text(slug, include="toc")

        _audit(
            self.session,
            actor=actor,
            action="update_metadata",
            target_type="legal_text",
            target_id=text.id,
            diff=diff,
            comment=comment,
        )
        self.session.flush()
        return self.get_text(slug, include="toc")

    # -------------------------------------------------------------------
    # Theme tags (editorial overrides)
    # -------------------------------------------------------------------

    def replace_theme_tags(
        self,
        slug: str,
        *,
        themes: list[LegalTheme],
        actor: User,
    ) -> LegalTextRead:
        """Replace the editor-confirmed theme set on a legal text.

        Auto suggester tags are preserved alongside; the repo helper either
        promotes a matching auto tag to editor or inserts a new editor row.
        Audited regardless of whether the set actually changed — gives us a
        timeline of editorial decisions even when an editor reaffirms the
        existing tags.
        """
        text = self.repo.get_text_by_slug(slug, editorial_status=None)
        if text is None:
            raise NotFound(f"LegalText not found: {slug}")

        before = sorted(
            t.theme.value
            for t in self.repo.get_theme_tags_for_text(text.id)
        )
        self.repo.replace_editor_theme_tags(text.id, themes)
        after = sorted(
            t.theme.value
            for t in self.repo.get_theme_tags_for_text(text.id)
        )
        _audit(
            self.session,
            actor=actor,
            action="update_themes",
            target_type="legal_text",
            target_id=text.id,
            diff={"before": before, "after": after},
        )
        self.session.flush()
        return self.get_text(slug, include="toc")

    # -------------------------------------------------------------------
    # Article content edit (single-article inline editing)
    # -------------------------------------------------------------------

    def update_article_content(
        self,
        article_id: int,
        *,
        actor: User,
        updates: dict[str, Any],
        comment: Optional[str] = None,
    ) -> ArticleEmbed:
        """Edit the bilingual content of an article.

        Versioning policy ("versioning is on the article" — see CLAUDE.md):

        - If the current version is *draft*, the edit mutates that version in
          place. The article-level current_version pointer doesn't move.
        - If the current version is *published*, we create a NEW draft version
          (next version_number) carrying the edits, and re-point the article
          at it. The previously published version stays intact in history.

        `updates` is the partial dict of editable fields (title_fr, title_ht,
        text_fr, text_ht). Empty/whitespace-only text_fr is rejected — every
        version must have a French body (text_fr is non-nullable in the model).
        """
        article = self.repo.get_article(article_id)
        if article is None:
            raise NotFound(f"Article not found: {article_id}")
        current = article.current_version
        if current is None:
            raise InvalidInput(
                f"Article {article_id} has no current version to edit"
            )

        editable = {"title_fr", "title_ht", "text_fr", "text_ht"}
        bad = [k for k in updates if k not in editable]
        if bad:
            raise InvalidInput(f"non-editable article fields: {sorted(bad)}")

        # Normalize blanks → None for nullable cols, while keeping text_fr
        # as a required non-empty string.
        normalized: dict[str, Any] = {}
        for field, value in updates.items():
            if isinstance(value, str):
                value = value.strip()
            if field == "text_fr":
                if not value:
                    raise InvalidInput("text_fr cannot be empty")
                normalized[field] = value
            else:
                normalized[field] = value or None

        # Compute diff against the current version values.
        diff: dict[str, dict[str, Any]] = {}
        for field, new_value in normalized.items():
            old_value = getattr(current, field)
            if old_value == new_value:
                continue
            diff[field] = {"before": old_value, "after": new_value}

        if not diff:
            return article_to_embed(article)

        if current.editorial_status == EditorialStatus.draft:
            # Mutate the existing draft version in place — no version bump.
            for field, change in diff.items():
                setattr(current, field, change["after"])
            target_version = current
            action = "update_article_draft"
        else:
            # Supersede the published version with a new draft. Carry forward
            # any fields the editor didn't touch from the previous version.
            target_version = ArticleVersion(
                article_id=article.id,
                version_number=current.version_number + 1,
                title_fr=normalized.get("title_fr", current.title_fr),
                title_ht=normalized.get("title_ht", current.title_ht),
                text_fr=normalized.get("text_fr", current.text_fr),
                text_ht=normalized.get("text_ht", current.text_ht),
                effective_from=current.effective_from,
                effective_to=current.effective_to,
                status=current.status,
                editorial_status=EditorialStatus.draft,
            )
            self.session.add(target_version)
            self.session.flush()  # need the new version's id for current_version_id
            article.current_version_id = target_version.id
            action = "amend_article"

        _audit(
            self.session,
            actor=actor,
            action=action,
            target_type="article_version",
            target_id=target_version.id,
            diff=diff,
            comment=comment,
        )
        self.session.flush()

        # Reload with eager-loaded current_version for the response DTO.
        refreshed = self.repo.get_article(article_id)
        assert refreshed is not None
        return article_to_embed(refreshed)

    # -------------------------------------------------------------------
    # Listing — editor sees everything, including drafts
    # -------------------------------------------------------------------

    def list_all(
        self,
        *,
        q: Optional[str] = None,
        category=None,
        code_subcategory=None,
        legal_status=None,
        editorial_status: Optional[EditorialStatus] = None,
        limit: int = 50,
        offset: int = 0,
    ):
        # Editor list — same shape as the public list endpoint, but
        # `editorial_status=None` (default) means "all statuses" instead of
        # "published only". The toggle in the UI sets it to draft/published
        # to filter explicitly.
        return self.corpus.list_texts(
            q=q,
            category=category,
            code_subcategory=code_subcategory,
            legal_status=legal_status,
            editorial_status=editorial_status,
            limit=limit,
            offset=offset,
        )

    def get_text(self, slug: str, *, include: Optional[str] = "all") -> LegalTextRead:
        # Editor view: bypass the published-only filter by going through the
        # repo directly with editorial_status=None, then constructing the DTO
        # via the corpus service path that handles ArticleEmbed conversion.
        text = self.repo.get_text_by_slug(
            slug,
            with_headings=(include in ("toc", "all")),
            with_articles=(include == "all"),
            with_signers=(include == "all"),
            editorial_status=None,
        )
        if text is None:
            raise NotFound(f"LegalText not found: {slug}")

        # Reuse the corpus service's conversion helpers via a temporary trick:
        # call the public service which does the same lookup but with the
        # filter — won't work for drafts. So replicate the conversion inline.
        from services.corpus.service import article_to_embed, text_to_read
        from packages.schemas.heading import LegalHeadingRead
        from packages.schemas.signer import LegalSignerRead

        if include == "all":
            return text_to_read(
                text,
                headings=[LegalHeadingRead.model_validate(h) for h in text.headings],
                articles=[article_to_embed(a) for a in text.articles],
                signers=[LegalSignerRead.model_validate(s) for s in text.signers],
            )
        if include == "toc":
            return text_to_read(
                text,
                headings=[LegalHeadingRead.model_validate(h) for h in text.headings],
                articles=[],
                signers=[],
            )
        return text_to_read(text, headings=[], articles=[], signers=[])


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------


def _slugify(raw: str) -> str:
    """Normalise a user-provided slug to URL-safe ASCII."""
    import unicodedata

    s = unicodedata.normalize("NFD", raw)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s[:120]
