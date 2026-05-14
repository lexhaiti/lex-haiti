"""Ingest historical Haitian constitutions from mjp.univ-perp.fr.

Reads the HTML files captured into scripts/_constitutions_raw/ (one per year,
named ht{YYYY}.htm) and inserts each as a *draft* LegalText.

Design choices, all of them deliberate:

  - **editorial_status='draft'** → invisible on the public API until a human
    promotes them. Honors the architecture principle "nothing publishes
    without editorial review."

  - **No article parsing.** These texts span 200 years of evolving legal form
    (1801 Toussaint vs 1987 Duvalier-aftermath). Detecting article structure
    here would be guessing at legal substance, which CLAUDE.md explicitly
    tells the assistant not to do. The full body text goes into preamble_fr
    as a single blob — structuring is editorial work for a later phase.

  - **status='in_force' for 1987 only**, all others 'abrogated'. This is
    factually uncontroversial: every constitution prior to the current one
    is, by definition, abrogated. The 1987 constitution itself was amended
    in 2011/2012 — calling the original-text-as-published "in_force" is a
    simplification an editor can refine later.

  - **moniteur_ref carries the source URL** as cheap provenance. When a
    proper raw_documents/raw_pages workflow ships, we'll backfill it.

  - **Idempotent.** Re-running skips already-inserted slugs.

Run:
    pip install -e ".[ingestion]"     # adds beautifulsoup4
    python -m scripts.ingest_constitutions
"""
from __future__ import annotations

import re
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup
from sqlalchemy import select

from api.db import SessionLocal
from schemas.enums import (
    EditorialStatus,
    LegalCategory,
    LegalStatus,
)
from services.corpus.models import LegalText

RAW_DIR = Path(__file__).parent / "_constitutions_raw"
SOURCE_BASE = "https://mjp.univ-perp.fr/constit/"

# Single 'in_force' constitution. Older ones are categorically abrogated.
CURRENT_CONSTITUTION_YEAR = 1987


def _extract_text(html: str) -> str:
    """Plain text from MJP-style HTML, approximating browser innerText.

    These pages are old (Web 1.0 era) and use tables for layout. bs4 with the
    stdlib html.parser handles them fine.
    """
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "head", "meta", "link"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    # Collapse 3+ newlines to 2 — preserve paragraph breaks, drop noise.
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _description(year: int, url: str) -> str:
    return (
        f"Texte numérisé depuis l'archive de l'Université de Perpignan "
        f"(Maurice Joly Project — mjp.univ-perp.fr). Source : {url}. "
        f"Données importées en mode brouillon — révision éditoriale requise "
        f"avant publication."
    )


def ingest() -> None:
    files = sorted(RAW_DIR.glob("ht*.htm"))
    if not files:
        print(f"No raw HTML files in {RAW_DIR}. Run the curl bulk-fetch first.")
        return

    inserted = 0
    skipped = 0

    with SessionLocal() as session:
        for path in files:
            m = re.match(r"ht(\d{4})\.htm$", path.name)
            if not m:
                print(f"  skip   {path.name} (unrecognized filename)")
                continue
            year = int(m.group(1))
            slug = f"constitution-{year}"

            existing = session.execute(
                select(LegalText).where(LegalText.slug == slug)
            ).scalar_one_or_none()
            if existing:
                skipped += 1
                print(f"  skip   {slug} (already present, id={existing.id})")
                continue

            url = f"{SOURCE_BASE}{path.name}"
            html = path.read_text(encoding="utf-8", errors="replace")
            text = _extract_text(html)

            status = (
                LegalStatus.in_force
                if year == CURRENT_CONSTITUTION_YEAR
                else LegalStatus.abrogated
            )

            row = LegalText(
                slug=slug,
                category=LegalCategory.constitution,
                jurisdiction="HT",
                title_fr=f"Constitution haïtienne de {year}",
                title_ht=None,
                description_fr=_description(year, url),
                description_ht=None,
                preamble_fr=text,
                preamble_ht=None,
                promulgation_date=date(year, 1, 1),
                publication_date=None,
                moniteur_ref=f"Source: {url}",
                status=status,
                editorial_status=EditorialStatus.draft,
            )
            session.add(row)
            session.flush()
            inserted += 1
            print(
                f"  new    {slug}  status={status.value}  "
                f"preamble={len(text):>6} chars"
            )

        session.commit()

    print("---")
    print(f"Inserted: {inserted}    Skipped: {skipped}    Total files: {len(files)}")


if __name__ == "__main__":
    ingest()
