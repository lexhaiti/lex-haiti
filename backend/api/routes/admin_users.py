"""Admin-only user management endpoints.

All routes here require ``UserRole.admin`` via the ``AdminUser``
dependency. Surfaces the four CRUD operations the editor dashboard
needs:

- ``GET    /admin/users``           list all editor accounts
- ``POST   /admin/users``           invite a new editor by email
- ``PATCH  /admin/users/{id}``      update role / name
- ``DELETE /admin/users/{id}``      remove the account (cascades to sessions)

Safety: an admin cannot demote or delete themselves — the dashboard
must always have at least one admin to remain operable. The route
returns 409 if the request would leave the system without an admin.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from api.deps import AdminUser, DbSession
from schemas.admin_user import (
    AdminUserCreate,
    AdminUserRead,
    AdminUserUpdate,
)
from services.auth.enums import UserRole
from services.auth.models import Session as AuthSession, User

router = APIRouter(prefix="/admin/users", tags=["admin"])


def _admin_count(db, exclude_user_id: int | None = None) -> int:
    stmt = select(func.count()).select_from(User).where(User.role == UserRole.admin)
    if exclude_user_id is not None:
        stmt = stmt.where(User.id != exclude_user_id)
    return db.execute(stmt).scalar_one()


def _session_counts(db, user_ids: list[int]) -> dict[int, int]:
    if not user_ids:
        return {}
    rows = db.execute(
        select(AuthSession.user_id, func.count())
        .where(AuthSession.user_id.in_(user_ids))
        .group_by(AuthSession.user_id)
    ).all()
    return {uid: int(n) for uid, n in rows}


def _to_read(user: User, session_count: int) -> AdminUserRead:
    return AdminUserRead(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role.value if hasattr(user.role, "value") else user.role,
        email_verified=user.email_verified,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        active_session_count=session_count,
    )


@router.get("", response_model=List[AdminUserRead])
def list_users(db: DbSession, _: AdminUser):
    users = db.execute(select(User).order_by(User.created_at.desc())).scalars().all()
    counts = _session_counts(db, [u.id for u in users])
    return [_to_read(u, counts.get(u.id, 0)) for u in users]


@router.post("", response_model=AdminUserRead, status_code=201)
def create_user(payload: AdminUserCreate, db: DbSession, _: AdminUser):
    existing = db.execute(
        select(User).where(User.email == payload.email)
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"User with email {payload.email!r} already exists (id={existing.id}).",
        )
    user = User(
        email=payload.email,
        name=payload.name,
        role=UserRole(payload.role),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _to_read(user, 0)


@router.patch("/{user_id}", response_model=AdminUserRead)
def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    db: DbSession,
    actor: AdminUser,
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    # Demoting the last remaining admin would lock everyone out of
    # the editor surface; reject preemptively.
    if (
        payload.role is not None
        and payload.role != "admin"
        and user.role == UserRole.admin
    ):
        if _admin_count(db, exclude_user_id=user.id) == 0:
            raise HTTPException(
                status_code=409,
                detail="Cannot demote the last admin — promote another user first.",
            )
        # Self-demotion is also blocked: keep the actor from kicking
        # themselves out of the dashboard mid-session.
        if user.id == actor.id:
            raise HTTPException(
                status_code=409,
                detail="You cannot demote yourself — have another admin do it.",
            )
    if payload.role is not None:
        user.role = UserRole(payload.role)
    if payload.name is not None:
        user.name = payload.name or None
    db.commit()
    db.refresh(user)
    counts = _session_counts(db, [user.id])
    return _to_read(user, counts.get(user.id, 0))


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: DbSession, actor: AdminUser):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == actor.id:
        raise HTTPException(
            status_code=409,
            detail="You cannot delete your own account.",
        )
    if user.role == UserRole.admin and _admin_count(db, exclude_user_id=user.id) == 0:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete the last admin — promote another user first.",
        )
    db.delete(user)
    db.commit()
    return None
