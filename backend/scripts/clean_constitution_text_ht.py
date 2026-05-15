"""Normalise the OCR-derived ``text_ht`` on Constitution 1987 articles.

Three cleanups, all rooted in artefacts of the Moniteur N° 36-A OCR
pass that ingested the Kreyòl Constitution into ``ArticleVersion``:

1. **Trailing heading-leak.** When the PDF column ended in the middle
   of an article and the next column started with the next *Tit /
   Chapit / Seksyon* heading, the OCR concatenated them. The leaked
   heading paragraphs land at the end of the prior article's
   ``text_ht`` (``...lwa.</p><p>CHAPIT II</p><p>KONSENAN ...</p>``).
   These headings already live in ``legal_headings`` — strip them
   from the article body.

2. **Mid-sentence line breaks.** A typesetter's hyphenless line break
   (``Ayiti pa admèt doub</p><p>nasyonalite nan pyès ka.``) renders
   visibly broken on the public site. When ``</p><p>`` joins an
   alphanumeric character to a lowercase letter, the wrap is an OCR
   artefact, not a paragraph break — merge with a single space.

3. **Noise paragraphs.** Single-character paragraphs (``<p>.</p>``,
   ``<p>#</p>``, ``<p>-</p>``) are OCR's interpretation of stray
   marks (dots, page-bottom margin, scan dust). They have no editorial
   value.

This script is **idempotent**. Re-running on already-clean text is a
no-op. It always prints a diff summary; pass ``--apply`` to commit
the changes to the database. With no ``--apply``, it only reports.

Conservative on heading-leak: only strip when a heading-marker
paragraph appears in the last 4 paragraphs of the article, and only
strip the heading paragraph + everything after it. Articles where
the heading bleeds **mid-body** (column-overlap garbage like
``constitution-1987:27``) are reported but NOT auto-fixed — they
need editorial reconstruction from the source, not regex surgery.

Usage (from ``backend/``)::

    # Dry run — print the per-article diff
    .venv/bin/python scripts/clean_constitution_text_ht.py

    # Apply locally
    .venv/bin/python scripts/clean_constitution_text_ht.py --apply

    # Push to prod via the sync script
    .venv/bin/python scripts/sync_legal_text_to_azure.py \\
        --slug constitution-1987 \\
        --prod-url "$PROD_DB_URL"
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select

from api.db import SessionLocal
from services.corpus.models import Article, ArticleVersion, LegalText


# Paragraph starting with a Tit / Chapit / Seksyon marker (FR or HT,
# including the common OCR variants seen in N° 36-A: "TITUTTT",
# "Chapit vV", "Chapitre V", "tite", etc. — anything that begins with
# the lemma "tit"/"chapit"/"seksyon" with the right case mix counts).
HEADING_MARKER_RE = re.compile(
    r"^\s*(?:TIT(?:RE)?|Tit(?:re)?|CHAPIT(?:RE)?|Chapit(?:re)?|SEKSYON|Seksyon)\b",
)

# Strict noise-paragraph: only punctuation / single-char marks.
NOISE_PARA_RE = re.compile(r"<p>\s*[.#•\-_=*\s]+</p>")

# Mid-sentence wrap: alphanumeric (incl. accents) → `</p><p>` →
# lowercase letter. Matches "doub</p><p>nasyonalite" but not
# "lalwa.</p><p>Atik" (period closes the sentence) and not
# "moun</p><p>a) Lè..." (uppercase / list marker starts new para).
MID_BREAK_RE = re.compile(
    r"([A-Za-z0-9À-ſ])</p>\s*<p>\s*([a-zà-ſ])",
)

# How far from the end to look for a leaked heading paragraph.
# The Moniteur column overlap rarely puts the heading more than 3-4
# paragraphs deep into the next article — limiting the window prevents
# accidentally amputating legitimate ALL-CAPS quotations earlier in
# the body.
TRAIL_WINDOW = 4


def _is_heading_subtitle(inner: str) -> bool:
    """Heuristic: an ALL-CAPS, mostly-alphabetic paragraph in the
    Kreyòl Constitution is a heading subtitle that bled in from the
    OCR (e.g. ``KONSENAN SITWAYEN AN, DWA AK DEVWA FONDALNATAL``).
    Body sentences are mixed-case; subtitle bleed is the only thing
    that produces a full ALL-CAPS short paragraph.
    """
    words = [w for w in re.split(r"\W+", inner) if len(w) >= 3]
    if len(words) < 1:
        return False
    uc_words = [w for w in words if w.isupper()]
    # A subtitle is short and predominantly uppercase.
    return len(words) <= 10 and len(uc_words) / len(words) >= 0.75


def strip_trailing_heading_leak(html: str) -> str:
    """Remove the trailing heading paragraphs if any of the last
    ``TRAIL_WINDOW`` paragraphs is a heading.

    A paragraph counts as a heading when it starts with a TIT /
    CHAPIT / Seksyon marker, OR when it is an all-caps subtitle
    line (see ``_is_heading_subtitle``). Once we find the first such
    paragraph in the trailing window, everything from it onward is
    dropped — heading bleed is contiguous, never interleaved with
    real body content.

    Returns ``html`` unchanged when no trailing heading is detected.
    """
    paras = re.findall(r"<p>.*?</p>", html, flags=re.DOTALL)
    if not paras:
        return html
    n = len(paras)
    start = max(0, n - TRAIL_WINDOW)
    cut_at: int | None = None
    for i in range(start, n):
        inner = re.sub(r"<[^>]+>", "", paras[i]).strip()
        if HEADING_MARKER_RE.match(inner) or _is_heading_subtitle(inner):
            cut_at = i
            break
    if cut_at is None:
        return html
    # Don't gut the whole article if the heading is the very first
    # paragraph — that means the whole text_ht is heading-bleed and a
    # human needs to look at it, not us.
    if cut_at == 0:
        return html
    return "".join(paras[:cut_at])


# Trailing in-paragraph garbage: after the last sentence-terminator
# in the last paragraph, an OCR-bled heading remnant. Two flavours:
#   (a) all-caps run, body never ends a sentence then opens an
#       unrelated all-caps run on the same line ("... pyès ka. TITUTTT").
#   (b) an explicit ``Chapit IV`` / ``TIT VI`` / ``Seksyon CH``
#       sentinel — these can appear in mixed case ("... anseye. Chapit IV").
_TRAILING_GARBAGE_RE = re.compile(
    r"([.;:!?])\s+"
    r"(?:"
    r"[A-Z][A-Z0-9]{2,}(?:\s+[A-Z][A-Z0-9]{2,}){0,5}"
    r"|"
    # Heading sentinel with accented Kreyòl follow-on — Konsènan,
    # Konsenan, Konsenan Hot Kou, etc. ``\w`` matches Unicode under
    # Python's default flags so the accents pass through.
    r"(?:TIT|Tit|Chapit|CHAPIT|Seksyon|SEKSYON)(?:re|RE)?\s*\w+(?:\s+\w+){0,5}"
    r")"
    r"\s*</p>",
)


def trim_trailing_inline_heading(html: str) -> str:
    """Strip an all-caps heading remnant that hangs off the end of
    the very last paragraph after a sentence-terminator."""
    # Apply to the LAST </p> only — bleed is always trailing.
    m = re.search(r"<p>(.*?)</p>\s*$", html, flags=re.DOTALL)
    if not m:
        return html
    inner = m.group(1)
    new_inner = _TRAILING_GARBAGE_RE.sub(r"\1</p>", "<p>" + inner + "</p>")
    # The substitution embedded a closing tag; strip the wrapper back off.
    new_inner = new_inner[3:-4]
    if new_inner == inner:
        return html
    return html[: m.start(1)] + new_inner + html[m.end(1):]


def merge_mid_sentence_breaks(html: str) -> str:
    """Replace ``WORD</p><p>word`` with ``WORD word`` — collapse OCR
    line-wrap into the surrounding paragraph."""
    prev = None
    out = html
    # Run until stable: a single sweep can leave consecutive merges
    # un-resolved when three or more paragraphs wrap a single sentence.
    while out != prev:
        prev = out
        out = MID_BREAK_RE.sub(r"\1 \2", out)
    return out


def drop_noise_paragraphs(html: str) -> str:
    return NOISE_PARA_RE.sub("", html)


def clean(html: str | None) -> str | None:
    if not html:
        return html
    out = drop_noise_paragraphs(html)
    # Merge breaks BEFORE stripping the trailing heading — the heading
    # often appears at the *end of the last body paragraph* once the
    # mid-sentence wrap is resolved (e.g. ``doub</p><p>nasyonalite
    # nan pyès ka. TITUTTT`` collapses to ``... pyès ka. TITUTTT``,
    # which the trailing-inline trimmer then strips).
    out = merge_mid_sentence_breaks(out)
    out = strip_trailing_heading_leak(out)
    out = trim_trailing_inline_heading(out)
    # Collapse any leftover empty <p></p> from the noise pass
    out = re.sub(r"<p>\s*</p>", "", out)
    return out.strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Commit changes to the DB (default: dry-run, prints diff only).",
    )
    parser.add_argument(
        "--slug",
        default="constitution-1987",
        help="Legal-text slug to clean (default: constitution-1987).",
    )
    args = parser.parse_args()

    db = SessionLocal()
    lt = db.execute(
        select(LegalText).where(LegalText.slug == args.slug)
    ).scalar_one_or_none()
    if lt is None:
        print(f"!! legal_text slug={args.slug!r} not found", file=sys.stderr)
        return 1

    arts = (
        db.execute(
            select(Article).where(Article.legal_text_id == lt.id).order_by(Article.position)
        )
        .scalars()
        .all()
    )

    n_total = 0
    n_changed = 0
    n_noise_only = 0
    n_trail = 0
    n_midbreak = 0
    skipped_no_trail = []  # mid-body heading still present after cleanup
    for a in arts:
        if not a.current_version_id:
            continue
        v = db.get(ArticleVersion, a.current_version_id)
        if not v or not v.text_ht:
            continue
        n_total += 1
        before = v.text_ht
        after = clean(before)
        if after == before:
            continue
        n_changed += 1
        # Bucket the kind of change for the summary
        if drop_noise_paragraphs(before) == before:
            # No noise; must be heading-leak or mid-break
            pass
        if strip_trailing_heading_leak(drop_noise_paragraphs(before)) != drop_noise_paragraphs(
            before
        ):
            n_trail += 1
        if merge_mid_sentence_breaks(before) != before:
            n_midbreak += 1
        if drop_noise_paragraphs(before) != before and after == drop_noise_paragraphs(before):
            n_noise_only += 1

        delta = len(before) - len(after)
        print(f"\n--- article {a.number} (id={a.id}) Δ={delta} chars ---")
        print(f"  BEFORE: {before[:200]!r}{'…' if len(before) > 200 else ''}")
        print(f"  AFTER : {after[:200]!r}{'…' if (after and len(after) > 200) else ''}")

        # Heuristic: detect column-overlap garbage that auto-fix can't
        # touch — heading marker still hiding inside body.
        if after and HEADING_MARKER_RE.search(after):
            # Only flag if it's still mid-body (not the very last char)
            tail_paras = re.findall(r"<p>.*?</p>", after, flags=re.DOTALL)
            has_marker_anywhere = any(
                HEADING_MARKER_RE.match(re.sub(r"<[^>]+>", "", p).strip())
                for p in tail_paras
            )
            if has_marker_anywhere:
                skipped_no_trail.append(a.number)

        if args.apply:
            v.text_ht = after

    if args.apply:
        db.commit()
        verb = "applied"
    else:
        db.rollback()
        verb = "would change"

    print(
        f"\n\n=== Summary ({verb}) ===\n"
        f"  scanned articles with text_ht: {n_total}\n"
        f"  changed: {n_changed}\n"
        f"    trailing heading-leak stripped: {n_trail}\n"
        f"    mid-sentence breaks merged:     {n_midbreak}\n"
        f"    noise paragraphs only:          {n_noise_only}\n"
        f"  still has heading marker in body (needs editor): {len(skipped_no_trail)}"
    )
    if skipped_no_trail:
        print(f"    {', '.join(skipped_no_trail)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
