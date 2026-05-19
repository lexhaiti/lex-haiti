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
# anywhere on the line, the whole line is dropped. OCR variants
# (``JOURNAL`` → ``JQURNAL``, ``REPUBLIQUE`` → ``REPUBLlQUE``,
# ``PORT-AU-PRINCE`` → ``PORT-AD-PRINCE``) are listed separately so
# we catch the legacy scans too.
MASTHEAD_NEEDLES = [
    # Journal masthead — shortened so OCR variants of the trailing
    # ``D'HAITI`` (``U'HAIT!``, ``D'HAÏ'I``…) don't break the match.
    "JOURNAL OFFICIEL",
    "JQURNAL OFFICIEL",                    # OCR variant
    "JOUl(NAI",                            # OCR variant
    "JOURNAL OffICIEL",                    # OCR variant
    # Frequency line
    "Paraissant du Lundi au Vendredi",
    "araissant du Lundi",
    "araissant",                            # short — catches ``Pm'aissnat``, ``Pwtusstulf``, ``araissant Directeur``
    "Paraissant Directeur",
    "Paraissant DIRECTEUR",
    "du Lundi au Vendredi",
    "Lundi et le Jeudi",
    "Lundi et te Jeudi",                   # OCR variant
    "Lundi et Le Jeudi",
    "lundi et le jeudi",
    # Director role + names
    "Directeur Général",
    "Directrice Générale",
    "DIRECTEUR GENERAL",
    "DIRECTEUR GÉNÉRAL",
    "DIRECTRICE GÉNÉRALE",
    "DIRE(TI'EUR",                          # OCR variant
    "DIRECTEUR GENERAI",                    # OCR variant
    "Direcfeur",                            # OCR variant
    "Direorem",                             # OCR variant
    # Devise
    "LIBERTÉ ÉGALITÉ FRATERNITÉ",
    "LIBERTE EGALITE FRATERNITE",
    "LIBERTÉ | ÉGALITÉ",
    "LIBERTÉ __ ÉGALITÉ",
    # Republic header
    "RÉPUBLIQUE D'HAÏTI",
    "REPUBLIQUE D'HAITI",
    "REPUBLlQUE D'HAITI",                   # OCR variant
    "REPUBLIQUI",                           # OCR variant
    # Special edition
    "Numéro Spécial",
    "NUMÉRO SPÉCIAL",
    "NUMERO SPECIAL",
    "Numéro Extraordinaire",
    "NUMERO EXTRAORDINAIRE",
    "N uméro Extraordinaire",
    # City line
    "PORT-AU-PRINCE",
    "PORT-AU.PRINCE",
    "PORT-AD-PRINCE",                       # OCR variant
    "PORT -AU .PRINCE",                     # OCR variant
    # Page-footer ("LE MONITEUR" chevron-marker)
    "<< LE MONITEUR >>",
    "« LE MONITEUR »",
    # Press footer (every issue carries this)
    "Presses Nationales d'Haiti",
    "Presses Nationales d'Haïti",
    "Hammerton Killick",
    "ISSN 1683",
    "Dépôt Légal",
    "Dép6t Légal",                          # OCR variant
    "Depot Légal",
    "Bibliothèque Nationale d'Haïti",
    "Bibliothèque Nationale d'Haiti",
    "Bibliothèque Nationaled",              # OCR variant
    "pressesnationales",
    "pndh-moniteur@",
    "lemoniteur@",
    "presses_nationales",
    "PRESSES",
    "Site Web",
    "www.pressesnational",
    # Phone / Tirage
    "Tél.:",
    "Tél:",
    "Tel.:",
    "Tel:",
    "Tirage:",
    "Tirage :",
    "exemplaires",
    "EXEMPLAIRES",
    # Misc OCR scraps
    "AN XX",                                # ``AN XXIème. DE LA REVOLUTION``
    "AN XXI",
    "DE LA REVOLUTION",
]

