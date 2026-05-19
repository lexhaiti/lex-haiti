"""Pre-extract text from each NEW PDF in the laws folder.

For every file in ``--src`` (default ``~/Downloads/laws``) that the
folder-survey (Step 1) flagged as NEW or that has no extraction
yet:

  * Pull text via the existing ``extract_text_from_pdf`` pipeline
    (embedded text layer → Tesseract OCR fallback).
  * Write ``<work-dir>/<slug>.txt`` with the full extracted text.
  * Write a stub ``<work-dir>/<slug>.json`` skeleton with:

      {
        "source_filename":   "<original.pdf>",
        "extracted_chars":   12345,
        "extracted_pages":   12,
        "status":            "pending_normalisation",
        "doc_type":          null,
        "official_title_fr": null,
        "act_date":          null,
        "publication_date":  null,
        "moniteur": {"number": null, "year": null, "date": null},
        "preamble_fr":       null,
        "visas":             [],
        "considerants":      [],
        "signers":           [],
        "articles":          [],
        "themes":            [],
        "notes":             ""
      }

The normalisation step (Step 6b — performed by the human/assistant
reviewing each ``.txt``) fills in those fields; the ingest CLI in
Step 7 only consumes JSONs whose ``status`` has been flipped to
``ready_for_ingest``.

Idempotent: re-running skips files that already have BOTH a
``.txt`` and a ``.json`` next to them unless ``--force`` is given.
Byte-identical folder duplicates (from the Step-1 survey) are
skipped automatically — only the alphabetically-first sibling is
processed.

Usage::

    .venv/bin/python scripts/extract_laws_folder_text.py
    .venv/bin/python scripts/extract_laws_folder_text.py --force
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
sys.path.insert(0, str(BACKEND_ROOT))

from services.ingestion.ocr import extract_text_from_pdf  # noqa: E402


def _md5(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.md5()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def _slug(filename: str) -> str:
    """Stable, readable slug for the working-dir filename."""
    stem = Path(filename).stem
    stem = re.sub(r"^\d{6,}-", "", stem)
    stem = re.sub(r"\s*\(\d+\)\s*$", "", stem)
    stem = re.sub(r"[^\w\-]+", "-", stem.lower())
    stem = re.sub(r"-+", "-", stem).strip("-")
    return stem[:90] or "untitled"


STUB_KEYS = {
    "source_filename": None,
    "extracted_chars": 0,
    "extracted_pages": 0,
    "status": "pending_normalisation",
    "doc_type": None,
    "official_title_fr": None,
    "official_title_ht": None,
    "act_date": None,
    "publication_date": None,
    "moniteur": {"number": None, "year": None, "date": None},
    "preamble_fr": None,
    "visas": [],
    "considerants": [],
    "enacting_formula_fr": None,
    "signers": [],
    "articles": [],
    "themes": [],
    "notes": "",
}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--src", type=Path, default=Path.home() / "Downloads" / "laws"
    )
    ap.add_argument(
        "--work-dir",
        type=Path,
        default=BACKEND_ROOT / "data" / "laws_inbox_2026",
    )
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    if not args.src.is_dir():
        ap.error(f"source folder does not exist: {args.src}")
    args.work_dir.mkdir(parents=True, exist_ok=True)

    files = sorted(
        p for p in args.src.iterdir() if p.is_file() and not p.name.startswith(".")
    )

    # De-duplicate byte-identical siblings — only the
    # alphabetically-first wins.
    by_hash: dict[str, list[Path]] = defaultdict(list)
    for p in files:
        by_hash[_md5(p)].append(p)
    primaries = {paths[0] for paths in by_hash.values()}

    written = 0
    skipped = 0
    for path in files:
        if path not in primaries:
            skipped += 1
            continue
        slug = _slug(path.name)
        txt_path = args.work_dir / f"{slug}.txt"
        json_path = args.work_dir / f"{slug}.json"

        if not args.force and txt_path.exists() and json_path.exists():
            skipped += 1
            continue

        if path.suffix.lower() != ".pdf":
            txt_path.write_text(
                f"[non-pdf source, not extracted: {path.name}]\n",
                encoding="utf-8",
            )
            stub = dict(STUB_KEYS)
            stub["source_filename"] = path.name
            stub["status"] = "needs_manual_extraction"
            stub["notes"] = (
                f"Non-PDF source ({path.suffix}); upload original separately."
            )
            json_path.write_text(
                json.dumps(stub, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            written += 1
            print(f"  [non-pdf] {path.name} → {slug}.{{txt,json}}")
            continue

        try:
            pages = extract_text_from_pdf(str(path))
        except Exception as exc:  # noqa: BLE001
            txt_path.write_text(
                f"[extraction failed: {exc}]\n", encoding="utf-8"
            )
            stub = dict(STUB_KEYS)
            stub["source_filename"] = path.name
            stub["status"] = "extraction_failed"
            stub["notes"] = f"OCR pipeline raised: {exc}"
            json_path.write_text(
                json.dumps(stub, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            written += 1
            print(f"  [FAILED]  {path.name}: {exc}")
            continue

        full_text = "\n\n".join(pages)
        txt_path.write_text(full_text, encoding="utf-8")

        stub = {
            **STUB_KEYS,
            "source_filename": path.name,
            "extracted_chars": len(full_text),
            "extracted_pages": len(pages),
            # Pre-fill a (best-effort) clean filename → human can replace.
            "notes": "Fill in the fields above by reading the .txt next to "
            "this JSON. Flip status to 'ready_for_ingest' when done.",
        }
        json_path.write_text(
            json.dumps(stub, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        written += 1
        print(
            f"  [pdf]     {path.name} → {slug}.{{txt,json}} "
            f"({len(pages)} pages, {len(full_text):,} chars)"
        )

    print(
        f"\nwrote {written} pair(s), skipped {skipped} (already-extracted or folder-dups)"
    )


if __name__ == "__main__":
    main()
