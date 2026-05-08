"""Simple in-memory sliding-window rate limiter.

Sufficient for single-process dev/staging. Swap to Redis-backed counters
before multi-process production deployment (Phase 2+).
"""
from __future__ import annotations

import time
from collections import defaultdict
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class _SlidingWindow:
    """Track request timestamps per key within a sliding window."""

    def __init__(self, window_seconds: int, max_requests: int) -> None:
        self.window = window_seconds
        self.limit = max_requests
        self._buckets: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str) -> tuple[bool, int]:
        """Return (allowed, remaining) for the given key."""
        now = time.monotonic()
        cutoff = now - self.window
        timestamps = self._buckets[key]
        # Prune expired entries
        timestamps[:] = [t for t in timestamps if t > cutoff]
        remaining = max(0, self.limit - len(timestamps))
        if len(timestamps) >= self.limit:
            return False, 0
        timestamps.append(now)
        return True, remaining - 1


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-IP rate limiter with configurable window and limit.

    Applies only to paths matching ``path_prefix`` (default: /api/).
    Returns 429 with Retry-After when exceeded.
    """

    def __init__(
        self,
        app,
        *,
        requests_per_minute: int = 60,
        path_prefix: str = "/api/",
    ) -> None:
        super().__init__(app)
        self._window = _SlidingWindow(
            window_seconds=60,
            max_requests=requests_per_minute,
        )
        self._prefix = path_prefix

    def _client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith(self._prefix):
            return await call_next(request)

        ip = self._client_ip(request)
        allowed, remaining = self._window.is_allowed(ip)

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "error": {
                        "code": 429,
                        "message": "Too many requests. Please slow down.",
                    },
                    "detail": "Rate limit exceeded",
                },
                headers={"Retry-After": "60"},
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response
