"""FastAPI app entrypoint.

Run from `backend/`: `uvicorn api.main:app --reload` (or `make dev`).
"""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware

from api.config import get_settings
from api.db import engine
from api.exceptions import register_exception_handlers
from api.rate_limit import RateLimitMiddleware
from api.routes import api_router

logger = logging.getLogger("lexhaiti.api")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


# ---------------------------------------------------------------------------
# Request logging middleware
# ---------------------------------------------------------------------------

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log method, path, status code, and duration for every request."""

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "%s %s → %d (%.0fms)",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response


# ---------------------------------------------------------------------------
# CSRF protection for cookie-authenticated mutation endpoints
# ---------------------------------------------------------------------------

_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


class CSRFMiddleware(BaseHTTPMiddleware):
    """Require an ``X-Requested-With`` header on state-changing requests.

    Browsers add custom headers only via XHR/fetch, never via ``<form>``
    or ``<img src=...>`` tags. The presence of a custom header forces a
    CORS preflight, which the CORSMiddleware already gates by origin.
    This closes the CSRF gap that cookie-based auth opens.

    Safe methods (GET, HEAD, OPTIONS) and unauthenticated requests pass
    through without the header.
    """

    async def dispatch(self, request: Request, call_next):
        if request.method not in _SAFE_METHODS:
            has_cookie = any(
                request.cookies.get(name)
                for name in (
                    "authjs.session-token",
                    "__Secure-authjs.session-token",
                    "next-auth.session-token",
                    "__Secure-next-auth.session-token",
                )
            )
            if has_cookie and not request.headers.get("x-requested-with"):
                from fastapi.responses import JSONResponse

                return JSONResponse(
                    status_code=403,
                    content={
                        "error": {
                            "code": 403,
                            "message": (
                                "Missing X-Requested-With header. "
                                "Mutation requests with cookie auth require this header."
                            ),
                        },
                        "detail": "CSRF check failed",
                    },
                )
        return await call_next(request)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="LexHaïti — public read API for the Haitian Legal Graph",
        lifespan=lifespan,
    )

    # Middleware is applied in reverse order: last added = outermost.
    # CORS → rate limit → CSRF → logging → app.
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(RateLimitMiddleware, requests_per_minute=120)

    app.add_middleware(
        CORSMiddleware,
        # ``cors_origins`` filters ``allowed_origins`` based on
        # ``app_env`` — production drops every ``http://`` entry so a
        # cleartext localhost can never preflight against the live API.
        allow_origins=settings.cors_origins,
        allow_credentials=True,  # required so Auth.js cookies travel to the API
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        # Explicit allowlist instead of "*" — wildcard combined with
        # allow_credentials echoes every request header back as allowed,
        # which weakens CSRF posture even though our request middleware
        # also checks X-Requested-With. The list below matches every
        # header the typed API client and Auth.js cookie flow send.
        allow_headers=[
            "Accept",
            "Authorization",
            "Content-Type",
            "X-Requested-With",
            "X-CSRF-Token",
        ],
    )

    # Domain exception → HTTP error mapping (Issues 4 + 10)
    register_exception_handlers(app)

    app.include_router(api_router, prefix=f"{settings.api_prefix}/v1")

    @app.get("/health", tags=["meta"])
    def health():
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return {"status": "healthy", "database": "connected"}
        except Exception:
            return {"status": "unhealthy", "database": "disconnected"}

    @app.get("/", tags=["meta"])
    def root():
        return {
            "name": settings.app_name,
            "version": settings.app_version,
            "docs": "/docs",
            "openapi": "/openapi.json",
        }

    return app


app = create_app()
