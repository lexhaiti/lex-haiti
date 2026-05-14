"""Schemas for the admin user-management surface.

Powers ``/api/v1/admin/users`` — admin-only endpoints that list,
invite, update roles for, and remove editor accounts. Stays out of
the ``auth`` schema's Auth.js-managed shape (users / accounts /
sessions) by carrying only the editor-facing fields.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


UserRoleLiteral = Literal["admin", "reviewer", "editor"]


class AdminUserRead(BaseModel):
    """One row of the editor account list."""

    id: int
    email: Optional[str] = None
    name: Optional[str] = None
    role: UserRoleLiteral
    email_verified: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    created_at: datetime
    # Total Auth.js sessions currently linked to this user. Useful as
    # a coarse "online recently" signal in the dashboard.
    active_session_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class AdminUserCreate(BaseModel):
    """Invite a new editor — they show up in ``auth.users`` immediately
    but only become signable on their first magic-link redemption."""

    email: str
    role: UserRoleLiteral = "editor"
    name: Optional[str] = Field(default=None, max_length=255)

    model_config = ConfigDict(extra="forbid")

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str) -> str:
        """Lightweight email-shape check — keeps us off the
        ``pydantic[email]`` extra (which pulls in ``email-validator``)
        for one field. The Auth.js magic-link send will fail loudly on
        actually unreachable addresses, so we don't need DNS-level
        validation here."""
        v = (v or "").strip().lower()
        if "@" not in v or "." not in v.split("@", 1)[1]:
            raise ValueError("invalid email")
        return v


class AdminUserUpdate(BaseModel):
    """Edit role and/or name on an existing user. Email is immutable —
    Auth.js uses it as the natural key and changing it would orphan
    every existing session row."""

    role: Optional[UserRoleLiteral] = None
    name: Optional[str] = Field(default=None, max_length=255)

    model_config = ConfigDict(extra="forbid")
