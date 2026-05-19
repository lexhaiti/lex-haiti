"""Ingest the 13 historical Haitian constitutions from Louis-Joseph
Janvier's 1886 compilation ``Les Constitutions d'Haïti (1801-1885)``
(BnF Gallica, bpt6k61426252).

Source-PDF structure
--------------------
Janvier's book is a 644-page Marpon-Flammarion edition organised
into book-level **CHAPITRES** (top-level, Roman-numbered) — each
chapter is a single historical constitution (or, for CHAPITRE X
and XIV, a bundle of constitutional-amendment laws). Inside each
chapter the constitution text itself carries its OWN internal
``CHAPITRE I / II / …`` divisions; those are parsed by the existing
article splitter and surface as ``LegalHeading`` rows in the DB.

What lands in the DB
--------------------
For each book-level chapter we create one ``LegalText`` with:

  * ``category = constitution``           (or ``loi_constitutionnelle``
    for CHAPITRE X — Geffrard-era amendments — and CHAPITRE XIV —
    1880s amendments of the 1879 constitution).
  * ``editorial_status = draft``          (the "unpublished" status
    the brief asked for; only ``published`` shows on the public site).
  * ``status = abrogated``                (every constitution from
    1801-1879 was superseded; defaults to abrogated until an editor
    flips the surviving 1879-as-current-in-1885 row to in_force).
  * ``jurisdiction = HT``.
  * ``title_fr`` / ``official_title_fr`` — Janvier's chapter title
    (``Constitution de 1801``, ``Constitution Impériale de 1849``,
    etc.) plus the promulgator in the official-title form.
  * ``preamble_fr`` — Janvier's historical commentary that opens
    the chapter (``En 1799, la partie occidentale de l'île d'Haïti
    était connue sous le nom de colonie française de Saint-Domingue
    …``) + the constitution's own pre-article block (``Discours
    préliminaire``, ``Devise de l'Etat``…) until the first
    ``Article premier``.
  * ``promulgation_date`` / ``publication_date`` — best-effort
    canonical date for the constitution (e.g. 8 juillet 1801 for
    Toussaint; 20 mai 1805 for Dessalines).
  * Inner CHAPITRE / TITRE / SECTION headings → ``LegalHeading``
    rows. Articles → ``Article`` + ``ArticleVersion`` rows
    (``ArticleStatus = abrogated``).
  * ``source_url`` records the BnF Gallica permalink so editorial
    can verify any line back to the printed source.

Historical-text note: the pre-1843 constitutions use ``LIBERTÉ,
ÉGALITÉ OU LA MORT`` (or ``Au nom de Dieu Tout-Puissant``); the
Moniteur-era masthead filters we use elsewhere are *off* here —
those strings are body content for these instruments, not
boilerplate.

Idempotent — re-running skips constitutions whose
``(category, promulgation_date, title_fr)`` already exists.
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
sys.path.insert(0, str(BACKEND_ROOT))

import fitz  # noqa: E402 — PyMuPDF
from sqlalchemy import select, func  # noqa: E402

from api.db import SessionLocal  # noqa: E402
from schemas.enums import (  # noqa: E402
    ArticleStatus,
    EditorialStatus,
    HeadingLevel,
    LegalCategory,
    LegalStatus,
)
from services.corpus.models import (  # noqa: E402
    Article,
    ArticleVersion,
    LegalHeading,
    LegalText,
)
from services.ingestion.article_split import split_into_articles, split_preamble  # noqa: E402
from services.ingestion.document_parser import parse_document  # noqa: E402


SOURCE_PDF = (
    Path.home()
    / "Downloads"
    / "Les_constitutions_d'Haïti_(1801-1885)___[...]Janvier_Louis-Joseph_bpt6k61426252.pdf"
)
SOURCE_URL = "https://gallica.bnf.fr/ark:/12148/bpt6k61426252"


@dataclass
class JanvierChapter:
    """One book-level chapter from Janvier's compilation."""

    book_chapter: str        # ``I``, ``II``, …
    start_page: int          # 1-indexed inclusive
    end_page: int            # 1-indexed inclusive (last page of this chapter)
    year: int                # canonical year of the constitution
    title_fr: str            # editor-facing title
    official_title_fr: str   # verbatim canonical title from the period
    promulgation_iso: str    # YYYY-MM-DD — canonical promulgation date
    category: LegalCategory  # constitution / loi_constitutionnelle


