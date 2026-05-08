"""auth schema — users, sessions, accounts (Auth.js compatible)

Revision ID: 0002_auth_schema
Revises: 0001_initial_schema
Create Date: 2026-05-01

The table shape matches what @auth/pg-adapter (next-auth v5) expects: lowercase
table names, camelCase quoted columns where Auth.js wants them. Living in a
separate `auth` schema so it doesn't pollute the corpus tables.

We add one bridge column to public_corpus.editorial_actions: actor_user_id,
optional FK → auth.users(id). Old free-form `actor` text stays for the seed
and any pre-auth scripts.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0002_auth_schema"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS auth")

    op.execute(
        "CREATE TYPE auth.user_role AS ENUM ('admin', 'reviewer', 'editor')"
    )

    # users — extends the standard Auth.js shape with role + timestamps.
    op.execute(
        """
        CREATE TABLE auth.users (
            id              SERIAL PRIMARY KEY,
            name            VARCHAR(255),
            email           VARCHAR(255) UNIQUE,
            "emailVerified" TIMESTAMPTZ,
            image           TEXT,
            role            auth.user_role NOT NULL DEFAULT 'editor',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_login_at   TIMESTAMPTZ
        )
        """
    )

    # accounts — OAuth provider links. Required by the adapter even if we
    # only use email magic-link today.
    op.execute(
        """
        CREATE TABLE auth.accounts (
            id                  SERIAL PRIMARY KEY,
            "userId"            INTEGER NOT NULL
                REFERENCES auth.users(id) ON DELETE CASCADE,
            type                VARCHAR(255) NOT NULL,
            provider            VARCHAR(255) NOT NULL,
            "providerAccountId" VARCHAR(255) NOT NULL,
            refresh_token       TEXT,
            access_token        TEXT,
            expires_at          BIGINT,
            id_token            TEXT,
            scope               TEXT,
            session_state       TEXT,
            token_type          TEXT
        )
        """
    )
    op.execute('CREATE INDEX ix_accounts_user ON auth.accounts("userId")')
    op.execute(
        'CREATE UNIQUE INDEX ux_accounts_provider '
        'ON auth.accounts(provider, "providerAccountId")'
    )

    # sessions — the source of truth for "is this cookie valid?".
    op.execute(
        """
        CREATE TABLE auth.sessions (
            id             SERIAL PRIMARY KEY,
            "userId"       INTEGER NOT NULL
                REFERENCES auth.users(id) ON DELETE CASCADE,
            expires        TIMESTAMPTZ NOT NULL,
            "sessionToken" VARCHAR(255) NOT NULL UNIQUE
        )
        """
    )
    op.execute('CREATE INDEX ix_sessions_user ON auth.sessions("userId")')
    op.execute('CREATE INDEX ix_sessions_expires ON auth.sessions(expires)')

    # verification_token — magic-link tokens (one row per email send).
    op.execute(
        """
        CREATE TABLE auth.verification_token (
            identifier TEXT NOT NULL,
            expires    TIMESTAMPTZ NOT NULL,
            token      TEXT NOT NULL,
            PRIMARY KEY (identifier, token)
        )
        """
    )

    # Bridge: editorial_actions can now reference an auth.users row.
    op.execute(
        """
        ALTER TABLE public_corpus.editorial_actions
        ADD COLUMN actor_user_id INTEGER
            REFERENCES auth.users(id) ON DELETE SET NULL
        """
    )
    op.execute(
        "CREATE INDEX ix_editorial_actions_actor_user "
        "ON public_corpus.editorial_actions(actor_user_id)"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE public_corpus.editorial_actions "
        "DROP COLUMN IF EXISTS actor_user_id"
    )
    op.execute("DROP TABLE IF EXISTS auth.verification_token")
    op.execute("DROP TABLE IF EXISTS auth.sessions")
    op.execute("DROP TABLE IF EXISTS auth.accounts")
    op.execute("DROP TABLE IF EXISTS auth.users")
    op.execute("DROP TYPE IF EXISTS auth.user_role")
    op.execute("DROP SCHEMA IF EXISTS auth")
