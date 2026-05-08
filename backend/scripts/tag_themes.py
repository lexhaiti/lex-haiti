"""Bulk-tag the existing corpus with auto theme suggestions.

Run after the 0005 migration to seed `legal_theme_tags` for every legal
text already in the DB. Uses `services.corpus.themes.suggest_themes` and
inserts results with `source = auto`. Idempotent — re-running will
update confidences but won't duplicate or downgrade editor tags.

Usage:
    python -m scripts.tag_themes              # tag all published texts
    python -m scripts.tag_themes --all        # include drafts
    python -m scripts.tag_themes --dry-run    # log only, no DB writes
"""
from __future__ import annotations

import argparse

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from api.config import get_settings
from packages.schemas.enums import EditorialStatus
from services.corpus.models import Article, ArticleVersion, LegalText
from services.corpus.repository import CorpusRepository
from services.corpus.themes import suggest_themes

import sqlalchemy as sa


def _make_session():
    settings = get_settings()
    engine = sa.create_engine(settings.database_url)
    return sa.orm.Session(engine)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--all",
        action="store_true",
        help="Tag all texts (including drafts). Default: published only.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print suggestions without writing to the DB.",
    )
    args = parser.parse_args()

    with _make_session() as session:
        repo = CorpusRepository(session)

        stmt = select(LegalText).options(
            selectinload(LegalText.articles).selectinload(Article.versions)
        )
        if not args.all:
            stmt = stmt.where(
                LegalText.editorial_status == EditorialStatus.published
            )

        texts = list(session.execute(stmt).scalars().all())
        print(f"[tag-themes] processing {len(texts)} text(s)")

        for text in texts:
            # Latest version of each article supplies the body for codes /
            # constitutions. For lois/décrets the suggester ignores articles
            # by category — see services/corpus/themes.py.
            article_bodies: list[str] = []
            for article in text.articles:
                if not article.versions:
                    continue
                latest = max(article.versions, key=lambda v: v.id)
                if latest.text_fr:
                    article_bodies.append(latest.text_fr)
                if latest.text_ht:
                    article_bodies.append(latest.text_ht)

            matches = suggest_themes(
                title_fr=text.title_fr,
                title_ht=text.title_ht,
                description_fr=text.description_fr,
                description_ht=text.description_ht,
                category=text.category,
                article_bodies=article_bodies,
            )

            if not matches:
                print(f"  {text.slug:35} (no themes matched)")
                continue

            label = " ".join(
                f"{m.theme.value}={m.confidence}" for m in matches
            )
            print(f"  {text.slug:35} {label}")

            if not args.dry_run:
                repo.upsert_auto_theme_tags(
                    text.id,
                    [(m.theme, float(m.confidence)) for m in matches],
                )

        if not args.dry_run:
            session.commit()
            print(f"[tag-themes] committed.")
        else:
            print(f"[tag-themes] dry-run, no writes.")


if __name__ == "__main__":
    main()
