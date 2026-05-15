"""Apply the cleaned ``text_ht`` snapshot to whichever database
``DATABASE_URL`` points at — designed to run inside the API
Container App (where the secret is already injected) so we don't
need to round-trip prod creds through a developer laptop.

Reads ``backend/data/constitution_1987_text_ht.json`` (committed in
the same change as ``clean_constitution_text_ht.py``) and UPDATEs
``article_versions.text_ht`` for every article keyed by
``(legal_text.slug, article.number)``. Only the *current version*
of each article is touched.

Idempotent: re-running with the same data is a no-op (the SQL
``UPDATE`` is identical on both sides).

Why a separate script instead of folding into ``run_migrations.py``:
text content fixes are not schema changes; they shouldn't ride
Alembic. Keeping them in a one-shot script means the migration
chain stays purely structural and this content sync only fires
when we explicitly ask for it (``az containerapp job start ...``).

Usage (from inside the running API container)::

    python scripts/apply_constitution_text_ht.py

Or one-shot via Container Apps Job (re-using the migrate Job's
identity + secrets so we don't have to provision a second one)::

    az containerapp job update --name lex-haiti-migrate \\
        -g lex-haiti-prod \\
        --image lexhaitiacr785ece.azurecr.io/lex-haiti-backend:<sha> \\
        --command python scripts/apply_constitution_text_ht.py
    az containerapp job start --name lex-haiti-migrate -g lex-haiti-prod
    # Then put the migrate command back so the next deploy works:
    az containerapp job update --name lex-haiti-migrate \\
        -g lex-haiti-prod \\
        --command python scripts/run_migrations.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, text

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "constitution_1987_text_ht.json"


def main() -> int:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL is not set. Refusing to run.", file=sys.stderr)
        return 30

    if not DATA_FILE.exists():
        print(f"ERROR: data file missing: {DATA_FILE}", file=sys.stderr)
        return 40

    payload = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    slug = payload["slug"]
    articles: dict[str, str] = payload["articles"]
    print(f"Applying text_ht cleanup → slug={slug!r}, {len(articles)} articles")

    # Driver fallback: psycopg2 might not be present, prefer psycopg3.
    if db_url.startswith("postgresql://"):
        # Default the driver explicitly so SQLAlchemy picks the same
        # one the API uses.
        db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

    engine = create_engine(db_url, pool_pre_ping=True)
    updated = 0
    skipped: list[str] = []

    with engine.begin() as conn:
        # Resolve the legal_text id once.
        lt_row = conn.execute(
            text("SELECT id FROM legal_texts WHERE slug = :slug"),
            {"slug": slug},
        ).first()
        if not lt_row:
            print(f"ERROR: legal_text slug={slug!r} not found on target DB", file=sys.stderr)
            return 50
        lt_id = lt_row[0]

        for number, ht in articles.items():
            res = conn.execute(
                text(
                    """
                    UPDATE article_versions
                       SET text_ht = :ht
                     WHERE id = (
                         SELECT current_version_id
                           FROM articles
                          WHERE legal_text_id = :lt_id
                            AND number = :number
                     )
                    """
                ),
                {"ht": ht, "lt_id": lt_id, "number": number},
            )
            if res.rowcount:
                updated += 1
            else:
                skipped.append(number)

    print(f"Done. updated={updated}  skipped(no current_version)={len(skipped)}")
    if skipped:
        print(f"  skipped article numbers: {', '.join(skipped[:30])}{'…' if len(skipped) > 30 else ''}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
