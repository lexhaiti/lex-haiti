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

    # CORS
    allowed_origins: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # Public site URL — used to build canonical permalinks embedded in
    # exported PDF/DOCX (so a printed copy points back to the live page).
    public_site_url: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    return Settings()
