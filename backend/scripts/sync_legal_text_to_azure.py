"""Push a single legal text (and everything attached to it) from the
local DB to Azure prod.

When to use this vs ``infra/azure/sync_local_to_prod.sh``:

  * **This script** — surgical sync for *one* legal_text. Idempotent,
    keyed on business identifiers (slug, article number, heading
    level+number+title_fr). Safe to re-run; safe to use on a prod DB
    that already has data. Use it for the day-to-day workflow:
    ingest a code/loi locally, polish it via the editor, push it
    here.

  * **sync_local_to_prod.sh** — nuclear option that ``DROP``s the
    entire ``public_corpus`` schema on prod and restores it from a
    local ``pg_dump``. Use it once at bootstrap, or after a major
    schema refactor where targeted UPSERTs would be too fiddly.

What gets synced for a slug:

  1. ``legal_texts`` row (UPSERT by slug).
  2. ``legal_headings`` rows (UPSERT by (level, number, title_fr)).
     Parent-child links rebuilt against the prod IDs.
  3. ``articles`` rows (UPSERT by (legal_text_id, number)).
     ``heading_id`` rebuilt against prod heading IDs.
  4. ``article_versions`` rows (UPSERT by (article_id, version_number)).
     ``current_version_id`` on each article rewritten to the matching
     prod version row at the end.
  5. ``legal_signers`` rows (UPSERT by (legal_text_id, position)).
  6. ``legal_theme_tags`` rows (UPSERT by (legal_text_id, theme)).
  7. ``moniteur_issues`` for the linked FR + HT issues (by year +
     number), and their ``moniteur_entries`` (by issue_id +
     position + detected_category). Links re-pointed to the
     freshly-synced legal_text on prod.

What does NOT get synced:

  * ``legal_changes`` rows where this legal_text is the *amending*
    law. Those are owned by the AMENDED text — re-sync that text to
    pick them up.
  * ``decisions``, ``citations`` — separate ingestion path.
  * ``article_block_versions`` if not eager-loaded — uncommon for
    non-amendment laws.

Usage (from ``backend/``)::

    # Preview only
    .venv/bin/python scripts/sync_legal_text_to_azure.py \\
        --slug constitution-1987 \\
        --prod-url 'postgresql+psycopg2://lhadmin:<pwd>@…' \\
        --dry-run

    # Apply
    .venv/bin/python scripts/sync_legal_text_to_azure.py \\
        --slug constitution-1987 \\
        --prod-url 'postgresql+psycopg2://lhadmin:<pwd>@…'
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, selectinload

from api.config import get_settings
from services.corpus.models import (
    Article,
    ArticleVersion,
    LegalHeading,
    LegalSigner,
    LegalText,
    LegalThemeTag,
    MoniteurEntry,
    MoniteurIssue,
)


# ── helpers ──────────────────────────────────────────────────────────


def _copy_fields(src: Any, dst: Any, fields: list[str]) -> None:
    for f in fields:
        setattr(dst, f, getattr(src, f))


def _upsert_legal_text(local: LegalText, prod_session: Session) -> LegalText:
    existing = prod_session.execute(
        select(LegalText).where(LegalText.slug == local.slug)
    ).scalar_one_or_none()
    fields = [
        "slug", "category", "code_subcategory", "jurisdiction",
        "title_fr", "title_ht",
        "description_fr", "description_ht",
        "preamble_fr", "preamble_ht",
        "visas_fr", "visas_ht",
        "considerants_fr", "considerants_ht",
        "enacting_formula_fr", "enacting_formula_ht",
        "enacting_formula_align",
        "promulgation_date", "publication_date",
        "moniteur_ref",
        "official_number", "issuing_authority", "official_formula",
        "sovereignty_formula_fr", "promulgation_formula_fr",
        "promulgation_location",
        "status", "editorial_status",
    ]
    if existing is None:
        prod = LegalText(**{f: getattr(local, f) for f in fields})
        prod_session.add(prod)
        prod_session.flush()
        print(f"  Inserted legal_text {prod.slug!r} (id={prod.id})")
    else:
        _copy_fields(local, existing, fields)
        prod = existing
        print(f"  Updated legal_text {prod.slug!r} (id={prod.id})")
    return prod


def _sync_headings(
    local_headings: list[LegalHeading], prod_text: LegalText, prod_session: Session
) -> dict[int, int]:
    """UPSERT headings by (level, number, title_fr). Returns a
    local_id → prod_id map so child rows + ``parent_id`` can be
    rewritten to prod IDs."""
    id_map: dict[int, int] = {}
    # First pass: ensure each heading exists. Defer parent linking to
    # a second pass once every id is known.
    prod_rows = prod_session.execute(
        select(LegalHeading).where(LegalHeading.legal_text_id == prod_text.id)
    ).scalars().all()
    by_key: dict[tuple[str, str, str], LegalHeading] = {
        (h.level, (h.number or "").strip(), (h.title_fr or "").strip()): h
        for h in prod_rows
    }
    fields = [
        "level", "number", "title_fr", "title_ht",
        "content_fr", "content_ht", "position", "key",
    ]
    for h in local_headings:
        key = (h.level, (h.number or "").strip(), (h.title_fr or "").strip())
        existing = by_key.get(key)
        if existing is None:
            row = LegalHeading(legal_text_id=prod_text.id, **{f: getattr(h, f) for f in fields})
            prod_session.add(row)
            prod_session.flush()
            id_map[h.id] = row.id
        else:
            _copy_fields(h, existing, fields)
            id_map[h.id] = existing.id

    # Second pass: parent linking.
    for h in local_headings:
        if h.parent_id is None:
            continue
        prod_id = id_map.get(h.id)
        parent_prod_id = id_map.get(h.parent_id)
        if prod_id is None or parent_prod_id is None:
            continue
        prod_h = prod_session.get(LegalHeading, prod_id)
        if prod_h is not None and prod_h.parent_id != parent_prod_id:
            prod_h.parent_id = parent_prod_id
    print(f"  Synced {len(local_headings)} headings.")
    return id_map


def _sync_articles_and_versions(
    local_text: LegalText,
    prod_text: LegalText,
    heading_id_map: dict[int, int],
    prod_session: Session,
) -> None:
    """Two passes: UPSERT articles, then UPSERT versions, then rewrite
    ``current_version_id`` on each article to the matching prod
    version. ``transferred_to_article_id`` and
    ``source_amendment_id`` are not re-pointed — they reference other
    legal_texts which may not be on prod yet."""
    # Map by article number for the prod side.
    prod_articles = prod_session.execute(
        select(Article).where(Article.legal_text_id == prod_text.id)
    ).scalars().all()
    by_number: dict[str, Article] = {a.number: a for a in prod_articles}

    art_id_map: dict[int, int] = {}
    # Title columns live on ArticleVersion (the versioned record), not
    # on Article itself — Article only holds identity + structural
    # placement. Keep this list aligned with the model in
    # services/corpus/models.py:Article.
    a_fields = ["number", "slug", "position", "domain_tags"]
    a_fields = [f for f in a_fields if hasattr(Article, f)]
    for a in local_text.articles:
        existing = by_number.get(a.number)
        heading_prod_id = (
            heading_id_map.get(a.heading_id) if a.heading_id is not None else None
        )
        if existing is None:
            row = Article(
                legal_text_id=prod_text.id,
                heading_id=heading_prod_id,
                **{f: getattr(a, f) for f in a_fields},
            )
            prod_session.add(row)
            prod_session.flush()
            art_id_map[a.id] = row.id
        else:
            _copy_fields(a, existing, a_fields)
            existing.heading_id = heading_prod_id
            art_id_map[a.id] = existing.id
    print(f"  Synced {len(local_text.articles)} articles.")

    # Versions: UPSERT by (prod_article_id, version_number).
    v_fields = [
        "version_number",
        "title_fr", "title_ht",
        "text_fr", "text_ht",
        "content_ast_fr", "content_ast_ht",
        "effective_from", "effective_to",
        "confidence", "editorial_status", "status",
    ]
    v_fields = [f for f in v_fields if hasattr(ArticleVersion, f)]

    version_id_map: dict[int, int] = {}
    versions_total = 0
    for a in local_text.articles:
        prod_article_id = art_id_map[a.id]
        prod_versions = prod_session.execute(
            select(ArticleVersion).where(ArticleVersion.article_id == prod_article_id)
        ).scalars().all()
        prod_by_vn = {v.version_number: v for v in prod_versions}
        for v in a.versions:
            existing = prod_by_vn.get(v.version_number)
            if existing is None:
                row = ArticleVersion(
                    article_id=prod_article_id,
                    **{f: getattr(v, f) for f in v_fields},
                )
                prod_session.add(row)
                prod_session.flush()
                version_id_map[v.id] = row.id
            else:
                _copy_fields(v, existing, v_fields)
                version_id_map[v.id] = existing.id
            versions_total += 1
    print(f"  Synced {versions_total} article_versions.")

    # Re-point current_version_id on each prod article. The local
    # row's current_version_id is the local row's id; map it through.
    cv_relinked = 0
    for a in local_text.articles:
        if a.current_version_id is None:
            continue
        prod_article_id = art_id_map[a.id]
        prod_version_id = version_id_map.get(a.current_version_id)
        if prod_version_id is None:
            continue
        prod_a = prod_session.get(Article, prod_article_id)
        if prod_a is not None and prod_a.current_version_id != prod_version_id:
            prod_a.current_version_id = prod_version_id
            cv_relinked += 1
    if cv_relinked:
        print(f"  Re-pointed current_version_id on {cv_relinked} articles.")


def _sync_signers(
    local_text: LegalText, prod_text: LegalText, prod_session: Session
) -> None:
    # Field list mirrors LegalSigner in services/corpus/models.py.
    fields = [
        "name", "function_fr", "function_ht",
        "signing_capacity", "chamber", "signed_at", "position",
    ]
    fields = [f for f in fields if hasattr(LegalSigner, f)]
    if not fields:
        return
    prod_rows = prod_session.execute(
        select(LegalSigner).where(LegalSigner.legal_text_id == prod_text.id)
    ).scalars().all()
    by_position = {r.position: r for r in prod_rows}
    for s in local_text.signers:
        existing = by_position.get(s.position)
        if existing is None:
            row = LegalSigner(
                legal_text_id=prod_text.id,
                **{f: getattr(s, f) for f in fields},
            )
            prod_session.add(row)
        else:
            _copy_fields(s, existing, fields)
    print(f"  Synced {len(local_text.signers)} signers.")


def _sync_theme_tags(
    local_text: LegalText, prod_text: LegalText, prod_session: Session
) -> None:
    prod_rows = prod_session.execute(
        select(LegalThemeTag).where(LegalThemeTag.legal_text_id == prod_text.id)
    ).scalars().all()
    by_theme = {r.theme: r for r in prod_rows}
    for t in local_text.theme_tags:
        existing = by_theme.get(t.theme)
        if existing is None:
            prod_session.add(
                LegalThemeTag(
                    legal_text_id=prod_text.id,
                    theme=t.theme,
                    source=t.source,
                    confidence=t.confidence,
                )
            )
        else:
            existing.source = t.source
            existing.confidence = t.confidence
    print(f"  Synced {len(local_text.theme_tags)} theme tags.")


def _sync_moniteur_issue(
    local_issue: MoniteurIssue, prod_session: Session
) -> MoniteurIssue:
    existing = prod_session.execute(
        select(MoniteurIssue).where(
            MoniteurIssue.year == local_issue.year,
            MoniteurIssue.number == local_issue.number,
        )
    ).scalar_one_or_none()
    fields = [
        "year", "number", "edition_label", "publication_date",
        "director", "processing_status", "processing_error",
        "file_url", "transcript_url",
        "page_count",
    ]
    fields = [f for f in fields if hasattr(MoniteurIssue, f)]
    if existing is None:
        row = MoniteurIssue(**{f: getattr(local_issue, f) for f in fields})
        prod_session.add(row)
        prod_session.flush()
        print(
            f"  Inserted moniteur_issue {local_issue.year}:{local_issue.number} (id={row.id})"
        )
        return row
    _copy_fields(local_issue, existing, fields)
    print(
        f"  Updated moniteur_issue {existing.year}:{existing.number} (id={existing.id})"
    )
    return existing


def _sync_moniteur_entries(
    local_issue: MoniteurIssue,
    prod_issue: MoniteurIssue,
    prod_legal_text_id: int | None,
    prod_session: Session,
    local_to_prod_issue: dict[int, int],
) -> dict[int, int]:
    """UPSERT entries by (issue_id, position, detected_category). Returns
    local_id → prod_id map for parent linking."""
    fields = [
        "position", "detected_category", "detected_title",
        "detected_number", "detected_date",
        "display_title", "summary_fr", "summary_ht",
        "raw_text", "confidence",
        "page_from", "page_to",
        "review_status", "review_notes",
        "parser_profile", "content_ast",
        "translation_detected_number",
        "translation_title_ht",
        "translation_page_from", "translation_page_to",
        "translation_summary_ht",
        "companion_documents",
    ]
    fields = [f for f in fields if hasattr(MoniteurEntry, f)]
    prod_rows = prod_session.execute(
        select(MoniteurEntry).where(MoniteurEntry.issue_id == prod_issue.id)
    ).scalars().all()
    by_key: dict[tuple[int, Any], MoniteurEntry] = {
        (r.position, r.detected_category): r for r in prod_rows
    }
    id_map: dict[int, int] = {}
    for e in local_issue.entries:
        key = (e.position, e.detected_category)
        existing = by_key.get(key)
        promoted = (
            prod_legal_text_id
            if e.promoted_legal_text_id is not None
            else None
        )
        trans_issue_prod = (
            local_to_prod_issue.get(e.translation_issue_id)
            if e.translation_issue_id is not None
            else None
        )
        if existing is None:
            row = MoniteurEntry(
                issue_id=prod_issue.id,
                promoted_legal_text_id=promoted,
                translation_issue_id=trans_issue_prod,
                **{f: getattr(e, f) for f in fields},
            )
            prod_session.add(row)
            prod_session.flush()
            id_map[e.id] = row.id
        else:
            _copy_fields(e, existing, fields)
            existing.promoted_legal_text_id = promoted
            existing.translation_issue_id = trans_issue_prod
            id_map[e.id] = existing.id

    # Second pass: parent_entry_id rebuild.
    for e in local_issue.entries:
        if e.parent_entry_id is None:
            continue
        prod_id = id_map.get(e.id)
        parent_prod = id_map.get(e.parent_entry_id)
        if prod_id is None or parent_prod is None:
            continue
        row = prod_session.get(MoniteurEntry, prod_id)
        if row is not None and row.parent_entry_id != parent_prod:
            row.parent_entry_id = parent_prod
    print(
        f"  Synced {len(local_issue.entries)} entries on N° {prod_issue.number}."
    )
    return id_map


# ── main ─────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--slug", required=True, help="legal_text.slug to sync")
    parser.add_argument(
        "--prod-url",
        default=os.environ.get("PROD_DATABASE_URL"),
        help="SQLAlchemy URL for the prod DB. Falls back to PROD_DATABASE_URL.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read both DBs, report planned changes, write nothing.",
    )
    args = parser.parse_args()

    if not args.prod_url:
        print(
            "ERROR: --prod-url or PROD_DATABASE_URL is required. "
            "Refusing to run without an explicit prod target.",
            file=sys.stderr,
        )
        return 1

    settings = get_settings()
    local_engine = create_engine(settings.database_url, echo=False)
    prod_engine = create_engine(args.prod_url, echo=False)

    print(f"== Syncing legal_text {args.slug!r} ==")

    with Session(local_engine) as local_session:
        local_text = local_session.execute(
            select(LegalText)
            .where(LegalText.slug == args.slug)
            .options(
                selectinload(LegalText.headings),
                selectinload(LegalText.articles).selectinload(Article.versions),
                selectinload(LegalText.signers),
                selectinload(LegalText.theme_tags),
                selectinload(LegalText.moniteur_issue).selectinload(MoniteurIssue.entries),
                selectinload(LegalText.moniteur_issue_ht).selectinload(MoniteurIssue.entries),
            )
        ).scalar_one_or_none()
        if local_text is None:
            print(f"ERROR: legal_text {args.slug!r} not found locally.")
            return 1

        print(
            f"  Local rows: {len(local_text.articles)} articles, "
            f"{len(local_text.headings)} headings, "
            f"{len(local_text.signers)} signers, "
            f"{len(local_text.theme_tags)} theme tags"
        )
        if local_text.moniteur_issue:
            print(
                f"  Local linked Moniteur (fr): {local_text.moniteur_issue.year}:"
                f"{local_text.moniteur_issue.number} ({len(local_text.moniteur_issue.entries)} entries)"
            )
        if local_text.moniteur_issue_ht:
            print(
                f"  Local linked Moniteur (ht): {local_text.moniteur_issue_ht.year}:"
                f"{local_text.moniteur_issue_ht.number} ({len(local_text.moniteur_issue_ht.entries)} entries)"
            )

        with Session(prod_engine) as prod_session:
            print("\n[1/6] Upserting legal_text…")
            prod_text = _upsert_legal_text(local_text, prod_session)

            print("\n[2/6] Upserting headings…")
            heading_id_map = _sync_headings(
                local_text.headings, prod_text, prod_session
            )

            print("\n[3/6] Upserting articles + versions…")
            _sync_articles_and_versions(
                local_text, prod_text, heading_id_map, prod_session
            )

            print("\n[4/6] Upserting signers + theme tags…")
            _sync_signers(local_text, prod_text, prod_session)
            _sync_theme_tags(local_text, prod_text, prod_session)

            print("\n[5/6] Upserting linked Moniteur issues + entries…")
            local_to_prod_issue: dict[int, int] = {}
            prod_fr_issue: MoniteurIssue | None = None
            prod_ht_issue: MoniteurIssue | None = None
            if local_text.moniteur_issue:
                prod_fr_issue = _sync_moniteur_issue(
                    local_text.moniteur_issue, prod_session
                )
                local_to_prod_issue[local_text.moniteur_issue.id] = prod_fr_issue.id
            if local_text.moniteur_issue_ht:
                prod_ht_issue = _sync_moniteur_issue(
                    local_text.moniteur_issue_ht, prod_session
                )
                local_to_prod_issue[local_text.moniteur_issue_ht.id] = prod_ht_issue.id
            if prod_fr_issue:
                _sync_moniteur_entries(
                    local_text.moniteur_issue, prod_fr_issue, prod_text.id,
                    prod_session, local_to_prod_issue,
                )
            if prod_ht_issue:
                _sync_moniteur_entries(
                    local_text.moniteur_issue_ht, prod_ht_issue, prod_text.id,
                    prod_session, local_to_prod_issue,
                )

            print("\n[6/6] Re-pointing legal_text.moniteur_issue_id(_ht)…")
            prod_text.moniteur_issue_id = (
                prod_fr_issue.id if prod_fr_issue else None
            )
            prod_text.moniteur_issue_id_ht = (
                prod_ht_issue.id if prod_ht_issue else None
            )

            if args.dry_run:
                prod_session.rollback()
                print("\n[dry-run] Rolled back, nothing persisted.")
            else:
                prod_session.commit()
                print("\n[committed]")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
