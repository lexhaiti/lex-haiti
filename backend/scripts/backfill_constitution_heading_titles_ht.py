"""Backfill ``legal_headings.title_ht`` for constitution-1987.

The original ingestion only populated ``title_fr`` for the 61 structural
headings of the 1987 Constitution. The TOC therefore shows an "FR"
fallback badge on every TIT / CHAPIT / SEKSYON row when the page is in
Kreyòl. This script applies the canonical Kreyòl translations
(cross-referenced against the N° 36-A transcription) so the TOC reads
natively in Kreyòl.

Mapping is keyed on ``(level, number, normalised_fr)`` rather than raw
row IDs so the script runs unchanged across local + Azure prod.
Idempotent — re-runs on already-translated rows are no-ops.

Usage (from ``backend/``)::

    .venv/bin/python scripts/backfill_constitution_heading_titles_ht.py
    .venv/bin/python scripts/backfill_constitution_heading_titles_ht.py --dry-run
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import Session

from api.config import get_settings
from services.corpus.models import LegalHeading, LegalText


CONSTITUTION_SLUG = "constitution-1987"


# Canonical Kreyòl translations for the 1987 Constitution's structural
# headings, cross-referenced against Le Moniteur N° 36-A (28 avril 1987).
#
# Key: (level, number, title_fr) — the title_fr is included for safety
# so a future re-ingestion that renumbers headings won't silently apply
# the wrong translation.
HEADING_TRANSLATIONS: dict[tuple[str, str, str], str] = {
    # ── TIT I ────────────────────────────────────────────────────────
    ("title", "I", "DE LA REPUBLIQUE D'HAITI: SON EMBLÈME - SES SYMBOLES"):
        "KONSENAN REPIBLIK AYITI: SIY VÈVÈ LI EPI LÒT SIY LI YO",
    ("chapter", "I", "DE LA REPUBLIQUE D'HAITI"):
        "Konsènan Repiblik Ayiti",
    ("chapter", "II", "DU TERRITOIRE DE LA REPUBLIQUE D'HAITI"):
        "Konsènan Teritwa Repiblik la",
    # ── TIT II ───────────────────────────────────────────────────────
    ("title", "II", "DE LA NATIONALITE HAITIENNE"):
        "KONSÈNAN NASYONALITE AYISYEN",
    # ── TIT III ──────────────────────────────────────────────────────
    ("title", "III", "DU CITOYEN DES DROITS ET DEVOIRS FONDAMENTAUX"):
        "KONSÈNAN SITWAYEN AN, DWA AK DEVWA FONDALNATAL",
    ("chapter", "I", "DE LA QUALITE DE CITOYEN"):
        "Konsènan Kalite yon Sitwayen",
    ("chapter", "II", "DES DROITS FONDAMENTAUX"):
        "Konsènan Dwa Fondalnatal Sitwayen yo",
    ("section", "A", "DROIT A LA VIE ET A LA SANTE"):
        "Dwa Lavi ak Lasante",
    ("section", "B", "DE LA LIBERTE INDIVIDUELLE"):
        "Dwa sou Libète Chak Moun",
    ("section", "C", "DE LA LIBERTE D'EXPRESSION"):
        "Dwa sou Libète Lapawòl",
    ("section", "D", "DE LA LIBERTE DE CONSCIENCE"):
        "Dwa sou Libète Konsyans",
    ("section", "E", "DE LA LIBERTE DE RÉUNION ET D'ASSOCIATION"):
        "Dwa sou Libète Reyinyon ak Libète Asosyasyon",
    ("section", "F", "DE L'EDUCATION ET DE L'ENSEIGNEMENT"):
        "Dwa sou Levasyon ak sou Ansèyman",
    ("section", "G", "DE LA LIBERTE DU TRAVAIL"):
        "Dwa sou Libète Travay",
    ("section", "H", "DE LA PROPRIÉTÉ"):
        "Dwa sou Pwopriyete",
    ("section", "I", "DROIT A L'INFORMATION"):
        "Dwa pou jwenn Enfòmasyon",
    ("section", "J", "DROIT A LA SÉCURITÉ"):
        "Dwa pou Sekirite",
    ("chapter", "III", "DES DEVOIRS DU CITOYEN"):
        "Konsènan Devwa Sitwayen yo",
    # ── TIT IV ───────────────────────────────────────────────────────
    ("title", "IV", "DES ETRANGERS"):
        "KONSÈNAN ETRANJE YO",
    # ── TIT V ────────────────────────────────────────────────────────
    ("title", "V", "DE LA SOUVERAINETÉ NATIONAL"):
        "KONSÈNAN SOUVRÈNTE NASYONAL LA",
    ("chapter", "I", "DES COLLECTIVITÉS TERRITORIALES ET DE LA DÉCENTRALISATION"):
        "Konsènan Kolektivite Teritoryal yo ak Desantralizasyon",
    ("section", "A", "DE LA SECTION COMMUNALE"):
        "Konsènan Seksyon Kominal la",
    ("section", "B", "DE LA COMMUNE"):
        "Konsènan Komin nan",
    ("section", "C", "DE L'ARRONDISSEMENT"):
        "Konsènan Awondisman an",
    ("section", "D", "DU DEPARTEMENT"):
        "Konsènan Depatman an",
    ("section", "E", "DES DÉLÉGUÉS ET VICE-DÉLÉGUÉS"):
        "Konsènan Delege ak Vis-Delege yo",
    ("section", "F", "DU CONSEIL INTERDÉPARTEMENTAL"):
        "Konsènan Konsèy Entèdepatmantal la",
    ("chapter", "II", "DU POUVOIR LÉGISLATIF"):
        "Konsènan Pouvwa Lejislatif la",
    ("section", "A", "DE LA CHAMBRE DES DEPUTES"):
        "Konsènan Lachanm Depite yo",
    ("section", "B", "DU SENAT"):
        "Konsènan Sena a",
    ("section", "C", "DE L'ASSEMBLÉE NATIONALE"):
        "Konsènan Asanble Nasyonal la",
    ("section", "D", "DE L'EXERCICE DU POUVOIR LÉGISLATIF"):
        "Konsènan jan Pouvwa Lejislatif la travay",
    ("section", "E", "DES INCOMPATIBILITÉS"):
        "Konsènan Enkonpatibilite yo",
    ("chapter", "III", "DU POUVOIR EXÉCUTIF"):
        "Konsènan Pouvwa Egzekitif la",
    ("section", "A", "DU PRÉSIDENT DE LA REPUBLIQUE"):
        "Konsènan Prezidan Repiblik la",
    ("section", "B", "DES ATTRIBUTIONS DU PRESIDENT DE LA REPUBLIQUE"):
        "Konsènan Atribisyon Prezidan Repiblik la",
    ("section", "C", "DU GOUVERNEMENT"):
        "Konsènan Gouvènman an",
    ("section", "D", "DES ATTRIBUTIONS DU PREMIER MINISTRE"):
        "Konsènan Atribisyon Premye Minis la",
    ("section", "E", "DES MINISTRES ET DES SECRÉTAIRES D'ETAT"):
        "Konsènan Minis yo ak Sekretè Deta yo",
    ("chapter", "IV", "DU POUVOIR JUDICIAIRE"):
        "Konsènan Pouvwa Jidisyè a",
    ("chapter", "V", "DE LA HAUTE COUR DE JUSTICE"):
        "Konsènan Wo Tribinal Lajistis",
    # ── TIT VI ───────────────────────────────────────────────────────
    ("title", "VI", "DES INSTITUTIONS INDEPENDANTES"):
        "KONSÈNAN ENSTITISYON ENDEPANDAN YO",
    ("chapter", "Préliminaire", "Du Conseil Constitutionnel"):
        "Konsènan Konsèy Konstitisyonèl la",
    ("chapter", "I", "DU CONSEIL ELECTORAL PERMANENT"):
        "Konsènan Konsèy Elektoral Pèmanan an",
    ("chapter", "II",
     "DE LA COUR SUPERIEURE DES COMPTES ET DU CONTENTIEUX ADMINISTRATIF"):
        "Konsènan Wo Tribinal Kont ak Kontansye Administratif la",
    ("chapter", "III", "DE LA COMMISSION DE CONCILIATION"):
        "Konsènan Komisyon Konsilyasyon an",
    ("chapter", "IV", "DE LA PROTECTION DU CITOYEN"):
        "Konsènan Pwoteksyon Sitwayen an",
    ("chapter", "V", "DE L'UNIVERSITÉ, DE L'ACADÉMIE, DE LA CULTURE"):
        "Konsènan Inivèsite, Akademi, Kilti",
    # ── TIT VII – XV ─────────────────────────────────────────────────
    ("title", "VII", "DES FINANCES PUBLIQUES"):
        "KONSÈNAN FINANS PIBLIK YO",
    ("title", "VIII", "DE LA FONCTION PUBLIQUE"):
        "KONSÈNAN FONKSYON PIBLIK LA",
    # Title IX has empty title_fr — leave alone.
    ("chapter", "I", "DE L'ECONOMIE ET DE L'AGRICULTURE"):
        "Konsènan Ekonomi ak Agrikilti",
    ("chapter", "II", "DE L'ENVIRONNEMENT"):
        "Konsènan Anviwònman an",
    ("title", "X", "DE LA FAMILLE"):
        "KONSÈNAN FANMI",
    ("title", "XI", "DE LA FORCE PUBLIQUE"):
        "KONSÈNAN FÒS PIBLIK LA",
    ("chapter", "I", "DES FORCES ARMÉES"):
        "Konsènan Fòs Lame yo",
    ("chapter", "II", "DES FORCES DE POLICE"):
        "Konsènan Fòs Polis yo",
    ("title", "XII", "DISPOSITIONS GÉNÉRALES"):
        "DISPOZISYON JENERAL YO",
    ("title", "XIII", "AMENDEMENTS A LA CONSTITUTION"):
        "AMANNMAN NAN KONSTITISYON AN",
    ("title", "XIV", "DES DISPOSITIONS TRANSITOIRES"):
        "KONSÈNAN DISPOZISYON TRANZITWA YO",
    ("title", "XV", "DISPOSITIONS FINALES"):
        "DÈNYE DISPOZISYON YO",
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    settings = get_settings()
    engine = create_engine(settings.database_url, echo=False)

    with Session(engine) as session:
        text = session.execute(
            select(LegalText).where(LegalText.slug == CONSTITUTION_SLUG)
        ).scalar_one_or_none()
        if text is None:
            print(f"ERROR: legal_text {CONSTITUTION_SLUG!r} not found.")
            return 1

        rows = session.execute(
            select(LegalHeading).where(LegalHeading.legal_text_id == text.id)
        ).scalars().all()

        applied = 0
        skipped_already_set = 0
        missing: list[tuple[str, str, str]] = []
        for h in rows:
            level = h.level
            number = (h.number or "").strip()
            tfr = (h.title_fr or "").strip()
            key = (level, number, tfr)
            tht = HEADING_TRANSLATIONS.get(key)
            if tht is None:
                if tfr:
                    missing.append(key)
                continue
            if (h.title_ht or "").strip() == tht:
                skipped_already_set += 1
                continue
            if not args.dry_run:
                session.execute(
                    update(LegalHeading)
                    .where(LegalHeading.id == h.id)
                    .values(title_ht=tht)
                )
            applied += 1

        if not args.dry_run:
            session.commit()

    print(
        f"\nResult"
        f"\n  Applied: {applied}"
        f"\n  Already up-to-date: {skipped_already_set}"
        f"\n  FR rows with no translation entry: {len(missing)}"
    )
    if missing:
        for k in missing[:10]:
            print(f"    - {k}")
        if len(missing) > 10:
            print(f"    …+{len(missing) - 10} more")
    print("[dry-run]" if args.dry_run else "[committed]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
