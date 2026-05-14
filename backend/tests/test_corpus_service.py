"""Tests for the corpus service read paths.

The CorpusService is the public API the routes layer uses. Its main
responsibilities are:

  1. Look up texts by slug with configurable include depth (metadata,
     toc, full)
  2. Assemble the TOC tree from flat heading rows
  3. List articles with optional heading-key filtering
  4. Quick-access homepage cards (category / subcategory routing)
  5. Batch article resolution for citation panels

These are the core read paths the public site depends on. Bugs here
produce broken reader pages, empty Code sidebars, or missing citation
labels.

Tests mock the repository layer so they run without a database.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace
from typing import Optional
from unittest.mock import MagicMock

import pytest

from schemas.enums import (
    ArticleStatus,
    CodeSubcategory,
    EditorialStatus,
    HeadingLevel,
    LegalCategory,
    LegalStatus,
)
from services.corpus.exceptions import NotFound


# ---------------------------------------------------------------------------
# Lightweight ORM-shaped mocks
# ---------------------------------------------------------------------------


def _ts() -> datetime:
    return datetime(2025, 1, 1, tzinfo=timezone.utc)


def _make_text(
    *,
    id: int = 1,
    slug: str = "code-civil",
    category: LegalCategory = LegalCategory.code,
    code_subcategory: Optional[CodeSubcategory] = CodeSubcategory.code_civil,
    jurisdiction: str = "HT",
    title_fr: str = "Code Civil",
    title_ht: Optional[str] = None,
    description_fr: Optional[str] = None,
    description_ht: Optional[str] = None,
    preamble_fr: Optional[str] = None,
    preamble_ht: Optional[str] = None,
    visas_fr: Optional[str] = None,
    visas_ht: Optional[str] = None,
    considerants_fr: Optional[str] = None,
    considerants_ht: Optional[str] = None,
    enacting_formula_fr: Optional[str] = None,
    enacting_formula_ht: Optional[str] = None,
    promulgation_date: Optional[date] = None,
    publication_date: Optional[date] = None,
    moniteur_ref: Optional[str] = None,
    moniteur_issue=None,
    official_number: Optional[str] = None,
    issuing_authority: Optional[str] = None,
    official_formula: Optional[str] = None,
    status: LegalStatus = LegalStatus.in_force,
    editorial_status: EditorialStatus = EditorialStatus.published,
    headings: list | None = None,
    articles: list | None = None,
    signers: list | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=id,
        slug=slug,
        category=category,
        code_subcategory=code_subcategory,
        jurisdiction=jurisdiction,
        title_fr=title_fr,
        title_ht=title_ht,
        description_fr=description_fr,
        description_ht=description_ht,
        preamble_fr=preamble_fr,
        preamble_ht=preamble_ht,
        visas_fr=visas_fr,
        visas_ht=visas_ht,
        considerants_fr=considerants_fr,
        considerants_ht=considerants_ht,
        enacting_formula_fr=enacting_formula_fr,
        enacting_formula_ht=enacting_formula_ht,
        promulgation_date=promulgation_date,
        publication_date=publication_date,
        moniteur_ref=moniteur_ref,
        moniteur_issue=moniteur_issue,
        official_number=official_number,
        issuing_authority=issuing_authority,
        official_formula=official_formula,
        status=status,
        editorial_status=editorial_status,
        created_at=_ts(),
        updated_at=_ts(),
        published_at=_ts(),
        headings=headings or [],
        articles=articles or [],
        signers=signers or [],
    )


def _make_heading(
    *,
    id: int,
    legal_text_id: int = 1,
    parent_id: Optional[int] = None,
    level: HeadingLevel = HeadingLevel.title,
    key: str = "titre-1",
    number: Optional[str] = "I",
    title_fr: Optional[str] = "Titre Premier",
    title_ht: Optional[str] = None,
    content_fr: Optional[str] = None,
    content_ht: Optional[str] = None,
    position: int = 0,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=id,
        legal_text_id=legal_text_id,
        parent_id=parent_id,
        level=level,
        key=key,
        number=number,
        title_fr=title_fr,
        title_ht=title_ht,
        content_fr=content_fr,
        content_ht=content_ht,
        position=position,
    )


def _make_article_version(
    *,
    id: int = 100,
    article_id: int = 10,
    version_number: int = 1,
    title_fr: Optional[str] = None,
    title_ht: Optional[str] = None,
    text_fr: str = "Corps de l'article.",
    text_ht: Optional[str] = None,
    status: ArticleStatus = ArticleStatus.in_force,
    editorial_status: EditorialStatus = EditorialStatus.draft,
    effective_from: Optional[date] = None,
    effective_to: Optional[date] = None,
    transferred_to_article_id: Optional[int] = None,
    source_amendment_id: Optional[int] = None,
    confidence=None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=id,
        article_id=article_id,
        version_number=version_number,
        title_fr=title_fr,
        title_ht=title_ht,
        text_fr=text_fr,
        text_ht=text_ht,
        status=status,
        editorial_status=editorial_status,
        effective_from=effective_from,
        effective_to=effective_to,
        transferred_to_article_id=transferred_to_article_id,
        source_amendment_id=source_amendment_id,
        confidence=confidence,
        created_at=_ts(),
        updated_at=_ts(),
    )


def _make_article(
    *,
    id: int = 10,
    legal_text_id: int = 1,
    heading_id: Optional[int] = None,
    number: str = "1",
    slug: str = "art-1",
    position: int = 0,
    domain_tags: list | None = None,
    current_version: SimpleNamespace | None = None,
    versions: list | None = None,
    legal_text: SimpleNamespace | None = None,
) -> SimpleNamespace:
    cv = current_version or _make_article_version(article_id=id)
    return SimpleNamespace(
        id=id,
        legal_text_id=legal_text_id,
        heading_id=heading_id,
        number=number,
        slug=slug,
        position=position,
        domain_tags=domain_tags or [],
        current_version=cv,
        versions=versions or [cv],
        legal_text=legal_text,
        created_at=_ts(),
        updated_at=_ts(),
    )


def _make_signer(
    *,
    id: int = 1,
    legal_text_id: int = 1,
    name: str = "Jean-Pierre Boyer",
    function_fr: str = "Président de la République",
    function_ht: Optional[str] = None,
    position: int = 0,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=id,
        legal_text_id=legal_text_id,
        name=name,
        function_fr=function_fr,
        function_ht=function_ht,
        position=position,
    )


def _service():
    from services.corpus.service import CorpusService

    session = MagicMock()
    service = CorpusService(session)
    service.repo = MagicMock()
    # Default: no theme tags. Individual tests can override.
    service.repo.get_theme_tags_for_text.return_value = []
    service.repo.get_theme_tags_for_texts.return_value = {}
    return service


# ---------------------------------------------------------------------------
# TOC tree assembly
# ---------------------------------------------------------------------------


class TestTocAssembly:
    """get_toc_by_slug converts flat heading rows into a nested tree."""

    def test_flat_headings_become_root_nodes(self):
        svc = _service()
        text = _make_text()
        svc.repo.get_text_by_slug.return_value = text
        svc.repo.get_headings_by_text_id.return_value = [
            _make_heading(id=1, key="titre-1", position=0),
            _make_heading(id=2, key="titre-2", position=1),
        ]

        roots = svc.get_toc_by_slug("code-civil")

        assert len(roots) == 2
        assert roots[0].key == "titre-1"
        assert roots[1].key == "titre-2"
        assert roots[0].children == []
        assert roots[1].children == []

    def test_nested_tree_structure(self):
        """Livre > Titre > Chapitre nesting is assembled correctly."""
        svc = _service()
        text = _make_text()
        svc.repo.get_text_by_slug.return_value = text
        svc.repo.get_headings_by_text_id.return_value = [
            _make_heading(
                id=1,
                key="livre-1",
                level=HeadingLevel.book,
                title_fr="Livre Premier",
                position=0,
            ),
            _make_heading(
                id=2,
                key="titre-1",
                level=HeadingLevel.title,
                title_fr="Des personnes",
                parent_id=1,
                position=0,
            ),
            _make_heading(
                id=3,
                key="chap-1",
                level=HeadingLevel.chapter,
                title_fr="De la nationalité",
                parent_id=2,
                position=0,
            ),
        ]

        roots = svc.get_toc_by_slug("code-civil")

        assert len(roots) == 1
        livre = roots[0]
        assert livre.key == "livre-1"
        assert len(livre.children) == 1

        titre = livre.children[0]
        assert titre.key == "titre-1"
        assert len(titre.children) == 1

        chapitre = titre.children[0]
        assert chapitre.key == "chap-1"
        assert chapitre.children == []

    def test_siblings_sorted_by_position(self):
        svc = _service()
        text = _make_text()
        svc.repo.get_text_by_slug.return_value = text
        # Return in reverse order — the service should sort by position.
        svc.repo.get_headings_by_text_id.return_value = [
            _make_heading(id=3, key="chap-3", position=2),
            _make_heading(id=1, key="chap-1", position=0),
            _make_heading(id=2, key="chap-2", position=1),
        ]

        roots = svc.get_toc_by_slug("code-civil")

        keys = [n.key for n in roots]
        assert keys == ["chap-1", "chap-2", "chap-3"]

    def test_empty_headings_returns_empty_tree(self):
        svc = _service()
        text = _make_text()
        svc.repo.get_text_by_slug.return_value = text
        svc.repo.get_headings_by_text_id.return_value = []

        roots = svc.get_toc_by_slug("code-civil")
        assert roots == []

    def test_orphan_heading_becomes_root(self):
        """A heading whose parent_id doesn't exist in the set → root node."""
        svc = _service()
        text = _make_text()
        svc.repo.get_text_by_slug.return_value = text
        svc.repo.get_headings_by_text_id.return_value = [
            _make_heading(id=5, key="section-1", parent_id=999, position=0),
        ]

        roots = svc.get_toc_by_slug("code-civil")
        assert len(roots) == 1
        assert roots[0].key == "section-1"

    def test_raises_not_found_for_missing_text(self):
        svc = _service()
        svc.repo.get_text_by_slug.return_value = None

        with pytest.raises(NotFound, match="not found"):
            svc.get_toc_by_slug("nonexistent")


