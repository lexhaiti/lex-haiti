"""Backfill ``MoniteurEntry`` rows for every ``Inbox laws-2026``
Moniteur issue so their sommaire isn't empty in /editorial/moniteur.

Direct DB insertion. Bypasses the regular Moniteur ingestion pipeline
(``MoniteurRepository.run_pipeline`` + per-doctype parsers) — those
exist to produce *structured* candidates (multiple entries per
issue, with detected articles & signers); here we just want each
issue to carry at least one well-extracted, well-normalised entry
so the editor can read it inline. Editors can re-trigger the full
pipeline from the UI to split into per-act candidates later.

What "clean extraction" means here

  1. **Text layer first.** ``fitz`` (PyMuPDF) gives us reading-order
     text per page, no OCR cost. Most Moniteur PDFs have a real
     text layer (modern issues), so this is fast and accurate.
  2. **OCR fallback only when sparse.** If the text layer returns
     fewer than ~200 cleaned characters per page on average (the
     legacy scanned issues), we fall back to ``extract_text_from
     _pdf`` which runs Tesseract via the existing ingestion module.
  3. **Page cap of 50.** A single Moniteur issue is rarely longer
     than 40 pages; the 73 MB ``Petrocaribe-compilation`` blob is
     a multi-issue archive and shouldn't drag a sommaire-backfill
     into a 30-minute OCR job. Editors handle long blobs case-by-
     case from the UI.
  4. **Aggressive normalisation.** De-hyphenate line breaks
     (``corn-\\nmerce → commerce``), fix the standard OCR
     artefacts (``N• → N°``, ``aoftt → août``, ``Il <month> → 11
     <month>``, ``l 0 → 10``, ``ter → 1er``), strip Moniteur
     masthead boilerplate that repeats on every page, collapse
     run-on whitespace, normalise paragraph breaks to ``\\n\\n``.

What goes into the entry

  ``position``           = 0  (single entry per issue for now)
  ``detected_category``  = parsed from the Inbox- prefix
                           (``Inbox-decret-…`` → ``decret``)
  ``detected_title`` / ``display_title`` = de-slugged form of the
                           Inbox number's tail
  ``detected_date``      = issue.publication_date
  ``raw_text``           = the cleaned extracted text
  ``page_from`` / ``page_to`` = 1 / page_count
  ``review_status``      = ``pending``  (editor reviews → accepts
                           or splits → promotes to a LegalText)

Idempotent. Second run reports ``inserted=0, already-had-entries=N``.

Usage::

    .venv/bin/python scripts/backfill_inbox_moniteur_entries.py
"""
from __future__ import annotations

import re
import sys
from decimal import Decimal
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
sys.path.insert(0, str(BACKEND_ROOT))

import fitz  # noqa: E402 — PyMuPDF
from sqlalchemy import func, select  # noqa: E402

from api.db import SessionLocal  # noqa: E402
from schemas.enums import (  # noqa: E402
    MoniteurCandidateStatus,
    MoniteurDocumentType,
)
from services.corpus.models import (  # noqa: E402
    MoniteurEntry,
    MoniteurIssue,
)
from services.ingestion.ocr import extract_text_from_pdf  # noqa: E402


EDITION = "Inbox laws-2026"
MAX_PAGES = 50
OCR_FALLBACK_THRESHOLD = 200  # avg chars per page below this → re-OCR


# ---------------------------------------------------------------------------
# Doc-type / title resolution from the Inbox-<…> issue number
# ---------------------------------------------------------------------------

