"""Simple in-memory sliding-window rate limiter.

Sufficient for single-process dev/staging. Swap to Redis-backed counters
before multi-process production deployment (Phase 2+).
"""
from __future__ import annotations

import ipaddress
import os
import time
from collections import defaultdict
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


# Trusted reverse-proxy networks. Only requests whose immediate peer
# is in one of these networks are allowed to override the client IP
# via ``X-Forwarded-For``. Default covers private LAN ranges, the
# loopback, and Azure Container Apps' internal gateway addresses.
# Override with ``RATE_LIMIT_TRUSTED_PROXIES`` (comma-separated CIDRs).
_DEFAULT_TRUSTED_PROXIES = (
    "127.0.0.0/8",
    "::1/128",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "fd00::/8",   # Unique-local IPv6
)


def _parse_trusted_proxies() -> list:
    raw = os.environ.get("RATE_LIMIT_TRUSTED_PROXIES")
    sources = (
        [s.strip() for s in raw.split(",") if s.strip()] if raw else _DEFAULT_TRUSTED_PROXIES
    )
    nets = []
    for cidr in sources:
        try:
            nets.append(ipaddress.ip_network(cidr, strict=False))
        except ValueError:
            continue
    return nets


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
        # If the bucket is empty after pruning, drop the key entirely
        # so an attacker spraying unique IPs can't permanently balloon
        # the dict — each idle IP frees its slot within ``window``.
        if not timestamps:
            self._buckets.pop(key, None)
            timestamps = self._buckets[key]
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
        self._trusted_proxies = _parse_trusted_proxies()

    def _client_ip(self, request: Request) -> str:
        peer = request.client.host if request.client else None
        # Only honour X-Forwarded-For when the immediate peer is one
        # of the trusted reverse proxies. Otherwise any client could
        # spoof the header to dodge the limit (or pin another IP into
        # 429-exhaustion). Falls back to the direct peer otherwise.
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded and peer and self._is_trusted_proxy(peer):
            return forwarded.split(",")[0].strip()
        return peer or "unknown"

    def _is_trusted_proxy(self, peer: str) -> bool:
        try:
            peer_ip = ipaddress.ip_address(peer)
        except ValueError:
            return False
        return any(peer_ip in net for net in self._trusted_proxies)

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
