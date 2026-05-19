"""Ingest normalised JSONs from ``data/laws_inbox_2026`` as DRAFT LegalTexts.

Workflow:

  1. ``scripts/extract_laws_folder_text.py`` extracted text + a stub
     JSON for each NEW PDF in the laws folder.
  2. A human/assistant filled in the stub JSON's fields by reading
     the ``.txt`` next to it and flipped ``status`` to
     ``"ready_for_ingest"``.
  3. This script (Step 7) reads every ``ready_for_ingest`` JSON,
     creates a ``LegalText`` row in ``editorial_status='draft'``
     with attached articles + signers, and rewrites the JSON's
     ``status`` to ``"ingested"`` with the resulting ``legal_text_id``.
     Re-running is a no-op (already-ingested JSONs are skipped).

Drafts NEVER auto-publish. They appear in the editorial console
under ``/editorial`` for editor review + promotion to
``editorial_status='published'``.

JSON shape (the parts that matter — see
``data/laws_inbox_2026/*.json`` for the live skeletons)::

    {
        "source_filename":   "Decret-...pdf",
        "status":            "ready_for_ingest",
        "doc_type":          "decret" | "loi" | "arrete" | ... ,
        "official_title_fr": "Décret … sur le bail à usage professionnel",
        "title_fr":          "Décret du 9 avril 2020 sur le bail à usage…",
        "act_date":          "2020-04-09",
        "publication_date":  "2020-05-11",
        "moniteur":          {"number": "Spécial 4", "year": 2020,
                              "date": "2020-05-11"},
        "preamble_fr":       "JOVENEL MOÏSE PRÉSIDENT …",
        "visas":             ["la Constitution, notamment …", …],
        "considerants":      ["Que … ;", …],
        "enacting_formula_fr": "DÉCRÈTE",
        "official_formula":  null,
        "signers":           [{"name": "...", "function_fr": "..."}],
        "articles":          [{"number": "1", "text_fr": "..."}],
        "themes":            [],
        "notes":             ""
    }

Usage::

    .venv/bin/python scripts/ingest_laws_inbox.py
    .venv/bin/python scripts/ingest_laws_inbox.py --dry-run
    .venv/bin/python scripts/ingest_laws_inbox.py --only haiti-loi-relative-...
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, Optional

HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select  # noqa: E402

from api.db import SessionLocal  # noqa: E402
from schemas.enums import (  # noqa: E402
    EditorialStatus,
    LegalCategory,
    LegalStatus,
)
from services.corpus.models import (  # noqa: E402
    Article,
    ArticleVersion,
    LegalSigner,
    LegalText,
    MoniteurIssue,
)


READY_STATUS = "ready_for_ingest"
INGESTED_STATUS = "ingested"


def _parse_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).date()
        except ValueError:
            return None
    return None


def _slugify(value: str) -> str:
    s = re.sub(r"[^\w\-]+", "-", value.lower())
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:120]


def _legal_text_slug(payload: dict) -> str:
    """Stable, readable slug for a LegalText row."""
    doc_type = payload.get("doc_type") or "texte"
    title = payload.get("title_fr") or payload.get("official_title_fr") or ""
    act_date = _parse_date(payload.get("act_date"))
    bits = [doc_type]
    if act_date:
        bits.append(act_date.isoformat())
    if title:
        # Take the most-distinctive words after the doctype.
        cleaned = re.sub(r"^(décret|decret|loi|arrêté|arrete)\s+", "", title, flags=re.IGNORECASE)
        cleaned = re.sub(r"^du\s+\d+\s+\w+\s+\d{4}", "", cleaned, flags=re.IGNORECASE)
        words = [w for w in re.split(r"\s+", cleaned) if len(w) > 3][:5]
        if words:
            bits.append("-".join(words))
    return _slugify("-".join(bits))


def _ensure_moniteur_issue(session, moniteur: dict | None) -> Optional[int]:
    """Find-or-create a MoniteurIssue row for ``{number, year, date}``.

    Returns ``None`` when the metadata is empty — the legal_text
    will simply have no moniteur_issue_id.
    """
    if not moniteur:
        return None
    number = (moniteur.get("number") or "").strip() or None
    year = moniteur.get("year")
    if not number or not year:
        return None
    existing = session.scalars(
        select(MoniteurIssue).where(
            MoniteurIssue.year == int(year),
            MoniteurIssue.number == number,
        )
    ).first()
    if existing is not None:
        return existing.id
    issue = MoniteurIssue(
        year=int(year),
        number=number,
        publication_date=_parse_date(moniteur.get("date")),
    )
    session.add(issue)
    session.flush()
    return issue.id


def _resolve_category(value: Any) -> LegalCategory:
    if value is None:
        return LegalCategory.other_regulatory
    if isinstance(value, LegalCategory):
        return value
    # Map common aliases to the canonical enum.
    aliases = {
        "decret electoral": LegalCategory.decret,
        "décret électoral": LegalCategory.decret,
        "decret-loi": LegalCategory.decret,
        "arrêté présidentiel": LegalCategory.arrete,
        "accord": LegalCategory.convention,
        "concordat": LegalCategory.convention,
        "reglement": LegalCategory.other_regulatory,
        "règlement": LegalCategory.other_regulatory,
    }
    key = str(value).strip().lower()
    if key in aliases:
        return aliases[key]
    try:
        return LegalCategory(key)
    except ValueError:
        return LegalCategory.other_regulatory


def _existing_text_for(session, slug: str) -> Optional[LegalText]:
    return session.scalars(
        select(LegalText).where(LegalText.slug == slug)
    ).first()


def _unique_slug(session, base: str) -> str:
    if not _existing_text_for(session, base):
        return base
    n = 2
    while _existing_text_for(session, f"{base}-{n}"):
        n += 1
    return f"{base}-{n}"


def ingest_one(session, payload: dict) -> int:
    """Ingest one normalised JSON. Returns the created LegalText id."""
    category = _resolve_category(payload.get("doc_type"))
    title_fr = (
        payload.get("title_fr")
        or payload.get("official_title_fr")
        or payload.get("source_filename")
        or "Texte sans titre"
    )
    slug = _unique_slug(session, _legal_text_slug(payload))
    visas = payload.get("visas") or []
    considerants = payload.get("considerants") or []
    issue_id = _ensure_moniteur_issue(session, payload.get("moniteur"))

    legal_text = LegalText(
        slug=slug,
        category=category,
        jurisdiction="HT",
        title_fr=title_fr,
        official_title_fr=payload.get("official_title_fr") or None,
        preamble_fr=payload.get("preamble_fr") or None,
        visas_fr="\n".join(f"Vu {v.lstrip('Vu ').rstrip(';').rstrip('.')} ;" for v in visas) if visas else None,
        considerants_fr="\n".join(considerants) if considerants else None,
        enacting_formula_fr=payload.get("enacting_formula_fr") or None,
        official_formula=payload.get("official_formula") or None,
        promulgation_date=_parse_date(payload.get("act_date")),
        publication_date=_parse_date(payload.get("publication_date")),
        moniteur_issue_id=issue_id,
        status=LegalStatus.in_force,
        editorial_status=EditorialStatus.draft,
    )
    session.add(legal_text)
    session.flush()

    # Signers
    for position, sig in enumerate(payload.get("signers") or []):
        if not sig.get("name"):
            continue
        session.add(
            LegalSigner(
                legal_text_id=legal_text.id,
                name=sig["name"],
                function_fr=sig.get("function_fr"),
                position=position,
            )
        )

    # Articles + initial version
    seen_slugs: set[str] = set()
    for position, art in enumerate(payload.get("articles") or []):
        number = str(art.get("number") or position + 1)
        text_fr = (art.get("text_fr") or "").strip()
        if not text_fr:
            continue
        art_slug_base = f"art-{_slugify(number)}"
        art_slug = art_slug_base
        counter = 2
        while art_slug in seen_slugs:
            art_slug = f"{art_slug_base}-{counter}"
            counter += 1
        seen_slugs.add(art_slug)
        article = Article(
            legal_text_id=legal_text.id,
            number=number,
            slug=art_slug,
            position=position,
        )
        session.add(article)
        session.flush()
        version = ArticleVersion(
            article_id=article.id,
            version_number=1,
            text_fr=text_fr,
        )
        session.add(version)
        session.flush()
        article.current_version_id = version.id

    session.flush()
    return legal_text.id


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--inbox",
        type=Path,
        default=BACKEND_ROOT / "data" / "laws_inbox_2026",
    )
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--only",
        action="append",
        help="Only ingest the JSON(s) matching this stem (repeatable).",
    )
    args = ap.parse_args()

    if not args.inbox.is_dir():
        ap.error(f"inbox does not exist: {args.inbox}")

    candidates = sorted(args.inbox.glob("*.json"))
    if args.only:
        keep = set(args.only)
        candidates = [p for p in candidates if p.stem in keep]
        if not candidates:
            print(f"no JSON matches --only {args.only}")
            return

    ingested = 0
    skipped = 0
    failed = 0

    with SessionLocal() as session:
        for json_path in candidates:
            try:
                payload = json.loads(json_path.read_text())
            except Exception as exc:  # noqa: BLE001
                print(f"  [PARSE FAIL] {json_path.name}: {exc}")
                failed += 1
                continue

            status = payload.get("status")
            if status != READY_STATUS:
                skipped += 1
                continue

            try:
                if args.dry_run:
                    print(
                        f"  [DRY]      {json_path.stem}: would ingest "
                        f"({payload.get('doc_type')}, "
                        f"{len(payload.get('articles', []))} articles)"
                    )
                    ingested += 1
                    continue

                legal_text_id = ingest_one(session, payload)
                session.commit()

                payload["status"] = INGESTED_STATUS
                payload["legal_text_id"] = legal_text_id
                payload["ingested_at"] = datetime.now(UTC).isoformat()
                json_path.write_text(
                    json.dumps(payload, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                ingested += 1
                print(
                    f"  [OK]       {json_path.stem} → legal_text #{legal_text_id}"
                )
            except Exception as exc:  # noqa: BLE001
                session.rollback()
                failed += 1
                print(f"  [FAIL]     {json_path.stem}: {exc}")

    print(
        f"\ningested {ingested}, skipped {skipped} (status != ready_for_ingest), failed {failed}"
    )


if __name__ == "__main__":
    main()