# Order matters — longer / more specific prefixes first so
# ``decret electoral`` wins over ``decret``.
DOCTYPE_PREFIXES: list[tuple[str, MoniteurDocumentType]] = [
    ("decret electoral", MoniteurDocumentType.decret),
    ("decret", MoniteurDocumentType.decret),
    ("décret", MoniteurDocumentType.decret),
    ("arrete", MoniteurDocumentType.arrete),
    ("arrêté", MoniteurDocumentType.arrete),
    ("loi", MoniteurDocumentType.loi),
    ("accord", MoniteurDocumentType.convention),
    ("convention", MoniteurDocumentType.convention),
    # ``avis`` exists in LegalCategory but not in MoniteurDocumentType —
    # the Moniteur enum tracks gazette-level types only, so it falls
    # through to ``autre`` until a real Moniteur avis entry comes up.
    ("avis", MoniteurDocumentType.autre),
    ("communique", MoniteurDocumentType.communique),
    ("circulaire", MoniteurDocumentType.circulaire),
    ("reglement", MoniteurDocumentType.autre),
    ("règlement", MoniteurDocumentType.autre),
    ("compilations", MoniteurDocumentType.autre),
]


def doctype_from_number(number: str) -> tuple[MoniteurDocumentType, str]:
    """``Inbox-<doctype>-<title-slug>`` → (DocType enum, title-slug)."""
    if not number.startswith("Inbox-"):
        return MoniteurDocumentType.autre, number
    rest = number[len("Inbox-"):]
    for hint, dt in DOCTYPE_PREFIXES:
        if rest.lower().startswith(hint):
            tail = rest[len(hint):].lstrip("-").strip()
            return dt, tail
    return MoniteurDocumentType.autre, rest


def display_title_from_number(number: str) -> str:
    dt, tail = doctype_from_number(number)
    if not tail:
        return number
    words = [w for w in tail.replace("-", " ").split() if w]
    if not words:
        return number
    # Capitalize the first word only; preserve casing on the rest
    # so abbreviations like APN / MENJS / CEP survive.
    words[0] = words[0].capitalize()
    return " ".join(words)


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------

OCR_FIXES: list[tuple[re.Pattern[str], str]] = [
    # Hyphenated line breaks (``com-\nmerce`` → ``commerce``). Must
    # run BEFORE we collapse newlines.
    (re.compile(r"(\w)-\n(\w)"), r"\1\2"),
    # ``N•`` / ``N"`` / ``N̈`` → ``N°``
    (re.compile(r"\bN[•”“\"`’'¨̈]"), "N°"),
    # ``aoftt`` / ``aoftl`` / ``aoO̧t`` → ``août``
    (re.compile(r"\baoft+t\b", re.IGNORECASE), "août"),
    (re.compile(r"\baoftl\b", re.IGNORECASE), "août"),
    (re.compile(r"\bao[OQ0]̧?t\b"), "août"),
    # ``Il <month>`` → ``11 <month>`` (lowercase L mistaken for 1)
    (
        re.compile(
            r"\bIl(\s+(?:janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre))",
            re.IGNORECASE,
        ),
        r"11\1",
    ),
    # ``l 0 <month>`` → ``10 <month>``
    (
        re.compile(
            r"\bl\s+0(\s+(?:janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre))",
            re.IGNORECASE,
        ),
        r"10\1",
    ),
    # ``ter`` → ``1er`` (when preceded by a space)
    (re.compile(r"(?<=\s)ter(?=\s+(?:janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre))", re.IGNORECASE), "1er"),
    # Compound ``11juin1934`` → ``11 juin 1934``
    (
        re.compile(
            r"\b(\d{1,2})(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)(\d{4})\b",
            re.IGNORECASE,
        ),
        r"\1 \2 \3",
    ),
    # Curly quotes → straight (looks better in plain-text raw_text)
    (re.compile(r"[“”«»]"), '"'),
    (re.compile(r"[‘’]"), "'"),
    # Tabs → space
    (re.compile(r"[\t\f\v]+"), " "),
    # Trim trailing spaces on each line
    (re.compile(r" +\n"), "\n"),
    # Collapse 3+ blank lines to 2
    (re.compile(r"\n{3,}"), "\n\n"),
    # Collapse multi-spaces (after all the substitutions are done)
    (re.compile(r" {2,}"), " "),
]