# Whole-line equality — lines that are ONLY one of these tokens are
# dropped (typically each of LIBERTÉ / ÉGALITÉ / FRATERNITÉ is on
# its own line, ``Directeur`` heads the director-name line, etc.).
# Whole-line matching means real-body uses of ``directeur`` aren't
# clobbered — only the bare masthead label gets dropped.
MASTHEAD_EXACT = {
    "LIBERTÉ",
    "EGALITE",
    "ÉGALITÉ",
    "FRATERNITÉ",
    "FRATERNITE",
    "Paraissant",
    "Paraissant .",
    "x Paraissant",
    "Directeur",
    "Directrice",
    "DIRECTEUR",
    "DIRECTRICE",
    "du Lundi au Vendredi",
    "Lundi 11 Mai 2020",        # repeats inside the bail-prof issue
    "Lundi au Vendredi",
    "Le Lundi au Vendredi",
    "SOMMAIRE",
    "Sommaire",
    "SOMMAIRE _",
    "DECRET",
    "DÉCRET",
    "DECRETS",
    "DÉCRETS",
    "LOI",
    "LOIS",
    "ARRETE",
    "ARRÊTÉ",
    "ARRETES",
    "ARRÊTÉS",
    "CORPS LÉGISLATIF",
    "ACCORD",
    "AVIS",
    # Empirical OCR-garbage strings observed in the laws-folder
    # scans — heavily-damaged masthead rasters that get OCR'd into
    # near-words my regex guards can't catch.
    "Pwtusstulf",
    "Pm'aissnat",
    "PAVED Inf sale",
    "DÊCllE1",
    "DÉCIŒr",
    "I~cret",
    "De'cret",
    "Le Lurid e l k Jtrudi",
    "x Paraissant JOURNAL OFFICIEL DE LA REPUBLIQUE U'HAIT! Directeur",
    "PAVED",
    "Inf sale",
    "IJlrtAJt~r 00-lb'IJ",
    "IJlrtAJt~r",
}

# Known director / director-name lines that recur as masthead. The
# match is whole-line + uppercase-tolerant.
DIRECTOR_NAMES = {
    "ronald saint jean",
    "jiehmann d. mellon",
    "simon desvarieux",
    "henry robert marc-charles",
    "edgar jean",
    "emile jean-baptiste",
    "willems edouard",
    "fritzner beauzile",
    "hitler rodnez",
}

# ``175e Année - Spécial N° 4`` style line. The OCR scans flatten
# the ordinal suffix in many ways (``e``, ``è``, ``ème``, ``è me``,
# ``'``, ``°``, ``¢``, ``<Jè``, ``rY`` — really anything in [0-9]?
# + a small letter cluster + ``ann[eé]e``). The pattern is wide
# enough to catch them all while remaining anchored on ``année``.
YEAR_LINE_RE = re.compile(
    r"^\s*\d{1,4}\s*[a-zA-Z<>°¢'`’\"\-]{0,6}\s*ann[eé0-9]\w?\b",
    re.IGNORECASE,
)

# E-mail / URL / phone — pure-footer signal in our corpus.
EMAIL_LINE_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+")
URL_LINE_RE = re.compile(r"\bwww\.[a-zA-Z0-9.-]+")
PHONE_LINE_RE = re.compile(r"\(\d{2,4}\)\s*\d{2,4}[-\s]?\d{2,4}")

# An issue-number cover line like ``16<Jè Année No. 54``, ``161 ème
# Année - Spécial No. 2``, ``150eme Année No. 80`` — same idea as
# YEAR_LINE_RE but with the ``No.`` continuation.
ISSUE_NO_LINE_RE = re.compile(
    r"^\s*\d{1,4}.{0,6}\s*ann[eé]e\b.+\bno\.?\s*\d+",
    re.IGNORECASE,
)


