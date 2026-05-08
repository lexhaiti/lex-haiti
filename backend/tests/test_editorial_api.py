"""Integration tests for the editorial API endpoints.

These exercise the two new endpoints added by the import pipeline:
  POST /api/v1/editorial/parse-document
  POST /api/v1/editorial/legal-texts

Unlike the public contract tests in test_api_contract.py, these override
the auth dependency so we can call editorial endpoints without a real session.
The parse-document endpoint is stateless (no DB writes); the legal-texts
endpoint writes a draft row and is cleaned up after the test.

Usage:
    make up                           # start Postgres+pgvector
    make migrate                      # apply schema
    pytest tests/test_editorial_api.py -v
"""
from __future__ import annotations

import io
import contextlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from api.db import engine, get_db
from api.deps import get_current_user
from api.main import app
from services.auth.enums import UserRole


# ---------------------------------------------------------------------------
# Fake editor user — injected via dependency override
# ---------------------------------------------------------------------------

# We need a real user row because editorial_actions has a FK to auth.users.
# The fixture below ensures a test user exists and cleans it up at module end.

_TEST_USER_EMAIL = "test-editorial-api@lexhaiti.test"
_test_user_id: int | None = None


def _ensure_test_user() -> int:
    """Create (or find) a test user in auth.users, return its id."""
    global _test_user_id  # noqa: PLW0603
    if _test_user_id is not None:
        return _test_user_id
    with engine.begin() as conn:
        existing = conn.execute(
            text("SELECT id FROM auth.users WHERE email = :e"),
            {"e": _TEST_USER_EMAIL},
        ).scalar()
        if existing:
            _test_user_id = existing
        else:
            _test_user_id = conn.execute(
                text(
                    "INSERT INTO auth.users (name, email, role) "
                    "VALUES (:n, :e, 'editor') RETURNING id"
                ),
                {"n": "Test Editor", "e": _TEST_USER_EMAIL},
            ).scalar_one()
    return _test_user_id


def _delete_test_user():
    with engine.begin() as conn:
        conn.execute(
            text("DELETE FROM auth.users WHERE email = :e"),
            {"e": _TEST_USER_EMAIL},
        )


class _FakeUser:
    """Minimal stand-in for services.auth.models.User."""

    def __init__(self, *, user_id: int, role: UserRole = UserRole.editor):
        self.id = user_id
        self.name = "Test Editor"
        self.email = _TEST_USER_EMAIL
        self.role = role


def _override_editor():
    uid = _ensure_test_user()
    return _FakeUser(user_id=uid, role=UserRole.editor)