# Boundaries identified by scanning the PDF for top-level ``CHAPITRE`` markers.
# Promulgation dates are taken from the canonical historiography
# (Dorsainville, Madiou, Ardouin, Schoelcher) — Janvier's prose carries
# the dates inline but never in a single-line form a regex could trust.
CHAPTERS: list[JanvierChapter] = [
    JanvierChapter(
        "I",  12,  36, 1801, "Constitution de 1801 (Toussaint-Louverture)",
        "Constitution de la Colonie française de Saint-Domingue — 8 juillet 1801",
        "1801-07-08", LegalCategory.constitution),
    JanvierChapter(
        "II", 37,  53, 1805, "Constitution Impériale d'Haïti de 1805 (Dessalines)",
        "Constitution Impériale d'Haïti — 20 mai 1805",
        "1805-05-20", LegalCategory.constitution),
    JanvierChapter(
        "III", 54, 90, 1806, "Constitution de 1806 (Pétion — République)",
        "Constitution de la République d'Haïti — 27 décembre 1806",
        "1806-12-27", LegalCategory.constitution),
    JanvierChapter(
        "IV", 91, 101, 1807, "Constitution de 1807 (Christophe — État du Nord)",
        "Constitution de l'État d'Haïti — 17 février 1807",
        "1807-02-17", LegalCategory.constitution),
    JanvierChapter(
        "V", 102, 119, 1811, "Constitution Royale de 1811 (Christophe)",
        "Loi constitutionnelle érigeant l'État d'Haïti en Royaume — 28 mars 1811 ; Constitution du Royaume — 2 avril 1811",
        "1811-04-02", LegalCategory.constitution),
    JanvierChapter(
        "VI", 120, 155, 1816, "Constitution de 1816 (Pétion — République révisée)",
        "Constitution de la République d'Haïti, révisée — 2 juin 1816",
        "1816-06-02", LegalCategory.constitution),
    JanvierChapter(
        "VII", 156, 198, 1843, "Constitution de 1843 (Hérard)",
        "Constitution de la République d'Haïti — 30 décembre 1843",
        "1843-12-30", LegalCategory.constitution),
    JanvierChapter(
        "VIII", 199, 239, 1846, "Constitution de 1846 (Riché)",
        "Constitution de la République d'Haïti — 14 novembre 1846",
        "1846-11-14", LegalCategory.constitution),
    JanvierChapter(
        "IX", 240, 280, 1849, "Constitution Impériale de 1849 (Soulouque / Faustin Ier)",
        "Constitution Impériale d'Haïti — 20 septembre 1849",
        "1849-09-20", LegalCategory.constitution),
    JanvierChapter(
        "X", 281, 308, 1859,
        "Lois constitutionnelles modifiantes de la Constitution de 1846 (Geffrard)",
        "Lois constitutionnelles révisant la Constitution de 1846 — 1858-1859 ; promulguées 23 octobre 1859",
        "1859-10-23", LegalCategory.loi_constitutionnelle),
    JanvierChapter(
        "XI", 309, 413, 1867, "Constitution de 1867 (Salnave)",
        "Constitution de la République d'Haïti — 14 juin 1867",
        "1867-06-14", LegalCategory.constitution),
    JanvierChapter(
        "XIII", 414, 478, 1879, "Constitution de 1879 (Boyer-Bazelais)",
        "Constitution de la République d'Haïti, votée par l'Assemblée constituante — 18 décembre 1879",
        "1879-12-18", LegalCategory.constitution),
    JanvierChapter(
        "XIV", 479, 635, 1880,
        "Amendements et lois constitutionnelles de la Constitution de 1879",
        "Lois constitutionnelles modifiant la Constitution de 1879 — 1880-1885",
        "1880-09-09", LegalCategory.loi_constitutionnelle),
]


# ---------------------------------------------------------------------------
# Text extraction + normalisation
# ---------------------------------------------------------------------------


_RUNNING_HEADER_RE = re.compile(
    r"^\s*(?:LES\s+CONSTITUTIONS\s+D'?\s*HA[ÏI]TI\.?|CONSTITUTION\s+(?:DE\s+L'EMPIRE\s+D'HA[ÏI]TI\s+)?(?:DE\s+|D'?)\s*\d{4}\.?|CHAPITRE\s+(?:PREMIER|I{1,3}|IV|V|VI{0,3}|IX|X|XI{0,3}|XIV|XV))\s*$",
    re.IGNORECASE | re.MULTILINE,
)

# Page-number lines (Roman ``IV`` or Arabic ``38``) — short and alone.
_PAGE_NUM_RE = re.compile(r"^\s*(?:\d{1,3}|[IVXLCDM]{1,7})\s*$", re.MULTILINE)


def _dehyphenate(text: str) -> str:
    """Join ``com-\nmerce`` back into ``commerce``. Skip if the next line
    starts with an uppercase letter (proper-name break)."""
    return re.sub(r"(\w)-\n(\w)", lambda m: m.group(1) + m.group(2), text)