# Boilerplate lines that repeat on every page of Le Moniteur.
# Substring match (case-insensitive) — when the needle appears
# anywhere on the line, the whole line is dropped.
MASTHEAD_NEEDLES = [
    "JOURNAL OFFICIEL DE LA REPUBLIQUE D'HAITI",
    "JOURNAL OFFICIEL DE LA RÉPUBLIQUE D'HAÏTI",
    "Paraissant du Lundi au Vendredi",
    "Directeur Général",
    "Directrice Générale",
    "Ronald Saint Jean",
    "LIBERTÉ ÉGALITÉ FRATERNITÉ",
    "LIBERTE EGALITE FRATERNITE",
    "RÉPUBLIQUE D'HAÏTI",
    "REPUBLIQUE D'HAITI",
    "Numéro Spécial",
    "NUMÉRO SPÉCIAL",
    "NUMERO SPECIAL",
    "PORT-AU-PRINCE",
    "PORT-AU.PRINCE",
    "<< LE MONITEUR >>",
    "« LE MONITEUR »",
]

# Whole-line equality — lines that are ONLY one of these tokens are
# dropped (typically each one of LIBERTÉ / ÉGALITÉ / FRATERNITÉ is
# rasterised onto its own line by the masthead).
MASTHEAD_EXACT = {
    "LIBERTÉ",
    "EGALITE",
    "ÉGALITÉ",
    "FRATERNITÉ",
    "FRATERNITE",
    "Paraissant",
    "du Lundi au Vendredi",
    "SOMMAIRE",
    "DECRET",
    "DÉCRET",
    "LOI",
    "ARRETE",
    "ARRÊTÉ",
}

# ``175e Année - Spécial N° 4`` style line — apostrophe + ``e`` /
# ``è`` / ``'`` all valid in OCR.
YEAR_LINE_RE = re.compile(
    r"^\d{2,3}\s*[eè'`’]?\s+ann[eé]e\b", re.IGNORECASE
)


_WORD_RE = re.compile(r"[A-Za-zÀ-ÿ]{4,}")
_PUNCT_NOISE = set(",.~|\\/`'*°<>«»")


def _is_low_signal(stripped: str) -> bool:
    """Drop lines that are clearly OCR noise. Three guards:

      1. Very short (≤ 2 chars) — orphan punctuation.
      2. Less than 30 % alphabetic — ``~``, ``-~``, ``ee 7``, …
      3. No four-or-more-letter pure-alpha word AND a heavy
         punctuation ratio — catches garbled masthead lines like
         ``, ~. ~t4or1tl`` and ``,lij,,trlql N° 4 • /,1.111dl J``
         where the OCR'd characters look word-like but assemble
         no readable tokens.
    """
    if len(stripped) <= 2:
        return True
    alpha = sum(1 for c in stripped if c.isalpha())
    if alpha / len(stripped) < 0.30:
        return True
    if not _WORD_RE.search(stripped):
        return True
    punct = sum(1 for c in stripped if c in _PUNCT_NOISE)
    if punct >= 4 and punct >= alpha // 3:
        return True
    return False


def _strip_masthead(text: str) -> str:
    lines = text.splitlines()
    keep: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            keep.append(line)
            continue
        if stripped in MASTHEAD_EXACT:
            continue
        lo = stripped.lower()
        if any(needle.lower() in lo for needle in MASTHEAD_NEEDLES):
            continue
        # Bare page-number lines (just digits, ≤ 3 chars)
        if stripped.isdigit() and len(stripped) <= 3:
            continue
        if YEAR_LINE_RE.match(stripped):
            continue
        if _is_low_signal(stripped):
            continue
        keep.append(line)
    return "\n".join(keep)


def normalise(text: str) -> str:
    out = _strip_masthead(text)
    for pat, repl in OCR_FIXES:
        out = pat.sub(repl, out)
    return out.strip()


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------


def _text_layer(pdf_path: str, max_pages: int) -> tuple[list[str], int]:
    pages: list[str] = []
    with fitz.open(pdf_path) as doc:
        page_count = doc.page_count
        n = min(page_count, max_pages)
        for i in range(n):
            try:
                pages.append(doc[i].get_text("text") or "")
            except Exception:  # noqa: BLE001
                pages.append("")
    return pages, page_count


