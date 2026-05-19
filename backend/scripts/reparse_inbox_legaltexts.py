"""Re-parse low-article LegalText drafts from the laws-folder inbox.

Targets every LegalText whose ``moniteur_issue.edition_label`` is
``Inbox laws-2026`` AND that currently has fewer than 5 ``Article``
rows despite the originating MoniteurEntry carrying substantial
``raw_text``. These rows hit one of three failure modes during the
first promotion pass:

  1. ``LIBERTÉ ÉGALITÉ`` appears BEFORE the first article (as the
     opening devise of the act), so the splitter slices the entire
     body off as post-dispositif content.

  2. ``Donné au Palais …`` appears between two acts in a multi-act
     issue (Petrocaribe compilation, partis politiques 2014 cover
     page), so only the first act's articles are seen.

  3. The cover page enumerates several acts with ``Article``-style
     bullet points (``• Loi portant formation, …``) that the
     parser confuses for body articles, then bails when the real
     ``Article 1.- …`` doesn't fit the expected position.

Strategy
--------
Bypass ``parse_document`` / ``split_into_articles`` entirely. Walk
the raw_text directly, match every ``Article N.-`` heading via the
existing pattern (which already accepts Roman + Arabic + bis/ter +
the Roman variant added recently), and slice the body between
consecutive headings. No post-dispositif cutoff, no structural-
heading short-circuit. Whatever lives BEFORE the first article
becomes the preamble (we don't overwrite preamble_fr / visas_fr —
those are already correctly populated from the first promotion).

Idempotent: re-running drops the current ``Article`` + ``Article
Version`` rows for the target LegalText and rebuilds them. The
LegalText itself (title, preamble, visas, signers, FK pointers)
stays intact.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import delete, func, select  # noqa: E402

from api.db import SessionLocal  # noqa: E402
from schemas.enums import ArticleStatus, EditorialStatus  # noqa: E402
from services.corpus.models import (  # noqa: E402
    Article,
    ArticleVersion,
    LegalText,
    MoniteurEntry,
    MoniteurIssue,
)
from services.ingestion.article_split import _ARTICLE_HEADING_RE  # noqa: E402


def split_articles_unconstrained(body: str) -> list[tuple[str, str]]:
    """Split a body into (number, article_body) tuples.

    Bypasses every cutoff in ``split_into_articles``. The contract:
    every match of ``_ARTICLE_HEADING_RE`` is treated as an article
    boundary; the article body runs from the END of the heading
    match to the START of the next heading match.
    """
    matches = list(_ARTICLE_HEADING_RE.finditer(body))
    if not matches:
        return []
    out: list[tuple[str, str]] = []
    for i, m in enumerate(matches):
        number = m.group(1)
        body_start = m.end()
        body_end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        text = body[body_start:body_end].strip()
        out.append((number, text))
    return out


def _slugify(text: str, max_len: int = 40) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:max_len].rstrip("-") or "art"


def reparse_one(session, lt: LegalText) -> tuple[int, int]:
    """Drop existing Articles, re-split from the entry's raw_text.

    Returns (old_article_count, new_article_count).
    """
    entry = session.scalars(
        select(MoniteurEntry).where(MoniteurEntry.promoted_legal_text_id == lt.id)
    ).first()
    if entry is None or not entry.raw_text:
        return 0, 0
    pairs = split_articles_unconstrained(entry.raw_text)
    if not pairs:
        return 0, 0

    old_count = session.scalar(
        select(func.count()).select_from(Article).where(Article.legal_text_id == lt.id)
    ) or 0

    # Drop existing — ArticleVersion has FK to Article(CASCADE delete).
    session.execute(
        delete(Article).where(Article.legal_text_id == lt.id)
    )
    session.flush()

    seen_slugs: set[str] = set()
    for i, (number, text) in enumerate(pairs):
        base = _slugify(f"art-{number}")
        slug = base
        n = 2
        while slug in seen_slugs:
            slug = f"{base}-{n}"
            n += 1
        seen_slugs.add(slug)
        art = Article(
            legal_text_id=lt.id,
            number=number,
            slug=slug,
            position=i,
            domain_tags=[],
        )
        session.add(art)
        session.flush()
        ver = ArticleVersion(
            article_id=art.id,
            version_number=1,
            text_fr=text or "(article body vide — texte source à vérifier)",
            status=ArticleStatus.in_force,
            editorial_status=EditorialStatus.draft,
        )
        session.add(ver)
        session.flush()
        art.current_version_id = ver.id

    return old_count, len(pairs)


def main() -> None:
    with SessionLocal() as s:
        # Every Inbox-laws-2026 LegalText, regardless of current
        # article count — if the unconstrained splitter produces
        # strictly MORE articles than what we have, replace.
        rows = s.scalars(
            select(LegalText)
            .join(MoniteurIssue, LegalText.moniteur_issue_id == MoniteurIssue.id)
            .where(MoniteurIssue.edition_label == "Inbox laws-2026")
            .order_by(LegalText.id)
        ).all()

        improved = 0
        unchanged = 0
        for lt in rows:
            old_n, new_n = reparse_one(s, lt)
            if new_n > old_n:
                s.commit()
                improved += 1
                print(
                    f"  + LegalText #{lt.id} "
                    f"({lt.title_fr[:50]}…) "
                    f"{old_n} → {new_n} articles"
                )
            else:
                s.rollback()
                unchanged += 1
        print(f"\nDone. improved={improved}, unchanged={unchanged}")


if __name__ == "__main__":
    main()
