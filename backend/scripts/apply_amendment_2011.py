"""Apply the 2011 Constitutional Amendment to the 1987 Constitution.

The amending law is already in DB as ``legal_texts.id = 106``; its
Article 2 (``articles.id = 5328``) carries the full text of the
modifications. This script walks that text, splits it into discrete
operations, and applies them to the 1987 Constitution
(``legal_texts.id = 87``) inside one transaction.

Run from ``backend/``::

    .venv/bin/python scripts/apply_amendment_2011.py
    .venv/bin/python scripts/apply_amendment_2011.py --apply   # commit
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from datetime import date
from typing import Literal

from sqlalchemy import text
from sqlalchemy.engine import Connection

from api.db import engine
from services.editorial.service import _sanitize_article_html

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CONSTITUTION_ID = 87
AMENDING_LAW_ID = 106
AMENDMENT_ARTICLE_ID = 5328  # Article 2 of the amending law
TITRE_VI_HEADING_ID = 427
EFFECTIVE_DATE = date(2012, 6, 19)
NEW_CHAPTER_NUMBER = "Préliminaire"
NEW_CHAPTER_TITLE = "Du Conseil Constitutionnel"

# Amendment-form → DB-form translation for the article-number column.
NUMBER_OVERRIDES: dict[str, str] = {
    "1er": "premier",
    "premier": "premier",
}

# Anchor article numbers we'll use when adding new ones. Maps the new
# article's number to the *DB number* of its predecessor (so position is
# computed deterministically rather than guessed from the dot notation).
# Filled in by ``predecessor_for()``; this table only overrides cases
# the heuristic can't infer.
ADD_PREDECESSOR_OVERRIDES: dict[str, str] = {
    "134bis": "134",
}


# ---------------------------------------------------------------------------
# Number-format helpers
# ---------------------------------------------------------------------------

def amend_to_db_number(amend_num: str) -> str:
    """Map the amendment's article-number form to the DB column form.

    Amendment uses dots (``12.1``, ``32.3``); the DB stores dashes
    (``12-1``, ``32-3``). Special-case ``1er`` / ``Premier``.
    """
    n = amend_num.strip()
    low = n.lower()
    if low in NUMBER_OVERRIDES:
        return NUMBER_OVERRIDES[low]
    return n.replace(".", "-")


def predecessor_for(db_num: str) -> str | None:
    """Best-guess predecessor article for an ADD operation.

    Rules: strip a trailing ``-N`` segment ("11-1" → "11"), strip a
    trailing ``bis``/``ter`` token ("134bis" → "134"). The override
    table above wins when the heuristic is wrong.
    """
    if db_num in ADD_PREDECESSOR_OVERRIDES:
        return ADD_PREDECESSOR_OVERRIDES[db_num]
    m = re.match(r"^(.+?)(-\d+|bis|ter)$", db_num)
    if m:
        return m.group(1)
    return None


def slugify_number(num: str) -> str:
    """Turn an article number into a URL slug component.

    Lowercase, ASCII-safe, dashes only. Matches the parser's slug rules
    well enough for the article reader to round-trip.
    """
    s = num.lower().replace(".", "-")
    s = re.sub(r"[^a-z0-9-]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s or "x"


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

INTRO_PATTERNS = {
    "replace": re.compile(
        r"^L[’']article\s+([\w.\- ]+?)\s+se lit désormais comme suit\s*:?\s*$",
        re.IGNORECASE,
    ),
    "add": re.compile(
        r"^Il est ajouté un article\s+([\w.\- ]+?)\s+qui se lit comme suit\s*:?\s*$",
        re.IGNORECASE,
    ),
    "abrogate_one": re.compile(
        r"^L[’']article\s+([\w.\- ]+?)\s+de la Constitution(?:\s+de 1987)?\s+est abrogé.*$",
        re.IGNORECASE,
    ),
    "abrogate_many": re.compile(
        r"^Les articles\s+(.+?)\s+de la Constitution(?:\s+de 1987)?\s+sont abrogés.*$",
        re.IGNORECASE,
    ),
    "preamble": re.compile(
        r"^Le préambule de la Constitution se lit désormais comme suit\s*:?\s*$",
        re.IGNORECASE,
    ),
    "new_chapter": re.compile(
        r"^Il est créé,?\s+au Titre VI.+chapitre traitant du Conseil Constitutionnel\s*:?\s*$",
        re.IGNORECASE,
    ),
}

# Sub-article header inside the new chapter section:
# "Article 190bis.-", "Article 190ter.1.-", "Article 190ter.10.-"
CHAPTER_ARTICLE_HEADER = re.compile(
    r"^Article\s+(190(?:bis|ter)(?:\.\d+)?)\.\-?\s*"
)


@dataclass
class Op:
    kind: Literal["replace", "add", "abrogate", "preamble", "new_chapter"]
    # For replace/add: amendment-form number (e.g. "1er", "11.1", "190bis")
    number: str | None = None
    # For abrogate: list of amendment-form numbers
    numbers: list[str] = field(default_factory=list)
    # For replace/add/preamble: HTML body
    content_html: str = ""
    # For new_chapter: list of inline sub-articles
    chapter_articles: list[tuple[str, str]] = field(default_factory=list)


def parse_paragraphs(html: str) -> list[str]:
    """Crude paragraph extraction — splits on closing ``</p>`` because
    the docx-converted HTML is a flat sequence of paragraphs with no
    block nesting. Returns the *plain text* of each paragraph plus its
    inner HTML for content collection."""
    # Normalize entities for the leading-character checks below.
    chunks = re.findall(r"<p[^>]*>(.*?)</p>", html, flags=re.DOTALL | re.IGNORECASE)
    out = []
    for c in chunks:
        out.append(c)
    return out


def strip_tags(html: str) -> str:
    """Bare-bones tag stripper for the intro-pattern matcher. We don't
    need entity decoding for the patterns we're matching."""
    s = re.sub(r"<[^>]+>", "", html)
    # Normalize curly quotes the docx emits in "L'article".
    s = s.replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+", " ", s).strip()


