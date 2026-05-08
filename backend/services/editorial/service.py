"""Editorial state transitions.

Every mutation writes one row to public_corpus.editorial_actions — the
append-only audit log. Reviews and rollbacks read from there.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from packages.schemas.enums import (
    CodeSubcategory,
    EditorialStatus,
    LegalCategory,
    LegalStatus,
)
from packages.schemas.article import ArticleEmbed
from packages.schemas.legal_text import LegalTextRead
from services.auth.models import User
from services.corpus.exceptions import InvalidInput, NotFound
from services.corpus.models import (
    Article,
    ArticleVersion,
    EditorialAction,
    LegalText,
)
from services.corpus.repository import CorpusRepository
from services.corpus.service import CorpusService, article_to_embed

# Fields the metadata editor is allowed to write. Excludes `slug` (permalink
# stability), `editorial_status` (use publish/unpublish), `preamble_*` (body
# editor — separate flow), and `jurisdiction` (always HT for now).
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
        return LegalTextRead.model_validate(  # safe: no articles loaded
            {
                **{k: getattr(text, k) for k in LegalTextRead.model_fields if k not in ("headings", "articles", "signers")},
                "headings": [],
                "articles": [],
                "signers": [],
            }
        )

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
