"""SQLAlchemy ORM models for the auth schema.

Shape mirrors what @auth/pg-adapter (next-auth v5) writes — including the
camelCase quoted column names. We add `role`, `created_at`, `last_login_at`
on the users table for our own use.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)

from services.auth.enums import UserRole

AUTH_SCHEMA = "auth"

auth_metadata = MetaData(schema=AUTH_SCHEMA)


class AuthBase(DeclarativeBase):
    metadata = auth_metadata


def _user_role_enum() -> SAEnum:
    return SAEnum(
        UserRole,
        name="user_role",
        schema=AUTH_SCHEMA,
        values_callable=lambda x: [e.value for e in x],
        create_type=False,  # created in the migration
    )


class User(AuthBase):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[Optional[str]] = mapped_column(String(255))
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    # Auth.js writes camelCase quoted; we map to snake_case in Python.
    email_verified: Mapped[Optional[datetime]] = mapped_column(
        "emailVerified", DateTime(timezone=True)
    )
    image: Mapped[Optional[str]] = mapped_column(Text)
    role: Mapped[UserRole] = mapped_column(
        _user_role_enum(), nullable=False, default=UserRole.editor
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    sessions: Mapped[list["Session"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Account(AuthBase):
    __tablename__ = "accounts"
    __table_args__ = (
        UniqueConstraint("provider", "providerAccountId", name="ux_accounts_provider"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        "userId",
        ForeignKey(f"{AUTH_SCHEMA}.users.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(255), nullable=False)
    provider_account_id: Mapped[str] = mapped_column(
        "providerAccountId", String(255), nullable=False
    )
    refresh_token: Mapped[Optional[str]] = mapped_column(Text)
    access_token: Mapped[Optional[str]] = mapped_column(Text)
    expires_at: Mapped[Optional[int]] = mapped_column(BigInteger)
    id_token: Mapped[Optional[str]] = mapped_column(Text)
    scope: Mapped[Optional[str]] = mapped_column(Text)
    session_state: Mapped[Optional[str]] = mapped_column(Text)
    token_type: Mapped[Optional[str]] = mapped_column(Text)


class Session(AuthBase):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        "userId",
        ForeignKey(f"{AUTH_SCHEMA}.users.id", ondelete="CASCADE"),
        nullable=False,
    )
    expires: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    session_token: Mapped[str] = mapped_column(
        "sessionToken", String(255), nullable=False, unique=True
    )

    user: Mapped[User] = relationship(back_populates="sessions")


class VerificationToken(AuthBase):
    __tablename__ = "verification_token"

    identifier: Mapped[str] = mapped_column(Text, primary_key=True)
    token: Mapped[str] = mapped_column(Text, primary_key=True)
    expires: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


__all__ = [
    "AuthBase",
    "AUTH_SCHEMA",
    "User",
    "Account",
    "Session",
    "VerificationToken",
]