def split_abrogated_list(s: str) -> list[str]:
    """Split a list-of-articles phrase like ``12.1, 12.2, 13, 14 et 15``
    into individual amendment-form numbers."""
    # Replace " et " with comma so the split is uniform, then split on commas.
    s = re.sub(r"\s+et\s+", ", ", s)
    return [p.strip() for p in s.split(",") if p.strip()]


def parse_amendment(html: str) -> list[Op]:
    """Walk the amendment HTML and emit a list of operations."""
    paragraphs = parse_paragraphs(html)
    ops: list[Op] = []
    i = 0
    while i < len(paragraphs):
        para_html = paragraphs[i]
        para_text = strip_tags(para_html)

        # --- ABROGATE (single) ----------------------------------------
        m = INTRO_PATTERNS["abrogate_one"].match(para_text)
        if m:
            num = m.group(1).strip()
            # Trim a trailing "de la Constitution" if it leaked in.
            num = re.sub(r"\s+de la Constitution.*$", "", num).strip()
            ops.append(Op(kind="abrogate", numbers=[num]))
            i += 1
            continue

        # --- ABROGATE (multi) -----------------------------------------
        m = INTRO_PATTERNS["abrogate_many"].match(para_text)
        if m:
            nums = split_abrogated_list(m.group(1))
            ops.append(Op(kind="abrogate", numbers=nums))
            i += 1
            continue

        # --- PREAMBLE -------------------------------------------------
        m = INTRO_PATTERNS["preamble"].match(para_text)
        if m:
            content, i = collect_content(paragraphs, i + 1)
            ops.append(Op(kind="preamble", content_html=content))
            continue

        # --- NEW CHAPTER ----------------------------------------------
        m = INTRO_PATTERNS["new_chapter"].match(para_text)
        if m:
            articles, i = collect_chapter_articles(paragraphs, i + 1)
            ops.append(Op(kind="new_chapter", chapter_articles=articles))
            continue

        # --- REPLACE --------------------------------------------------
        m = INTRO_PATTERNS["replace"].match(para_text)
        if m:
            num = m.group(1).strip()
            content, i = collect_content(paragraphs, i + 1)
            ops.append(Op(kind="replace", number=num, content_html=content))
            continue

        # --- ADD ------------------------------------------------------
        m = INTRO_PATTERNS["add"].match(para_text)
        if m:
            num = m.group(1).strip()
            content, i = collect_content(paragraphs, i + 1)
            ops.append(Op(kind="add", number=num, content_html=content))
            continue

        # First paragraph is the lead-in "Les modifications apportées…",
        # skip silently.
        i += 1
    return ops


