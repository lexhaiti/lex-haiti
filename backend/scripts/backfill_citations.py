"""Detect inline article-to-article cross-references in a legal text and
insert them into public_corpus.citations.

Heuristic: matches "article 192", "Article 115", "art. 52" patterns inside
each article body, with the target's number existing in the same legal text.
Skips self-references and duplicates already present in the table.

Usage (from backend/):
    .venv/bin/python -m scripts.backfill_citations constitution-1987

This is intentionally simple — a real citation extraction would need NLP
to disambiguate "article 192 of the Code Civil" from "article 192" (same
text). For Phase 0, same-text refs are good enough to demo the graph UI.
"""

from __future__ import annotations

import re
import sys

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from api.config import get_settings
from schemas.enums import (
    CitationNodeType,
    CitationRelation,
    EditorialStatus,
    ExtractionMethod,
)
from services.corpus.models import Article, Citation, LegalText

# Match "article N" / "Article N.M" / "art. N" — case-insensitive, with
# optional ".M" suffix to handle the Constitution's amendment-style numbering.
_PATTERN = re.compile(r"\b[Aa]rt(?:icle|\.)\s+(\d+(?:\.\d+)?)\b")


def _make_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(get_settings().database_url, future=True)
    Session = sessionmaker(bind=engine, autoflush=False, future=True)
    return Session()


def backfill(slug: str) -> tuple[int, int]:
    """Returns (inserted, skipped_existing)."""
    sess = _make_session()
    try:
        text = sess.execute(
            select(LegalText)
            .where(LegalText.slug == slug)
            .options(selectinload(LegalText.articles).selectinload(Article.current_version))
        ).scalar_one_or_none()
        if text is None:
            print(f"Legal text not found: {slug}", file=sys.stderr)
            return 0, 0

        by_number: dict[str, int] = {a.number: a.id for a in text.articles}

        # Existing edges keyed by (source, target) so we don't re-insert.
        existing = {
            (c.source_node_id, c.target_node_id): c.id
            for c in sess.execute(
                select(Citation).where(
                    Citation.source_node_type == CitationNodeType.article,
                    Citation.target_node_type == CitationNodeType.article,
                )
            ).scalars()
        }

        inserted = 0
        skipped = 0

        for art in text.articles:
            cv = art.current_version
            body = cv.text_fr if cv else None
            if not body:
                continue
            seen_targets: set[int] = set()
            for m in _PATTERN.finditer(body):
                target_num = m.group(1)
                target_id = by_number.get(target_num)
                if not target_id or target_id == art.id:
                    continue
                if target_id in seen_targets:
                    continue
                seen_targets.add(target_id)
                if (art.id, target_id) in existing:
                    skipped += 1
                    continue
                # 60-char window around the match, used as the source quote.
                start = max(0, m.start() - 30)
                end = min(len(body), m.end() + 40)
                quote = body[start:end].replace("\n", " ").strip()
                citation = Citation(
                    source_node_type=CitationNodeType.article,
                    source_node_id=art.id,
                    target_node_type=CitationNodeType.article,
                    target_node_id=target_id,
                    relation=CitationRelation.cites,
                    source_paragraph=quote,
                    confidence=0.85,
                    extraction_method=ExtractionMethod.regex,
                    validated_by="backfill_script",
                    editorial_status=EditorialStatus.published,
                )
                sess.add(citation)
                inserted += 1

        sess.commit()
        return inserted, skipped
    finally:
        sess.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python -m scripts.backfill_citations <slug>", file=sys.stderr)
        sys.exit(2)
    ins, skip = backfill(sys.argv[1])
    print(f"Inserted {ins} new citations, skipped {skip} existing.")