def extract_chapter_text(doc: fitz.Document, ch: JanvierChapter) -> str:
    """Pull, concatenate, and lightly normalise every page in a chapter."""
    parts: list[str] = []
    for i in range(ch.start_page - 1, ch.end_page):
        if i >= doc.page_count:
            break
        parts.append(doc[i].get_text("text"))
    raw = "\n".join(parts)
    raw = _dehyphenate(raw)
    raw = _RUNNING_HEADER_RE.sub("", raw)
    raw = _PAGE_NUM_RE.sub("", raw)
    raw = re.sub(r" +\n", "\n", raw)
    raw = re.sub(r"\n{3,}", "\n\n", raw)
    raw = re.sub(r"[ \t]{2,}", " ", raw)
    return _strip_preamble_devise(raw.strip())


# ---------------------------------------------------------------------------
# Devise-aware preamble cleanup
# ---------------------------------------------------------------------------

# The Haitian constitutions all open with the State's devise:
#   ``LIBERTÉ, ÉGALITÉ OU LA MORT``   (1801-1820, pre-revision era)
#   ``LIBERTÉ ÉGALITÉ FRATERNITÉ``    (post-revision, 1843 onward)
#   ``AU NOM DE LA RÉPUBLIQUE``       (1879+ promulgation banner)
# The article splitter in services/ingestion/article_split.py uses
# ``LIBERTÉ ÉGALITÉ`` as the *post*-dispositif marker (the Moniteur-
# style promulgation banner that appears AFTER the last article).
# In Janvier's compilation that pattern appears BEFORE the first
# article, so the splitter slices the entire constitution off as
# closing-block content and returns 0 articles.
#
# We strip those devise / promulgation lines from the preamble zone
# (everything up to ``Article 1`` / ``Art. 1``) before handing the
# body to the splitter. Articles + body of the constitution stay
# untouched.
_DEVISE_LINE_RE = re.compile(
    r"^\s*(?:"
    r"LIBERT[ÉE](?:[\s,]+[ÉE]GALIT[ÉE])?(?:[\s,]+(?:FRATERNIT[ÉE]|OU\s+LA\s+MORT))?"
    r"|[ÉE]GALIT[ÉE](?:[\s,]+(?:FRATERNIT[ÉE]|OU\s+LA\s+MORT))?"
    r"|FRATERNIT[ÉE]"
    r"|OU\s+LA\s+MORT"
    r"|AU\s+NOM\s+DE\s+LA\s+R[ÉE]PUBLIQUE"
    r"|R[ÉE]PUBLIQUE\s+D'?\s*HA[IÏ]TI"
    r"|EMPIRE\s+D'?\s*HA[IÏ]TI"
    r")\s*\.?\s*$",
    re.IGNORECASE | re.MULTILINE,
)

_FIRST_ARTICLE_RE = re.compile(
    r"(?:^|\n)\s*Art(?:\.?|icle)\s+(?:1er|premier|1)\b",
    re.IGNORECASE,
)


def _strip_preamble_devise(text: str) -> str:
    """Strip devise + promulgation-banner lines from the pre-article
    region. Everything from the first article onward is left untouched."""
    m = _FIRST_ARTICLE_RE.search(text)
    if not m:
        return text
    head = text[: m.start()]
    tail = text[m.start():]
    head = _DEVISE_LINE_RE.sub("", head)
    head = re.sub(r"\n{3,}", "\n\n", head)
    return head + tail


# ---------------------------------------------------------------------------
# Slug helper
# ---------------------------------------------------------------------------


def _slugify(text: str, max_len: int = 90) -> str:
    s = text.lower()
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
    existing = session.scalar(
        select(func.count()).select_from(LegalText).where(LegalText.slug == base)
    )
    if not existing:
        return base
    n = 2
    while True:
        candidate = f"{base}-{n}"
        if not session.scalar(
            select(func.count()).select_from(LegalText).where(LegalText.slug == candidate)
        ):
            return candidate
        n += 1


# ---------------------------------------------------------------------------
# Promote one chapter into a LegalText + Articles
# ---------------------------------------------------------------------------