def is_intro(para_html: str) -> bool:
    """Does this paragraph match any of the operation-intro patterns?"""
    txt = strip_tags(para_html)
    for pat in INTRO_PATTERNS.values():
        if pat.match(txt):
            return True
    return False


def collect_content(paragraphs: list[str], start: int) -> tuple[str, int]:
    """Gather consecutive non-intro paragraphs starting at ``start``.

    Returns ``(html, next_index)``. The returned HTML is a sequence of
    ``<p>…</p>`` blocks ready to feed into the sanitizer.
    """
    out = []
    i = start
    while i < len(paragraphs) and not is_intro(paragraphs[i]):
        out.append(f"<p>{paragraphs[i]}</p>")
        i += 1
    return "".join(out), i


def collect_chapter_articles(
    paragraphs: list[str], start: int
) -> tuple[list[tuple[str, str]], int]:
    """Walk paragraphs after a "Il est créé un chapitre…" intro,
    grouping by inline ``<strong>Article 190bis.-</strong>`` headers.

    Returns ``(list_of_(number, content_html), next_index)``. Stops at
    the next operation intro.
    """
    articles: list[tuple[str, str]] = []
    current_num: str | None = None
    current_chunks: list[str] = []
    i = start
    while i < len(paragraphs):
        para = paragraphs[i]
        if is_intro(para):
            break
        # Look for "Article 190bis.-" at the start of the paragraph.
        plain = strip_tags(para)
        m = CHAPTER_ARTICLE_HEADER.match(plain)
        if m:
            # Flush the previous article before starting the new one.
            if current_num is not None:
                articles.append((current_num, "".join(current_chunks)))
            current_num = m.group(1).strip()
            # Strip the header from the paragraph so the article body
            # doesn't include "Article 190bis.- " as inline text.
            body = re.sub(
                r"^\s*<strong>\s*Article\s+190(?:bis|ter)(?:\.\d+)?\.\-?\s*</strong>\s*",
                "",
                para,
                flags=re.IGNORECASE,
            )
            current_chunks = [f"<p>{body}</p>"]
        else:
            if current_num is None:
                # Should not happen — first chapter paragraph is the chapter intro.
                pass
            else:
                current_chunks.append(f"<p>{para}</p>")
        i += 1
    if current_num is not None:
        articles.append((current_num, "".join(current_chunks)))
    return articles, i


# ---------------------------------------------------------------------------
# DB writers
# ---------------------------------------------------------------------------

def load_amendment_html(conn: Connection) -> str:
    return conn.execute(
        text(
            """
            SELECT av.text_fr
              FROM public_corpus.article_versions av
              JOIN public_corpus.articles a ON a.current_version_id = av.id
             WHERE a.id = :aid
        """
        ),
        {"aid": AMENDMENT_ARTICLE_ID},
    ).scalar()


