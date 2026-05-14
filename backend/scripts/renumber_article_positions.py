"""Renumber every article's ``position`` so the natural article-number
order matches the document-reading order.

Run from ``backend/``::

    .venv/bin/python scripts/renumber_article_positions.py
    .venv/bin/python scripts/renumber_article_positions.py --apply
    .venv/bin/python scripts/renumber_article_positions.py --apply --slug some-text

Sort key for an article number ``"N"``:
  1. Major integer (the leading digits, or 1 for "premier"/"premier-…")
  2. Suffix rank: bare = 0, ``bis`` = 1, ``ter`` = 2, ``quater`` = 3, …
  3. Sub-numbers in the trailing ``-N`` segments
  4. The full string itself, as a tiebreaker so ordering is stable

So the natural order goes: ``1 < 1-1 < 2 < 2-1 < 10 < 134 < 134bis <
190 < 190bis < 190bis-1 < 190ter < 190ter-1 < 190ter-2 < 190ter-10 <
191``. Headings (preserved by ``heading_id``) are not touched —
``position`` is a per-text linear index used only for prev/next
navigation and the article reader's ordering.
"""
from __future__ import annotations

import argparse
import re
import sys

from sqlalchemy import text
from sqlalchemy.engine import Connection

from api.db import engine

# ``bis`` / ``ter`` / ``quater`` / ``quinquies`` / ``sexies`` cover
# every Latin ordinal multiplier the parser has ever produced. The
# dict gives each a rank that puts a suffix after the bare number but
# before the next major one (``134 < 134bis < 134ter < 135``).
SUFFIX_RANK = {
    "": 0,
    "bis": 1,
    "ter": 2,
    "quater": 3,
    "quinquies": 4,
    "sexies": 5,
    "septies": 6,
    "octies": 7,
    "novies": 8,
    "decies": 9,
}

# Matches "<major><suffix>?(-<sub>)*" with the suffix as a single
# alpha token. Tolerates whitespace and case (numbers in the DB are
# stored as-typed, sometimes lowercase, sometimes title-case).
NUM_PATTERN = re.compile(
    r"^\s*(?P<major>\d+)(?P<suffix>bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)?"
    r"(?P<rest>(?:-\d+)*)\s*$",
    re.IGNORECASE,
)


def sort_key(number: str) -> tuple:
    """Build the comparable sort key for a raw article number.

    ``premier`` maps to major=1 with no suffix. Articles whose number
    doesn't parse (e.g. weirdly formatted imports like "Annexe A")
    sort last, alphabetically among themselves, so they don't crash
    the renumber but stay grouped after the numbered ones.
    """
    raw = (number or "").strip()
    lowered = raw.lower()

    # "premier" / "premier-1" → major=1, with the remaining ``-N`` parts.
    if lowered == "premier":
        return (0, 1, 0, (), raw)
    m_pre = re.match(r"^premier((?:-\d+)+)\s*$", lowered)
    if m_pre:
        sub = tuple(int(n) for n in m_pre.group(1).split("-")[1:])
        return (0, 1, 0, sub, raw)

    m = NUM_PATTERN.match(raw)
    if not m:
        # Non-numeric label — push to the end, sort by string.
        return (1, 0, 0, (), raw.lower())

    major = int(m.group("major"))
    suffix = (m.group("suffix") or "").lower()
    sub_part = m.group("rest") or ""
    sub = tuple(int(n) for n in sub_part.split("-")[1:]) if sub_part else ()

    return (0, major, SUFFIX_RANK.get(suffix, 99), sub, raw)


def renumber_legal_text(conn: Connection, lid: int, slug: str) -> int:
    """Reorder all articles of a legal_text into natural-number order
    and rewrite ``position`` contiguously from 0. Returns the count of
    rows whose position changed."""
    rows = conn.execute(
        text(
            """
            SELECT id, number, position FROM public_corpus.articles
             WHERE legal_text_id = :lid
             ORDER BY position
        """
        ),
        {"lid": lid},
    ).all()
    if not rows:
        return 0

    decorated = [(sort_key(r[1]), r[0], r[1], r[2]) for r in rows]
    decorated.sort(key=lambda t: t[0])

    # Detect "already in order" — common, so we skip the UPDATE pass.
    if all(decorated[i][3] == i for i in range(len(decorated))):
        return 0

    # Stage 1: shift current positions out of the way to avoid any
    # transient collisions (positions have no unique constraint, but
    # this keeps debug output during the script honest).
    offset = 1_000_000
    conn.execute(
        text(
            "UPDATE public_corpus.articles SET position = position + :off WHERE legal_text_id = :lid"
        ),
        {"off": offset, "lid": lid},
    )
    # Stage 2: write the new positions in natural-sort order.
    changed = 0
    for new_pos, (_, aid, _, old_pos) in enumerate(decorated):
        if old_pos == new_pos:
            continue
        changed += 1
        conn.execute(
            text(
                "UPDATE public_corpus.articles SET position = :p, updated_at = now() WHERE id = :aid"
            ),
            {"p": new_pos, "aid": aid},
        )
    # Stage 3: any rows whose key happened to map to the same index
    # they started at still have the +offset value. Snap them back.
    conn.execute(
        text(
            """
            UPDATE public_corpus.articles
               SET position = position - :off
             WHERE legal_text_id = :lid AND position >= :off
        """
        ),
        {"off": offset, "lid": lid},
    )
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Commit changes. Without it, the transaction is rolled back.",
    )
    parser.add_argument(
        "--slug",
        default=None,
        help="Run on a single legal_text by slug (otherwise: all texts).",
    )
    args = parser.parse_args()

    with engine.begin() as conn:
        if args.slug:
            lts = conn.execute(
                text(
                    "SELECT id, slug FROM public_corpus.legal_texts WHERE slug = :s"
                ),
                {"s": args.slug},
            ).all()
        else:
            lts = conn.execute(
                text(
                    "SELECT id, slug FROM public_corpus.legal_texts ORDER BY id"
                )
            ).all()

        total_changed_texts = 0
        total_changed_rows = 0
        for lid, slug in lts:
            n = renumber_legal_text(conn, lid, slug)
            if n > 0:
                total_changed_texts += 1
                total_changed_rows += n
                print(f"  {slug}: {n} article position(s) updated")

        print()
        print(f"Texts touched: {total_changed_texts}")
        print(f"Articles repositioned: {total_changed_rows}")

        if not args.apply:
            raise RuntimeError("dry-run: rolling back. Re-run with --apply to commit.")
    print("\nDONE — committed.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RuntimeError as e:
        print(f"\n{e}")
        sys.exit(0)
