"""Contract tests — exercise each public endpoint against a seeded database.

These act as the bridge between the backend schema and any client (frontend,
ingestion scripts, future Pro layer). They run end-to-end against a real
Postgres + the actual seed produced by `scripts/seed.py`.

Usage:
    make up                           # start Postgres+pgvector
    make migrate                      # apply schema
    python -m scripts.seed            # insert the example legal text
    pytest tests/test_api_contract.py

If the seed isn't present, the tests are skipped with an informative reason.
"""
from __future__ import annotations

import contextlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from api.db import engine
from api.main import app


@contextlib.contextmanager
def _temp_editorial_status(table: str, slug: str, target: str):
    """Flip a row's editorial_status for the duration of a test, then restore."""
    with engine.begin() as conn:
        original = conn.execute(
            text(
                f"SELECT editorial_status::text FROM public_corpus.{table} "
                f"WHERE slug = :s"
            ),
            {"s": slug},
        ).scalar_one()
        conn.execute(
            text(
                f"UPDATE public_corpus.{table} SET editorial_status = :t "
                f"WHERE slug = :s"
            ),
            {"t": target, "s": slug},
        )
    try:
        yield
    finally:
        with engine.begin() as conn:
            conn.execute(
                text(
                    f"UPDATE public_corpus.{table} SET editorial_status = :o "
                    f"WHERE slug = :s"
                ),
                {"o": original, "s": slug},
            )

client = TestClient(app)

SEED_SLUG = "exemple-loi-paternite"
SEED_DECISION_SLUG = "cassation-2020-01-15-paternite"


def _has_seed() -> bool:
    try:
        return client.get(f"/api/v1/legal-texts/{SEED_SLUG}").status_code == 200
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _has_seed(),
    reason=(
        "seed data not present — run `make up && make migrate && "
        "python -m scripts.seed`"
    ),
)


# ---------------------------------------------------------------------------
# meta routes
# ---------------------------------------------------------------------------


class TestMeta:
    def test_root_returns_service_info(self):
        r = client.get("/")
        assert r.status_code == 200
        body = r.json()
        assert "name" in body and "version" in body and body["docs"] == "/docs"

    def test_health_responds(self):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] in {"healthy", "unhealthy"}

    def test_openapi_includes_all_resource_groups(self):
        schema = client.get("/openapi.json").json()
        for path in (
            "/api/v1/legal-texts/search",
            "/api/v1/legal-texts/{slug}",
            "/api/v1/articles/{article_id}",
            "/api/v1/decisions",
            "/api/v1/decisions/{slug}",
            "/api/v1/citations",
        ):
            assert path in schema["paths"], f"missing path: {path}"


# ---------------------------------------------------------------------------
# /api/v1/legal-texts/
# ---------------------------------------------------------------------------


class TestListLegalTexts:
    def test_returns_paginated_envelope(self):
        r = client.get("/api/v1/legal-texts")
        assert r.status_code == 200
        body = r.json()
        assert {"items", "total", "page", "size"} <= body.keys()
        for item in body["items"]:
            # editorial workflow filter defaults to published
            assert item["editorial_status"] == "published"

    def test_filter_by_category(self):
        r = client.get("/api/v1/legal-texts?category=loi")
        assert r.status_code == 200
        for item in r.json()["items"]:
            assert item["category"] == "loi"

    def test_q_param_finds_seed(self):
        r = client.get("/api/v1/legal-texts?q=paternit")
        assert r.status_code == 200
        slugs = [t["slug"] for t in r.json()["items"]]
        assert SEED_SLUG in slugs

    def test_invalid_status_rejected(self):
        # `status` is enum-validated; an unknown value yields 422.
        r = client.get("/api/v1/legal-texts?status=bogus")
        assert r.status_code == 422

    def test_pagination_bounds(self):
        # limit > 100 should be rejected.
        r = client.get("/api/v1/legal-texts?limit=500")
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# /api/v1/legal-texts/{slug}
# ---------------------------------------------------------------------------