# ---------------------------------------------------------------------------
# get_text_by_slug — include modes
# ---------------------------------------------------------------------------


class TestGetTextBySlug:

    def test_metadata_only_by_default(self):
        svc = _service()
        text = _make_text()
        svc.repo.get_text_by_slug.return_value = text

        result = svc.get_text_by_slug("code-civil")

        assert result.slug == "code-civil"
        assert result.headings == []
        assert result.articles == []
        assert result.signers == []
        # Repo called without eager-loading relations
        svc.repo.get_text_by_slug.assert_called_once_with(
            "code-civil",
            with_headings=False,
            with_articles=False,
            with_signers=False,
        )

    def test_include_toc_loads_headings_only(self):
        svc = _service()
        heading = _make_heading(id=1, key="titre-1")
        text = _make_text(headings=[heading])
        svc.repo.get_text_by_slug.return_value = text

        result = svc.get_text_by_slug("code-civil", include="toc")

        assert len(result.headings) == 1
        assert result.headings[0].key == "titre-1"
        assert result.articles == []
        assert result.signers == []

    def test_include_all_loads_everything(self):
        svc = _service()
        heading = _make_heading(id=1, key="titre-1")
        article = _make_article(id=10, number="1", slug="art-1")
        signer = _make_signer(id=1, name="Boyer")
        text = _make_text(
            headings=[heading], articles=[article], signers=[signer]
        )
        svc.repo.get_text_by_slug.return_value = text

        result = svc.get_text_by_slug("code-civil", include="all")

        assert len(result.headings) == 1
        assert len(result.articles) == 1
        assert len(result.signers) == 1
        # Article embed should flatten current_version content
        embed = result.articles[0]
        assert embed.number == "1"
        assert embed.content_fr == "Corps de l'article."

    def test_raises_not_found_for_missing_slug(self):
        svc = _service()
        svc.repo.get_text_by_slug.return_value = None

        with pytest.raises(NotFound, match="not found"):
            svc.get_text_by_slug("nonexistent")


