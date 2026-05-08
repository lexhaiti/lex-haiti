"""Read-side access to Auth.js's tables.

The backend never *writes* to auth.users — that's Auth.js's job. We only
read sessions to identify the caller.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession, selectinload

from services.auth.models import Session, User


class AuthRepository:
    def __init__(self, session: DbSession) -> None:
        self.session = session

    def get_user_for_session_token(self, token: str) -> Optional[User]:
        """Look up a session by its opaque token; return the user if valid."""
        stmt = (
            select(Session)
            .where(Session.session_token == token)
            .options(selectinload(Session.user))
        )
        sess = self.session.execute(stmt).scalar_one_or_none()
        if not sess:
            return None
        if sess.expires < datetime.now(timezone.utc):
            return None
        return sess.user

    def get_user_by_email(self, email: str) -> Optional[User]:
        return self.session.execute(
            select(User).where(User.email == email)
        ).scalar_one_or_none()
