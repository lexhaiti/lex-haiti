"""Tests for the JSON-import path on the Moniteur ingestion pipeline.

Two flavours of entry are supported:

  - **Pending** (no ``content`` block) — entry lands at ``pending``
    review status, the editor promotes it through the normal review
    flow.
  - **Auto-promoted** (with a ``content`` block carrying a full
    ``JsonImportLegalText``) — entry is created AND a draft
    ``LegalText`` is created in the same transaction, with the
    entry's ``promoted_legal_text_id`` set.

The tests below pin both behaviours plus the optional page-range
fields (``page_from`` / ``page_to`` now allowed to be omitted).
"""
from __future__ import annotations

import contextlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from api.db import engine
from api.deps import get_current_user
from api.main import app
from services.auth.enums import UserRole


# ---------------------------------------------------------------------------
# Test user + DB-availability gate (mirror the pattern in test_editorial_api)
# ---------------------------------------------------------------------------


_TEST_USER_EMAIL = "test-moniteur-json-import@lexhaiti.test"
_test_user_id: int | None = None


def _ensure_test_user() -> int:
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
                {"n": "Test Editor JSON", "e": _TEST_USER_EMAIL},
            ).scalar_one()
    return _test_user_id


def _delete_test_user():
    with engine.begin() as conn:
        conn.execute(
            text("DELETE FROM auth.users WHERE email = :e"),
            {"e": _TEST_USER_EMAIL},
        )


class _FakeUser:
    def __init__(self, *, user_id: int, role: UserRole = UserRole.editor):
        self.id = user_id
        self.name = "Test Editor"
        self.email = _TEST_USER_EMAIL
        self.role = role


def _override_editor():
    uid = _ensure_test_user()
    return _FakeUser(user_id=uid, role=UserRole.editor)


def _db_ok() -> bool:
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
    _delete_test_user()


# ---------------------------------------------------------------------------
# Cleanup helpers
# ---------------------------------------------------------------------------


@contextlib.contextmanager
def _cleanup_issue(year: int, number: str):
    """Delete the Moniteur issue + its entries + any auto-promoted
    LegalTexts after the test."""
    try:
        yield
    finally:
        with engine.begin() as conn:
            issue_id = conn.execute(
                text(
                    "SELECT id FROM public_corpus.moniteur_issues "
                    "WHERE year = :y AND number = :n"
                ),
                {"y": year, "n": number},
            ).scalar()
            if issue_id is None:
                return
            promoted_ids = conn.execute(
                text(
                    "SELECT promoted_legal_text_id "
                    "FROM public_corpus.moniteur_entries "
                    "WHERE issue_id = :id "
                    "  AND promoted_legal_text_id IS NOT NULL"
                ),
                {"id": issue_id},
            ).scalars().all()
            for lt_id in promoted_ids:
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
                        "DELETE FROM public_corpus.legal_text_theme_tags "
                        "WHERE legal_text_id = :id"
                    ),
                    {"id": lt_id},
                )
                conn.execute(
                    text(
                        "DELETE FROM public_corpus.legal_texts "
                        "WHERE id = :id"
                    ),
                    {"id": lt_id},
                )
            conn.execute(
                text(
                    "DELETE FROM public_corpus.moniteur_entries "
                    "WHERE issue_id = :id"
                ),
                {"id": issue_id},
            )
            conn.execute(
                text(
                    "DELETE FROM public_corpus.moniteur_issues WHERE id = :id"
                ),
                {"id": issue_id},
            )


def _entry_state(issue_id: int) -> list[dict]:
    """Return per-entry (position, review_status, promoted) snapshot."""
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT position, review_status, promoted_legal_text_id "
                "FROM public_corpus.moniteur_entries "
                "WHERE issue_id = :id ORDER BY position"
            ),
            {"id": issue_id},
        ).mappings().all()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Schema-only tests (no DB)
# ---------------------------------------------------------------------------


class TestJsonImportEntrySchema:
    """Pure schema tests — no DB, no app. Validate the new optional
    fields and the inline content block."""

    def test_page_fields_are_optional(self):
        from schemas.moniteur import JsonImportEntry

        entry = JsonImportEntry.model_validate(
            {
                "detected_category": "loi",
                "raw_text": "Article 1. ...",
            }
        )
        assert entry.page_from is None
        assert entry.page_to is None
        assert entry.content is None

    def test_content_block_accepts_full_legal_text(self):
        from schemas.moniteur import JsonImportEntry

        entry = JsonImportEntry.model_validate(
            {
                "detected_category": "loi",
                "content": {
                    "slug": "test-loi",
                    "category": "loi",
                    "title_fr": "Loi test",
                    "articles": [
                        {
                            "number": "1",
                            "slug": "art-1",
                            "position": 0,
                            "version": {"text_fr": "Premier."},
                        }
                    ],
                },
            }
        )
        assert entry.content is not None
        assert entry.content.title_fr == "Loi test"
        assert entry.content.articles is not None
        assert len(entry.content.articles) == 1

    def test_unknown_fields_rejected_on_entry(self):
        from pydantic import ValidationError

        from schemas.moniteur import JsonImportEntry

        with pytest.raises(ValidationError):
            JsonImportEntry.model_validate(
                {
                    "detected_category": "loi",
                    "unknown_field": "boom",
                }
            )

    def test_unknown_fields_rejected_on_content(self):
        from pydantic import ValidationError

        from schemas.moniteur import JsonImportLegalText

        with pytest.raises(ValidationError):
            JsonImportLegalText.model_validate(
                {
                    "slug": "x",
                    "category": "loi",
                    "title_fr": "X",
                    "made_up": "nope",
                }
            )