def find_article_id(conn: Connection, db_num: str) -> int | None:
    return conn.execute(
        text(
            """
            SELECT id FROM public_corpus.articles
             WHERE legal_text_id = :lid AND number = :num
        """
        ),
        {"lid": CONSTITUTION_ID, "num": db_num},
    ).scalar()


def apply_replace(conn: Connection, db_num: str, html: str) -> tuple[int | None, int | None]:
    aid = find_article_id(conn, db_num)
    if aid is None:
        return None, None
    cur = conn.execute(
        text(
            """
            SELECT av.id, av.version_number
              FROM public_corpus.articles a
              JOIN public_corpus.article_versions av ON av.id = a.current_version_id
             WHERE a.id = :aid
        """
        ),
        {"aid": aid},
    ).first()
    if cur is None:
        return aid, None
    next_n = (cur[1] or 1) + 1
    new_av_id = conn.execute(
        text(
            """
            INSERT INTO public_corpus.article_versions
                (article_id, version_number, text_fr, status,
                 effective_from, source_amendment_id, editorial_status,
                 created_at, updated_at)
            VALUES (:aid, :n, :body, 'in_force', :eff, :src, 'published',
                    now(), now())
            RETURNING id
        """
        ),
        {
            "aid": aid,
            "n": next_n,
            "body": _sanitize_article_html(html),
            "eff": EFFECTIVE_DATE,
            "src": AMENDING_LAW_ID,
        },
    ).scalar()
    conn.execute(
        text("UPDATE public_corpus.articles SET current_version_id = :v, updated_at = now() WHERE id = :aid"),
        {"v": new_av_id, "aid": aid},
    )
    # Provenance row.
    conn.execute(
        text(
            """
            INSERT INTO public_corpus.legal_changes
                (amending_text_id, amended_text_id, amended_article_id, new_version_id,
                 change_kind, effective_on)
            VALUES (:amend, :amended, :aid, :nv, 'amend', :eff)
            ON CONFLICT DO NOTHING
        """
        ),
        {
            "amend": AMENDING_LAW_ID,
            "amended": CONSTITUTION_ID,
            "aid": aid,
            "nv": new_av_id,
            "eff": EFFECTIVE_DATE,
        },
    )
    return aid, new_av_id


def apply_abrogate(conn: Connection, db_num: str) -> int | None:
    aid = find_article_id(conn, db_num)
    if aid is None:
        return None
    # Update the current version's status. Don't create a new version —
    # abrogation is a status flip, not a content change.
    conn.execute(
        text(
            """
            UPDATE public_corpus.article_versions
               SET status = 'abrogated',
                   effective_to = :eff,
                   updated_at = now()
             WHERE id = (SELECT current_version_id FROM public_corpus.articles WHERE id = :aid)
        """
        ),
        {"aid": aid, "eff": EFFECTIVE_DATE},
    )
    conn.execute(
        text(
            """
            INSERT INTO public_corpus.legal_changes
                (amending_text_id, amended_text_id, amended_article_id,
                 change_kind, effective_on)
            VALUES (:amend, :amended, :aid, 'abrogate', :eff)
            ON CONFLICT DO NOTHING
        """
        ),
        {
            "amend": AMENDING_LAW_ID,
            "amended": CONSTITUTION_ID,
            "aid": aid,
            "eff": EFFECTIVE_DATE,
        },
    )
    return aid


