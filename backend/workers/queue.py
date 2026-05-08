"""RQ queue connection + helpers shared by the API (enqueue) and the
worker process (execute)."""

from __future__ import annotations

from functools import lru_cache

from redis import Redis
from rq import Queue

from api.config import get_settings

# Single named queue for now — Moniteur ingestion is the only producer.
# Split into category-specific queues (`ingestion`, `enrichment`, …) once
# more job types land.
QUEUE_DEFAULT = "default"


@lru_cache(maxsize=1)
def get_redis() -> Redis:
    return Redis.from_url(get_settings().redis_url)


@lru_cache(maxsize=4)
def get_queue(name: str = QUEUE_DEFAULT) -> Queue:
    # `default_timeout` is generous so a 200-page scanned PDF (15-20 min
    # of OCR) doesn't get killed mid-parse. RQ defaults to 180s.
    return Queue(name, connection=get_redis(), default_timeout=60 * 60)
