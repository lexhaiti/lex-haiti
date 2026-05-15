"""Normalize systematic OCR substitutions in ``article_versions.text_ht``.

The Kreyòl scan used a Latin-9-ish encoding that mis-mapped accented
characters and a few digits onto unrelated glyphs. Tesseract carried
the substitutions through, so the public reader sees things like
``S6l m6t`` instead of ``Sèl mèt`` and ``kreyÿl`` instead of ``kreyòl``.

This script applies a conservative set of substitutions:

  1. **Character-level**: ``6`` → ``è`` when sandwiched between two
     alphabetic letters (so ``Atik 6`` and bare digits are NOT
     touched). Same rule for other unambiguous substitutes:
     ``ÿ → ò``, ``ô → ò``, ``ù → ò`` (capital and lowercase) when
     they sit inside a word.

  2. **Whole-word fixes**: a hand-coded list of common Kreyòl words
     that the OCR mangled. Catches the 6→ò cases that the default
     rule would otherwise mis-correct to è (``f6k → fòk``,
     ``k6d → kòd``, etc.). Case-sensitive — we have separate entries
     for ``Sèl`` vs ``sèl`` because Tesseract preserves case.

  3. **Glyph cleanups**: ``8€`` (which Tesseract emits for ``se`` in
     this scan), stray ``I`` standing in for ``l`` mid-word
     (``KouI6 → Koulè``), doubled-K (``Kkè → Kè``), ``1i`` → ``li``
     when 1 stands in for l.

Idempotent — re-runs on already-normalised text are no-ops because
every substitution either matches a recognisable error pattern or is
already in canonical form.

Only ``constitution-1987`` is in scope by default; pass ``--slug X``
to run on a different legal text. ``--dry-run`` prints a per-rule
substitution count without writing.

Usage (from ``backend/``)::

    .venv/bin/python scripts/normalize_ocr_substitutions.py
    .venv/bin/python scripts/normalize_ocr_substitutions.py --dry-run
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import Session

from api.config import get_settings
from services.corpus.models import Article, ArticleVersion, LegalText


CONSTITUTION_SLUG = "constitution-1987"


# ────────────────────────────────────────────────────────────────────
# Whole-word fixes
# ────────────────────────────────────────────────────────────────────
#
# These run BEFORE the character-level pass so 6→ò cases get their
# canonical spelling before the default 6→è rule would mis-correct.
# Case-sensitive matches — the OCR preserves case, so ``Sèl`` and
# ``sèl`` need separate entries.
#
# Sources: words observed in the actual text_ht column across the 467
# Kreyòl bodies after the transcription reconciliation. New entries
# should also be case-sensitive and reference Kreyòl-orthography
# canonical forms.

# 6 → ò exceptions (otherwise the default 6→è would mis-fire).
_WORD_FIXES_OBO: dict[str, str] = {
    # f6k → fòk
    "f6k": "fòk", "F6k": "Fòk", "F6K": "FÒK",
    # k6d → kòd
    "k6d": "kòd", "K6d": "Kòd", "K6D": "KÒD",
    # k6t → kòt
    "k6t": "kòt", "K6t": "Kòt",
    # k6z → kòz (cause)
    "k6z": "kòz", "K6z": "Kòz",
    # m6d → mòd
    "m6d": "mòd", "M6d": "Mòd",
    # m6n → mòn (mountain)
    "m6n": "mòn", "M6n": "Mòn",
    # b6d → bòd
    "b6d": "bòd", "B6d": "Bòd",
    # g6m → gòm
    "g6m": "gòm",
    # k6 → kò (body — ambiguous with kè, but the constitution uses
    # "kò lejislatif" repeatedly so this maps correctly far more
    # often than not).
    "k6 ": "kò ",
    " k6,": " kò,",
    " k6.": " kò.",
}

# Specific known glyph corruptions on whole words.
_WORD_FIXES_MISC: dict[str, str] = {
    # `kdd` (d→ò twice) → `kòd`
    "kdd": "kòd",
    "Kdd": "Kòd",
    # `kbd` (b→ò) → `kòd`
    "kbd": "kòd",
    "Kbd": "Kòd",
    # Tesseract's reading of "se" in the section heading became "8€".
    "8€": "se",
    # `Kkè` (doubled K) → `Kè`
    "Kkè": "Kè",
    "kkè": "kè",
    "Kk6": "Kè",
    "kk6": "kè",
    # ÿ → ò inside known words.
    "kreyÿl": "kreyòl",
    "Kreyÿl": "Kreyòl",
    "KreyèlL": "kreyòl",
    "KreyèL": "Kreyòl",
    "kreyèl": "kreyòl",
    "Kreyèl": "Kreyòl",
    # Pòtoprens variants.
    "Pdtoprens": "Pòtoprens",
    "Pôtoprens": "Pòtoprens",
    "Pdtbprens": "Pòtoprens",
    # ``deja`` mis-rendered.
    "deJa": "deja",
    # ``soti`` (often `soti!` with mis-OCR'd ! for `nan`).
    "Sektanm": "Septanm",
    # ``Iwa`` (1→I) → "lwa". Common at start of sentence.
    "Iwa ": "lwa ",
    "Iwa,": "lwa,",
    "Iwa.": "lwa.",
    # ``Yribinal`` → "Tribinal"
    "Yribinal": "Tribinal",
    # ``soti!`` → "soti"
    "soti!": "soti",
    # ``lùt`` (ù→ò) → "lòt"
    "lùt ": "lòt ",
    "lùt,": "lòt,",
    "lùt.": "lòt.",
    " lùd": " lòd",
    " kùd": " kòd",
}


# ────────────────────────────────────────────────────────────────────
# Character-level rules
# ────────────────────────────────────────────────────────────────────
#
# Each entry is (regex, replacement). Patterns use a lookaround so
# they only fire inside a word — i.e. surrounded by alphabetic
# letters on both sides. This protects digits in article markers
# (``Atik 6``), publication dates (``28 avril 1987``) and citation
# numbers (``1804 la``) from being mangled.

_LETTER = r"[A-Za-zÀ-ÿ]"
_CHAR_RULES: list[tuple[str, str]] = [
    # 6 preceded by a letter and NOT followed by a digit → è.
    # Catches mid-word (``S6l → Sèl``) and word-end
    # (``KouI6 → Koulè``, ``Koul6`` → ``Koulè``) without touching
    # year/article numbers (``1987``, ``Atik 6:`` — preceded by
    # space, not a letter).
    (rf"(?<={_LETTER})6(?!\d)", "è"),
    # ÿ between letters → ò
    (rf"(?<={_LETTER})ÿ(?={_LETTER})", "ò"),
    # ô (circumflex o) between letters → ò
    (rf"(?<={_LETTER})ô(?={_LETTER})", "ò"),
    # ù between letters → ò  (lùt → lòt — though we also catch
    # specific cases via word-fixes above for safety)
    (rf"(?<={_LETTER})ù(?={_LETTER})", "ò"),
    # Capital I sandwiched between a lowercase letter and any
    # alphanumeric (incl. Latin-extended accented letters like è/ò)
    # is a typical OCR substitution for lowercase l (column-edge
    # smudge): KouI6 → Koulè. The lookahead must allow accented
    # vowels because the 6→è pass above runs first and turns the
    # right-side 6 into è before this rule fires.
    (rf"(?<=[a-z])I(?=[A-Za-z0-9À-ÿ])", "l"),
    # 1 sandwiched between alphabetic characters is a stand-in for
    # l: ``1i`` → ``li``, ``1ot`` → ``lot``.
    (rf"(?<=[a-z])1(?=[a-z])", "l"),
    # Bare ``1`` at the start of a word followed by `i` or `a` and
    # then a letter: ``1i`` at sentence start → ``li``.
    (rf"(?<=\s)1(?=[ia][a-z])", "l"),
]


def normalize(html: str, *, stats: Counter[str]) -> str:
    """Apply word-level fixes first, then character-level rules. The
    HTML structure (``<p>...</p>``) is preserved because every rule
    operates strictly inside word boundaries.
    """
    out = html

    # Word-level fixes — substring replacement is fine here, the
    # entries are specific enough not to collide. Tracked per-rule
    # so the summary can show which words were the biggest wins.
    for needle, repl in {**_WORD_FIXES_OBO, **_WORD_FIXES_MISC}.items():
        if needle not in out:
            continue
        count = out.count(needle)
        out = out.replace(needle, repl)
        stats[f"word: {needle} → {repl}"] += count

    # Character-level passes.
    for pattern, repl in _CHAR_RULES:
        rx = re.compile(pattern)
        new, n = rx.subn(repl, out)
        if n:
            stats[f"char: {pattern} → {repl}"] += n
            out = new

    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--slug",
        default=CONSTITUTION_SLUG,
        help="Legal text slug to process (default: constitution-1987).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report substitutions without writing.",
    )
    args = parser.parse_args()

    settings = get_settings()
    engine = create_engine(settings.database_url, echo=False)

    stats: Counter[str] = Counter()
    rows_changed = 0
    rows_total = 0

    with Session(engine) as session:
        text = session.execute(
            select(LegalText).where(LegalText.slug == args.slug)
        ).scalar_one_or_none()
        if text is None:
            print(f"ERROR: legal_text {args.slug!r} not found.")
            return 1

        # Operate on every version row that carries Kreyòl text, not
        # just current_version. Older versions can still be surfaced
        # through the version timeline and they deserve the same
        # cleanup pass.
        rows = session.execute(
            select(ArticleVersion)
            .join(Article, Article.id == ArticleVersion.article_id)
            .where(Article.legal_text_id == text.id)
            .where(ArticleVersion.text_ht.is_not(None))
        ).scalars().all()

        for v in rows:
            rows_total += 1
            old = v.text_ht or ""
            new = normalize(old, stats=stats)
            if new == old:
                continue
            rows_changed += 1
            if not args.dry_run:
                session.execute(
                    update(ArticleVersion)
                    .where(ArticleVersion.id == v.id)
                    .values(text_ht=new)
                )

        if not args.dry_run:
            session.commit()

    print(f"\nRows: {rows_changed} changed / {rows_total} total")
    print("\nTop substitutions (count · rule):")
    for rule, n in stats.most_common(25):
        print(f"  {n:5d}  {rule}")
    print("[dry-run]" if args.dry_run else "[committed]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
