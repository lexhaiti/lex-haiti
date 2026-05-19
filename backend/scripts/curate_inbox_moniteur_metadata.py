"""Curate per-file metadata for every ``Inbox laws-2026`` Moniteur issue.

The auto-staging pass (``import_laws_folder_as_drafts.py``) gave each
PDF a placeholder ``MoniteurIssue`` with a slug-mash ``number``
(``Inbox-decret-decret-fixant-l-organisation-et``) and a heuristic
``year`` derived from the filename, which for files like
``1005901609-5f5a8ad385746801097332.pdf`` defaults to **2026** even
though the act is from 1996.

This script applies a curated, per-file table so the editorial
moniteur list shows:

  * the real Moniteur reference when carried by the PDF itself
    (``Spécial 4`` for the bail-prof decree, ``Spécial 6`` for the
    matrimonial-regimes decree, ``Spécial 66`` for the 2025
    electoral decree, ``Extraordinaire 19`` for the PetroCaribe
    compilation, …);

  * a clean ``Brouillon: <short act title>`` ID when we don't yet
    have the Moniteur ref (most pre-2010 scans don't carry it on
    the cover page);

  * the correct ``year`` (calendar year of publication), promulgation
    date, and a canonical French ``display_title`` for the entry
    (drives the sommaire row in /editorial/moniteur/<id>).

The mapping is keyed by the staged filename **without the 6-hex
content-hash suffix and without ``.pdf``** — that's the stable form
of ``_stable_target_name`` in ``import_laws_folder_as_drafts.py``.
We strip the trailing ``-<6hex>`` chunk on lookup so re-staging
(which could change the hash) doesn't break the mapping.

Idempotent. Re-running is a no-op when the curated values already
match the DB.
"""
from __future__ import annotations

import re
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select  # noqa: E402

from api.db import SessionLocal  # noqa: E402
from schemas.enums import MoniteurDocumentType  # noqa: E402
from services.corpus.models import MoniteurEntry, MoniteurIssue  # noqa: E402


EDITION = "Inbox laws-2026"