# ---------------------------------------------------------------------------
# article_to_embed — flattening helper
# ---------------------------------------------------------------------------


class TestArticleToEmbed:

    def test_flattens_current_version_fields(self):
        from services.corpus.service import article_to_embed

        cv = _make_article_version(
            title_fr="Titre art.",
            text_fr="Contenu.",
            text_ht="Kontni.",
            status=ArticleStatus.abrogated,
            version_number=3,
        )
        article = _make_article(
            id=10, number="1382", slug="art-1382", current_version=cv,
        )

        embed = article_to_embed(article)

        assert embed.id == 10
        assert embed.number == "1382"
        assert embed.title_fr == "Titre art."
        assert embed.content_fr == "Contenu."
        assert embed.content_ht == "Kontni."
        assert embed.status == ArticleStatus.abrogated
        assert embed.version_number == 3

    def test_handles_no_current_version(self):
        from services.corpus.service import article_to_embed

        article = _make_article(id=5)
        article.current_version = None

        embed = article_to_embed(article)

        assert embed.content_fr is None
        assert embed.title_fr is None
        assert embed.status == ArticleStatus.in_force
        assert embed.version_number is None


# ---------------------------------------------------------------------------
# list_articles_by_text_slug
# ---------------------------------------------------------------------------


class TestListArticlesByTextSlug:

    def test_returns_paginated_articles(self):
        svc = _service()
        text = _make_text(id=1)
        articles = [
            _make_article(id=10, number="1", slug="art-1", position=0),
            _make_article(id=11, number="2", slug="art-2", position=1),
        ]
        svc.repo.get_text_by_slug.return_value = text
        svc.repo.list_articles_by_text.return_value = (articles, 2)

        result = svc.list_articles_by_text_slug("code-civil")

        assert result.total == 2
        assert len(result.items) == 2
        assert result.items[0].number == "1"
        assert result.items[1].number == "2"

    def test_heading_key_resolves_to_heading_id(self):
        svc = _service()
        text = _make_text(id=1)
        heading = _make_heading(id=42, key="chapitre-3")
        svc.repo.get_text_by_slug.return_value = text
        svc.repo.get_heading_by_key.return_value = heading
        svc.repo.list_articles_by_text.return_value = ([], 0)

        svc.list_articles_by_text_slug("code-civil", heading_key="chapitre-3")

        # The resolved heading_id should be passed to the repo
        svc.repo.list_articles_by_text.assert_called_once()
        call_kwargs = svc.repo.list_articles_by_text.call_args
        assert call_kwargs[1]["heading_id"] == 42

    def test_heading_key_not_found_raises(self):
        svc = _service()
        text = _make_text(id=1)
        svc.repo.get_text_by_slug.return_value = text
        svc.repo.get_heading_by_key.return_value = None

        with pytest.raises(NotFound, match="Heading not found"):
            svc.list_articles_by_text_slug(
                "code-civil", heading_key="nonexistent"
            )

    def test_text_not_found_raises(self):
        svc = _service()
        svc.repo.get_text_by_slug.return_value = None

        with pytest.raises(NotFound, match="not found"):
            svc.list_articles_by_text_slug("nonexistent")