def apply_add(
    conn: Connection,
    db_num: str,
    html: str,
    heading_id_override: int | None = None,
    predecessor_db_num: str | None = None,
) -> tuple[int, int]:
    """Insert a new article + its first version.

    ``predecessor_db_num`` is the article we want this new one to come
    right after in document order (and inherit ``heading_id`` from,
    unless ``heading_id_override`` is supplied). The function shifts
    all subsequent ``position`` values by one to free a slot.
    """
    pred_num = predecessor_db_num
    if pred_num is None:
        pred_num = predecessor_for(db_num)
    pred = None
    if pred_num is not None:
        pred = conn.execute(
            text(
                """
                SELECT id, position, heading_id FROM public_corpus.articles
                 WHERE legal_text_id = :lid AND number = :num
            """
            ),
            {"lid": CONSTITUTION_ID, "num": pred_num},
        ).first()
    if pred is None:
        # Fall back to placing at the end of the document.
        max_pos = (
            conn.execute(
                text(
                    "SELECT COALESCE(MAX(position), -1) FROM public_corpus.articles WHERE legal_text_id = :lid"
                ),
                {"lid": CONSTITUTION_ID},
            ).scalar()
            or -1
        )
        new_pos = max_pos + 1
        heading_id = heading_id_override
    else:
        new_pos = pred[1] + 1
        heading_id = heading_id_override if heading_id_override is not None else pred[2]
        # Shift trailing siblings up by one. Done in two stages with
        # arithmetic so PK/unique constraints don't matter (position
        # has no uniqueness).
        conn.execute(
            text(
                """
                UPDATE public_corpus.articles
                   SET position = position + 1
                 WHERE legal_text_id = :lid AND position >= :p
            """
            ),
            {"lid": CONSTITUTION_ID, "p": new_pos},
        )

    slug_base = slugify_number(db_num)
    # Ensure slug uniqueness within the legal_text.
    slug = slug_base
    n = 1
    while conn.execute(
        text(
            "SELECT 1 FROM public_corpus.articles WHERE legal_text_id = :lid AND slug = :s"
        ),
        {"lid": CONSTITUTION_ID, "s": slug},
    ).scalar():
        n += 1
        slug = f"{slug_base}-{n}"

    new_aid = conn.execute(
        text(
            """
            INSERT INTO public_corpus.articles
                (legal_text_id, heading_id, number, slug, position,
                 domain_tags, created_at, updated_at)
            VALUES (:lid, :hid, :num, :slug, :pos, '{}'::text[], now(), now())
            RETURNING id
        """
        ),
        {
            "lid": CONSTITUTION_ID,
            "hid": heading_id,
            "num": db_num,
            "slug": slug,
            "pos": new_pos,
        },
    ).scalar()
    new_av_id = conn.execute(
        text(
            """
            INSERT INTO public_corpus.article_versions
                (article_id, version_number, text_fr, status,
                 effective_from, source_amendment_id, editorial_status,
                 created_at, updated_at)
            VALUES (:aid, 1, :body, 'in_force', :eff, :src, 'published',
                    now(), now())
            RETURNING id
        """
        ),
        {
            "aid": new_aid,
            "body": _sanitize_article_html(html),
            "eff": EFFECTIVE_DATE,
            "src": AMENDING_LAW_ID,
        },
    ).scalar()
    conn.execute(
        text(
            "UPDATE public_corpus.articles SET current_version_id = :v WHERE id = :aid"
        ),
        {"v": new_av_id, "aid": new_aid},
    )
    conn.execute(
        text(
            """
            INSERT INTO public_corpus.legal_changes
                (amending_text_id, amended_text_id, amended_article_id, new_version_id,
                 change_kind, effective_on)
            VALUES (:amend, :amended, :aid, :nv, 'add', :eff)
            ON CONFLICT DO NOTHING
        """
        ),
        {
            "amend": AMENDING_LAW_ID,
            "amended": CONSTITUTION_ID,
            "aid": new_aid,
            "nv": new_av_id,
            "eff": EFFECTIVE_DATE,
        },
    )
    return new_aid, new_av_id