# Curated table — one row per source PDF.
#
# Key:   staged-filename stem with the trailing ``-<6hex>`` hash
#        chunk stripped (so re-staging is safe).
# Value: (year, number, publication_date_iso, doctype, display_title)
#
# Fields:
#   year:     calendar year of publication
#   number:   Moniteur ref when carried by the PDF, otherwise a
#             ``Brouillon: <short act ID>`` placeholder unique
#             within ``year``.
#   pub_iso:  YYYY-MM-DD — the publication date (or the act date
#             when the Moniteur publication date is unknown).
#   doctype:  MoniteurDocumentType — drives the sommaire badge.
#   title:    canonical French display title for the entry.
CURATION: dict[str, tuple[int, str, str, MoniteurDocumentType, str]] = {
    # ----- 1960s — Duvalier (François) era -----
    "03-18-1966-a": (
        1966,
        "22-A",
        "1966-03-18",
        MoniteurDocumentType.decret,
        "Décret du 18 mars 1966 modifiant la Loi du 12 mars 1958 créant l'Ordre du Mérite Militaire Jean-Jacques Dessalines Le Grand",
    ),
    # ----- 1970s — Duvalier (Jean-Claude) era -----
    "701444946-moniteur-decret-7-avril-1978-creant-l-apn": (
        1978,
        "Brouillon · Décret APN 1978",
        "1978-04-07",
        MoniteurDocumentType.decret,
        "Décret du 7 avril 1978 modifiant l'organisation de l'Autorité Portuaire Nationale (APN)",
    ),
    "584826828-decret-du-29-mars-reglementant-la-profession-avocat-pd": (
        1979,
        "Brouillon · Décret avocat 1979",
        "1979-03-29",
        MoniteurDocumentType.decret,
        "Décret du 29 mars 1979 réglementant la profession d'avocat",
    ),
    # ----- 1980s — late Duvalier (J-C) -----
    "701444950-moniteur-decret-15-mars-1985-organisant-l-apn": (
        1985,
        "Brouillon · Décret APN 1985",
        "1985-03-15",
        MoniteurDocumentType.decret,
        "Décret du 15 mars 1985 organisant l'Autorité Portuaire Nationale (APN)",
    ),
    # ----- 1987 — post-Duvalier transition -----
    "530707552-decret-du-17-aout-1987-portant-organisation-et-fonctio": (
        1987,
        "Brouillon · Décret MAE 1987",
        "1987-08-17",
        MoniteurDocumentType.decret,
        "Décret du 17 août 1987 portant organisation et fonctionnement du Ministère des Affaires Étrangères",
    ),
    # ----- 1989 — Avril government decrees-laws on education -----
    "703232731-loi-moniteur-decret-loi-organique-menfp-1989": (
        1989,
        "Brouillon · Décret-loi MENFP 1989",
        "1989-06-05",
        MoniteurDocumentType.decret,
        "Décret-loi du 5 juin 1989 portant organisation du Ministère de l'Éducation Nationale et de la Formation Professionnelle (MENFP)",
    ),
    "558118993-decret-adaptant-les-structures-organlsattonnelles-du-m": (
        1989,
        "Brouillon · Décret-loi MENJS 1989",
        "1989-06-05",
        MoniteurDocumentType.decret,
        "Décret-loi du 5 juin 1989 adaptant les structures organisationnelles du Ministère de l'Éducation Nationale, de la Jeunesse et des Sports aux nouvelles réalités sociopolitiques",
    ),
    # ----- 1996 — Préval I -----
    "1005901609-5f5a8ad385746801097332": (
        1996,
        "Brouillon · Loi sections communales 1996",
        "1996-03-26",
        MoniteurDocumentType.loi,
        "Loi du 26 mars 1996 portant organisation de la Collectivité Territoriale de Section Communale",
    ),
    # ----- 2001 — Aristide II -----
    "222345469-haiti-loi-relative-au-controle-et-a-la-repression-du-t": (
        2001,
        "Brouillon · Loi drogue 2001",
        "2001-10-04",
        MoniteurDocumentType.loi,
        "Loi du 4 octobre 2001 relative au contrôle et à la répression du trafic illicite de la drogue",
    ),
    # ----- 2002 — Aristide II — the binationaux law (variante of #36) -----
    "54785cac4": (
        2002,
        "Brouillon · Loi privilèges binationaux 2002 (variante)",
        "2002-08-12",
        MoniteurDocumentType.loi,
        "Loi du 1er août 2002 portant privilèges accordés aux Haïtiens d'origine jouissant d'une autre nationalité (variante de la version publiée au Moniteur 65/2002)",
    ),
    # ----- 2006 — Boniface Alexandre transition -----
    "237115038-decret-fixant-l-organisation-et-le-fonctionnement-de-l": (
        2006,
        "Brouillon · Décret organisation commune 2006",
        "2006-06-02",
        MoniteurDocumentType.decret,
        "Décret du 1er février 2006 fixant l'organisation et le fonctionnement de la Collectivité Municipale dite Commune ou Municipalité",
    ),
    "55540673-les-lois-votees-par-la-48eme-legislature-deputes-2006-2": (
        2010,
        "Compilation · 48ème Législature 2006-2010",
        "2010-01-13",
        MoniteurDocumentType.autre,
        "Lois adoptées par la 48ème Législature — Chambre des Députés (2006-2010)",
    ),
    # ----- 2009 — Préval II — reproductions for material errors -----
    "655172452-loi-sur-les-marche-s-publics-10-juin-2009": (
        2009,
        "60 (reproduction)",
        "2009-06-12",
        MoniteurDocumentType.loi,
        "Loi du 10 juin 2009 fixant les règles générales relatives aux marchés publics et aux conventions de concession d'ouvrage de service public (reproduction pour erreurs matérielles)",
    ),
    "55535676-reglements-interieurs-du-senat-haiti": (
        2009,
        "Spécial 4 (reproduction)",
        "2009-06-03",
        MoniteurDocumentType.autre,
        "Règlement Intérieur du Sénat — 8e édition adoptée le 14 novembre 2008 (reproduction pour erreurs matérielles)",
    ),
    # ----- 2014 — Martelly era -----
    "548673623-le-moniteur-21-mars-2014-arrete-fixant-le-statut-parti": (
        2014,
        "Brouillon · Le Moniteur 21 mars 2014",
        "2014-03-21",
        MoniteurDocumentType.arrete,
        "Arrêté du 21 mars 2014 fixant le statut particulier des personnels éducatifs (et arrêtés sur les aires protégées des Trois Baies, AHTIC, APB, etc.)",
    ),
    "603565368-loi-sur-les-partis-politiques-haiti-haitijustice": (
        2014,
        "Brouillon · Loi partis politiques 2014",
        "2014-01-16",
        MoniteurDocumentType.loi,
        "Loi du 16 janvier 2014 portant formation, fonctionnement et financement des Partis Politiques",
    ),
    # ----- 2015 — Martelly -----
    "832110484-decret-sections-communales": (
        2015,
        "Brouillon · Décret limites territoriales 2015",
        "2015-08-05",
        MoniteurDocumentType.decret,
        "Décret du 5 août 2015 identifiant et établissant les limites territoriales des Départements, Arrondissements, Communes et Sections Communales de la République d'Haïti",
    ),
    "287728347-haiti-l-arrete-presidentiel-193-traitant-des-exonerati": (
        2015,
        "Brouillon · Arrêté présidentiel 193 / 2015",
        "2015-10-08",
        MoniteurDocumentType.arrete,
        "Arrêté Présidentiel No 193 du 8 octobre 2015 révisant l'Arrêté du 23 novembre 2005 relatif aux privilèges accordés aux anciens Chefs d'État et de Gouvernement",
    ),
    # ----- 2016 — Privert / Martelly transition -----
    "299581779-decret-creant-le-centre-financier-international-de-l-i": (
        2016,
        "Brouillon · Décret Centre Financier Gonâve 2016",
        "2016-01-07",
        MoniteurDocumentType.decret,
        "Décret du 7 janvier 2016 créant le Centre Financier International de l'Île de La Gonâve",
    ),
    "decret-portant-sur-la-signature-e-lectronique": (
        2016,
        "Brouillon · Décret signature électronique 2016",
        "2016-01-29",
        MoniteurDocumentType.decret,
        "Décret du 29 janvier 2016 portant sur la signature électronique",
    ),
    # ----- 2017 — Moïse I -----
    "542383239-loi-signature-et-echanges-electroniques-2017-1": (
        2017,
        "Brouillon · Loi signature et échanges électroniques 2017",
        "2017-04-11",
        MoniteurDocumentType.loi,
        "Loi sur la signature électronique et Loi sur les échanges électroniques (votées au Sénat les 14 et 16 février 2017)",
    ),
    # ----- 2018 — Moïse I -----
    "392696061-compilations-textes-relatifs-aux-fonds-petrocaribe-mon": (
        2018,
        "Extraordinaire 19",
        "2018-10-24",
        MoniteurDocumentType.autre,
        "Compilations des Textes relatifs aux Fonds PetroCaribe — Le Moniteur Numéro Extraordinaire N° 19 du 24 octobre 2018",
    ),
    # ----- 2020 — Moïse II — landmark codification decrees -----
    "694424192-moniteur-bail-a-usage-professionnel-decret-du-9-avril": (
        2020,
        "Spécial 4",
        "2020-05-11",
        MoniteurDocumentType.decret,
        "Décret du 9 avril 2020 sur le bail à usage professionnel",
    ),
    "887716264-regimes-matrimoniaux-decret-9-avril-2020": (
        2020,
        "Spécial 6",
        "2020-05-13",
        MoniteurDocumentType.decret,
        "Décret du 9 avril 2020 portant réforme des Régimes Matrimoniaux",
    ),
    "700927831-avis-de-liquidation-de-pension-civile-de-retraite": (
        2020,
        "Brouillon · Avis pension civile 2020",
        "2020-07-02",
        MoniteurDocumentType.autre,
        "Avis de Liquidation de Pension Civile de Retraite et Avis de Rectification de Pension (Jeudi 2 juillet 2020)",
    ),
    # ----- 2021 — Ariel Henry transition — Accord politique -----
    "526747291-accord-politique-pour-une-gouvernance-apaisee-et-effic": (
        2021,
        "Spécial 46 · Accord politique",
        "2021-09-17",
        MoniteurDocumentType.convention,
        "Accord Politique du 11 septembre 2021 pour une Gouvernance Apaisée et Efficace de la Période Intérimaire",
    ),
    # ----- 2023 — Ariel Henry — sanctions package -----
    "879756018-decret-du-30-avril-2023": (
        2023,
        "Brouillon · Décret blanchiment 2023",
        "2023-04-30",
        MoniteurDocumentType.decret,
        "Décret du 30 avril 2023 sanctionnant le blanchiment de capitaux, le financement du terrorisme et le financement de la prolifération des armes de destruction massive en Haïti",
    ),
    # ----- 2025 — CPT-era electoral decree -----
    "968897041-le-decret-electoral-nov-2025": (
        2025,
        "Spécial 66",
        "2025-12-01",
        MoniteurDocumentType.decret,
        "Décret Électoral du 1er décembre 2025",
    ),
}


