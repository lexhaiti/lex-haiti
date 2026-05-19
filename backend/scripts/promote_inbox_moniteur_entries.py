"""Promote every ``Inbox laws-2026`` MoniteurEntry to a structured
``LegalText`` with parsed preamble/visas/considérants/articles/signers.

Direct DB insertion. Bypasses ``MoniteurRepository.promote_entry``
(which expects content_ast / parser-profile metadata we don't have
here) and uses the ingestion helpers directly:

  * ``services.ingestion.document_parser.parse_document`` — splits
    the entry's raw_text into headings + articles + preamble.
  * ``services.ingestion.article_split.split_preamble`` — breaks
    the preamble into the standard Haitian legal-text components
    (visas, considérants, mentions procédurales, enacting formula).
  * ``services.ingestion.signatories_extract.extract_signatories``
    — pulls signers out of the official formula by category.

When ``parse_document`` returns 0 articles (heavy OCR damage on
the cover-page sommaire — happens on a handful of multi-act
issues), the script falls back to dumping the cleaned raw_text as
the preamble + a single placeholder Article 1 carrying the rest of
the body. Editors then split into real articles by hand from the
review UI.

Idempotent on ``MoniteurEntry.promoted_legal_text_id``: an entry
that already has a ``LegalText`` attached is skipped.

The LegalText is created with ``editorial_status='draft'`` so it
stays out of the public listing until an editor flips it to
``published``.

Usage::

    .venv/bin/python scripts/promote_inbox_moniteur_entries.py
"""
from __future__ import annotations

import re
import sys
from datetime import UTC, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select, func  # noqa: E402

from api.db import SessionLocal  # noqa: E402
from schemas.enums import (  # noqa: E402
    ArticleStatus,
    EditorialStatus,
    LegalCategory,
    LegalStatus,
    MoniteurCandidateStatus,
)
from services.corpus.models import (  # noqa: E402
    Article,
    ArticleVersion,
    LegalSigner,
    LegalText,
    MoniteurEntry,
    MoniteurIssue,
)
from services.ingestion.article_split import split_preamble  # noqa: E402
from services.ingestion.document_parser import parse_document  # noqa: E402
from services.ingestion.signatories_extract import extract_signatories  # noqa: E402

from scripts.curate_inbox_moniteur_metadata import (  # noqa: E402
    CURATION,
    _curation_key,
)

EDITION = "Inbox laws-2026"


def _moniteur_doctype_to_legal_category(value) -> LegalCategory:
    """Map a ``MoniteurDocumentType`` to its ``LegalCategory`` peer.

    The two enums share legal-text values 1:1 by name; the Moniteur
    enum's gazette-only values (``promulgation``, ``correspondance``,
    ``errata``, ``resolution``, ``note``, ``autre``) collapse to
    ``other_regulatory`` on the corpus side because they aren't
    legal-text categories.
    """
    try:
        return LegalCategory(value.value)
    except ValueError:
        return LegalCategory.other_regulatory


def _slugify(text: str, max_len: int = 80) -> str:
    s = text.lower()
    # Strip accents
    s = (
        s.replace("à", "a").replace("â", "a").replace("ä", "a")
        .replace("é", "e").replace("è", "e").replace("ê", "e").replace("ë", "e")
        .replace("î", "i").replace("ï", "i")
        .replace("ô", "o").replace("ö", "o")
        .replace("ù", "u").replace("û", "u").replace("ü", "u")
        .replace("ç", "c").replace("œ", "oe").replace("æ", "ae")
        .replace("ñ", "n")
    )
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:max_len].rstrip("-") or "untitled"


def _unique_slug(session, base: str) -> str:
    """Return ``base``, or ``base-2``, ``base-3``… so the slug is
    globally unique in ``legal_texts``."""
    existing = session.scalar(
        select(func.count()).select_from(LegalText).where(LegalText.slug == base)
    )
    if not existing:
        return base
    n = 2
    while True:
        candidate = f"{base}-{n}"
        exists = session.scalar(
            select(func.count()).select_from(LegalText).where(LegalText.slug == candidate)
        )
        if not exists:
            return candidate
        n += 1


