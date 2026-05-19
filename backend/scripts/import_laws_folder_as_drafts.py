"""Stub a draft ``MoniteurIssue`` for every PDF in ``~/Downloads/laws``.

The user dropped ~35 historic decrees / lois / arrêtés into that
folder. Each one is either a self-contained Moniteur issue or a
single-act extract published in one. We want every file visible in
``/editorial/moniteur`` so editors can triage, parse, and promote
them — exactly the existing Moniteur upload workflow, but bulk-
staged from a local folder instead of one-at-a-time uploads.

What the script does

  1. md5-dedups byte-identical files in the source folder (Scribd
     downloads often leave ``foo.pdf`` + ``foo (1).pdf`` pairs).
  2. Looks at ``backend/data/laws_inbox_2026/*.json`` to skip files
     that already went through the per-file laws-inbox pipeline
     (they're tracked there by ``source_filename`` and already have
     a real ``MoniteurIssue`` from ``ingest_laws_inbox.py``).
  3. Copies each remaining PDF into ``backend/data/scans/
     laws_inbox_2026/<stable-slug>.pdf`` — the directory is
     gitignored (some files are 70 MB), and the path lives under
     the scan endpoint's allowed root so editors can actually
     download the scan from the UI.
  4. Heuristically extracts an act-date and a doc-type label from
     the filename + first two PDF pages (same heuristic as
     ``survey_laws_folder.py``).
  5. Creates a ``MoniteurIssue`` with::

         year             = act_date.year   (or 2026 fallback)
         number           = ``Inbox-<slug>``
         publication_date = act_date  (when known)
         file_url         = absolute path of the copied scan
         edition_label    = "Inbox laws-2026"
         processing_status= uploaded   (= brouillon / draft)

     The ``Inbox-`` prefix avoids any collision with real Moniteur
     numbers in the existing seed (e.g. "Spécial 5", "36-A").

  6. As a side-pass, fills in ``file_url`` for the three already-
     ingested issues from the laws-inbox pipeline (#34 / #35 / #36)
     — those had ``NULL`` file_urls, so the "Download scan" button
     in editorial was broken.

Idempotent. Re-running:
  - skips any source file whose copy already exists at the staging
    path (compared by name);
  - skips any laws_inbox_2026/*.json that's already been ingested;
  - leaves the ``file_url`` on the 3 backfilled issues alone if
    already set.

Usage::

    .venv/bin/python scripts/import_laws_folder_as_drafts.py
    .venv/bin/python scripts/import_laws_folder_as_drafts.py --src ~/Downloads/laws
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Optional

HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select  # noqa: E402

from api.db import SessionLocal  # noqa: E402
from schemas.enums import MoniteurIssueStatus  # noqa: E402
from services.corpus.models import MoniteurIssue  # noqa: E402

# Re-use the survey's heuristics so doc-type + date detection stay
# consistent across the two scripts.
from scripts.survey_laws_folder import (  # noqa: E402
    guess_date,
    guess_doc_type,
    guess_title,
)


DEFAULT_SRC = Path.home() / "Downloads" / "laws"
STAGING_DIR = BACKEND_ROOT / "data" / "scans" / "laws_inbox_2026"
INBOX_DIR = BACKEND_ROOT / "data" / "laws_inbox_2026"
EDITION = "Inbox laws-2026"


def _md5(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.md5()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def _slugify(text: str, max_len: int = 32) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:max_len].rstrip("-") or "untitled"


def _stable_target_name(path: Path) -> str:
    """Slug-based filename for the staged copy.

    Hash-suffixed so two files with the same slug prefix don't
    collide on disk.
    """
    stem_slug = _slugify(path.stem, max_len=64)
    short_hash = hashlib.md5(path.name.encode()).hexdigest()[:6]
    return f"{stem_slug}-{short_hash}.pdf"


def _safe_extract_text(path: Path, max_pages: int = 2) -> str:
    """Pull the first two pages of text — tolerates OCR-only PDFs."""
    try:
        from services.ingestion.ocr import extract_text_from_pdf

        pages = extract_text_from_pdf(str(path), max_pages=max_pages) or []
    except Exception:  # noqa: BLE001
        return ""
    return "\n".join(pages)


def _page_count(path: Path) -> Optional[int]:
    try:
        import fitz

        with fitz.open(str(path)) as doc:
            return doc.page_count
    except Exception:  # noqa: BLE001
        return None


def _already_ingested_source_filenames() -> set[str]:
    """Names of files already promoted via ``ingest_laws_inbox.py``."""
    out: set[str] = set()
    if not INBOX_DIR.is_dir():
        return out
    for json_path in INBOX_DIR.glob("*.json"):
        try:
            payload = json.loads(json_path.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        if payload.get("status") != "ingested":
            continue
        src = payload.get("source_filename")
        if isinstance(src, str):
            out.add(src)
    return out


def _backfill_existing_file_urls(source_root: Path) -> int:
    """Set ``file_url`` for the 3 already-ingested Moniteur issues.

    Maps via ``laws_inbox_2026/*.json``: each ingested JSON carries
    both the source filename (so we can find the original in
    ``source_root``) and the ``legal_text_id`` (so we can find the
    issue via ``LegalText.moniteur_issue_id``). Stages the original
    into ``STAGING_DIR`` so the scan endpoint can serve it.
    """
    if not INBOX_DIR.is_dir():
        return 0
    updated = 0
    with SessionLocal() as session:
        from services.corpus.models import LegalText

        for json_path in INBOX_DIR.glob("*.json"):
            try:
                payload = json.loads(json_path.read_text())
            except (json.JSONDecodeError, OSError):
                continue
            if payload.get("status") != "ingested":
                continue
            lt_id = payload.get("legal_text_id")
            src_name = payload.get("source_filename")
            if not lt_id or not src_name:
                continue
            lt = session.get(LegalText, lt_id)
            if lt is None or lt.moniteur_issue_id is None:
                continue
            issue = session.get(MoniteurIssue, lt.moniteur_issue_id)
            if issue is None or issue.file_url:
                continue
            src_path = source_root / src_name
            if not src_path.exists():
                continue
            target = stage_pdf(src_path)
            issue.file_url = str(target)
            issue.edition_label = issue.edition_label or EDITION
            updated += 1
        session.commit()
    return updated


def stage_pdf(src: Path) -> Path:
    """Copy ``src`` into the staging dir if not already there."""
    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    target = STAGING_DIR / _stable_target_name(src)
    if not target.exists():
        shutil.copy2(src, target)
    return target


def create_or_skip(session, src: Path, copied: Path) -> Optional[MoniteurIssue]:
    """Find-or-create a MoniteurIssue stub for ``src``.

    Returns the created row on insert, ``None`` if a row already
    exists for this staged path.
    """
    existing = session.scalars(
        select(MoniteurIssue).where(MoniteurIssue.file_url == str(copied))
    ).first()
    if existing is not None:
        return None

    text = _safe_extract_text(src, max_pages=2)
    act_date = guess_date(src.name, text)
    hint, _category = guess_doc_type(src.name, text)
    title_seed = guess_title(src.name)
    slug = _slugify(title_seed, max_len=32)
    if hint:
        slug = f"{hint}-{slug}"[:48].rstrip("-")
    year = act_date.year if act_date is not None else 2026
    number = f"Inbox-{slug}"

    issue = MoniteurIssue(
        year=year,
        number=number,
        publication_date=act_date,
        edition_label=EDITION,
        file_url=str(copied),
        page_count=_page_count(src),
        processing_status=MoniteurIssueStatus.uploaded,
    )
    session.add(issue)
    return issue


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC)
    args = ap.parse_args()

    if not args.src.is_dir():
        ap.error(f"source folder does not exist: {args.src}")

    pdfs = sorted(
        p for p in args.src.iterdir() if p.is_file() and p.suffix.lower() == ".pdf"
    )

    # Pass 1: md5-dedupe folder-internal byte-duplicates.
    by_hash: dict[str, list[Path]] = defaultdict(list)
    for p in pdfs:
        by_hash[_md5(p)].append(p)
    unique = [paths[0] for paths in by_hash.values()]
    folder_dups = sum(len(v) - 1 for v in by_hash.values())

    # Pass 2: skip files already ingested through the laws-inbox pipeline.
    already_ingested = _already_ingested_source_filenames()
    to_stage = [p for p in unique if p.name not in already_ingested]
    skipped_already_ingested = len(unique) - len(to_stage)

    created = 0
    skipped_existing_issue = 0
    failed: list[tuple[Path, str]] = []

    with SessionLocal() as session:
        for src in to_stage:
            try:
                copied = stage_pdf(src)
                issue = create_or_skip(session, src, copied)
                if issue is None:
                    skipped_existing_issue += 1
                    continue
                session.commit()
                created += 1
                print(
                    f"  + {src.name} → MoniteurIssue {issue.year}/{issue.number}"
                )
            except Exception as exc:  # noqa: BLE001
                session.rollback()
                failed.append((src, str(exc)))
                print(f"  ! {src.name}: {exc}")

    # Pass 3: backfill file_url on the 3 already-ingested issues.
    backfilled = _backfill_existing_file_urls(args.src)

    print(
        f"\ncreated={created}, "
        f"already-have-issue={skipped_existing_issue}, "
        f"folder-md5-dups={folder_dups}, "
        f"already-ingested={skipped_already_ingested}, "
        f"backfilled-file-urls={backfilled}, "
        f"failed={len(failed)}"
    )


if __name__ == "__main__":
    main()
