"""Smoke tests — verify the app starts and basic endpoints respond.

These don't require a running database — the health endpoint catches
DB exceptions and reports 'unhealthy', which is acceptable for a smoke test.
"""
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_root_returns_metadata():
    r = client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert body["docs"] == "/docs"
    assert "name" in body
    assert "version" in body


def test_health_endpoint_responds():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] in {"healthy", "unhealthy"}


def test_openapi_schema_is_served():
    r = client.get("/openapi.json")
    assert r.status_code == 200
    schema = r.json()
    paths = schema.get("paths", {})
    assert "/api/v1/legal-texts" in paths
    assert "/api/v1/articles/{article_id}" in paths