def _normalize_visa_line(line: str) -> str:
    """Ensure each visa starts with ``Vu`` and ends with ``;``."""
    line = line.strip().rstrip(";").rstrip(".").strip()
    if not line:
        return ""
    if not line.lower().startswith("vu "):
        line = f"Vu {line.lstrip('* •—-').strip()}"
    return line + " ;"


def _join_visas(visas_blob: str | None) -> str | None:
    if not visas_blob:
        return None
    lines = [
        _normalize_visa_line(ln)
        for ln in visas_blob.split("\n")
        if ln.strip()
    ]
    lines = [ln for ln in lines if ln]
    return "\n".join(lines) if lines else None


def _join_considerants(considerants_blob: str | None) -> str | None:
    if not considerants_blob:
        return None
    lines = []
    for ln in considerants_blob.split("\n"):
        s = ln.strip().rstrip(";").rstrip(".").strip()
        if not s:
            continue
        if not s.lower().startswith("considérant") and not s.lower().startswith("considerant"):
            s = f"Considérant {s.lstrip('* •—-').strip()}"
        lines.append(s + " ;")
    return "\n".join(lines) if lines else None


def promote_one(session, issue: MoniteurIssue, entry: MoniteurEntry) -> int | None:
    """Promote one entry. Returns the new LegalText id, or None on skip."""
    if entry.promoted_legal_text_id is not None:
        return None  # already done

    key = _curation_key(issue.file_url)
    curation = CURATION.get(key)
    if curation is None:
        # The 3 already-fully-ingested issues (#34/#35/#36) aren't in
        # CURATION; they have a different path.
        return None

    year, number, pub_iso, doctype, title = curation
    category = _moniteur_doctype_to_legal_category(doctype)

    # Parse the raw text into structure
    parse = parse_document(entry.raw_text or "")
    pp = split_preamble(parse.preamble or "")
    visas_fr = _join_visas(pp.visas)
    considerants_fr = _join_considerants(pp.considerants)
    mentions_fr = (pp.mentions_procedurales or "").strip() or None
    enacting_fr = (pp.enacting_formula or "").strip() or None
    preamble_fr = (parse.preamble or "").strip() or None
    # The preamble already contains visas/considérants — to avoid
    # duplication on the LawDetail page, clear preamble_fr when the
    # structured fields cover it.
    if (visas_fr or considerants_fr or mentions_fr or enacting_fr) and preamble_fr:
        # Keep only the leading "title block" — everything before the
        # first "Vu" / "Considérant" / "DÉCRÈTE".
        m = re.search(
            r"^\s*(?:vu|consid[eé]rant|d[eé]cr[eè]te|arr[eê]te|le\s+pr[eé]sident)",
            preamble_fr,
            re.IGNORECASE | re.MULTILINE,
        )
        if m and m.start() > 0:
            preamble_fr = preamble_fr[: m.start()].strip() or None
        else:
            preamble_fr = None

    # Signers
    sigs = extract_signatories(enacting_fr, category=category)

    # LegalText
    pub_date = datetime.fromisoformat(pub_iso).date()
    base_slug = _slugify(title, max_len=70)
    slug = _unique_slug(session, base_slug)

    legal_text = LegalText(
        slug=slug,
        category=category,
        jurisdiction="HT",
        title_fr=title,
        official_title_fr=title,
        preamble_fr=preamble_fr,
        visas_fr=visas_fr,
        considerants_fr=considerants_fr,
        mentions_procedurales_fr=mentions_fr,
        enacting_formula_fr=enacting_fr,
        promulgation_date=pub_date,
        publication_date=pub_date,
        moniteur_issue_id=issue.id,
        status=LegalStatus.in_force,
        editorial_status=EditorialStatus.draft,
    )
    session.add(legal_text)
    session.flush()

    # Articles + ArticleVersions. Track seen slugs per-LegalText so
    # legitimate duplicate ``Article 1`` headings (Constitution-style
    # numbering reset, or a single act referenced twice in OCR) don't
    # violate the ``uq_articles_text_slug`` constraint.
    article_count = 0
    seen_slugs: set[str] = set()
    if parse.articles:
        for i, pa in enumerate(parse.articles):
            base = _slugify(f"art-{pa.number}", max_len=40)
            art_slug = base
            n = 2
            while art_slug in seen_slugs:
                art_slug = f"{base}-{n}"
                n += 1
            seen_slugs.add(art_slug)
            article = Article(
                legal_text_id=legal_text.id,
                number=pa.number,
                slug=art_slug,
                position=i,
                domain_tags=[],
            )
            session.add(article)
            session.flush()
            version = ArticleVersion(
                article_id=article.id,
                version_number=1,
                text_fr=pa.content_fr.strip(),
                status=ArticleStatus.in_force,
                editorial_status=EditorialStatus.draft,
            )
            session.add(version)
            session.flush()
            article.current_version_id = version.id
            article_count += 1
    else:
        # Fallback: no articles parsed. Dump body as a placeholder
        # Article 1 so the LawDetail page has something to render.
        # The editor will refine.
        body = (entry.raw_text or "").strip()
        if body:
            article = Article(
                legal_text_id=legal_text.id,
                number="1",
                slug="art-1",
                position=0,
                domain_tags=[],
            )
            session.add(article)
            session.flush()
            version = ArticleVersion(
                article_id=article.id,
                version_number=1,
                text_fr=body[:200_000],
                status=ArticleStatus.in_force,
                editorial_status=EditorialStatus.draft,
            )
            session.add(version)
            session.flush()
            article.current_version_id = version.id
            article_count = 1

    # Signers — keep as LegalSigner rows so the LawDetail can show them
    for i, sig in enumerate(sigs):
        signer = LegalSigner(
            legal_text_id=legal_text.id,
            position=i,
            full_name=sig.full_name or "",
            role_text=sig.role,
        )
        session.add(signer)

    # Update entry
    entry.review_status = MoniteurCandidateStatus.accepted
    entry.promoted_legal_text_id = legal_text.id
    entry.reviewed_at = datetime.now(UTC)
    entry.detected_title = title
    entry.display_title = title
    entry.detected_date = pub_date

    return legal_text.id