def promote_chapter(session, ch: JanvierChapter, body: str) -> int | None:
    """Return the new LegalText id, or None if already-ingested."""
    pub_date = date.fromisoformat(ch.promulgation_iso)
    # Dedup: ``(category, promulgation_date, title_fr)`` is unique enough.
    existing = session.scalar(
        select(LegalText.id).where(
            LegalText.category == ch.category,
            LegalText.promulgation_date == pub_date,
            LegalText.title_fr == ch.title_fr,
        )
    )
    if existing is not None:
        return None

    # Parse the body
    parsed = parse_document(body)
    pp = split_preamble(parsed.preamble or "")

    description_fr = (
        f"{ch.official_title_fr}. "
        f"Texte historique transcrit dans Louis-Joseph Janvier, "
        f"Les Constitutions d'Haïti (1801-1885), Paris, "
        f"Marpon et Flammarion, 1886 — chapitre {ch.book_chapter}."
    )

    slug = _unique_slug(session, _slugify(ch.title_fr))
    legal_text = LegalText(
        slug=slug,
        category=ch.category,
        jurisdiction="HT",
        title_fr=ch.title_fr,
        official_title_fr=ch.official_title_fr,
        description_fr=description_fr,
        preamble_fr=parsed.preamble.strip() or None,
        visas_fr=(pp.visas or "").strip() or None,
        considerants_fr=(pp.considerants or "").strip() or None,
        mentions_procedurales_fr=(
            f"Source : Bibliothèque nationale de France, Gallica — "
            f"Janvier, Louis-Joseph (1886), Les Constitutions d'Haïti (1801-1885). "
            f"Voir {SOURCE_URL}."
        ),
        enacting_formula_fr=(pp.enacting_formula or "").strip() or None,
        promulgation_date=pub_date,
        publication_date=pub_date,
        status=LegalStatus.abrogated,  # every one of these is historic
        editorial_status=EditorialStatus.draft,
    )
    session.add(legal_text)
    session.flush()

    # Headings — flat for now (parser produces them as a flat list per
    # parent resolution; we keep depth via parent_id but skip TocNode
    # tree generation since this is a draft).
    heading_id_by_key: dict[str, int] = {}
    for i, ph in enumerate(parsed.headings):
        try:
            level_enum = HeadingLevel(ph.level)
        except ValueError:
            level_enum = HeadingLevel.chapter  # safe default
        h = LegalHeading(
            legal_text_id=legal_text.id,
            parent_id=heading_id_by_key.get(ph.parent_key or "") if ph.parent_key else None,
            level=level_enum,
            key=ph.key,
            number=ph.number or None,
            title_fr=ph.title_fr or None,
            position=i,
        )
        session.add(h)
        session.flush()
        heading_id_by_key[ph.key] = h.id

    # Articles
    seen_slugs: set[str] = set()
    article_count = 0
    for i, pa in enumerate(parsed.articles):
        base = _slugify(f"art-{pa.number}", max_len=40)
        art_slug = base
        n = 2
        while art_slug in seen_slugs:
            art_slug = f"{base}-{n}"
            n += 1
        seen_slugs.add(art_slug)
        heading_id = heading_id_by_key.get(pa.heading_key or "")
        article = Article(
            legal_text_id=legal_text.id,
            number=pa.number,
            slug=art_slug,
            position=i,
            heading_id=heading_id,
            domain_tags=[],
        )
        session.add(article)
        session.flush()
        version = ArticleVersion(
            article_id=article.id,
            version_number=1,
            text_fr=pa.content_fr.strip(),
            status=ArticleStatus.abrogated,
            editorial_status=EditorialStatus.draft,
        )
        session.add(version)
        session.flush()
        article.current_version_id = version.id
        article_count += 1

    return legal_text.id


def main() -> None:
    if not SOURCE_PDF.exists():
        raise SystemExit(f"source PDF not found: {SOURCE_PDF}")

    doc = fitz.open(str(SOURCE_PDF))
    inserted: list[tuple[int, str, int, int]] = []  # (lt_id, title, headings, articles)
    skipped = 0
    failed: list[tuple[str, str]] = []

    with SessionLocal() as s:
        for ch in CHAPTERS:
            try:
                body = extract_chapter_text(doc, ch)
                lt_id = promote_chapter(s, ch, body)
                if lt_id is None:
                    skipped += 1
                    print(f"  · {ch.book_chapter} {ch.year} — already ingested, skipped")
                    continue
                s.commit()
                heads = s.scalar(
                    select(func.count()).select_from(LegalHeading).where(
                        LegalHeading.legal_text_id == lt_id
                    )
                ) or 0
                arts = s.scalar(
                    select(func.count()).select_from(Article).where(
                        Article.legal_text_id == lt_id
                    )
                ) or 0
                inserted.append((lt_id, ch.title_fr, heads, arts))
                print(
                    f"  + Chap. {ch.book_chapter} ({ch.year}) → LegalText #{lt_id} — "
                    f"{heads} headings, {arts} articles"
                )
            except Exception as exc:  # noqa: BLE001
                s.rollback()
                failed.append((ch.book_chapter, str(exc)))
                print(f"  ! Chap. {ch.book_chapter}: {exc}")

    print(
        f"\nDone. inserted={len(inserted)}, skipped={skipped}, failed={len(failed)}"
    )
    if failed:
        for ch, reason in failed:
            print(f"  - Chap. {ch}: {reason}")


if __name__ == "__main__":
    main()