def extract_clean_text(pdf_path: str) -> tuple[str, int, str]:
    """Returns (cleaned_text, page_count, source).

    ``source`` is ``text-layer`` or ``ocr`` depending on which path
    produced the result. ``page_count`` is the PDF's full page count
    even when we only extracted the first ``MAX_PAGES``.
    """
    pages, page_count = _text_layer(pdf_path, MAX_PAGES)
    raw = "\n\n".join(pages)
    cleaned = normalise(raw)
    avg = len(cleaned) // max(1, len(pages))
    if avg >= OCR_FALLBACK_THRESHOLD:
        return cleaned, page_count, "text-layer"

    # Sparse text layer → fall back to Tesseract via the existing
    # extraction module.
    try:
        ocr_pages = extract_text_from_pdf(pdf_path, max_pages=MAX_PAGES) or []
    except Exception:  # noqa: BLE001
        ocr_pages = []
    raw_ocr = "\n\n".join(ocr_pages)
    cleaned_ocr = normalise(raw_ocr)
    if len(cleaned_ocr) > len(cleaned):
        return cleaned_ocr, page_count, "ocr"
    return cleaned, page_count, "text-layer-only"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    inserted = 0
    skipped_have_entries = 0
    skipped_no_file = 0
    failed: list[tuple[int, str]] = []

    with SessionLocal() as session:
        issues = session.scalars(
            select(MoniteurIssue).where(MoniteurIssue.edition_label == EDITION).order_by(
                MoniteurIssue.year.desc(), MoniteurIssue.id
            )
        ).all()

        for issue in issues:
            existing = (
                session.scalar(
                    select(func.count())
                    .select_from(MoniteurEntry)
                    .where(MoniteurEntry.issue_id == issue.id)
                )
                or 0
            )
            if existing > 0:
                skipped_have_entries += 1
                continue

            if not issue.file_url:
                skipped_no_file += 1
                continue

            pdf_path = Path(issue.file_url)
            if not pdf_path.exists():
                failed.append((issue.id, f"file_url not on disk: {pdf_path}"))
                continue

            try:
                text, page_count, source = extract_clean_text(str(pdf_path))
            except Exception as exc:  # noqa: BLE001
                failed.append((issue.id, f"extract failed: {exc}"))
                continue

            if not text:
                failed.append((issue.id, "no text extracted"))
                continue

            doctype, _ = doctype_from_number(issue.number)
            title = display_title_from_number(issue.number)

            # Truncate raw_text at 300 KB to keep DB rows manageable.
            # The Petrocaribe compilation alone produces several MB
            # of OCR text — that's not editor-readable inline anyway,
            # and the full PDF is one click away via the scan
            # endpoint.
            if len(text) > 300_000:
                text = text[:300_000] + "\n\n[... text truncated for sommaire view; download the original scan for the full content ...]"

            entry = MoniteurEntry(
                issue_id=issue.id,
                position=0,
                detected_category=doctype,
                detected_title=title,
                display_title=title,
                detected_date=issue.publication_date,
                raw_text=text,
                page_from=1,
                page_to=page_count,
                review_status=MoniteurCandidateStatus.pending,
                confidence=Decimal("0.50"),  # heuristic — editor revises
            )
            session.add(entry)
            # Update the issue's page_count if we discovered one
            if not issue.page_count:
                issue.page_count = page_count

            try:
                session.commit()
                inserted += 1
                print(
                    f"  + #{issue.id:>3} {issue.year}/{issue.number[:38]:<38} "
                    f"→ {len(text):>6} chars via {source}"
                )
            except Exception as exc:  # noqa: BLE001
                session.rollback()
                failed.append((issue.id, f"commit: {exc}"))

    print(
        f"\nDone: inserted={inserted}, "
        f"already-had-entries={skipped_have_entries}, "
        f"no-file-url={skipped_no_file}, "
        f"failed={len(failed)}"
    )
    if failed:
        for iid, reason in failed:
            print(f"  ! #{iid}: {reason}")


if __name__ == "__main__":
    main()