# ---------------------------------------------------------------------------
# Quick access (homepage cards)
# ---------------------------------------------------------------------------


class TestQuickAccess:

    def test_default_keys_route_to_correct_repo_methods(self):
        svc = _service()
        constitution = _make_text(
            id=1,
            slug="constitution-1987",
            category=LegalCategory.constitution,
        )
        code_civil = _make_text(
            id=2, slug="code-civil", category=LegalCategory.code,
            code_subcategory=CodeSubcategory.code_civil,
        )

        def by_cat(cat, **kw):
            if cat == LegalCategory.constitution:
                return constitution
            return None

        def by_sub(sub, **kw):
            if sub == CodeSubcategory.code_civil:
                return code_civil
            return None

        svc.repo.latest_by_category.side_effect = by_cat
        svc.repo.latest_by_subcategory.side_effect = by_sub

        result = svc.get_quick_access()

        # Should include constitution (via category) and code_civil (via subcategory).
        # Other defaults (code_penal, code_travail) return None → skipped.
        slugs = [r.slug for r in result]
        assert "constitution-1987" in slugs
        assert "code-civil" in slugs

    def test_custom_keys(self):
        svc = _service()
        text = _make_text(id=1, slug="code-penal")

        svc.repo.latest_by_subcategory.return_value = text

        result = svc.get_quick_access(keys=[CodeSubcategory.code_penal])

        assert len(result) == 1
        assert result[0].slug == "code-penal"
        svc.repo.latest_by_subcategory.assert_called_once_with(
            CodeSubcategory.code_penal
        )

    def test_skips_missing_entries(self):
        svc = _service()
        svc.repo.latest_by_category.return_value = None
        svc.repo.latest_by_subcategory.return_value = None

        result = svc.get_quick_access()
        assert result == []