def _override_none():
    return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _db_ok() -> bool:
    """Check that the database is reachable and the public_corpus schema exists."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1 FROM public_corpus.legal_texts LIMIT 0"))
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _db_ok(),
    reason="database not reachable — run `make up && make migrate`",
)


def teardown_module():
    """Remove the test user after the module finishes."""
    _delete_test_user()


@contextlib.contextmanager
def _cleanup_slug(slug: str):
    """Delete the legal text (and cascaded children) after the test."""
    try:
        yield
    finally:
        with engine.begin() as conn:
            # editorial_actions, article_versions, articles, headings, signers
            # all cascade from legal_texts via FK ON DELETE CASCADE (or we
            # delete manually in the right order).
            lt_id = conn.execute(
                text(
                    "SELECT id FROM public_corpus.legal_texts WHERE slug = :s"
                ),
                {"s": slug},
            ).scalar()
            if lt_id is not None:
                # Delete in dependency order
                conn.execute(
                    text(
                        "DELETE FROM public_corpus.editorial_actions "
                        "WHERE target_type = 'legal_text' AND target_id = :id"
                    ),
                    {"id": lt_id},
                )
                conn.execute(
                    text(
                        "DELETE FROM public_corpus.article_versions "
                        "WHERE article_id IN ("
                        "  SELECT id FROM public_corpus.articles "
                        "  WHERE legal_text_id = :id"
                        ")"
                    ),
                    {"id": lt_id},
                )
                conn.execute(
                    text(
                        "DELETE FROM public_corpus.articles "
                        "WHERE legal_text_id = :id"
                    ),
                    {"id": lt_id},
                )
                conn.execute(
                    text(
                        "DELETE FROM public_corpus.legal_headings "
                        "WHERE legal_text_id = :id"
                    ),
                    {"id": lt_id},
                )
                conn.execute(
                    text(
                        "DELETE FROM public_corpus.legal_signers "
                        "WHERE legal_text_id = :id"
                    ),
                    {"id": lt_id},
                )
                conn.execute(
                    text(
                        "DELETE FROM public_corpus.legal_texts WHERE id = :id"
                    ),
                    {"id": lt_id},
                )


# ---------------------------------------------------------------------------
# POST /api/v1/editorial/parse-document
# ---------------------------------------------------------------------------


class TestParseDocument:
    """Stateless parsing endpoint — no DB writes, just text analysis."""

    def setup_method(self):
        app.dependency_overrides[get_current_user] = _override_editor

    def teardown_method(self):
        app.dependency_overrides.pop(get_current_user, None)

    def test_parses_text_with_headings_and_articles(self):
        content = (
            "Le Président de la République,\n"
            "Vu la Constitution ;\n"
            "ARRÊTE :\n\n"
            "TITRE I — Des dispositions générales\n\n"
            "Article 1er. — La présente loi régit les marchés publics.\n\n"
            "Article 2. — Les marchés respectent la transparence.\n"
        )
        client = TestClient(app)
        resp = client.post(
            "/api/v1/editorial/parse-document",
            files={"file": ("test.txt", io.BytesIO(content.encode()), "text/plain")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["headings"]) == 1
        assert body["headings"][0]["level"] == "title"
        assert len(body["articles"]) == 2
        assert body["articles"][0]["number"] == "1"
        assert body["parser_confidence"] >= 0.5
        assert "Président" in body["preamble"]

    def test_parses_plain_articles_without_headings(self):
        content = (
            "Article 1er. — Premier article.\n\n"
            "Article 2. — Deuxième article.\n"
        )
        client = TestClient(app)
        resp = client.post(
            "/api/v1/editorial/parse-document",
            files={"file": ("loi.txt", io.BytesIO(content.encode()), "text/plain")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["headings"]) == 0
        assert len(body["articles"]) == 2

    def test_returns_warnings_for_empty_document(self):
        client = TestClient(app)
        resp = client.post(
            "/api/v1/editorial/parse-document",
            files={"file": ("empty.txt", io.BytesIO(b""), "text/plain")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["parser_confidence"] == 0.0
        assert len(body["warnings"]) >= 1

    def test_rejects_unauthenticated(self):
        app.dependency_overrides[get_current_user] = _override_none
        client = TestClient(app)
        resp = client.post(
            "/api/v1/editorial/parse-document",
            files={"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/v1/editorial/legal-texts
# ---------------------------------------------------------------------------


class TestCreateLegalText:
    """Creates a draft legal text — writes to DB, cleaned up after each test."""

    TEST_SLUG = "test-editorial-api-import"

    def setup_method(self):
        app.dependency_overrides[get_current_user] = _override_editor

    def teardown_method(self):
        app.dependency_overrides.pop(get_current_user, None)

    def test_creates_draft_with_headings_and_articles(self):
        payload = {
            "slug": self.TEST_SLUG,
            "category": "loi",
            "title_fr": "Loi test import API",
            "status": "in_force",
            "headings": [
                {
                    "key": "ch-1",
                    "parent_key": None,
                    "level": "chapter",
                    "number": "I",
                    "title_fr": "Des dispositions générales",
                    "position": 0,
                },
            ],
            "articles": [
                {
                    "number": "1",
                    "slug": "art-1",
                    "heading_key": "ch-1",
                    "position": 0,
                    "version": {
                        "text_fr": "Premier article de test.",
                    },
                },
                {
                    "number": "2",
                    "slug": "art-2",
                    "heading_key": "ch-1",
                    "position": 1,
                    "version": {
                        "text_fr": "Deuxième article de test.",
                    },
                },
            ],
        }
        client = TestClient(app)
        with _cleanup_slug(self.TEST_SLUG):
            resp = client.post("/api/v1/editorial/legal-texts", json=payload)
            assert resp.status_code == 201, resp.text
            body = resp.json()
            assert body["slug"] == self.TEST_SLUG
            assert body["editorial_status"] == "draft"
            assert len(body["headings"]) == 1
            assert len(body["articles"]) == 2
            assert body["articles"][0]["number"] == "1"

    def test_creates_minimal_text(self):
        slug = f"{self.TEST_SLUG}-minimal"
        payload = {
            "slug": slug,
            "category": "arrete",
            "title_fr": "Arrêté minimal",
            "status": "in_force",
        }
        client = TestClient(app)
        with _cleanup_slug(slug):
            resp = client.post("/api/v1/editorial/legal-texts", json=payload)
            assert resp.status_code == 201
            body = resp.json()
            assert body["slug"] == slug
            assert body["editorial_status"] == "draft"
            assert body["headings"] == []
            assert body["articles"] == []

    def test_rejects_missing_title(self):
        payload = {
            "slug": "test-no-title",
            "category": "loi",
            "title_fr": "",
            "status": "in_force",
        }
        client = TestClient(app)
        resp = client.post("/api/v1/editorial/legal-texts", json=payload)
        # Empty title_fr should be rejected by the service
        assert resp.status_code in (400, 422)

    def test_rejects_unauthenticated(self):
        app.dependency_overrides[get_current_user] = _override_none
        client = TestClient(app)
        resp = client.post(
            "/api/v1/editorial/legal-texts",
            json={
                "slug": "no-auth",
                "category": "loi",
                "title_fr": "Should fail",
                "status": "in_force",
            },
        )
        assert resp.status_code == 401
