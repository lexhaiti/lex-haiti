"""Create or promote a user to admin role.

Usage:
    python -m scripts.create_admin --email founders@lexhaiti.ht
    python -m scripts.create_admin --email someone@example.com --role reviewer

Idempotent: if the email already exists, the role is updated. The user signs
in via the magic-link flow at http://localhost:3000/sign-in — Auth.js will
create the proper sessions/accounts rows on their first sign-in.
"""
from __future__ import annotations

import argparse
import sys

from sqlalchemy import select

from api.db import SessionLocal
from services.auth.enums import UserRole
from services.auth.models import User


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument(
        "--role",
        default=UserRole.admin.value,
        choices=[r.value for r in UserRole],
    )
    parser.add_argument("--name", default=None)
    args = parser.parse_args()

    role = UserRole(args.role)

    with SessionLocal() as session:
        existing = session.execute(
            select(User).where(User.email == args.email)
        ).scalar_one_or_none()

        if existing:
            previous = existing.role.value if hasattr(existing.role, "value") else existing.role
            existing.role = role
            if args.name:
                existing.name = args.name
            session.commit()
            print(
                f"Updated {args.email} (id={existing.id}): "
                f"{previous} -> {role.value}"
            )
        else:
            user = User(email=args.email, name=args.name, role=role)
            session.add(user)
            session.commit()
            print(f"Created {args.email} (id={user.id}, role={role.value})")

    print()
    print("Sign-in flow:")
    print(f"  1. Open http://localhost:3000/sign-in")
    print(f"  2. Enter:   {args.email}")
    print(f"  3. Open the inbox at http://localhost:8025 (Mailpit)")
    print(f"  4. Click the magic-link in the email")
    print()
    print(
        "No password — Auth.js sends a one-time link to that email each sign-in. "
        "The Mailpit container catches the email; nothing leaves your machine."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