# ---------------------------------------------------------------------------
# Integration tests
# ---------------------------------------------------------------------------


class TestImportJsonRoute:
    """End-to-end exercise of POST /api/v1/editorial/moniteur/issues/import-json.

    Two scenarios:
      - Entry without ``content`` block → review_status='pending',
        promoted_legal_text_id IS NULL.
      - Entry with ``content`` block → review_status='accepted',
        promoted_legal_text_id points at a fresh draft LegalText.
    """

    URL = "/api/v1/editorial/moniteur/issues/import-json"

    def setup_method(self):
        app.dependency_overrides[get_current_user] = _override_editor

    def teardown_method(self):
        app.dependency_overrides.pop(get_current_user, None)

    def test_pending_entry_without_content(self):
        payload = {
            "schema_version": 1,
            "issue": {
                "number": "test-json-pending",
                "year": 2099,
                "publication_date": "2099-01-15",
            },
            "entries": [
                {
                    "detected_category": "loi",
                    "detected_title": "Pending — no content",
                    "raw_text": "Article 1. ...",
                }
            ],
        }
        client = TestClient(app)
        with _cleanup_issue(2099, "test-json-pending"):
            resp = client.post(self.URL, json=payload)
            assert resp.status_code == 201, resp.text
            body = resp.json()
            issue_id = body["id"]

            state = _entry_state(issue_id)
            assert len(state) == 1
            assert state[0]["review_status"] == "pending"
            assert state[0]["promoted_legal_text_id"] is None

    def test_content_block_auto_promotes_entry(self):
        slug = "test-json-content-auto-promoted"
        payload = {
            "schema_version": 1,
            "issue": {
                "number": "test-json-content",
                "year": 2099,
                "publication_date": "2099-02-20",
            },
            "entries": [
                {
                    "detected_category": "loi",
                    "detected_title": "Auto-promoted",
                    "content": {
                        "slug": slug,
                        "category": "loi",
                        "title_fr": "Loi auto-promue",
                        "promulgation_date": "2099-02-20",
                        "publication_date": "2099-02-20",
                        "articles": [
                            {
                                "number": "1",
                                "slug": "art-1",
                                "position": 0,
                                "version": {
                                    "text_fr": "Premier article.",
                                },
                            }
                        ],
                    },
                }
            ],
        }
        client = TestClient(app)
        with _cleanup_issue(2099, "test-json-content"):
            resp = client.post(self.URL, json=payload)
            assert resp.status_code == 201, resp.text
            body = resp.json()
            issue_id = body["id"]

            state = _entry_state(issue_id)
            assert len(state) == 1
            assert state[0]["review_status"] == "accepted"
            promoted_id = state[0]["promoted_legal_text_id"]
            assert promoted_id is not None

            # The promoted LegalText should exist with the slug we
            # asked for, status=draft, hooked back into this issue.
            with engine.connect() as conn:
                row = conn.execute(
                    text(
                        "SELECT slug, editorial_status, moniteur_issue_id "
                        "FROM public_corpus.legal_texts WHERE id = :id"
                    ),
                    {"id": promoted_id},
                ).mappings().one()
                assert row["slug"] == slug
                assert row["editorial_status"] == "draft"
                assert row["moniteur_issue_id"] == issue_id

    def test_mixed_payload_keeps_pending_and_promotes_other(self):
        """One pending entry + one entry with content in the same
        payload — the two follow independent paths."""
        slug = "test-json-mixed-promoted"
        payload = {
            "schema_version": 1,
            "issue": {
                "number": "test-json-mixed",
                "year": 2099,
                "publication_date": "2099-03-25",
            },
            "entries": [
                {
                    "detected_category": "loi",
                    "detected_title": "Pending half",
                    "raw_text": "Article 1. ...",
                },
                {
                    "detected_category": "loi",
                    "detected_title": "Promoted half",
                    "content": {
                        "slug": slug,
                        "category": "loi",
                        "title_fr": "Promoted half",
                        "articles": [
                            {
                                "number": "1",
                                "slug": "art-1",
                                "position": 0,
                                "version": {"text_fr": "Texte."},
                            }
                        ],
                    },
                },
            ],
        }
        client = TestClient(app)
        with _cleanup_issue(2099, "test-json-mixed"):
            resp = client.post(self.URL, json=payload)
            assert resp.status_code == 201, resp.text
            issue_id = resp.json()["id"]

            state = _entry_state(issue_id)
            assert len(state) == 2
            # position 0 = pending entry
            assert state[0]["review_status"] == "pending"
            assert state[0]["promoted_legal_text_id"] is None
            # position 1 = auto-promoted entry
            assert state[1]["review_status"] == "accepted"
            assert state[1]["promoted_legal_text_id"] is not None