_WORD_RE = re.compile(r"[A-Za-zÀ-ÿ]{4,}")
_PUNCT_NOISE = set(",.~|\\/`'*°<>«»()[]{}")
# ``I`` is treated as a vowel here even though uppercase ``I`` is
# frequently the OCR rendering of lowercase ``l``; that mis-classes
# some consonant clusters but the consonant-cluster guard below
# catches the worst offenders.
_VOWELS = set("aeiouyàâäéèêëîïôöùûüœæAEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜŒÆ")
# Real French rarely has 5+ consonants in a row. OCR garbage like
# ``lltll'IIINNlllll`` or ``BLNHKFR`` lights this up; we drop the
# line. The lowercase-only check keeps real proper nouns / Kreyòl
# (``Mpwen``, ``Strophe``) from being clobbered.
_CONSONANT_RUN_RE = re.compile(r"[bcdfghjklmnpqrstvwxz]{5,}", re.IGNORECASE)


def _is_low_signal(stripped: str) -> bool:
    """Drop lines that are clearly OCR noise. Four guards:

      1. Very short (≤ 2 chars) — orphan punctuation.
      2. Less than 30 % alphabetic — ``~``, ``-~``, ``ee 7``, …
      3. No four-or-more-letter pure-alpha word — catches all-
         punctuation lines and garbled mastheads.
      4. Vowel ratio < 15 % among the alpha chars — catches the
         consonant-cluster OCR garbage like ``lltll'IIINNlllll``,
         ``Pwtusstulf``, ``JOUl(NAI 1011111(-'1111``,
         ``DIRECT(TI'EUR``. Real French text always carries vowels
         at ≥ 30 % of its alpha chars.
      5. Heavy punctuation ratio (≥ 4 noise punct AND ≥ alpha/3) —
         catches ``, ~. ~t4or1tl`` and ``,lij,,trlql N° 4``.
    """
    if len(stripped) <= 2:
        return True
    alpha = sum(1 for c in stripped if c.isalpha())
    if alpha / len(stripped) < 0.30:
        return True
    if not _WORD_RE.search(stripped):
        return True
    if alpha >= 5:
        vowels = sum(1 for c in stripped if c in _VOWELS)
        if vowels / alpha < 0.17:
            return True
    # 5+ consonants in a row → likely OCR garbage.
    if _CONSONANT_RUN_RE.search(stripped):
        return True
    punct = sum(1 for c in stripped if c in _PUNCT_NOISE)
    if punct >= 4 and punct >= alpha // 3:
        return True
    return False


def _strip_masthead(text: str) -> str:
    lines = text.splitlines()
    keep: list[str] = []
    last_non_blank: str = ""
    for line in lines:
        stripped = line.strip()
        if not stripped:
            keep.append(line)
            continue
        # Collapse internal multi-spaces so the EXACT match catches
        # text-layer extractions that pad word gaps (``Le Lurid e l k
        #  Jtrudi`` ← two spaces between ``k`` and ``Jtrudi``).
        stripped = re.sub(r"\s+", " ", stripped)
        if stripped in MASTHEAD_EXACT:
            continue
        lo = stripped.lower()
        if lo in DIRECTOR_NAMES:
            continue
        if any(needle.lower() in lo for needle in MASTHEAD_NEEDLES):
            continue
        # Bare page-number lines (just digits, ≤ 3 chars)
        if stripped.isdigit() and len(stripped) <= 3:
            continue
        if YEAR_LINE_RE.match(stripped):
            continue
        if ISSUE_NO_LINE_RE.match(stripped):
            continue
        # E-mail / URL / phone — footer-only in our corpus.
        if EMAIL_LINE_RE.search(stripped) or URL_LINE_RE.search(stripped):
            continue
        if PHONE_LINE_RE.search(stripped):
            continue
        if _is_low_signal(stripped):
            continue
        # Dedup: drop a line that is byte-identical to the previous
        # non-blank line (the cover page repeats document titles).
        if stripped == last_non_blank:
            continue
        keep.append(line)
        last_non_blank = stripped
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
