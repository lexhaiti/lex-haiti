"""Domain exception → HTTP error mapping.

Register with ``register_exception_handlers(app)`` in the FastAPI factory.
Routes no longer need try/except for domain exceptions — they call services,
and any domain exception surfaces as the correct HTTP status with a
consistent JSON body::

    {"error": {"code": 404, "message": "LegalText not found: constitution-1987"}}

The ``detail`` key is kept for backward compat with FastAPI's default shape.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.status import (
    HTTP_400_BAD_REQUEST,
    HTTP_404_NOT_FOUND,
    HTTP_409_CONFLICT,
    HTTP_422_UNPROCESSABLE_CONTENT,
    HTTP_500_INTERNAL_SERVER_ERROR,
)

from services.corpus.exceptions import (
    AlreadyExists,
    CorpusError,
    InvalidInput,
    NotFound,
)

logger = logging.getLogger(__name__)


def _error_response(status_code: int, message: str) -> JSONResponse:
    """Build a consistent error JSON response."""
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {"code": status_code, "message": message},
            # backward compat with FastAPI's default HTTPException shape
            "detail": message,
        },
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Map domain and HTTP exceptions to structured JSON responses."""

    # --- Domain exceptions (most specific first) --------------------------

    @app.exception_handler(NotFound)
    async def not_found_handler(request: Request, exc: NotFound) -> JSONResponse:
        return _error_response(HTTP_404_NOT_FOUND, str(exc))

    @app.exception_handler(InvalidInput)
    async def invalid_input_handler(
        request: Request, exc: InvalidInput
    ) -> JSONResponse:
        return _error_response(HTTP_400_BAD_REQUEST, str(exc))

    @app.exception_handler(AlreadyExists)
    async def already_exists_handler(
        request: Request, exc: AlreadyExists
    ) -> JSONResponse:
        return _error_response(HTTP_409_CONFLICT, str(exc))

    @app.exception_handler(CorpusError)
    async def corpus_error_handler(
        request: Request, exc: CorpusError
    ) -> JSONResponse:
        return _error_response(HTTP_400_BAD_REQUEST, str(exc))

    # --- Standard HTTP and validation errors (unified format) -------------

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return _error_response(exc.status_code, detail)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=HTTP_422_UNPROCESSABLE_CONTENT,
            content={
                "error": {
                    "code": HTTP_422_UNPROCESSABLE_CONTENT,
                    "message": "Validation error",
                    "details": exc.errors(),
                },
                "detail": exc.errors(),
            },
        )

    # --- Unexpected errors ------------------------------------------------

    @app.exception_handler(Exception)
    async def unhandled_error_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
        return _error_response(
            HTTP_500_INTERNAL_SERVER_ERROR,
            "Internal server error",
        )