def apply_new_chapter(
    conn: Connection, chapter_articles: list[tuple[str, str]]
) -> int:
    # Insert the new chapter heading under Titre VI. We give it the
    # smallest position among Titre VI's existing children so the TOC
    # places it first ("Chapitre préliminaire" reads naturally before
    # Chapter I).
    min_child_pos = conn.execute(
        text(
            """
            SELECT MIN(position) FROM public_corpus.legal_headings
             WHERE legal_text_id = :lid AND parent_id = :pid
        """
        ),
        {"lid": CONSTITUTION_ID, "pid": TITRE_VI_HEADING_ID},
    ).scalar()
    target_pos = min_child_pos if min_child_pos is not None else 0
    # Shift everything at or after target_pos up by 1 so the new
    # chapter can occupy that slot.
    conn.execute(
        text(
            """
            UPDATE public_corpus.legal_headings
               SET position = position + 1
             WHERE legal_text_id = :lid AND position >= :p
        """
        ),
        {"lid": CONSTITUTION_ID, "p": target_pos},
    )
    # Ensure the heading ``key`` is unique within the legal_text.
    key_base = "chapter-preliminaire-conseil-constitutionnel"
    key = key_base
    n = 1
    while conn.execute(
        text(
            "SELECT 1 FROM public_corpus.legal_headings WHERE legal_text_id = :lid AND key = :k"
        ),
        {"lid": CONSTITUTION_ID, "k": key},
    ).scalar():
        n += 1
        key = f"{key_base}-{n}"

    new_hid = conn.execute(
        text(
            """
            INSERT INTO public_corpus.legal_headings
                (legal_text_id, parent_id, level, key, number, title_fr, position)
            VALUES (:lid, :pid, 'chapter', :key, :num, :title, :pos)
            RETURNING id
        """
        ),
        {
            "lid": CONSTITUTION_ID,
            "pid": TITRE_VI_HEADING_ID,
            "key": key,
            "num": NEW_CHAPTER_NUMBER,
            "title": NEW_CHAPTER_TITLE,
            "pos": target_pos,
        },
    ).scalar()

    # Insert each sub-article in document order. Predecessor for the
    # first sub-article is the previously-last article in Titre VI
    # (article 190 sits at position 327, heading_id=426 = chapter V of
    # Titre VI). The new articles go *under our new chapter*, but in
    # document order they slot right after the existing article 190.
    prev_db_num = "190"
    for amend_num, body_html in chapter_articles:
        # Convert "190bis" → "190bis" (no dots), "190ter.5" → "190ter-5".
        db_num = amend_num.replace(".", "-")
        apply_add(
            conn,
            db_num=db_num,
            html=body_html,
            heading_id_override=new_hid,
            predecessor_db_num=prev_db_num,
        )
        prev_db_num = db_num

    return new_hid


