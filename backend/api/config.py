"""Application settings, loaded from environment / .env via pydantic-settings."""
from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "LexHaiti API"
    app_version: str = "0.1.0"
    api_prefix: str = "/api"

    # ``development`` (default — keeps localhost in the CORS allowlist)
    # or ``production`` (drops every non-https origin from the allowlist
    # so a tight CORS policy is the default in prod). Set
    # ``APP_ENV=production`` on the Container App env vars.
    app_env: str = "development"

    # Database
    database_url: str = (
        "postgresql+psycopg2://lexhaiti:lexhaiti@localhost:5432/lexhaiti"
    )

    # Redis (job queue, future caching)
    redis_url: str = "redis://localhost:6379/0"

    # Object storage (S3-compatible: MinIO in dev, B2 in prod)
    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key_id: str = "minioadmin"
    s3_secret_access_key: str = "minioadmin"
    s3_bucket: str = "lexhaiti-dev"
    s3_region: str = "us-east-1"

    # CORS — full list of origins the API is willing to talk to. The
    # default carries both localhost (for dev) and the prod Vercel
    # surfaces; ``cors_origins`` below filters this down at runtime
    # based on ``app_env``, so production never echoes ``http://``
    # back even if a stray localhost entry slipped in. Override via
    # ``ALLOWED_ORIGINS`` env var (JSON list) when adding a Vercel
    # preview branch or a partner subdomain.
    allowed_origins: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://lexhaiti.org",
        "https://www.lexhaiti.org",
        "https://lex-haiti.vercel.app",
    ]

    # Public site URL — used to build canonical permalinks embedded in
    # exported PDF/DOCX (so a printed copy points back to the live page).
    public_site_url: str = "http://localhost:3000"

    @property
    def cors_origins(self) -> List[str]:
        """Effective CORS allowlist, post-environment filtering.

        Production strips out every ``http://`` origin (the cleartext
        localhost entries) so a misconfigured env var can't accidentally
        let a non-TLS frontend talk to the prod API. Dev gets the full
        list so editors running `make web-dev` against `make dev`
        keep working without ceremony.
        """
        if self.app_env.lower() in ("production", "prod"):
            return [o for o in self.allowed_origins if o.startswith("https://")]
        return list(self.allowed_origins)


@lru_cache
def get_settings() -> Settings:
    return Settings()
