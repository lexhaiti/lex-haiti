"""Run pending Alembic migrations against the configured database.

This is the entry point of the **init container** that Azure
Container Apps runs once per revision before the API container
starts. Replacing the manual ``az containerapp exec … alembic
upgrade head`` step that used to live in the deploy checklist.

Why a wrapper around ``alembic upgrade head`` instead of running
the CLI directly:

  * **One canonical error code.** Container Apps treats any non-zero
    exit from an init container as "block the revision"; we want a
    distinct exit for "blocked by SKIP_MIGRATIONS" vs "alembic
    failed" vs "DB unreachable" so the logs read cleanly.
  * **Kill-switch.** ``SKIP_MIGRATIONS=1`` lets you ship a hot-fix
    revision that bypasses the init step — e.g. if a migration ever
    blocks a critical deploy you can roll without dropping the
    migration first.
  * **Stamp diagnostics.** Logs the revision the DB is at before +
    after, so the Container Apps log stream tells you what changed
    just from the init container output without needing psql.

Exit codes:
  0    success (migrations applied, none pending, or skipped)
  10   SKIP_MIGRATIONS=1 — intentional bypass, logged loudly
  20   Alembic error (migration failed mid-flight)
  30   DB unreachable / config error (no DATABASE_URL etc.)

Usage (inside the container)::

    python scripts/run_migrations.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Path bootstrap so the script runs both from ``backend/`` during local
# dev and from ``/app`` inside the Docker image.
sys.path.insert(0, str(Path(__file__).parent.parent))

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError


_BANNER = "─" * 60


def _config_path() -> Path:
    """Locate alembic.ini. ``backend/migrations/alembic.ini`` in the
    repo; same path inside the runtime image since we COPY the source
    tree verbatim."""
    here = Path(__file__).parent.parent
    return here / "migrations" / "alembic.ini"


def _current_head(engine) -> str | None:
    # Our alembic_version table lives in the ``public_corpus`` schema
    # (see migrations/env.py:51). Without that hint, MigrationContext
    # looks for ``public.alembic_version`` and reports the DB as empty
    # even when it isn't.
    with engine.connect() as conn:
        return MigrationContext.configure(
            conn, opts={"version_table_schema": "public_corpus"}
        ).get_current_revision()


def main() -> int:
    if os.environ.get("SKIP_MIGRATIONS") == "1":
        print(_BANNER)
        print("⚠  SKIP_MIGRATIONS=1 set — skipping `alembic upgrade head`.")
        print("   The API will start against whatever schema is on the DB.")
        print(_BANNER)
        return 10

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL is not set. Refusing to run.", file=sys.stderr)
        return 30

    cfg_path = _config_path()
    if not cfg_path.exists():
        print(f"ERROR: alembic config not found at {cfg_path}", file=sys.stderr)
        return 30

    cfg = Config(str(cfg_path))
    # alembic.ini's ``sqlalchemy.url`` is a placeholder; override here
    # with the runtime DB so deploys don't need a ConfigMap edit.
    cfg.set_main_option("sqlalchemy.url", db_url)

    try:
        engine = create_engine(db_url, pool_pre_ping=True)
        before = _current_head(engine) or "(empty)"
    except SQLAlchemyError as exc:
        print(f"ERROR: could not reach DB: {exc}", file=sys.stderr)
        return 30

    print(_BANNER)
    print(f"  Current DB revision: {before}")
    print("  Running `alembic upgrade head`…")
    print(_BANNER)

    try:
        command.upgrade(cfg, "head")
    except Exception as exc:  # noqa: BLE001 — alembic raises a handful
        print(f"ERROR: alembic upgrade failed: {exc}", file=sys.stderr)
        return 20

    after = _current_head(engine) or "(empty)"
    print(_BANNER)
    if after == before:
        print(f"  No pending migrations. DB still at: {after}")
    else:
        print(f"  Migrations applied. DB now at: {after}")
    print(_BANNER)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