class TestGetLegalTextBySlug:
    def test_returns_seed_metadata(self):
        r = client.get(f"/api/v1/legal-texts/{SEED_SLUG}")
        assert r.status_code == 200
        body = r.json()
        assert body["slug"] == SEED_SLUG
        assert body["status"] == "in_force"
        assert body["editorial_status"] == "published"
        assert body["title_ht"]  # bilingual native — Kreyòl present
        # By default include is None — children are empty arrays.
        assert body["headings"] == []
        assert body["articles"] == []
        assert body["signers"] == []

    def test_include_toc_returns_headings_only(self):
        r = client.get(f"/api/v1/legal-texts/{SEED_SLUG}?include=toc")
        body = r.json()
        assert len(body["headings"]) >= 1
        assert body["articles"] == []

    def test_include_all_returns_articles_with_inline_content(self):
        r = client.get(f"/api/v1/legal-texts/{SEED_SLUG}?include=all")
        body = r.json()
        assert len(body["headings"]) >= 1
        assert len(body["articles"]) == 3
        assert len(body["signers"]) == 1
        first = body["articles"][0]
        # ArticleEmbed flattens current_version content_fr/ht onto the article.
        assert first["content_fr"]
        assert first["content_ht"]
        assert first["number"] == "1"

    def test_404_on_missing_slug(self):
        r = client.get("/api/v1/legal-texts/no-such-text")
        assert r.status_code == 404

    def test_draft_text_is_hidden_from_slug_endpoint(self):
        with _temp_editorial_status("legal_texts", SEED_SLUG, "draft"):
            r = client.get(f"/api/v1/legal-texts/{SEED_SLUG}")
            assert r.status_code == 404, (
                "draft texts must not be reachable via the public slug endpoint"
            )

    def test_draft_text_is_hidden_from_toc_endpoint(self):
        with _temp_editorial_status("legal_texts", SEED_SLUG, "draft"):
            r = client.get(f"/api/v1/legal-texts/{SEED_SLUG}/toc")
            assert r.status_code == 404

    def test_draft_text_is_hidden_from_articles_endpoint(self):
        with _temp_editorial_status("legal_texts", SEED_SLUG, "draft"):
            r = client.get(f"/api/v1/legal-texts/{SEED_SLUG}/articles")
            assert r.status_code == 404


# ---------------------------------------------------------------------------
# /api/v1/legal-texts/{slug}/toc and /articles
# ---------------------------------------------------------------------------


class TestToc:
    def test_returns_tree(self):
        r = client.get(f"/api/v1/legal-texts/{SEED_SLUG}/toc")
        assert r.status_code == 200
        nodes = r.json()
        assert isinstance(nodes, list) and len(nodes) >= 1
        first = nodes[0]
        assert first["level"] == "chapter"
        assert "children" in first


class TestListArticlesInText:
    def test_returns_seed_articles(self):
        r = client.get(f"/api/v1/legal-texts/{SEED_SLUG}/articles")
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 3
        assert len(body["items"]) == 3
        numbers = {a["number"] for a in body["items"]}
        assert numbers == {"1", "2", "3"}


# ---------------------------------------------------------------------------
# /api/v1/articles/{id}
# ---------------------------------------------------------------------------


class TestArticleDetail:
    def test_returns_with_history_and_current_version(self):
        text = client.get(f"/api/v1/legal-texts/{SEED_SLUG}?include=all").json()
        article_id = text["articles"][0]["id"]

        r = client.get(f"/api/v1/articles/{article_id}")
        assert r.status_code == 200
        body = r.json()
        assert body["number"] == "1"
        assert body["current_version"] is not None
        assert body["current_version"]["text_fr"]
        # version history present (one version in the seed)
        assert len(body["versions"]) == 1
        assert body["versions"][0]["version_number"] == 1

    def test_404_on_missing_id(self):
        r = client.get("/api/v1/articles/999999")
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# /api/v1/legal-texts/search
# ---------------------------------------------------------------------------


class TestSearch:
    def test_finds_text_by_title(self):
        r = client.get("/api/v1/legal-texts/search?q=paternit")
        assert r.status_code == 200
        body = r.json()
        assert body["query"] == "paternit"
        slugs = [hit["text"]["slug"] for hit in body["items"]]
        assert SEED_SLUG in slugs

    def test_finds_text_by_article_content(self):
        # "reconnaissance" appears in seed article 2 only.
        r = client.get("/api/v1/legal-texts/search?q=reconnaissance")
        body = r.json()
        slugs = [hit["text"]["slug"] for hit in body["items"]]
        assert SEED_SLUG in slugs
        hit = next(h for h in body["items"] if h["text"]["slug"] == SEED_SLUG)
        assert hit["matched_articles"] >= 1
        assert len(hit["snippets"]) >= 1
        snippet = hit["snippets"][0]
        assert "article" in snippet
        assert "snippet_fr" in snippet

    def test_empty_results_for_missing_term(self):
        r = client.get("/api/v1/legal-texts/search?q=zzzzzznotfound")
        body = r.json()
        assert body["total"] == 0
        assert body["items"] == []

    def test_empty_query_rejected(self):
        # `q` has min_length=1, so empty string is 422.
        r = client.get("/api/v1/legal-texts/search?q=")
        assert r.status_code == 422

    def test_finds_text_by_preamble_content(self):
        # The seed law is published. Inject a unique sentinel into preamble_fr,
        # search for it, expect a hit; clean up afterwards.
        sentinel = "lyseeqxywv-preamble-sentinel"
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE public_corpus.legal_texts "
                    "SET preamble_fr = :p WHERE slug = :s"
                ),
                {"p": f"Texte d'essai contenant {sentinel} pour la recherche.",
                 "s": SEED_SLUG},
            )
        try:
            r = client.get(
                "/api/v1/legal-texts/search",
                params={"q": sentinel},
            )
            assert r.status_code == 200
            slugs = [hit["text"]["slug"] for hit in r.json()["items"]]
            assert SEED_SLUG in slugs, (
                f"search must index preamble_fr; got slugs: {slugs}"
            )
        finally:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "UPDATE public_corpus.legal_texts "
                        "SET preamble_fr = NULL WHERE slug = :s"
                    ),
                    {"s": SEED_SLUG},
                )


