"""Editorial state transitions.

Every mutation writes one row to public_corpus.editorial_actions — the
append-only audit log. Reviews and rollbacks read from there.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Any, List, Optional

from sqlalchemy import func
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
from packages.schemas.enums import BlockKind, ChangeKind
from services.corpus.models import (
    Article,
    ArticleVersion,
    EditorialAction,
    LegalChange,
    LegalHeading,
    LegalSigner,
    LegalText,
    LegalTextBlockVersion,
)
from services.corpus.repository import CorpusRepository
from services.corpus.service import CorpusService, article_to_embed
from services.corpus.themes import suggest_themes


def _article_number_slug(num: str) -> str:
    """Article-number → slug-safe ASCII. Mirrors the helper used by
    the ingestion pipeline at promotion time; kept inline rather than
    imported across bounded contexts. "9-1" → "9-1", "9 bis" →
    "9-bis", "Premier" → "premier"."""
    s = num.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s or "n"

# Fields the metadata editor is allowed to write. Excludes `slug` (permalink
# stability), `editorial_status` (use publish/unpublish), and
# `jurisdiction` (always HT for now). Formal-block fields (preamble /
# visas / considérants / enacting_formula) were promoted into this list
# in Phase 1 so the in-place EditableFormalBlock editor can write to
# them. Each is bilingual; pass null to clear.
_METADATA_FIELDS: tuple[str, ...] = (
    "slug",
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

# Constraint on editor-supplied slugs. Lowercase ASCII letters,
# digits, and hyphens; one or more, max 200. The parser-generated
# slugs can exceed 80 chars for verbose titles ("arrete-annulant-l-
# arrete-du-3-juin-…"), which is the whole reason the editor needs
# to be able to override them.
_SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?$")


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

        # Slug edits — used to overrule the auto-generated slug when
        # the parser produces verbose / awkward URLs from long titles.
        # Validate the format strictly; reject collisions with other
        # texts. CLAUDE.md says permalinks are forever, so changes on
        # *published* texts deserve a louder warning — the audit log
        # diff captures the before/after.
        if "slug" in updates:
            new_slug = (updates["slug"] or "").strip().lower()
            if not _SLUG_RE.match(new_slug):
                raise InvalidInput(
                    "slug must be lowercase ASCII letters / digits / hyphens "
                    "(1–200 chars, no leading/trailing hyphen)"
                )
            if new_slug != text.slug:
                # Collision check: another text already owns this slug.
                conflict = (
                    self.session.query(LegalText.id)
                    .filter(
                        LegalText.slug == new_slug,
                        LegalText.id != text.id,
                    )
                    .first()
                )
                if conflict is not None:
                    raise AlreadyExists(
                        f'slug "{new_slug}" is already in use by another text'
                    )
            updates["slug"] = new_slug

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
        # Re-fetch by whichever slug is current (slug may have changed
        # in the patch). The previous ``slug`` arg is stale in that
        # case; ``text.slug`` is the live value after the setattr.
        return self.get_text(text.slug, include="toc")

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

    def add_article_version(
        self,
        article_id: int,
        *,
        actor: User,
        payload: dict[str, Any],
    ) -> ArticleVersion:
        """Add a new version of an article *because of an amending law*.

        Distinct from ``update_article_content`` (editorial corrections):
        here the editor declares "this incoming law introduces a new
        version", so ``source_legal_text_id`` is mandatory and a
        ``LegalChange`` row is written alongside the new ``ArticleVersion``.

        The new version becomes the article's current version. The
        previous version stays in history with its own ``effective_to``
        capped at the new version's ``effective_from`` (when supplied)
        so the article reader can render a clean timeline.

        Payload shape mirrors ``ArticleVersionAddInput``:
        - text_fr (required, non-empty)
        - text_ht, title_fr, title_ht (optional)
        - effective_from (defaults to amending law's promulgation /
          publication date when omitted)
        - source_legal_text_id (required)
        - source_article_id (optional — the precise amending article)
        - comment (optional audit-log note)
        """
        article = self.repo.get_article(article_id)
        if article is None:
            raise NotFound(f"Article not found: {article_id}")
        current = article.current_version
        if current is None:
            raise InvalidInput(
                f"Article {article_id} has no current version — "
                "amend not allowed on an empty article"
            )

        text_fr = (payload.get("text_fr") or "").strip()
        if not text_fr:
            raise InvalidInput("text_fr cannot be empty")

        source_legal_text_id = payload.get("source_legal_text_id")
        if source_legal_text_id is None:
            raise InvalidInput("source_legal_text_id is required")

        # The amending text must exist and be distinct from the amended
        # text — a law cannot amend itself.
        amending = (
            self.session.query(LegalText)
            .filter(LegalText.id == source_legal_text_id)
            .one_or_none()
        )
        if amending is None:
            raise NotFound(
                f"Amending legal text not found: {source_legal_text_id}"
            )
        if amending.id == article.legal_text_id:
            raise InvalidInput(
                "Amending text must be different from the amended text"
            )

        # Effective date — explicit on payload wins; otherwise inherit
        # from the amending law. Either is fine for the timeline.
        effective_from = payload.get("effective_from")
        if effective_from is None:
            effective_from = (
                amending.promulgation_date or amending.publication_date
            )

        # Cap the previous version's effective_to so the timeline is
        # gap-free. Only stamp when we have a defined effective_from
        # and the prev version doesn't already carry one.
        if effective_from and current.effective_to is None:
            current.effective_to = effective_from

        # Build the new version. Title fields fall back to the previous
        # version so editors don't have to retype them on every amendment.
        new_version = ArticleVersion(
            article_id=article.id,
            version_number=current.version_number + 1,
            title_fr=payload.get("title_fr") or current.title_fr,
            title_ht=payload.get("title_ht") or current.title_ht,
            text_fr=text_fr,
            text_ht=payload.get("text_ht") or None,
            effective_from=effective_from,
            status=current.status,  # carry forward unless editor flips
            source_amendment_id=amending.id,  # legacy single FK, kept in sync
            editorial_status=EditorialStatus.draft,
        )
        self.session.add(new_version)
        self.session.flush()  # need id for current_version_id + LegalChange

        article.current_version_id = new_version.id

        # Bidirectional graph row. ``change_kind=amend`` is the default
        # for "this law changed an article's content". Other kinds
        # (abrogate, replace, renumber, …) will need their own service
        # entrypoints when those flows ship.
        change = LegalChange(
            amending_text_id=amending.id,
            amended_text_id=article.legal_text_id,
            amended_article_id=article.id,
            new_version_id=new_version.id,
            change_kind=ChangeKind.amend,
            effective_on=effective_from,
        )
        self.session.add(change)

        _audit(
            self.session,
            actor=actor,
            action="amend_article",
            target_type="article_version",
            target_id=new_version.id,
            diff={
                "version_number": {
                    "before": current.version_number,
                    "after": new_version.version_number,
                },
                "source_legal_text_id": {
                    "before": None,
                    "after": amending.id,
                },
            },
            comment=payload.get("comment"),
        )
        self.session.flush()
        return new_version

    def insert_article(
        self,
        slug: str,
        *,
        actor: User,
        payload: dict[str, Any],
    ) -> Article:
        """Insert a brand-new article into a legal text — amendment
        insertion case (Article 9-1, 9 bis, …).

        Position semantics:
        - With ``after_article_id``: new article inherits that
          article's ``heading_id``, slots at ``after.position + 1``,
          and all later siblings in the same heading are bumped +1.
        - Without it, with ``heading_id``: inserted at position 0 of
          that heading, all existing rows in that heading bumped +1.
        - With neither: error.

        Sibling-shift is a single bulk UPDATE — most headings carry
        <50 articles, so the cost is negligible. Could be replaced
        with fractional positions later if it ever matters.

        ``source_legal_text_id`` is required: writes a ``LegalChange``
        with ``change_kind=add`` so the amending law's "Modifications
        apportées" panel surfaces the insertion. A new article with
        no provenance shouldn't be created through this entrypoint
        (use the bulk-import flow for that).
        """
        text = self.repo.get_text_by_slug(slug, editorial_status=None)
        if text is None:
            raise NotFound(f"LegalText not found: {slug}")

        number = (payload.get("number") or "").strip()
        if not number:
            raise InvalidInput("number is required")
        text_fr = (payload.get("text_fr") or "").strip()
        if not text_fr:
            raise InvalidInput("text_fr cannot be empty")

        # ``source_legal_text_id`` is optional: when supplied, the
        # insertion is treated as an amendment introduction (writes a
        # LegalChange row, derives effective_from from the amending
        # law's date). When omitted, the insertion is treated as a
        # parser-correction — the article was always in the original
        # text, the OCR/parser just missed it — and no LegalChange is
        # written. effective_from falls back to the parent text's own
        # promulgation / publication date in that case.
        source_id = payload.get("source_legal_text_id")
        amending: Optional[LegalText] = None
        if source_id is not None:
            amending = (
                self.session.query(LegalText)
                .filter(LegalText.id == source_id)
                .one_or_none()
            )
            if amending is None:
                raise NotFound(f"Amending legal text not found: {source_id}")

        # Reject duplicate numbers within the same text — the parser's
        # promotion path uses a `--N` suffix on collisions, but here we
        # want a hard rejection so the editor sees the conflict.
        existing = (
            self.session.query(Article)
            .filter(Article.legal_text_id == text.id, Article.number == number)
            .one_or_none()
        )
        if existing is not None:
            raise AlreadyExists(
                f'Article "{number}" already exists in this text'
            )

        # Resolve anchor → heading_id + insert position.
        after_id = payload.get("after_article_id")
        heading_id: Optional[int]
        insert_position: int
        if after_id is not None:
            anchor = self.repo.get_article(after_id)
            if anchor is None or anchor.legal_text_id != text.id:
                raise InvalidInput(
                    "after_article_id must point at an article in this text"
                )
            heading_id = anchor.heading_id
            insert_position = anchor.position + 1
        else:
            heading_id = payload.get("heading_id")
            insert_position = 0

        # Optionally validate heading_id belongs to this text.
        if heading_id is not None:
            owns = (
                self.session.query(LegalHeading)
                .filter(
                    LegalHeading.id == heading_id,
                    LegalHeading.legal_text_id == text.id,
                )
                .one_or_none()
            )
            if owns is None:
                raise InvalidInput(
                    "heading_id must point at a heading in this text"
                )

        # Slug — derive from the number, dedupe within the text by
        # appending --2 / --3 / … on collisions.
        base_slug = f"art-{_article_number_slug(number)}"
        slug_candidate = base_slug
        n = 2
        while (
            self.session.query(Article.id)
            .filter(
                Article.legal_text_id == text.id, Article.slug == slug_candidate
            )
            .first()
            is not None
        ):
            slug_candidate = f"{base_slug}--{n}"
            n += 1

        # Shift sibling positions by +1 inside the same heading.
        # Single bulk UPDATE — cheap.
        sibling_q = self.session.query(Article).filter(
            Article.legal_text_id == text.id,
            Article.position >= insert_position,
        )
        if heading_id is None:
            sibling_q = sibling_q.filter(Article.heading_id.is_(None))
        else:
            sibling_q = sibling_q.filter(Article.heading_id == heading_id)
        for sib in sibling_q.all():
            sib.position = sib.position + 1
        self.session.flush()

        # Effective_from — when an amending law is supplied, inherit
        # its date (the article is "in force from when the amendment
        # was promulgated"). Otherwise (parser correction), fall back
        # to the parent text's own date — the article is reckoned to
        # have always existed as part of the original.
        effective_from = payload.get("effective_from")
        if effective_from is None:
            if amending is not None:
                effective_from = (
                    amending.promulgation_date or amending.publication_date
                )
            else:
                effective_from = (
                    text.promulgation_date or text.publication_date
                )

        article = Article(
            legal_text_id=text.id,
            heading_id=heading_id,
            number=number,
            slug=slug_candidate,
            position=insert_position,
            domain_tags=[],
        )
        self.session.add(article)
        self.session.flush()  # need article.id for the version FK

        version = ArticleVersion(
            article_id=article.id,
            version_number=1,
            title_fr=payload.get("title_fr") or None,
            title_ht=payload.get("title_ht") or None,
            text_fr=text_fr,
            text_ht=payload.get("text_ht") or None,
            effective_from=effective_from,
            source_amendment_id=amending.id if amending else None,
            editorial_status=EditorialStatus.draft,
        )
        self.session.add(version)
        self.session.flush()
        article.current_version_id = version.id

        # Bidirectional graph row — only when an amending law was
        # supplied. Parser-corrections introduce no amendment edge.
        if amending is not None:
            change = LegalChange(
                amending_text_id=amending.id,
                amended_text_id=text.id,
                amended_article_id=article.id,
                new_version_id=version.id,
                change_kind=ChangeKind.add,
                effective_on=effective_from,
            )
            self.session.add(change)

        _audit(
            self.session,
            actor=actor,
            action="insert_article",
            target_type="article",
            target_id=article.id,
            diff={
                "number": {"before": None, "after": number},
                "source_legal_text_id": {
                    "before": None,
                    "after": amending.id if amending else None,
                },
            },
            comment=payload.get("comment"),
        )
        self.session.flush()

        # Reload with eager-loaded current_version for the response DTO.
        refreshed = self.repo.get_article(article.id)
        assert refreshed is not None
        return refreshed

    def delete_article(self, article_id: int, *, actor: User) -> None:
        """Hard-delete an article along with its versions + amendment
        rows. Used for parser-error cleanup — a "phantom" article that
        the OCR/parser produced but doesn't exist in the source text.

        Cascades:
        - ``article_versions.article_id`` is ON DELETE CASCADE — all
          versions go with the article.
        - ``legal_changes.amended_article_id`` is ON DELETE CASCADE —
          any amendment rows targeting this article also go.
        - ``articles.current_version_id`` is a self-loop FK with
          use_alter; we null it first so the version delete can proceed
          without a constraint violation.

        Irreversible — the audit log captures number + version count
        but not the bodies. UI surfaces a confirm dialog with the
        count of versions about to be lost.
        """
        article = self.repo.get_article(article_id)
        if article is None:
            raise NotFound(f"Article not found: {article_id}")
        version_count = len(article.versions)
        # Capture identity for the audit log before the row is gone.
        diff = {
            "number": {"before": article.number, "after": None},
            "slug": {"before": article.slug, "after": None},
            "version_count": {"before": version_count, "after": 0},
        }
        # Break the article ↔ current_version FK loop so the version
        # delete can proceed. Flush before delete so the null reaches
        # the DB before SQLAlchemy tries to remove the version rows.
        article.current_version_id = None
        self.session.flush()
        _audit(
            self.session,
            actor=actor,
            action="delete_article",
            target_type="article",
            target_id=article.id,
            diff=diff,
        )
        self.session.delete(article)
        self.session.flush()

    def insert_heading(
        self,
        slug: str,
        *,
        actor: User,
        payload: dict[str, Any],
    ) -> LegalHeading:
        """Insert a new TOC node into a legal text. Anchor is either
        ``after_heading_id`` (slot after that heading, inherit its
        parent) or ``parent_id`` (append to end of that parent's
        children). Mirrors the article-insertion pattern.
        """
        text = self.repo.get_text_by_slug(slug, editorial_status=None)
        if text is None:
            raise NotFound(f"LegalText not found: {slug}")

        key = (payload.get("key") or "").strip()
        if not key:
            raise InvalidInput("key is required")
        level = payload.get("level")
        if level is None:
            raise InvalidInput("level is required")

        # Reject duplicate keys — the UNIQUE constraint on
        # (legal_text_id, key) catches it anyway but the editor sees
        # a friendlier error here.
        existing = (
            self.session.query(LegalHeading)
            .filter(
                LegalHeading.legal_text_id == text.id,
                LegalHeading.key == key,
            )
            .one_or_none()
        )
        if existing is not None:
            raise AlreadyExists(
                f'Heading key "{key}" already exists in this text'
            )

        after_id = payload.get("after_heading_id")
        explicit_parent = payload.get("parent_id")
        parent_id: Optional[int]
        insert_position: int

        if after_id is not None and explicit_parent is not None:
            raise InvalidInput(
                "Specify either after_heading_id or parent_id, not both"
            )

        if after_id is not None:
            anchor = (
                self.session.query(LegalHeading)
                .filter(LegalHeading.id == after_id)
                .one_or_none()
            )
            if anchor is None or anchor.legal_text_id != text.id:
                raise InvalidInput(
                    "after_heading_id must point at a heading in this text"
                )
            parent_id = anchor.parent_id
            insert_position = anchor.position + 1
            # Shift later siblings within the same parent.
            sibling_q = self.session.query(LegalHeading).filter(
                LegalHeading.legal_text_id == text.id,
                LegalHeading.position >= insert_position,
            )
            if parent_id is None:
                sibling_q = sibling_q.filter(LegalHeading.parent_id.is_(None))
            else:
                sibling_q = sibling_q.filter(
                    LegalHeading.parent_id == parent_id
                )
            for sib in sibling_q.all():
                sib.position = sib.position + 1
            self.session.flush()
        else:
            parent_id = explicit_parent
            if parent_id is not None:
                anchor_parent = (
                    self.session.query(LegalHeading)
                    .filter(LegalHeading.id == parent_id)
                    .one_or_none()
                )
                if (
                    anchor_parent is None
                    or anchor_parent.legal_text_id != text.id
                ):
                    raise InvalidInput(
                        "parent_id must point at a heading in this text"
                    )
            # Append at end of the parent's children.
            tail = (
                self.session.query(func.coalesce(func.max(LegalHeading.position), -1))
                .filter(
                    LegalHeading.legal_text_id == text.id,
                    LegalHeading.parent_id == parent_id
                    if parent_id is not None
                    else LegalHeading.parent_id.is_(None),
                )
                .scalar()
            )
            insert_position = int(tail) + 1

        heading = LegalHeading(
            legal_text_id=text.id,
            parent_id=parent_id,
            level=level,
            key=key,
            number=payload.get("number"),
            title_fr=payload.get("title_fr"),
            title_ht=payload.get("title_ht"),
            content_fr=payload.get("content_fr"),
            content_ht=payload.get("content_ht"),
            position=insert_position,
        )
        self.session.add(heading)
        self.session.flush()

        _audit(
            self.session,
            actor=actor,
            action="insert_heading",
            target_type="heading",
            target_id=heading.id,
            diff={
                "key": {"before": None, "after": key},
                "level": {"before": None, "after": getattr(level, "value", str(level))},
                "parent_id": {"before": None, "after": parent_id},
            },
        )
        self.session.flush()
        return heading

    def update_heading_full(
        self,
        heading_id: int,
        *,
        actor: User,
        updates: dict[str, Any],
    ) -> LegalHeading:
        """Patch the full set of editor-writable heading fields:
        ``level``, ``number``, titles, contents, ``parent_id``,
        ``position``. Empty for keys not present in ``updates``.

        Distinct from the existing ``update_heading_titles`` repo
        helper which only touches the two title columns.
        """
        heading = (
            self.session.query(LegalHeading)
            .filter(LegalHeading.id == heading_id)
            .one_or_none()
        )
        if heading is None:
            raise NotFound(f"Heading not found: {heading_id}")

        editable = {
            "level",
            "number",
            "title_fr",
            "title_ht",
            "content_fr",
            "content_ht",
            "parent_id",
            "position",
        }
        bad = [k for k in updates if k not in editable]
        if bad:
            raise InvalidInput(f"non-editable heading fields: {sorted(bad)}")

        # Reject self-parent + parent-from-another-text cycles.
        if "parent_id" in updates:
            new_parent_id = updates["parent_id"]
            if new_parent_id == heading.id:
                raise InvalidInput("heading cannot be its own parent")
            if new_parent_id is not None:
                new_parent = (
                    self.session.query(LegalHeading)
                    .filter(LegalHeading.id == new_parent_id)
                    .one_or_none()
                )
                if (
                    new_parent is None
                    or new_parent.legal_text_id != heading.legal_text_id
                ):
                    raise InvalidInput(
                        "parent_id must point at a heading in the same text"
                    )

        diff: dict[str, dict[str, Any]] = {}
        for field, new_value in updates.items():
            old_value = getattr(heading, field)
            # Compare on the enum's value so { 'before': 'section', 'after': 'chapter' }
            # instead of opaque <HeadingLevel.section>.
            if hasattr(old_value, "value"):
                old_value_cmp = old_value.value
            else:
                old_value_cmp = old_value
            if hasattr(new_value, "value"):
                new_value_cmp = new_value.value
            else:
                new_value_cmp = new_value
            if old_value_cmp == new_value_cmp:
                continue
            diff[field] = {"before": old_value_cmp, "after": new_value_cmp}
            setattr(heading, field, new_value)

        if not diff:
            return heading

        _audit(
            self.session,
            actor=actor,
            action="update_heading",
            target_type="heading",
            target_id=heading.id,
            diff=diff,
        )
        self.session.flush()
        return heading

    def delete_heading(
        self,
        heading_id: int,
        *,
        actor: User,
        reparent_children: bool = False,
    ) -> None:
        """Delete a TOC node (Livre / Titre / Chapitre / Section / …).

        Two modes:
        - ``reparent_children=False`` (default): refuse if the heading
          has sub-headings or articles. The editor is forced to clear
          the subtree first, which avoids accidental cascade losses.
        - ``reparent_children=True``: lift the sub-headings + articles
          up to this heading's parent (or to the text root when this
          is a top-level heading) before deletion. Non-destructive —
          content survives, just changes its TOC anchor.

        Note on cascades: the model has
        ``legal_headings.parent_id ON DELETE CASCADE`` and
        ``articles.heading_id ON DELETE SET NULL``. So a "naïve"
        delete would silently wipe the subtree (sub-headings) and
        orphan articles (heading_id=NULL → bubble to root). The
        ``reparent_children`` step happens *before* the delete so the
        cascade fires on an empty heading and the survival outcome is
        deterministic.
        """
        heading = (
            self.session.query(LegalHeading)
            .filter(LegalHeading.id == heading_id)
            .one_or_none()
        )
        if heading is None:
            raise NotFound(f"Heading not found: {heading_id}")

        child_count = (
            self.session.query(LegalHeading)
            .filter(LegalHeading.parent_id == heading.id)
            .count()
        )
        article_count = (
            self.session.query(Article)
            .filter(Article.heading_id == heading.id)
            .count()
        )

        if (child_count > 0 or article_count > 0) and not reparent_children:
            raise InvalidInput(
                f"Heading has {child_count} sub-heading(s) and "
                f"{article_count} article(s). Empty it first or pass "
                "reparent_children=true to lift them to the parent."
            )

        if reparent_children:
            # Lift articles to the parent (or null → text-root level).
            self.session.query(Article).filter(
                Article.heading_id == heading.id
            ).update({"heading_id": heading.parent_id})
            # Same for sub-headings.
            self.session.query(LegalHeading).filter(
                LegalHeading.parent_id == heading.id
            ).update({"parent_id": heading.parent_id})
            self.session.flush()

        diff = {
            "number": {"before": heading.number, "after": None},
            "title_fr": {"before": heading.title_fr, "after": None},
            "reparented_articles": {
                "before": None,
                "after": article_count if reparent_children else 0,
            },
            "reparented_subheadings": {
                "before": None,
                "after": child_count if reparent_children else 0,
            },
        }
        _audit(
            self.session,
            actor=actor,
            action="delete_heading",
            target_type="heading",
            target_id=heading.id,
            diff=diff,
        )
        self.session.delete(heading)
        self.session.flush()

    # -------------------------------------------------------------------
    # Formal-block versions (preamble / visas / considérants / enacting)
    # -------------------------------------------------------------------

    # BlockKind → (fr_column, ht_column) on LegalText. Only the four
    # versionable formal blocks are mapped; structural / signature /
    # promulgation kinds aren't text blocks and have no flat columns.
    _BLOCK_COLUMNS: dict[BlockKind, tuple[str, str]] = {
        BlockKind.preamble: ("preamble_fr", "preamble_ht"),
        BlockKind.visa: ("visas_fr", "visas_ht"),
        BlockKind.considerant: ("considerants_fr", "considerants_ht"),
        BlockKind.enacting_formula: ("enacting_formula_fr", "enacting_formula_ht"),
    }

    def list_block_versions(
        self, slug: str, block_kind: BlockKind
    ) -> List[LegalTextBlockVersion]:
        """All versions of a formal block on a text — newest first.

        Used by the editor "Versions" accordion on each formal block.
        Editorial filter is intentionally absent: editors see every
        version regardless of editorial_status; public-side block
        history is not surfaced today.
        """
        if block_kind not in self._BLOCK_COLUMNS:
            raise InvalidInput(
                f"block_kind {block_kind.value!r} is not a versionable block"
            )
        text = self.repo.get_text_by_slug(slug, editorial_status=None)
        if text is None:
            raise NotFound(f"LegalText not found: {slug}")
        rows = (
            self.session.query(LegalTextBlockVersion)
            .filter(
                LegalTextBlockVersion.legal_text_id == text.id,
                LegalTextBlockVersion.block_kind == block_kind,
            )
            .order_by(LegalTextBlockVersion.version_number.desc())
            .all()
        )
        return rows

    def add_block_version(
        self,
        slug: str,
        block_kind: BlockKind,
        *,
        actor: User,
        payload: dict[str, Any],
    ) -> LegalTextBlockVersion:
        """Add a new version of a formal block, anchored to an
        amending legal text.

        Mirrors ``add_article_version`` for blocks: writes a new
        ``LegalTextBlockVersion`` row, denormalises the new content
        onto the corresponding ``legal_texts`` column (the public
        read path stays unchanged), caps the previous version's
        ``effective_to`` so the timeline is gap-free, and writes a
        ``LegalChange`` row (``change_kind=amend``,
        ``amended_block_kind=<kind>``, ``new_block_version_id=<id>``)
        so the amending law's "Modifications apportées" panel picks
        up the block edit.
        """
        if block_kind not in self._BLOCK_COLUMNS:
            raise InvalidInput(
                f"block_kind {block_kind.value!r} is not a versionable block"
            )

        text = self.repo.get_text_by_slug(slug, editorial_status=None)
        if text is None:
            raise NotFound(f"LegalText not found: {slug}")

        # At least one language must carry the new content. Blocks are
        # bilingual; allowing both-empty would replace the block with
        # nothing, which is what abrogation means — that path goes
        # through change_kind=abrogate, not amend.
        text_fr = (payload.get("text_fr") or "").strip() or None
        text_ht = (payload.get("text_ht") or "").strip() or None
        if not text_fr and not text_ht:
            raise InvalidInput(
                "at least one of text_fr / text_ht must be non-empty"
            )

        source_id = payload.get("source_legal_text_id")
        if source_id is None:
            raise InvalidInput("source_legal_text_id is required")
        amending = (
            self.session.query(LegalText)
            .filter(LegalText.id == source_id)
            .one_or_none()
        )
        if amending is None:
            raise NotFound(f"Amending legal text not found: {source_id}")
        if amending.id == text.id:
            raise InvalidInput(
                "Amending text must be different from the amended text"
            )

        # Find the current latest version (any editorial status) to
        # compute the next version_number and cap effective_to.
        latest = (
            self.session.query(LegalTextBlockVersion)
            .filter(
                LegalTextBlockVersion.legal_text_id == text.id,
                LegalTextBlockVersion.block_kind == block_kind,
            )
            .order_by(LegalTextBlockVersion.version_number.desc())
            .first()
        )
        next_version_number = (latest.version_number + 1) if latest else 1

        effective_from = payload.get("effective_from")
        if effective_from is None:
            effective_from = (
                amending.promulgation_date or amending.publication_date
            )

        # Cap previous version's effective_to so the timeline is gap-free.
        if latest and effective_from and latest.effective_to is None:
            latest.effective_to = effective_from

        new_version = LegalTextBlockVersion(
            legal_text_id=text.id,
            block_kind=block_kind,
            version_number=next_version_number,
            text_fr=text_fr,
            text_ht=text_ht,
            effective_from=effective_from,
            source_amendment_id=amending.id,
            editorial_status=EditorialStatus.draft,
        )
        self.session.add(new_version)
        self.session.flush()

        # Denormalise onto the LegalText columns so the public read
        # path (which still reads the columns directly) reflects the
        # new content. Writing both at once keeps the column and the
        # versioned row in lockstep.
        col_fr, col_ht = self._BLOCK_COLUMNS[block_kind]
        setattr(text, col_fr, text_fr)
        setattr(text, col_ht, text_ht)

        change = LegalChange(
            amending_text_id=amending.id,
            amended_text_id=text.id,
            amended_block_kind=block_kind,
            new_block_version_id=new_version.id,
            change_kind=ChangeKind.amend,
            effective_on=effective_from,
        )
        self.session.add(change)

        _audit(
            self.session,
            actor=actor,
            action="amend_block",
            target_type="block_version",
            target_id=new_version.id,
            diff={
                "block_kind": {"before": None, "after": block_kind.value},
                "version_number": {
                    "before": latest.version_number if latest else None,
                    "after": new_version.version_number,
                },
                "source_legal_text_id": {"before": None, "after": amending.id},
            },
            comment=payload.get("comment"),
        )
        self.session.flush()
        return new_version

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