# ``-<6hex>.pdf`` content-hash suffix stripper.
_HASH_SUFFIX_RE = re.compile(r"-[0-9a-f]{6}\.pdf$")


def _curation_key(file_url: str | None) -> str | None:
    if not file_url:
        return None
    name = Path(file_url).name
    return _HASH_SUFFIX_RE.sub("", name) or None


def main() -> None:
    updated_issues = 0
    updated_entries = 0
    unchanged = 0
    no_curation: list[tuple[int, str]] = []

    with SessionLocal() as s:
        issues = s.scalars(
            select(MoniteurIssue).where(MoniteurIssue.edition_label == EDITION)
        ).all()
        for issue in issues:
            key = _curation_key(issue.file_url)
            if key not in CURATION:
                no_curation.append((issue.id, key or "(no file_url)"))
                continue
            year, number, pub_iso, doctype, title = CURATION[key]
            pub_date = date.fromisoformat(pub_iso)

            issue_dirty = (
                issue.year != year
                or issue.number != number
                or issue.publication_date != pub_date
            )
            if issue_dirty:
                # Guard against (year, number) collisions with other rows.
                collision = s.scalars(
                    select(MoniteurIssue).where(
                        MoniteurIssue.year == year,
                        MoniteurIssue.number == number,
                        MoniteurIssue.id != issue.id,
                    )
                ).first()
                if collision is not None:
                    print(
                        f"  ! #{issue.id}: collision with #{collision.id} "
                        f"({year}/{number}) — skipping"
                    )
                    continue
                issue.year = year
                issue.number = number
                issue.publication_date = pub_date
                updated_issues += 1

            entry = s.scalars(
                select(MoniteurEntry).where(MoniteurEntry.issue_id == issue.id)
            ).first()
            if entry is not None:
                entry_dirty = (
                    entry.detected_category != doctype
                    or (entry.display_title or "") != title
                    or (entry.detected_title or "") != title
                    or entry.detected_date != pub_date
                )
                if entry_dirty:
                    entry.detected_category = doctype
                    entry.display_title = title
                    entry.detected_title = title
                    entry.detected_date = pub_date
                    updated_entries += 1

            if not issue_dirty and (entry is None or not entry_dirty):
                unchanged += 1
                continue

            s.commit()
            print(f"  + #{issue.id} → {year}/{number}  ·  {title[:60]}…")

        print(
            f"\nDone. issues updated={updated_issues}, "
            f"entries updated={updated_entries}, "
            f"unchanged={unchanged}, no-curation={len(no_curation)}"
        )
        if no_curation:
            print("\nFiles without a curation row:")
            for iid, key in no_curation:
                print(f"  - #{iid}: {key}")


if __name__ == "__main__":
    main()
