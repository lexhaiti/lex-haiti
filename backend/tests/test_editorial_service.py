"""Tests for the editorial service versioning logic.

The editorial service's ``update_article_content`` implements the critical
versioning policy from CLAUDE.md:

  - Draft version → mutate in place (no version bump)
  - Published version → create a new draft version (supersede)

This logic is the highest-risk untested code in the backend because a bug
here corrupts the corpus: it would either lose edit history (by mutating
a published version) or create unnecessary versions (by branching on drafts).

These tests mock the repository layer to test the branching logic in
isolation, without a real database.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from typing import Optional
from unittest.mock import MagicMock, patch

import pytest

from schemas.article import ArticleCreate, ArticleVersionCreate
from schemas.enums import ArticleStatus, EditorialStatus, LegalCategory, LegalStatus
from schemas.heading import LegalHeadingCreate
from schemas.legal_text import LegalTextCreate
from services.corpus.exceptions import AlreadyExists, InvalidInput, NotFound


# ---------------------------------------------------------------------------
# Lightweight ORM-like mocks — enough shape for the service to read attrs
# ---------------------------------------------------------------------------


def _make_version(
    *,
    id: int = 1,
    article_id: int = 10,
    version_number: int = 1,
    title_fr: str = "Titre original",
    title_ht: Optional[str] = None,
    text_fr: str = "Corps original.",
    text_ht: Optional[str] = None,
    editorial_status: EditorialStatus = EditorialStatus.draft,
    effective_from: Optional[date] = None,
    effective_to: Optional[date] = None,
    status: ArticleStatus = ArticleStatus.in_force,
    transferred_to_article_id: Optional[int] = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=id,
        article_id=article_id,
        version_number=version_number,
        title_fr=title_fr,
        title_ht=title_ht,
        text_fr=text_fr,
        text_ht=text_ht,
        editorial_status=editorial_status,
        effective_from=effective_from,
        effective_to=effective_to,
        status=status,
        transferred_to_article_id=transferred_to_article_id,
    )


def _make_article(
    *,
    id: int = 10,
    legal_text_id: int = 100,
    heading_id: Optional[int] = None,
    number: str = "1",
    slug: str = "art-1",
    position: int = 0,
    domain_tags: list = None,
    current_version: SimpleNamespace = None,
) -> SimpleNamespace:
    a = SimpleNamespace(
        id=id,
        legal_text_id=legal_text_id,
        heading_id=heading_id,
        number=number,
        slug=slug,
        position=position,
        domain_tags=domain_tags or [],
        current_version=current_version or _make_version(article_id=id),
    )
    return a


def _make_user(id: int = 1, email: str = "editor@test.com", role: str = "editor"):
    return SimpleNamespace(id=id, email=email, name="Test Editor", role=role)


# ---------------------------------------------------------------------------
# Versioning policy: draft → mutate in place
# ---------------------------------------------------------------------------


class TestUpdateArticleContentDraft:
    """When the current version is a draft, edits mutate it in place."""

    def _run(self, updates: dict, version_kwargs: dict = None):
        from services.editorial.service import EditorialService

        v_kwargs = {"editorial_status": EditorialStatus.draft}
        if version_kwargs:
            v_kwargs.update(version_kwargs)
        version = _make_version(**v_kwargs)
        article = _make_article(current_version=version)

        session = MagicMock()
        service = EditorialService(session)
        service.repo = MagicMock()
        service.repo.get_article.return_value = article

        actor = _make_user()
        result = service.update_article_content(
            article.id, actor=actor, updates=updates
        )
        return session, version, article, result

    def test_mutates_text_fr_in_place(self):
        session, version, article, _ = self._run(
            {"text_fr": "Nouveau corps."}
        )
        # The draft version's text_fr should be mutated directly
        assert version.text_fr == "Nouveau corps."
        # No new ArticleVersion was added to the session
        assert not any(
            call[0][0].__class__.__name__ == "ArticleVersion"
            for call in session.add.call_args_list
            if hasattr(call[0][0], "__class__")
        )

    def test_mutates_title_ht_in_place(self):
        _, version, _, _ = self._run({"title_ht": "Tit an kreyòl"})
        assert version.title_ht == "Tit an kreyòl"

    def test_no_op_when_values_unchanged(self):
        from services.corpus.service import article_to_embed

        version = _make_version(text_fr="Same text.")
        article = _make_article(current_version=version)

        session = MagicMock()
        from services.editorial.service import EditorialService
        service = EditorialService(session)
        service.repo = MagicMock()
        service.repo.get_article.return_value = article

        result = service.update_article_content(
            article.id, actor=_make_user(), updates={"text_fr": "Same text."}
        )
        # No audit row should be written (no diff)
        audit_adds = [
            c for c in session.add.call_args_list
            if hasattr(c[0][0], "action")
        ]
        assert len(audit_adds) == 0

    def test_rejects_empty_text_fr(self):
        with pytest.raises(InvalidInput, match="text_fr cannot be empty"):
            self._run({"text_fr": ""})

    def test_rejects_whitespace_text_fr(self):
        with pytest.raises(InvalidInput, match="text_fr cannot be empty"):
            self._run({"text_fr": "   "})

    def test_rejects_unknown_fields(self):
        with pytest.raises(InvalidInput, match="non-editable"):
            self._run({"slug": "hacked"})

    def test_sanitizes_text_fr_html(self):
        """text_fr from the Tiptap editor lands as HTML — bleach should
        scrub <script> + dangerous attrs while preserving <strong>,
        <em>, lists, and ``text-align`` styles."""
        _, version, _, _ = self._run(
            {
                "text_fr": (
                    '<p>Bold <strong>here</strong>.</p>'
                    '<p><script>alert(1)</script></p>'
                    '<p style="text-align: center">Centered</p>'
                )
            }
        )
        assert "<script>" not in version.text_fr
        assert "<strong>here</strong>" in version.text_fr
        assert "text-align: center" in version.text_fr

    def test_strips_dangerous_handlers_from_html(self):
        _, version, _, _ = self._run(
            {"text_fr": '<p onclick="steal()">click bait</p>'}
        )
        assert "onclick" not in version.text_fr
        assert "click bait" in version.text_fr

    def test_script_tag_text_content_is_preserved_as_plain_text(self):
        """Bleach drops the ``<script>`` tag but keeps its text
        content — the result is harmless prose in a paragraph
        context. The test pins the behaviour so a future bleach
        upgrade that changes it surfaces here."""
        _, version, _, _ = self._run(
            {"text_fr": "<p>before<script>alert(1)</script>after</p>"}
        )
        assert "<script>" not in version.text_fr
        # Script content survives as text — not executable in a body.
        assert "alert(1)" in version.text_fr

    def test_preserves_plain_text_text_fr_unchanged(self):
        """Legacy plain-text bodies pass through the sanitizer
        untouched (no tags ⇒ bleach is a no-op)."""
        _, version, _, _ = self._run(
            {"text_fr": "Texte brut sans HTML."}
        )
        assert version.text_fr == "Texte brut sans HTML."


# ---------------------------------------------------------------------------
# Sanitizer helper — pinned independently of the article-content path
# ---------------------------------------------------------------------------


class TestSanitizeArticleHtml:
    """Direct tests on ``_sanitize_article_html``. The helper is the
    trust boundary between the Tiptap editor (which emits arbitrary
    HTML) and the public renderer (which uses
    ``dangerouslySetInnerHTML``), so the allowlist deserves
    standalone coverage. Every write path that takes rich text — the
    article inline editor, AddArticleDialog (correction + amendment),
    AddVersionDialog, formal-block edits + AddBlockVersionDialog — flows
    through this same function."""

    def _clean(self, html):
        from services.editorial.service import _sanitize_article_html

        return _sanitize_article_html(html)

    def test_keeps_basic_formatting_tags(self):
        out = self._clean(
            "<p><strong>Bold</strong> and <em>italic</em> and <u>under</u>.</p>"
        )
        assert "<strong>Bold</strong>" in out
        assert "<em>italic</em>" in out
        assert "<u>under</u>" in out

    def test_keeps_lists(self):
        out = self._clean(
            "<ul><li>One</li><li>Two</li></ul><ol><li>A</li></ol>"
        )
        assert "<ul>" in out and "<li>One</li>" in out
        assert "<ol>" in out and "<li>A</li>" in out

    def test_keeps_paragraph_text_align(self):
        for align in ("left", "center", "right", "justify"):
            out = self._clean(f'<p style="text-align: {align}">x</p>')
            assert f"text-align: {align}" in out, out

    def test_strips_disallowed_css_properties(self):
        out = self._clean(
            '<p style="text-align: center; color: red; font-size: 99px">x</p>'
        )
        assert "text-align: center" in out
        assert "color" not in out
        assert "font-size" not in out

    def test_strips_event_handlers(self):
        out = self._clean('<p onclick="alert(1)" onmouseover="x()">y</p>')
        assert "onclick" not in out
        assert "onmouseover" not in out

    def test_strips_disallowed_tags(self):
        out = self._clean(
            '<iframe src="evil"></iframe>'
            '<p>safe</p>'
            '<object data="bad"></object>'
        )
        assert "<iframe" not in out
        assert "<object" not in out
        assert "<p>safe</p>" in out

    def test_strips_dangerous_protocols(self):
        # ``<a>`` isn't in the allowlist, so the whole tag is stripped
        # but the visible label survives — same defense-in-depth as
        # script-tag content. We pin both.
        out = self._clean('<a href="javascript:steal()">label</a>')
        assert "javascript:" not in out
        assert "label" in out

    def test_none_in_none_out(self):
        assert self._clean(None) is None

    def test_whitespace_in_empty_out(self):
        assert self._clean("   \n  ") == ""


# ---------------------------------------------------------------------------
# Versioning policy: published → create new draft version
# ---------------------------------------------------------------------------


class TestUpdateArticleContentPublished:
    """When the current version is published, edits create a new draft."""

    def test_creates_new_version_on_published(self):
        from services.editorial.service import EditorialService

        version = _make_version(
            id=1,
            version_number=1,
            text_fr="Original published body.",
            editorial_status=EditorialStatus.published,
        )
        article = _make_article(current_version=version)

        session = MagicMock()
        # flush() needs to assign an id to the new version
        flush_count = [0]
        def fake_flush():
            flush_count[0] += 1
            # Simulate DB assigning an id to the newly added version
            for call in session.add.call_args_list:
                obj = call[0][0]
                if hasattr(obj, "version_number") and not hasattr(obj, "id"):
                    obj.id = 999
        session.flush.side_effect = fake_flush

        service = EditorialService(session)
        service.repo = MagicMock()
        service.repo.get_article.return_value = article

        service.update_article_content(
            article.id,
            actor=_make_user(),
            updates={"text_fr": "Updated body."},
        )

        # A new ArticleVersion should have been added
        added_objects = [c[0][0] for c in session.add.call_args_list]
        new_versions = [
            o for o in added_objects if hasattr(o, "version_number")
        ]
        assert len(new_versions) >= 1

        new_v = new_versions[0]
        assert new_v.version_number == 2  # bumped from 1
        assert new_v.text_fr == "Updated body."
        assert new_v.editorial_status == EditorialStatus.draft
        # Carries forward the untouched fields from the original version
        assert new_v.title_fr == version.title_fr

    def test_published_version_stays_intact(self):
        from services.editorial.service import EditorialService

        version = _make_version(
            text_fr="Must not change.",
            editorial_status=EditorialStatus.published,
        )
        article = _make_article(current_version=version)

        session = MagicMock()
        session.flush.return_value = None
        for call in session.add.call_args_list:
            obj = call[0][0]
            if hasattr(obj, "version_number"):
                obj.id = 999

        service = EditorialService(session)
        service.repo = MagicMock()
        service.repo.get_article.return_value = article

        service.update_article_content(
            article.id,
            actor=_make_user(),
            updates={"text_fr": "New text."},
        )

        # Original version must NOT be modified
        assert version.text_fr == "Must not change."


# ---------------------------------------------------------------------------
# Article not found / no current version
# ---------------------------------------------------------------------------


class TestUpdateArticleContentEdgeCases:

    def test_raises_not_found_for_missing_article(self):
        from services.editorial.service import EditorialService

        session = MagicMock()
        service = EditorialService(session)
        service.repo = MagicMock()
        service.repo.get_article.return_value = None

        with pytest.raises(NotFound, match="Article not found"):
            service.update_article_content(
                999, actor=_make_user(), updates={"text_fr": "x"}
            )

    def test_raises_invalid_input_for_no_current_version(self):
        from services.editorial.service import EditorialService

        article = _make_article()
        article.current_version = None

        session = MagicMock()
        service = EditorialService(session)
        service.repo = MagicMock()
        service.repo.get_article.return_value = article

        with pytest.raises(InvalidInput, match="no current version"):
            service.update_article_content(
                article.id, actor=_make_user(), updates={"text_fr": "x"}
            )


# ---------------------------------------------------------------------------
# State transitions: publish / unpublish
# ---------------------------------------------------------------------------


class TestPublishUnpublish:

    def _make_text(self, status=EditorialStatus.draft):
        return SimpleNamespace(
            id=100,
            slug="test-law",
            category="loi",
            code_subcategory=None,
            jurisdiction="HT",
            title_fr="Loi test",
            title_ht=None,
            description_fr=None,
            description_ht=None,
            preamble_fr=None,
            preamble_ht=None,
            visas_fr=None,
            visas_ht=None,
            considerants_fr=None,
            considerants_ht=None,
            enacting_formula_fr=None,
            enacting_formula_ht=None,
            promulgation_date=None,
            publication_date=None,
            moniteur_ref=None,
            moniteur_issue=None,
            status="in_force",
            editorial_status=status,
            published_at=None,
            created_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
            updated_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        )

    def test_publish_changes_status(self):
        from services.editorial.service import EditorialService

        text = self._make_text(status=EditorialStatus.draft)

        session = MagicMock()
        service = EditorialService(session)
        service.repo = MagicMock()
        service.repo.get_text_by_slug.return_value = text
        service.corpus = MagicMock()
        service.corpus.get_text_by_slug.return_value = SimpleNamespace()

        service.publish_legal_text("test-law", actor=_make_user())

        assert text.editorial_status == EditorialStatus.published
        assert text.published_at is not None

    def test_unpublish_requires_comment(self):
        from services.editorial.service import EditorialService

        session = MagicMock()
        service = EditorialService(session)

        with pytest.raises(InvalidInput, match="comment is required"):
            service.unpublish_legal_text(
                "test-law", actor=_make_user(), comment=""
            )

    def test_unpublish_resets_to_draft(self):
        from services.editorial.service import EditorialService

        text = self._make_text(status=EditorialStatus.published)

        session = MagicMock()
        service = EditorialService(session)
        service.repo = MagicMock()
        service.repo.get_text_by_slug.return_value = text

        service.unpublish_legal_text(
            "test-law", actor=_make_user(), comment="Needs correction."
        )

        assert text.editorial_status == EditorialStatus.draft
        assert text.published_at is None

    def test_publish_not_found_raises(self):
        from services.editorial.service import EditorialService

        session = MagicMock()
        service = EditorialService(session)
        service.repo = MagicMock()
        service.repo.get_text_by_slug.return_value = None

        with pytest.raises(NotFound):
            service.publish_legal_text("missing", actor=_make_user())


# ---------------------------------------------------------------------------
# Metadata update — diff tracking
# ---------------------------------------------------------------------------


class TestMetadataUpdate:

    def test_no_op_when_nothing_changed(self):
        from services.editorial.service import EditorialService

        text = SimpleNamespace(
            id=1, slug="test", title_fr="Titre", editorial_status=EditorialStatus.draft,
            title_ht=None, description_fr=None, description_ht=None,
            promulgation_date=None, publication_date=None, moniteur_ref=None,
            category=None, code_subcategory=None, status=LegalStatus.in_force,
        )

        session = MagicMock()
        service = EditorialService(session)
        service.repo = MagicMock()
        service.repo.get_text_by_slug.return_value = text

        # Mock get_text to return a value
        service.get_text = MagicMock(return_value=SimpleNamespace())

        result = service.update_legal_text_metadata(
            "test", actor=_make_user(), updates={"title_fr": "Titre"}
        )

        # No audit row when nothing changed — check no EditorialAction added
        audit_adds = [
            c for c in session.add.call_args_list
            if hasattr(c[0][0], "action")
        ]
        assert len(audit_adds) == 0

    def test_rejects_empty_title_fr(self):
        from services.editorial.service import EditorialService

        text = SimpleNamespace(
            id=1, slug="test", title_fr="Titre",
            editorial_status=EditorialStatus.draft,
        )

        session = MagicMock()
        service = EditorialService(session)
        service.repo = MagicMock()
        service.repo.get_text_by_slug.return_value = text

        with pytest.raises(InvalidInput, match="title_fr cannot be empty"):
            service.update_legal_text_metadata(
                "test", actor=_make_user(), updates={"title_fr": ""}
            )

    def test_rejects_unknown_fields(self):
        from services.editorial.service import EditorialService

        text = SimpleNamespace(id=1, slug="test", editorial_status=EditorialStatus.draft)

        session = MagicMock()
        service = EditorialService(session)
        service.repo = MagicMock()
        service.repo.get_text_by_slug.return_value = text

        # ``slug`` was added to the editable allowlist when the editor
        # asked for parser-slug overrides; pick a field that's still
        # never accepted (created_at is server-managed).
        with pytest.raises(InvalidInput, match="unknown metadata fields"):
            service.update_legal_text_metadata(
                "test",
                actor=_make_user(),
                updates={"created_at": "2025-01-01"},
            )


# ---------------------------------------------------------------------------
# Create legal text (editorial import)
# ---------------------------------------------------------------------------


class TestCreateLegalText:

    def _make_create_data(self, **overrides) -> LegalTextCreate:
        defaults = dict(
            slug="test-law",
            category=LegalCategory.loi,
            title_fr="Loi test",
            headings=[
                LegalHeadingCreate(
                    key="chapter-1",
                    level="chapter",
                    number="I",
                    title_fr="Premier chapitre",
                    position=0,
                ),
            ],
            articles=[
                ArticleCreate(
                    number="1",
                    slug="art-1",
                    heading_key="chapter-1",
                    position=0,
                    version=ArticleVersionCreate(
                        text_fr="Corps de l'article premier.",
                    ),
                ),
            ],
        )
        defaults.update(overrides)
        return LegalTextCreate(**defaults)

    def _service(self):
        from services.editorial.service import EditorialService

        session = MagicMock()
        # flush() is called many times; always succeed
        session.flush.return_value = None
        service = EditorialService(session)
        service.repo = MagicMock()
        # No existing text with this slug
        service.repo.get_text_by_slug.return_value = None
        # get_text needs to work for the return value
        service.get_text = MagicMock(return_value=SimpleNamespace(
            id=1, slug="test-law", title_fr="Loi test",
        ))
        return service, session

    def test_rejects_empty_slug(self):
        service, _ = self._service()
        data = self._make_create_data(slug="")
        with pytest.raises(InvalidInput, match="slug is required"):
            service.create_legal_text(data, actor=_make_user())

    def test_rejects_empty_title(self):
        service, _ = self._service()
        data = self._make_create_data(title_fr="")
        with pytest.raises(InvalidInput, match="title_fr is required"):
            service.create_legal_text(data, actor=_make_user())

    def test_rejects_duplicate_slug(self):
        service, _ = self._service()
        service.repo.get_text_by_slug.return_value = SimpleNamespace(
            id=99, slug="test-law"
        )
        data = self._make_create_data()
        with pytest.raises(AlreadyExists, match="already exists"):
            service.create_legal_text(data, actor=_make_user())

    def test_creates_text_headings_articles(self):
        service, session = self._service()
        data = self._make_create_data()

        service.create_legal_text(data, actor=_make_user())

        # LegalText + LegalHeading + Article + ArticleVersion + EditorialAction = 5 adds
        added = [c[0][0] for c in session.add.call_args_list]
        assert len(added) >= 4  # at least text + heading + article + version

        # Check that flush was called (needed for FK resolution)
        assert session.flush.call_count >= 4

    def test_creates_without_headings_or_articles(self):
        service, session = self._service()
        data = self._make_create_data(headings=None, articles=None)

        service.create_legal_text(data, actor=_make_user())

        # Only LegalText + EditorialAction
        added = [c[0][0] for c in session.add.call_args_list]
        assert len(added) >= 1

    def test_editorial_status_always_draft(self):
        """Even if the caller passes published, the text is created as draft."""
        service, session = self._service()
        data = self._make_create_data(editorial_status=EditorialStatus.published)

        service.create_legal_text(data, actor=_make_user())

        # Find the LegalText that was added
        legal_texts = [
            c[0][0] for c in session.add.call_args_list
            if hasattr(c[0][0], 'editorial_status') and hasattr(c[0][0], 'slug')
        ]
        assert len(legal_texts) >= 1
        assert legal_texts[0].editorial_status == EditorialStatus.draft