def main() -> None:
    promoted = 0
    skipped = 0
    failed: list[tuple[int, str]] = []

    with SessionLocal() as s:
        issues = s.scalars(
            select(MoniteurIssue).where(MoniteurIssue.edition_label == EDITION)
        ).all()
        for issue in issues:
            entry = s.scalars(
                select(MoniteurEntry).where(MoniteurEntry.issue_id == issue.id)
            ).first()
            if entry is None:
                skipped += 1
                continue
            if entry.promoted_legal_text_id is not None:
                skipped += 1
                continue
            try:
                lt_id = promote_one(s, issue, entry)
                if lt_id is None:
                    skipped += 1
                    continue
                s.commit()
                promoted += 1
                # Re-fetch the entry to get the post-promote view
                ent = s.get(MoniteurEntry, entry.id)
                lt = s.get(LegalText, lt_id) if ent else None
                arts = (
                    s.scalar(
                        select(func.count())
                        .select_from(Article)
                        .where(Article.legal_text_id == lt_id)
                    )
                    or 0
                )
                print(
                    f"  + #{issue.id} → LegalText #{lt_id} "
                    f"({issue.year}/{issue.number[:32]}) — {arts} articles"
                )
            except Exception as exc:  # noqa: BLE001
                s.rollback()
                failed.append((issue.id, str(exc)))
                print(f"  ! #{issue.id}: {exc}")

    print(
        f"\nDone. promoted={promoted}, skipped={skipped}, failed={len(failed)}"
    )
    if failed:
        print("\nFailures:")
        for iid, reason in failed:
            print(f"  - #{iid}: {reason}")


if __name__ == "__main__":
    main()