# ---------------------------------------------------------------------------
# /api/v1/legal-texts/quick-access
# ---------------------------------------------------------------------------


class TestQuickAccess:
    def test_returns_list(self):
        r = client.get("/api/v1/legal-texts/quick-access")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------------------------------------------------------------------
# /api/v1/decisions/
# ---------------------------------------------------------------------------


class TestListDecisions:
    def test_returns_paginated_envelope(self):
        r = client.get("/api/v1/decisions")
        assert r.status_code == 200
        body = r.json()
        assert {"items", "total", "page", "size"} <= body.keys()

    def test_filter_by_court(self):
        r = client.get("/api/v1/decisions?court=cassation")
        assert r.status_code == 200
        for item in r.json()["items"]:
            assert item["court"] == "cassation"

    def test_finds_seed_decision(self):
        r = client.get("/api/v1/decisions?court=cassation")
        slugs = [d["slug"] for d in r.json()["items"]]
        assert SEED_DECISION_SLUG in slugs

    def test_q_param_finds_decision(self):
        r = client.get("/api/v1/decisions?q=paternit")
        slugs = [d["slug"] for d in r.json()["items"]]
        assert SEED_DECISION_SLUG in slugs

    def test_date_range_filter(self):
        # Decision is dated 2020-01-15 — narrow window catches it.
        r = client.get("/api/v1/decisions?from=2020-01-01&to=2020-12-31")
        slugs = [d["slug"] for d in r.json()["items"]]
        assert SEED_DECISION_SLUG in slugs

        r2 = client.get("/api/v1/decisions?from=2025-01-01&to=2025-12-31")
        assert SEED_DECISION_SLUG not in [
            d["slug"] for d in r2.json()["items"]
        ]


class TestGetDecision:
    def test_returns_full_decision(self):
        r = client.get(f"/api/v1/decisions/{SEED_DECISION_SLUG}")
        assert r.status_code == 200
        body = r.json()
        assert body["slug"] == SEED_DECISION_SLUG
        assert body["court"] == "cassation"
        assert body["chamber"] == "civile"
        assert body["decision_date"] == "2020-01-15"
        assert body["full_text_fr"]
        assert body["outcome"] == "rejet"

    def test_404_on_missing(self):
        r = client.get("/api/v1/decisions/no-such-decision")
        assert r.status_code == 404

    def test_draft_decision_is_hidden(self):
        with _temp_editorial_status("decisions", SEED_DECISION_SLUG, "draft"):
            r = client.get(f"/api/v1/decisions/{SEED_DECISION_SLUG}")
            assert r.status_code == 404, (
                "draft decisions must not be reachable via the public slug endpoint"
            )


# ---------------------------------------------------------------------------
# /api/v1/citations/
# ---------------------------------------------------------------------------


class TestCitations:
    def test_returns_paginated_envelope(self):
        r = client.get("/api/v1/citations")
        assert r.status_code == 200
        body = r.json()
        assert {"items", "total", "page", "size"} <= body.keys()

    def test_outgoing_from_decision(self):
        d = client.get(f"/api/v1/decisions/{SEED_DECISION_SLUG}").json()
        r = client.get(
            "/api/v1/citations",
            params={"source_type": "decision", "source_id": d["id"]},
        )
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 2  # seed creates 2 citations from this decision
        for c in items:
            assert c["source_node_type"] == "decision"
            assert c["source_node_id"] == d["id"]

    def test_filter_by_relation(self):
        d = client.get(f"/api/v1/decisions/{SEED_DECISION_SLUG}").json()
        r = client.get(
            "/api/v1/citations",
            params={
                "source_type": "decision",
                "source_id": d["id"],
                "relation": "applies",
            },
        )
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["relation"] == "applies"

    def test_incoming_to_article(self):
        text = client.get(
            f"/api/v1/legal-texts/{SEED_SLUG}?include=all"
        ).json()
        article_2 = next(a for a in text["articles"] if a["number"] == "2")

        r = client.get(
            "/api/v1/citations",
            params={"target_type": "article", "target_id": article_2["id"]},
        )
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["target_node_id"] == article_2["id"]
        assert items[0]["relation"] == "applies"

    def test_invalid_node_type_rejected(self):
        r = client.get("/api/v1/citations?source_type=bogus")
        assert r.status_code == 422
