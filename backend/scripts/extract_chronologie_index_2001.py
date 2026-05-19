"""Extract the 2001 ``Index Chronologique de la Législation Haïtienne``
PDF into a structured JSON seed file.

Source: Ministère de la Justice et de la Sécurité Publique, ``Index
Chronologique de la Législation Haïtienne (1804-2000)``, septembre
2001 (265 pages, scanned + OCR'd by the publisher; text layer is
present but riddled with typical scan artifacts — ``N•`` for
``N°``, ``aoftt`` for ``août``, ``Il`` for ``11``, dropped
spaces in compound numbers like ``11juin1934``).

The layout is a 3-column table:

  col 1 (x ≈   50-215)   description of the act (often wraps)
  col 2 (x ≈  215-290)   act date (rarely wraps)
  col 3 (x ≥  290     )   ``MONITEUR N° xx`` + ``du <date>``

Algorithm:

  1. For each page, pull words with positions via PyMuPDF.
  2. Group words into lines by y (within ±5 px).
  3. Classify each line's words into the three columns by x0.
  4. The running header at y < 30 is captured as the *section*
     context for all rows on that page (e.g. ``DU DROIT
     INTERNATIONAL PUBLIC``, ``LEGISLATION A CARACTERES DIVERS``).
     Pages whose running header reads ``INDEX CHRONOLOGIQUE DE LA
     LEGISLATION HAITIENNE`` are non-content pages (TOC,
     methodology, annexe) — they're skipped.
  5. A *new row* starts on any line that has col-2 (date) content.
     Subsequent lines with only col-1 content are wrap-arounds of
     the same row's description. Lines with only col-3 content
     extend the moniteur reference (the ``du …`` publication date).
  6. Each row is written out with both ``act_date_raw`` /
     ``moniteur_date_raw`` (the verbatim string with all OCR
     artefacts) and a parsed ``act_date`` / ``moniteur_date`` if
     the date regex matches a recognisable form.

Usage::

    .venv/bin/python scripts/extract_chronologie_index_2001.py \
        --src ~/Downloads/Haiti\ -\ 2001\ -\ Chronological\ Index\ of\ Haitian\ Legislation\ (1804-2000)\ [French].pdf \
        --out backend/data/chronologie_2001.json

Read-only — no DB writes. The companion ``seed_chronologie_2001.py``
(Step 4) does the upserts.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path
from typing import Iterable, Optional

HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
sys.path.insert(0, str(BACKEND_ROOT))

import fitz  # PyMuPDF


# Column boundaries — derived from inspection of pages 30, 49, 100, 200.
COL1_MAX_X = 215
COL2_MAX_X = 290

RUNNING_HEADER_Y_MAX = 30
INDEX_RUNNING_HEADER = "INDEX CHRONOLOGIQUE DE LA LEGISLATION HAITIENNE"

# ---------------------------------------------------------------------------
# OCR repair
# ---------------------------------------------------------------------------

OCR_FIXES = [
    # ``N•`` / ``N"`` / ``N̈`` → ``N°``
    (re.compile(r"\bN[•\"’'¨̈]"), "N°"),
    # ``aoftt`` / ``aoftl`` / ``aoftt`` / ``aoO̧t`` / ``aotlt`` → ``août``
    (re.compile(r"\baoft+t\b", re.IGNORECASE), "août"),
    (re.compile(r"\baoftl\b", re.IGNORECASE), "août"),
    (re.compile(r"\bao[OQ0]̧?t\b"), "août"),
    # Numbered ``Il`` ≡ ``11`` when followed by a month
    (
        re.compile(
            r"\bIl(\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre))",
            re.IGNORECASE,
        ),
        r"11\1",
    ),
    # ``ter octobre`` / ``1 cr janvier`` → ``1er``
    (re.compile(r"\bter\b"), "1er"),
    (re.compile(r"\b1\s*cr\b"), "1er"),
    # Compound ``11juin1934`` → ``11 juin 1934``
    (
        re.compile(
            r"\b(\d{1,2})(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)(\d{4})\b",
            re.IGNORECASE,
        ),
        r"\1 \2 \3",
    ),
    # ``l 0`` / ``l 1`` / ``l 5`` → ``10/11/15`` (lowercase L mistaken
    # for digit ``1`` then split by an extraneous space).
    (re.compile(r"\bl\s+(\d)\b"), r"1\1"),
    # Collapse multi-spaces
    (re.compile(r"\s+"), " "),
]


def _ocr_clean(text: str) -> str:
    out = text
    for pattern, repl in OCR_FIXES:
        out = pattern.sub(repl, out)
    return out.strip()


# ---------------------------------------------------------------------------
# Date parsing
# ---------------------------------------------------------------------------

MONTHS = {
    "janvier": 1,
    "février": 2,
    "fevrier": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "août": 8,
    "aout": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "décembre": 12,
    "decembre": 12,
}

DATE_RE = re.compile(
    r"(?P<day>\d{1,2})(?:er)?\s+(?P<month>"
    + "|".join(sorted(MONTHS.keys(), key=len, reverse=True))
    + r")\s+(?P<year>\d{4})",
    re.IGNORECASE,
)


def _parse_date(raw: str) -> Optional[date]:
    if not raw:
        return None
    cleaned = _ocr_clean(raw)
    m = DATE_RE.search(cleaned)
    if not m:
        return None
    try:
        return date(
            int(m.group("year")),
            MONTHS[m.group("month").lower()],
            int(m.group("day")),
        )
    except (ValueError, KeyError):
        return None


# ---------------------------------------------------------------------------
# Moniteur ref parsing
# ---------------------------------------------------------------------------

MONITEUR_RE = re.compile(
    r"MONITEUR\s+N°?\s*(?:spécial\s+)?(?P<num>[\dA-Z\-°/spécial ]+?)"
    r"(?:\s*du\s+(?P<pub>.+))?$",
    re.IGNORECASE | re.DOTALL,
)
MONITEUR_NUMBER_RE = re.compile(r"\b(?:spécial\s+)?([\dA-Z\-]+)\b", re.IGNORECASE)


def _parse_moniteur(raw: str) -> tuple[Optional[str], Optional[str], Optional[date]]:
    """Return (number, publication_date_raw, publication_date)."""
    cleaned = _ocr_clean(raw)
    if "moniteur" not in cleaned.lower():
        return None, None, None
    # Split "MONITEUR N° XX [du <date>]"
    m = MONITEUR_RE.search(cleaned)
    if not m:
        return None, None, None
    number_blob = (m.group("num") or "").strip(" .,")
    num_match = MONITEUR_NUMBER_RE.search(number_blob)
    number = num_match.group(1) if num_match else number_blob or None
    if "spécial" in number_blob.lower() and number:
        number = f"Spécial {number}"
    pub_raw = (m.group("pub") or "").strip()
    pub_date = _parse_date(pub_raw) if pub_raw else None
    return number, pub_raw or None, pub_date


# ---------------------------------------------------------------------------
# Page-level parsing
# ---------------------------------------------------------------------------


def _group_into_lines(words: list[tuple]) -> list[list[tuple]]:
    """Cluster (x0,y0,x1,y1,word,…) tuples into lines by y proximity."""
    sorted_words = sorted(words, key=lambda w: (round(w[1]), w[0]))
    lines: list[list[tuple]] = []
    cur: list[tuple] = []
    last_y: Optional[float] = None
    for w in sorted_words:
        y = w[1]
        if last_y is not None and abs(y - last_y) > 5:
            if cur:
                lines.append(cur)
            cur = []
        cur.append(w)
        last_y = y
    if cur:
        lines.append(cur)
    return lines


def _columns_for_line(line: list[tuple]) -> tuple[str, str, str]:
    c1, c2, c3 = [], [], []
    for x0, _y0, _x1, _y1, w, *_rest in line:
        if x0 < COL1_MAX_X:
            c1.append(w)
        elif x0 < COL2_MAX_X:
            c2.append(w)
        else:
            c3.append(w)
    return " ".join(c1), " ".join(c2), " ".join(c3)


# Canonical section labels. The source PDF's running headers come
# through with OCR damage (``PUBUC`` instead of ``PUBLIC``,
# ``HAIDEN`` for ``HAITIEN``, dropped spaces) — we collapse all
# variants to these forms so the editorial UI can group cleanly.
# Substring-match against canonical section titles. The source
# running header is OCR'd inconsistently (``PUBUC`` for ``PUBLIC``,
# ``HAITIEN`` / ``HAIDEN`` / ``HAJTIEN`` / ``HAITTEN``, missing
# spaces in ``DUDROnPUBUCHAITIEN``). We strip the header to lowercase
# letters only and check for short stable signature substrings —
# those are unique enough to map every variant to one bucket.
CANONICAL_SECTIONS: list[tuple[tuple[str, ...], str]] = [
    (("internat",), "DU DROIT INTERNATIONAL PUBLIC"),
    (
        (
            "publichait",
            "pubuchait",
            "pubuchaiden",
            "publichaiden",
            "publichajtien",
            "publichaiten",
            "publichaitten",
        ),
        "DU DROIT PUBLIC HAÏTIEN",
    ),
    (("penal", "pénal"), "DROIT PÉNAL"),
    (("prive", "privé", "priye"), "DU DROIT PRIVÉ"),
    (("caractere", "caracteres"), "LÉGISLATION À CARACTÈRES DIVERS"),
]


def _ascii_letters_only(s: str) -> str:
    """Strip ``s`` to lowercase ASCII letters — used to match OCR variants."""
    import unicodedata

    normalised = unicodedata.normalize("NFKD", s)
    return "".join(c.lower() for c in normalised if c.isalpha() and ord(c) < 128)


def _normalise_section(text: str) -> Optional[str]:
    compact = re.sub(r"\s+", " ", text).strip(" :")
    if not compact:
        return None
    if compact.upper().startswith("INDEX CHRONOLOGIQUE"):
        return None
    signature = _ascii_letters_only(compact)
    for needles, canonical in CANONICAL_SECTIONS:
        if any(n in signature for n in needles):
            return canonical
    return compact  # unknown variant — keep verbatim so we can spot it


def _page_section(page: fitz.Page) -> Optional[str]:
    """Return the running-header section name, or ``None`` for non-content pages."""
    header_words = [
        w for w in page.get_text("words") if w[1] < RUNNING_HEADER_Y_MAX
    ]
    if not header_words:
        return None
    text = " ".join(w[4] for w in sorted(header_words, key=lambda w: (round(w[1]), w[0])))
    text = _ocr_clean(text)
    return _normalise_section(text)


# Inline ``SECTION I : DES INSTRUMENTS A CARACTERE UNIVERSEL``-style
# divider. The roman numeral is the discriminator; everything after
# the colon is the section name.
SECTION_HEADER_RE = re.compile(
    r"^\s*SECTION\s+(I{1,3}|IV|V|VI{0,3}|VIII?|IX|X)\s*[:.]\s*(.+?)\s*$",
    re.IGNORECASE,
)

# Column header lines that follow a SECTION divider — they're not
# rows of data. The middle and right columns are ``DATES`` and
# ``REFERENCES`` so spotting either is enough.
COLUMN_HEADER_RE = re.compile(
    r"\b(DATES|REFERENCES|RÉFÉRENCES)\b", re.IGNORECASE
)


def parse_page(
    page: fitz.Page,
    page_no: int,
    chapter: Optional[str],
    inherited_section: Optional[str],
) -> tuple[list[dict], Optional[str]]:
    """Parse one page. Returns ``(rows, last_section_seen)``.

    ``chapter`` is the running header at the top of the page (or
    inherited from the previous page when this page only carries
    the generic ``INDEX CHRONOLOGIQUE …`` header).

    ``inherited_section`` is the most recent inline ``SECTION I/II
    /III : …`` divider seen on a previous page. It applies to every
    row on this page UNLESS a new SECTION divider appears here, in
    which case it switches mid-page.

    A SECTION divider can span two lines in the source PDF — e.g.::

        SECTION I : DES INSTRUMENTS A CARACTERE
        UNIVERSEL

    We join short trailing lines (≤ 30 chars, no date pattern) to
    the SECTION header so the captured value reads ``SECTION I : DES
    INSTRUMENTS A CARACTERE UNIVERSEL``.
    """
    if chapter is None and page_no < 25:
        return [], inherited_section

    words = page.get_text("words")
    body_words = [w for w in words if w[1] >= RUNNING_HEADER_Y_MAX]
    lines = _group_into_lines(body_words)

    rows: list[dict] = []
    cur: Optional[dict] = None
    current_section = inherited_section

    line_idx = 0
    while line_idx < len(lines):
        line = lines[line_idx]
        full_text = _ocr_clean(" ".join(w[4] for w in line))

        # Inline SECTION divider?
        m = SECTION_HEADER_RE.match(full_text)
        if m:
            section_label = f"SECTION {m.group(1).upper()} : {m.group(2)}".strip()
            # Continuation: peek up to 3 following lines. Join each one
            # that looks like more of the section title (predominantly
            # uppercase, no date, no Moniteur ref, no column-header
            # word, not a new SECTION header). Stop at the first
            # non-continuation line so the column-1 header
            # (``GRANDS INSTRUMENTS INTERNA- DATES REFERENCES``) and
            # its orphan continuation ``TIONAUX`` don't bleed in.
            consumed = 0
            for peek in range(1, 4):
                nxt_idx = line_idx + peek
                if nxt_idx >= len(lines):
                    break
                nxt = _ocr_clean(" ".join(w[4] for w in lines[nxt_idx]))
                if not nxt:
                    break
                letters = [c for c in nxt if c.isalpha()]
                uppercase_ratio = (
                    sum(1 for c in letters if c.isupper()) / max(1, len(letters))
                )
                looks_like_title = uppercase_ratio >= 0.7
                if (
                    looks_like_title
                    and not DATE_RE.search(nxt)
                    and not COLUMN_HEADER_RE.search(nxt)
                    and not SECTION_HEADER_RE.match(nxt)
                ):
                    section_label = f"{section_label} {nxt}".strip()
                    consumed += 1
                else:
                    break
            current_section = section_label
            line_idx += consumed
            # Flush any open row before the new section
            if cur is not None:
                rows.append(cur)
                cur = None
            line_idx += 1
            continue

        # Column-header line (``DATES   REFERENCES``)? Skip — but
        # also skip a 1-2 line block of text immediately preceding
        # ``DATES`` (it's the col-1 column header like ``GRANDS
        # INSTRUMENTS INTERNATIONAUX``).
        if COLUMN_HEADER_RE.search(full_text) and not DATE_RE.search(full_text):
            line_idx += 1
            continue

        c1, c2, c3 = _columns_for_line(line)
        c1 = _ocr_clean(c1)
        c2 = _ocr_clean(c2)
        c3 = _ocr_clean(c3)
        has_date = bool(c2 and DATE_RE.search(c2))
        if has_date:
            if cur is not None:
                rows.append(cur)
            cur = {
                "source_page": page_no,
                "chapter": chapter,
                "section": current_section,
                "description_fr": c1,
                "act_date_raw": c2,
                "moniteur_ref_raw": c3,
            }
        else:
            if cur is None:
                line_idx += 1
                continue
            if c1:
                cur["description_fr"] = (cur["description_fr"] + " " + c1).strip()
            if c3:
                cur["moniteur_ref_raw"] = (cur["moniteur_ref_raw"] + " " + c3).strip()
        line_idx += 1
    if cur is not None:
        rows.append(cur)
    return rows, current_section


def parse_pdf(pdf_path: Path, max_pages: Optional[int] = None) -> Iterable[dict]:
    doc = fitz.open(str(pdf_path))
    total = doc.page_count if max_pages is None else min(doc.page_count, max_pages)
    display_order = 0
    last_chapter: Optional[str] = None
    last_section: Optional[str] = None
    for page_no in range(total):
        page = doc[page_no]
        # Chapter = the running-header at the top of the page. Pages
        # whose header is the generic ``INDEX CHRONOLOGIQUE …``
        # inherit the previous page's chapter.
        page_chapter = _page_section(page)
        if page_chapter is not None:
            last_chapter = page_chapter
        rows, last_section = parse_page(
            page, page_no + 1, last_chapter, last_section
        )
        for row in rows:
            row["display_order"] = display_order
            display_order += 1
            row["description_fr"] = _ocr_clean(row["description_fr"])
            row["act_date"] = _parse_date(row["act_date_raw"])
            mn, mpr, mpd = _parse_moniteur(row["moniteur_ref_raw"])
            row["moniteur_number"] = mn
            row["moniteur_date_raw"] = mpr
            row["moniteur_date"] = mpd
            row["moniteur_year"] = (
                mpd.year if mpd else (row["act_date"].year if row["act_date"] else None)
            )
            for k in ("act_date", "moniteur_date"):
                v = row.get(k)
                row[k] = v.isoformat() if v else None
            yield row


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--src",
        type=Path,
        default=Path.home()
        / "Downloads"
        / "Haiti - 2001 - Chronological Index of Haitian Legislation (1804-2000) [French].pdf",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=BACKEND_ROOT / "data" / "chronologie_2001.json",
    )
    ap.add_argument("--max-pages", type=int, default=None)
    args = ap.parse_args()

    if not args.src.exists():
        ap.error(f"source PDF does not exist: {args.src}")

    rows = list(parse_pdf(args.src, max_pages=args.max_pages))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w") as fh:
        json.dump(rows, fh, ensure_ascii=False, indent=2)

    # Report
    sections = sorted({r["section"] for r in rows if r["section"]})
    with_dates = sum(1 for r in rows if r["act_date"])
    with_moniteur = sum(1 for r in rows if r["moniteur_number"])
    print(f"wrote {args.out} ({len(rows)} rows)")
    print(f"  sections covered: {len(sections)}")
    print(f"  rows with parsed act_date:     {with_dates}/{len(rows)}")
    print(f"  rows with parsed moniteur ref: {with_moniteur}/{len(rows)}")


if __name__ == "__main__":
    main()
