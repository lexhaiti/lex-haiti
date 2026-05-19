"""Survey a folder of raw legal PDFs against what we already have in DB.

Read-only. Emits a Markdown report next to the source folder so the
team can mark which files are already ingested vs. genuinely new
before running the heavier ``ingest_laws_folder.py`` (Step 6) on
the same input.

For each file in ``--src`` (default ``~/Downloads/laws``):

  * pulls the first ``--probe-pages`` pages via
    ``services.ingestion.ocr.extract_text_from_pdf`` (text layer
    first, falls back to Tesseract OCR for scanned-only files).
  * guesses the document type, the act date, and a cleaned-up
    title from the filename + first page of text.
  * cross-references ``legal_texts`` and ``moniteur_issues`` in
    the local DB to flag likely duplicates so the next step skips
    them.

Usage::

    .venv/bin/python scripts/survey_laws_folder.py
    .venv/bin/python scripts/survey_laws_folder.py --src ~/Downloads/laws --out /tmp/laws_survey.md
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Optional

HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from api.db import SessionLocal  # noqa: E402
from schemas.enums import LegalCategory  # noqa: E402
from services.corpus.models import LegalText, MoniteurIssue  # noqa: E402
from services.ingestion.ocr import extract_text_from_pdf  # noqa: E402


# French + Kreyòl month names → integer. Both accent-on and accent-off
# variants because OCR strips diacritics inconsistently.
MONTHS_FR: dict[str, int] = {
    "janvier": 1,
    "fevrier": 2,
    "février": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "aout": 8,
    "août": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "decembre": 12,
    "décembre": 12,
}

DOC_TYPE_HINTS: list[tuple[str, Optional[LegalCategory]]] = [
    ("constitution", LegalCategory.constitution),
    ("decret electoral", LegalCategory.decret),
    ("décret électoral", LegalCategory.decret),
    ("decret", LegalCategory.decret),
    ("décret", LegalCategory.decret),
    ("arrete", LegalCategory.arrete),
    ("arrêté", LegalCategory.arrete),
    # ``loi`` matches inside ``Moniteur`` too, so keep it after the
    # more specific hints.
    ("ordonnance", LegalCategory.ordonnance),
    ("avis", LegalCategory.avis),
    ("communique", LegalCategory.communique),
    ("communiqué", LegalCategory.communique),
    ("circulaire", LegalCategory.circulaire),
    ("concordat", LegalCategory.convention),
    ("accord", LegalCategory.convention),
    ("convention", LegalCategory.convention),
    ("loi", LegalCategory.loi),
    ("reglement", LegalCategory.other_regulatory),
    ("règlement", LegalCategory.other_regulatory),
]


def _normalise(s: str) -> str:
    """Strip diacritics & non-alphanum so filename + text use a common key."""
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def guess_doc_type(filename: str, text: str) -> tuple[Optional[str], Optional[LegalCategory]]:
    """Doc-type detection. Filename wins by a wide margin — body text
    is full of citations to older instruments (``Vu la Constitution
    …``, ``Vu la Loi du …``) that bait the detector. Only fall back
    to text when the filename is opaque (``54785cac4.pdf``)."""
    fn_norm = _normalise(filename)
    for hint, category in DOC_TYPE_HINTS:
        if _normalise(hint) in fn_norm:
            return hint, category
    # Filename was useless. Try the first ~300 chars of body text
    # (just the cover page header — past that we hit the visas).
    head = _normalise(text[:300])
    for hint, category in DOC_TYPE_HINTS:
        if _normalise(hint) in head:
            return hint, category
    return None, None


_DATE_RE = re.compile(
    r"\b(\d{1,2})[\s\-_./]+("
    + "|".join(sorted(MONTHS_FR.keys(), key=len, reverse=True))
    + r")[\s\-_./]+(\d{4})\b",
    re.IGNORECASE,
)


def _scan_dates(blob: str) -> list[date]:
    """Yield all ``D MOIS YYYY`` matches from ``blob`` as ``date``s."""
    out: list[date] = []
    for m in _DATE_RE.finditer(blob):
        day = int(m.group(1))
        month_name = m.group(2).lower()
        month = MONTHS_FR.get(month_name)
        if month is None:
            month = MONTHS_FR.get(month_name.replace("é", "e").replace("û", "u"))
        year = int(m.group(3))
        if month and 1 <= day <= 31 and 1800 <= year <= 2099:
            try:
                out.append(date(year, month, day))
            except ValueError:
                pass
    return out


_YEAR_ONLY_RE = re.compile(r"\b(18\d{2}|19\d{2}|20\d{2})\b")


def guess_date(filename: str, text: str) -> Optional[date]:
    """Act-date detection. Filename almost always carries the date as
    a tail (``Decret-du-9-Avril-2020``, ``Loi-…-4-Octobre-2001``); body
    text is full of citations to older instruments so picking the
    earliest date in the body is actively wrong. Order of preference:

      1. Any ``D MOIS YYYY`` triple in the filename → most recent
         (Scribd uploads sometimes carry both the act date and the
         capture date; the act date is what we want and is typically
         the later one when both are dates of the document itself).
      2. Same triple in the first 300 chars of body text (cover page
         header, before the visas start).
      3. None — leave the editor to fill it in.
    """
    fn_dates = _scan_dates(filename)
    if fn_dates:
        return max(fn_dates)
    head_dates = _scan_dates(text[:300])
    if head_dates:
        return max(head_dates)
    # Last resort: a bare ``YYYY`` in the filename (e.g.
    # ``Concordat-1860.docx``).
    for m in _YEAR_ONLY_RE.finditer(filename):
        try:
            return date(int(m.group(1)), 1, 1)
        except ValueError:
            pass
    return None


def guess_title(filename: str) -> str:
    """Clean a Scribd-style filename into a plausible title."""
    name = Path(filename).stem
    # Drop leading Scribd numeric id ("237115038-")
    name = re.sub(r"^\d{6,}-", "", name)
    # Drop trailing " (1)" duplicates
    name = re.sub(r"\s*\(\d+\)\s*$", "", name).strip()
    # ``-`` and ``_`` → spaces
    name = name.replace("-", " ").replace("_", " ").strip()
    # Collapse whitespace
    return re.sub(r"\s+", " ", name)


def find_dup(
    session: Session,
    doc_date: Optional[date],
    title: str,
) -> tuple[Optional[LegalText], str]:
    """Best-effort dedup. Returns (LegalText|None, reason)."""
    title_norm = _normalise(title)
    if not title_norm:
        return None, "no title"
    significant = [w for w in title_norm.split() if len(w) > 4]

    # 1. By date first (high signal).
    if doc_date is not None:
        rows = session.scalars(
            select(LegalText).where(LegalText.promulgation_date == doc_date).limit(20)
        ).all()
        for row in rows:
            t = _normalise((row.title_fr or "") + " " + (row.official_title_fr or ""))
            hits = sum(1 for w in significant[:6] if w in t)
            if hits >= 3:
                return row, f"date+title match ({hits} words)"

    # 2. Fallback: title-only fuzzy ILIKE on the 3 longest words.
    fuzzy_words = sorted(significant, key=len, reverse=True)[:3]
    if fuzzy_words:
        ilike = "%" + "%".join(fuzzy_words) + "%"
        for col in (LegalText.title_fr, LegalText.official_title_fr):
            row = session.scalars(select(LegalText).where(col.ilike(ilike))).first()
            if row:
                return row, f"title ilike '{ilike[:60]}'"

    return None, "no match"


def find_moniteur_issue(
    session: Session, filename: str, doc_date: Optional[date]
) -> Optional[MoniteurIssue]:
    """Quick check if the file looks like a Moniteur issue we already have."""
    name_norm = _normalise(filename)
    if "moniteur" not in name_norm and "journal officiel" not in name_norm:
        return None
    # Try matching by publication date alone.
    if doc_date is not None:
        return session.scalars(
            select(MoniteurIssue).where(MoniteurIssue.publication_date == doc_date).limit(1)
        ).first()
    return None


def _safe_extract(path: Path, max_pages: int) -> str:
    if path.suffix.lower() != ".pdf":
        return ""
    try:
        pages = extract_text_from_pdf(str(path), max_pages=max_pages) or []
    except Exception as exc:  # noqa: BLE001 — best-effort survey
        return f"[extract failed: {exc}]"
    return "\n".join(pages)


def _md5(path: Path, chunk: int = 1 << 20) -> str:
    """Quick file hash for intra-folder dup detection."""
    h = hashlib.md5()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def survey(
    src: Path, out_path: Path, probe_pages: int = 2
) -> tuple[int, int, int, int]:
    files = sorted(p for p in src.iterdir() if p.is_file() and not p.name.startswith("."))

    # Pass 1: bucket by md5 to find byte-identical copies (Scribd downloads
    # often produce ``foo.pdf`` + ``foo (1).pdf``).
    by_hash: dict[str, list[Path]] = defaultdict(list)
    for p in files:
        by_hash[_md5(p)].append(p)
    primary_for: dict[Path, Optional[Path]] = {}
    for paths in by_hash.values():
        head, *rest = paths
        primary_for[head] = None
        for dup in rest:
            primary_for[dup] = head

    rows: list[dict] = []
    new_count = 0
    db_dup_count = 0
    folder_dup_count = 0
    moniteur_dup = 0

    with SessionLocal() as session:
        for path in files:
            primary = primary_for.get(path)
            text = _safe_extract(path, probe_pages)
            hint, _ = guess_doc_type(path.name, text)
            doc_date = guess_date(path.name, text)
            title = guess_title(path.name)

            issue = find_moniteur_issue(session, path.name, doc_date)
            dup_text, reason = find_dup(session, doc_date, title)

            if primary is not None:
                status = f"FOLDER-DUP of `{primary.name}`"
                folder_dup_count += 1
                reason = "byte-identical to primary"
            elif issue is not None:
                status = f"MONITEUR #{issue.id} ({issue.year}/{issue.number})"
                moniteur_dup += 1
            elif dup_text is not None:
                status = f"DB-DUP **#{dup_text.id}** — {(dup_text.official_title_fr or dup_text.title_fr or '')[:80]}"
                db_dup_count += 1
            else:
                status = "**NEW**"
                new_count += 1

            rows.append(
                {
                    "file": path.name,
                    "size_kb": path.stat().st_size // 1024,
                    "hint": hint or "—",
                    "date": doc_date.isoformat() if doc_date else "—",
                    "title": (title or "—")[:80],
                    "status": status,
                    "reason": reason,
                }
            )

    with out_path.open("w") as fh:
        fh.write("# Laws-folder survey\n\n")
        fh.write(f"- Source: `{src}`\n")
        fh.write(f"- Probed: first {probe_pages} pages of each PDF (text layer + OCR fallback)\n")
        fh.write(f"- Total files: **{len(rows)}**\n")
        fh.write(f"- NEW (likely missing from DB): **{new_count}**\n")
        fh.write(f"- Folder-internal duplicates (byte-identical): **{folder_dup_count}**\n")
        fh.write(f"- DB duplicates (heuristic title/date match): **{db_dup_count}**\n")
        fh.write(f"- Match an existing Moniteur issue: **{moniteur_dup}**\n\n")
        fh.write("Doc-type + date are guessed from the filename first, then the\n")
        fh.write("cover-page header — body text is full of citations (``Vu la\n")
        fh.write("Loi du …``) and will bait the detector. Cryptic filenames\n")
        fh.write("like ``54785cac4.pdf`` get a best-effort body-text guess.\n\n")
        fh.write("| File | Size | Doc-type | Date | Title guess | Status | Match reason |\n")
        fh.write("|---|---:|---|---|---|---|---|\n")
        for r in rows:
            fh.write(
                f"| `{r['file']}` | {r['size_kb']} KB | {r['hint']} | {r['date']} | "
                f"{r['title']} | {r['status']} | {r['reason']} |\n"
            )

    return new_count, folder_dup_count, db_dup_count, moniteur_dup


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--src", type=Path, default=Path.home() / "Downloads" / "laws")
    ap.add_argument("--out", type=Path, default=Path("/tmp/laws_folder_survey.md"))
    ap.add_argument("--probe-pages", type=int, default=2)
    args = ap.parse_args()

    if not args.src.is_dir():
        ap.error(f"source folder does not exist: {args.src}")

    new_count, folder_dup, db_dup, moniteur_dup = survey(args.src, args.out, args.probe_pages)
    print(f"wrote {args.out}")
    print(
        f"  → NEW: {new_count}"
        f" · folder-DUP: {folder_dup}"
        f" · DB-DUP: {db_dup}"
        f" · MONITEUR-match: {moniteur_dup}"
    )


if __name__ == "__main__":
    main()