def apply_preamble(conn: Connection, html: str) -> None:
    """Replace the preamble of the Constitution with the amended text,
    and write a ``legal_text_block_versions`` row capturing the prior
    state for the timeline."""
    # Snapshot the current preamble into a versions row, then overwrite.
    cur = conn.execute(
        text(
            """
            SELECT preamble_fr FROM public_corpus.legal_texts WHERE id = :lid
        """
        ),
        {"lid": CONSTITUTION_ID},
    ).scalar()
    if cur is not None:
        # Existing v1 snapshot — keep the original text alongside the new one.
        existing_v = conn.execute(
            text(
                """
                SELECT COALESCE(MAX(version_number), 0)
                  FROM public_corpus.legal_text_block_versions
                 WHERE legal_text_id = :lid AND block_kind = 'preamble'
            """
            ),
            {"lid": CONSTITUTION_ID},
        ).scalar()
        if (existing_v or 0) == 0:
            conn.execute(
                text(
                    """
                    INSERT INTO public_corpus.legal_text_block_versions
                        (legal_text_id, block_kind, version_number, text_fr,
                         editorial_status, created_at, updated_at)
                    VALUES (:lid, 'preamble', 1, :body, 'published', now(), now())
                """
                ),
                {"lid": CONSTITUTION_ID, "body": cur},
            )
            existing_v = 1
        next_v = (existing_v or 1) + 1
        conn.execute(
            text(
                """
                INSERT INTO public_corpus.legal_text_block_versions
                    (legal_text_id, block_kind, version_number, text_fr,
                     effective_from, source_amendment_id, editorial_status,
                     created_at, updated_at)
                VALUES (:lid, 'preamble', :n, :body, :eff, :src, 'published',
                        now(), now())
            """
            ),
            {
                "lid": CONSTITUTION_ID,
                "n": next_v,
                "body": _sanitize_article_html(html),
                "eff": EFFECTIVE_DATE,
                "src": AMENDING_LAW_ID,
            },
        )
    conn.execute(
        text(
            """
            UPDATE public_corpus.legal_texts
               SET preamble_fr = :body, updated_at = now()
             WHERE id = :lid
        """
        ),
        {"lid": CONSTITUTION_ID, "body": _sanitize_article_html(html)},
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Commit changes. Without this flag, the transaction is rolled back.",
    )
    parser.add_argument(
        "--skip-preamble",
        action="store_true",
        help="Don't touch the preamble even if the amendment includes one.",
    )
    args = parser.parse_args()

    with engine.begin() as conn:
        amendment_html = load_amendment_html(conn)
        if not amendment_html:
            print("Couldn't load amendment HTML", file=sys.stderr)
            return 1
        ops = parse_amendment(amendment_html)

        # Sanity: print operation counts.
        kinds: dict[str, int] = {}
        for op in ops:
            kinds[op.kind] = kinds.get(op.kind, 0) + 1
        print("Parsed operations:")
        for k in sorted(kinds):
            print(f"  {k}: {kinds[k]}")
        # Drill-down per kind.
        for k in ("replace", "add", "abrogate", "new_chapter"):
            entries = [op for op in ops if op.kind == k]
            if not entries:
                continue
            print(f"  --- {k} ({len(entries)}) ---")
            for op in entries:
                if k == "abrogate":
                    print(f"    abrogate {', '.join(op.numbers)}")
                elif k == "new_chapter":
                    nums = [a[0] for a in op.chapter_articles]
                    print(f"    new chapter with {len(nums)} articles: {nums}")
                else:
                    body_len = len(_sanitize_article_html(op.content_html or "") or "")
                    print(f"    {k} {op.number}  ({body_len} chars)")

        # Apply.
        applied = {
            "replace": 0, "abrogate": 0, "add": 0,
            "preamble": 0, "new_chapter": 0,
            "missing_replace": [], "missing_abrogate": [],
        }
        for op in ops:
            if op.kind == "replace":
                db_num = amend_to_db_number(op.number or "")
                aid, av = apply_replace(conn, db_num, op.content_html)
                if aid is None:
                    applied["missing_replace"].append(op.number)
                else:
                    applied["replace"] += 1
            elif op.kind == "abrogate":
                for amend_num in op.numbers:
                    db_num = amend_to_db_number(amend_num)
                    aid = apply_abrogate(conn, db_num)
                    if aid is None:
                        applied["missing_abrogate"].append(amend_num)
                    else:
                        applied["abrogate"] += 1
            elif op.kind == "add":
                db_num = amend_to_db_number(op.number or "")
                apply_add(conn, db_num, op.content_html)
                applied["add"] += 1
            elif op.kind == "preamble":
                if not args.skip_preamble:
                    apply_preamble(conn, op.content_html)
                    applied["preamble"] += 1
            elif op.kind == "new_chapter":
                apply_new_chapter(conn, op.chapter_articles)
                applied["new_chapter"] += 1

        print("\nApplied counts:", applied)

        if not args.apply:
            # Roll back this dry-run.
            raise RuntimeError("dry-run: rolling back. Re-run with --apply to commit.")
    print("\nDONE — changes committed.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RuntimeError as e:
        # Friendly dry-run exit (rollback already happened).
        print(f"\n{e}")
        sys.exit(0)
