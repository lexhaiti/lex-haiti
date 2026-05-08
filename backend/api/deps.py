"""Common FastAPI dependencies."""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session
from starlette.status import HTTP_401_UNAUTHORIZED, HTTP_403_FORBIDDEN

from api.db import get_db
from services.auth.enums import UserRole
from services.auth.models import User
from services.auth.repository import AuthRepository
from services.corpus.service import CorpusService
from services.search.service import SearchService

DbSession = Annotated[Session, Depends(get_db)]


def get_corpus_service(db: DbSession) -> CorpusService:
    return CorpusService(db)


def get_search_service(db: DbSession) -> SearchService:
    return SearchService(db)


CorpusServiceDep = Annotated[CorpusService, Depends(get_corpus_service)]
SearchServiceDep = Annotated[SearchService, Depends(get_search_service)]


# ---------------------------------------------------------------------------
# Auth — read the Auth.js cookie, look up the session, identify the user
# ---------------------------------------------------------------------------

# Auth.js v5 cookie names. The Secure-prefixed forms are used in production
# (HTTPS); the bare names are used in dev (HTTP localhost).
_AUTHJS_COOKIE_NAMES = (
    "authjs.session-token",
    "__Secure-authjs.session-token",
    # legacy v4 names — kept for forward-compat with older clients
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
)


def _read_session_token(request: Request) -> Optional[str]:
    for name in _AUTHJS_COOKIE_NAMES:
        token = request.cookies.get(name)
        if token:
            return token
    # Bearer fallback for non-browser clients (curl, scripts, tests).
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header.removeprefix("Bearer ").strip() or None
    return None


def get_current_user(db: DbSession, request: Request) -> Optional[User]:
    """Resolve the calling user from the Auth.js session cookie, or None.

    Public routes can use this to behave differently for signed-in editors
    (e.g. show extra UI hints) without requiring auth.
    """
    token = _read_session_token(request)
    if not token:
        return None
    return AuthRepository(db).get_user_for_session_token(token)


CurrentUser = Annotated[Optional[User], Depends(get_current_user)]


def require_role(*roles: UserRole):
    """Dependency factory: enforces that current_user has one of the given roles."""

    allowed = {r.value for r in roles}

    def _checker(user: CurrentUser) -> User:
        if user is None:
            raise HTTPException(
                status_code=HTTP_401_UNAUTHORIZED,
                detail="sign-in required",
                headers={"WWW-Authenticate": "Cookie"},
            )
        role_value = user.role.value if hasattr(user.role, "value") else user.role
        if role_value not in allowed:
            raise HTTPException(
                status_code=HTTP_403_FORBIDDEN,
                detail=f"requires role: {' | '.join(sorted(allowed))}",
            )
        return user

    return _checker


EditorialUser = Annotated[
    User,
    Depends(require_role(UserRole.admin, UserRole.reviewer, UserRole.editor)),
]
AdminUser = Annotated[User, Depends(require_role(UserRole.admin))]
