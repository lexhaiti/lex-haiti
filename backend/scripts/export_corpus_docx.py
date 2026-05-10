"""Export every LegalText to DOCX (and Moniteur metadata to JSON) before wiping
the corpus.

Run from `backend/`:
    python -m scripts.export_corpus_docx
    python -m scripts.export_corpus_docx --out /custom/path

Output layout (default):
    backend/exports/<UTC-timestamp>/
        legal_texts/<slug>.docx          # one DOCX per LegalText
        legal_texts.json                 # index of texts (id, slug, status, ...)
        moniteur/<id>.json               # one JSON per moniteur issue with sommaire
        moniteur.json                    # issue index

Reuses services.corpus.export.docx.render_docx so the output matches the
user-facing /api/lois/{slug}/export.docx download. Drafts are included.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from api.db import SessionLocal
from packages.schemas.heading import LegalHeadingRead
from packages.schemas.signer import LegalSignerRead
from packages.schemas.theme import LegalThemeTagRead
from services.corpus.export import render_docx
from services.corpus.models import LegalText, MoniteurIssue
from services.corpus.repository import CorpusRepository
from services.corpus.service import article_to_embed, text_to_read


def _slug_safe(slug: str) -> str:
    """Filesystem-safe filename — slugs are already URL-safe but trim hard."""
    return slug.replace("/", "_")[:200] or "untitled"


def _serialize_date(value):
    return value.isoformat() if value is not None else None


def _build_index_entry(text: LegalText) -> dict:
    return {
        "id": text.id,
        "slug": text.slug,
        "category": text.category.value if text.category else None,
        "code_subcategory": text.code_subcategory.value if text.code_subcategory else None,
        "title_fr": text.title_fr,
        "title_ht": text.title_ht,
        "official_number": text.official_number,
        "issuing_authority": text.issuing_authority,
        "publication_date": _serialize_date(text.publication_date),
        "promulgation_date": _serialize_date(text.promulgation_date),
        "status": text.status.value if text.status else None,
        "editorial_status": text.editorial_status.value if text.editorial_status else None,
        "moniteur_issue_id": text.moniteur_issue_id,
    }


def _serialize_moniteur(issue: MoniteurIssue, entries: list) -> dict:
    def _enum(value):
        return value.value if value is not None and hasattr(value, "value") else value

    return {
        "id": issue.id,
        "number": issue.number,
        "year": issue.year,
        "edition_label": issue.edition_label,
        "publication_date": _serialize_date(issue.publication_date),
        "page_count": issue.page_count,
        "processing_status": _enum(issue.processing_status),
        "file_url": issue.file_url,
        "sommaire": [
            {
                "id": e.id,
                "position": e.position,
                "detected_category": _enum(e.detected_category),
                "detected_title": e.detected_title,
                "display_title": e.display_title,
                "detected_number": e.detected_number,
                "detected_date": _serialize_date(e.detected_date),
                "summary_fr": e.summary_fr,
                "summary_ht": e.summary_ht,
                "parent_entry_id": e.parent_entry_id,
                "page_from": e.page_from,
                "page_to": e.page_to,
                "review_status": _enum(e.review_status),
                "promoted_legal_text_id": e.promoted_legal_text_id,
            }
            for e in entries
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Destination directory (default: backend/exports/<UTC-timestamp>/)",
    )
    parser.add_argument(
        "--base-url",
        default="https://lexhaiti.ht",
        help="Base URL embedded in DOCX provenance footer (default: lexhaiti.ht)",
    )
    args = parser.parse_args(argv)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    repo_root = Path(__file__).resolve().parents[1]
    out_root = (args.out or (repo_root / "exports" / timestamp)).resolve()
    legal_dir = out_root / "legal_texts"
    moniteur_dir = out_root / "moniteur"
    legal_dir.mkdir(parents=True, exist_ok=True)
    moniteur_dir.mkdir(parents=True, exist_ok=True)

    print(f"→ Exporting to {out_root}")

    legal_index: list[dict] = []
    failures: list[tuple[str, str]] = []

    with SessionLocal() as session:
        repo = CorpusRepository(session)

        # ── Legal texts ───────────────────────────────────────────────────
        # Bypass the service helper: it defaults to editorial_status=published,
        # which would silently skip the 4 draft décrets. We want everything.
        slugs = session.scalars(
            select(LegalText.slug).order_by(LegalText.id)
        ).all()
        print(f"→ {len(slugs)} legal_texts to export (drafts included)")

        for i, slug in enumerate(slugs, 1):
            try:
                row = repo.get_text_by_slug(
                    slug,
                    editorial_status=None,
                    with_headings=True,
                    with_articles=True,
                    with_signers=True,
                )
                if row is None:
                    raise RuntimeError(f"LegalText not found: {slug}")
                theme_tags = [
                    LegalThemeTagRead.model_validate(t)
                    for t in repo.get_theme_tags_for_text(row.id)
                ]
                text_read = text_to_read(
                    row,
                    headings=[
                        LegalHeadingRead.model_validate(h) for h in row.headings
                    ],
                    articles=[article_to_embed(a) for a in row.articles],
                    signers=[
                        LegalSignerRead.model_validate(s) for s in row.signers
                    ],
                    theme_tags=theme_tags,
                )
                payload = render_docx(
                    text_read, lang="fr", base_url=args.base_url
                )
                target = legal_dir / f"{_slug_safe(slug)}.docx"
                target.write_bytes(payload)
                legal_index.append(_build_index_entry(row))
                print(f"  [{i:>3}/{len(slugs)}] {slug}.docx ({len(payload):,} bytes)")
            except Exception as exc:  # noqa: BLE001
                failures.append((slug, repr(exc)))
                print(f"  [{i:>3}/{len(slugs)}] FAILED {slug}: {exc}", file=sys.stderr)

        (out_root / "legal_texts.json").write_text(
            json.dumps(legal_index, indent=2, ensure_ascii=False), encoding="utf-8"
        )

        # ── Moniteur issues ───────────────────────────────────────────────
        issues = session.scalars(
            select(MoniteurIssue).order_by(MoniteurIssue.id)
        ).all()
        moniteur_index: list[dict] = []
        print(f"→ {len(issues)} moniteur_issues to export")
        for issue in issues:
            entries = sorted(getattr(issue, "entries", []) or [], key=lambda e: e.position)
            payload = _serialize_moniteur(issue, entries)
            (moniteur_dir / f"{issue.id}.json").write_text(
                json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
            )
            moniteur_index.append({
                "id": issue.id,
                "number": issue.number,
                "year": issue.year,
                "publication_date": _serialize_date(issue.publication_date),
                "entry_count": len(entries),
            })
            print(f"  · moniteur/{issue.id}.json ({len(entries)} entries)")

        (out_root / "moniteur.json").write_text(
            json.dumps(moniteur_index, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    # ── Summary ──────────────────────────────────────────────────────────
    print(f"\n✔ Wrote {len(legal_index)} DOCX file(s) to {legal_dir}")
    print(f"✔ Wrote {len(moniteur_index)} moniteur JSON file(s) to {moniteur_dir}")
    if failures:
        print(f"\n✗ {len(failures)} legal_text(s) failed:", file=sys.stderr)
        for slug, err in failures:
            print(f"  - {slug}: {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