# ---------------------------------------------------------------------------
# resolve_articles (citation panel)
# ---------------------------------------------------------------------------


class TestResolveArticles:

    def test_batch_resolves_articles(self):
        svc = _service()
        text = _make_text(id=1, slug="code-civil", title_fr="Code Civil")
        articles = [
            _make_article(id=10, number="1382", slug="art-1382", legal_text=text),
            _make_article(id=11, number="1383", slug="art-1383", legal_text=text),
        ]
        svc.repo.resolve_articles.return_value = articles

        result = svc.resolve_articles([10, 11])

        assert len(result) == 2
        assert result[0].number == "1382"
        assert result[0].text_slug == "code-civil"
        assert result[0].text_title_fr == "Code Civil"
        assert result[1].number == "1383"

    def test_skips_articles_without_legal_text(self):
        svc = _service()
        good = _make_article(
            id=10, number="1", slug="art-1",
            legal_text=_make_text(id=1, slug="code-civil", title_fr="Code Civil"),
        )
        orphan = _make_article(id=11, number="2", slug="art-2", legal_text=None)
        svc.repo.resolve_articles.return_value = [good, orphan]

        result = svc.resolve_articles([10, 11])

        assert len(result) == 1
        assert result[0].id == 10

    def test_empty_input_returns_empty(self):
        svc = _service()
        svc.repo.resolve_articles.return_value = []

        result = svc.resolve_articles([])
        assert result == []


# ---------------------------------------------------------------------------
# get_article
# ---------------------------------------------------------------------------


class TestGetArticle:

    def test_returns_article_with_history(self):
        svc = _service()
        v1 = _make_article_version(id=100, version_number=1, text_fr="V1.")
        v2 = _make_article_version(id=101, version_number=2, text_fr="V2.")
        article = _make_article(
            id=10, current_version=v2, versions=[v1, v2],
        )
        svc.repo.get_article.return_value = article

        result = svc.get_article(10, with_history=True)

        assert result.id == 10
        assert len(result.versions) == 2

    def test_returns_article_without_history(self):
        svc = _service()
        article = _make_article(id=10)
        svc.repo.get_article.return_value = article

        result = svc.get_article(10, with_history=False)

        assert result.id == 10
        assert not hasattr(result, "versions") or not result.versions

    def test_raises_not_found(self):
        svc = _service()
        svc.repo.get_article.return_value = None

        with pytest.raises(NotFound, match="not found"):
            svc.get_article(999)


# ---------------------------------------------------------------------------
# list_texts (pagination shape)
# ---------------------------------------------------------------------------


class TestListTexts:

    def test_returns_paginated_response(self):
        svc = _service()
        texts = [
            _make_text(id=1, slug="loi-1"),
            _make_text(id=2, slug="loi-2"),
        ]
        svc.repo.list_texts.return_value = (texts, 2)

        result = svc.list_texts()

        assert result.total == 2
        assert result.page == 1
        assert result.size == 50
        assert len(result.items) == 2

    def test_pagination_math(self):
        svc = _service()
        svc.repo.list_texts.return_value = ([], 100)

        result = svc.list_texts(limit=10, offset=30)

        assert result.page == 4  # (30 // 10) + 1
        assert result.size == 10
        assert result.total == 100
