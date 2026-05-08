"""Alembic environment.

The `sqlalchemy.url` from alembic.ini is overridden by our application
Settings (which honors .env), so a single source of truth for the DB URL.
"""
from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make the project root importable so `apps`, `services`, `packages` resolve.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from api.config import get_settings  # noqa: E402
from services.corpus import models as _corpus_models  # noqa: E402, F401  (registers tables)
from services.corpus.models import Base, PUBLIC_CORPUS_SCHEMA  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata


def _include_object(obj, name, type_, reflected, compare_to):
    """Restrict autogenerate to our schema."""
    if type_ == "table":
        return getattr(obj, "schema", None) == PUBLIC_CORPUS_SCHEMA
    return True


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        include_object=_include_object,
        version_table_schema=PUBLIC_CORPUS_SCHEMA,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # Ensure schema exists before alembic touches its version table.
        connection.exec_driver_sql(
            f"CREATE SCHEMA IF NOT EXISTS {PUBLIC_CORPUS_SCHEMA}"
        )
        connection.commit()

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
            include_object=_include_object,
            version_table_schema=PUBLIC_CORPUS_SCHEMA,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
