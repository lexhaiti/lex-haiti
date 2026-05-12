"""Seed the authorities table with Haitian institutions.

Idempotent — safe to re-run. Insert-on-conflict-do-nothing keyed on
``code``. Run from ``backend/``:

    python -m scripts.seed_authorities

Tree structure:

  - Présidence de la République
  - Premier Ministre (Primature)
  - Parlement (parent of)
      - Sénat
      - Chambre des Députés
      - Corps Législatif (collective name for both chambers in joint
        session — many older laws are signed in this name)
  - Conseil des Ministres (collective body — used when an act is taken
    "en Conseil des Ministres" rather than by the President alone)
  - Conseil Présidentiel de Transition (CPT) — transitional executive
  - Conseil Électoral Provisoire (CEP)
  - Ministries — 17 standard portfolios, each a child of Premier
    Ministre. Names match the official ministry titles as of 2026.
  - Cour de cassation, Cours d'appel, Tribunaux de Première Instance
  - Conseil Supérieur du Pouvoir Judiciaire (CSPJ)
  - Banque de la République d'Haïti (BRH)
  - Office de Management et des Ressources Humaines (OMRH)
  - Cour Supérieure des Comptes et du Contentieux Administratif (CSCCA)

Adjust this list as historical needs come up — every new authority you
encounter during ingestion gets added here once and reused forever.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select

from api.db import SessionLocal
from packages.schemas.enums import AuthorityType
from services.corpus.models import Authority

_log = logging.getLogger(__name__)


@dataclass(frozen=True)
class _Seed:
    code: str
    name_fr: str
    authority_type: AuthorityType
    name_ht: Optional[str] = None
    short_name: Optional[str] = None
    parent_code: Optional[str] = None
    notes: Optional[str] = None


# Ordered so parents always seed before their children.
_AUTHORITIES: list[_Seed] = [
    # ── Executive top level ───────────────────────────────────────────
    _Seed(
        code="presidence",
        name_fr="Présidence de la République",
        name_ht="Prezidans Repiblik la",
        short_name="Présidence",
        authority_type=AuthorityType.executive_body,
        notes="Chef de l'État. Promulgue les lois adoptées par le Parlement.",
    ),
    _Seed(
        code="primature",
        name_fr="Premier Ministre",
        name_ht="Premye Minis",
        short_name="Primature",
        authority_type=AuthorityType.executive_body,
        notes="Chef du Gouvernement. Contreseing sur les décrets présidentiels.",
    ),
    _Seed(
        code="conseil_ministres",
        name_fr="Conseil des Ministres",
        name_ht="Konsèy Minis yo",
        short_name="Conseil",
        authority_type=AuthorityType.collective_body,
        notes="Réunion du Gouvernement. Certains décrets sont pris en Conseil des Ministres.",
    ),
    _Seed(
        code="cpt",
        name_fr="Conseil Présidentiel de Transition",
        name_ht="Konsèy Prezidansyèl Tranzisyon",
        short_name="CPT",
        authority_type=AuthorityType.collective_body,
        notes="Organe exécutif transitoire (institué en 2024).",
    ),

    # ── Parlement ─────────────────────────────────────────────────────
    _Seed(
        code="parlement",
        name_fr="Parlement de la République d'Haïti",
        name_ht="Palman Repiblik Ayiti",
        short_name="Parlement",
        authority_type=AuthorityType.parliamentary_body,
        notes="Pouvoir législatif bicaméral.",
    ),
    _Seed(
        code="senat",
        name_fr="Sénat de la République",
        name_ht="Sena Repiblik la",
        short_name="Sénat",
        authority_type=AuthorityType.parliamentary_body,
        parent_code="parlement",
    ),
    _Seed(
        code="chambre",
        name_fr="Chambre des Députés",
        name_ht="Chanm Depite",
        short_name="Chambre",
        authority_type=AuthorityType.parliamentary_body,
        parent_code="parlement",
    ),
    _Seed(
        code="corps_legislatif",
        name_fr="Corps Législatif",
        name_ht="Kò Lejislatif la",
        short_name="Corps Législatif",
        authority_type=AuthorityType.parliamentary_body,
        parent_code="parlement",
        notes="Nom collectif des deux chambres en session conjointe.",
    ),

    # ── Ministères (parent = Primature) ──────────────────────────────
    _Seed(
        code="min_justice",
        name_fr="Ministère de la Justice et de la Sécurité Publique",
        short_name="MJSP",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),
    _Seed(
        code="min_finances",
        name_fr="Ministère de l'Économie et des Finances",
        short_name="MEF",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),
    _Seed(
        code="min_interieur",
        name_fr="Ministère de l'Intérieur et des Collectivités Territoriales",
        short_name="MICT",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),
    _Seed(
        code="min_affaires_etrangeres",
        name_fr="Ministère des Affaires Étrangères et des Cultes",
        short_name="MAE",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),
    _Seed(
        code="min_planification",
        name_fr="Ministère de la Planification et de la Coopération Externe",
        short_name="MPCE",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),
    _Seed(
        code="min_sante",
        name_fr="Ministère de la Santé Publique et de la Population",
        short_name="MSPP",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),
    _Seed(
        code="min_education",
        name_fr="Ministère de l'Éducation Nationale et de la Formation Professionnelle",
        short_name="MENFP",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),
    _Seed(
        code="min_agriculture",
        name_fr="Ministère de l'Agriculture, des Ressources Naturelles et du Développement Rural",
        short_name="MARNDR",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),
    _Seed(
        code="min_commerce",
        name_fr="Ministère du Commerce et de l'Industrie",
        short_name="MCI",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),
    _Seed(
        code="min_travaux_publics",
        name_fr="Ministère des Travaux Publics, Transports et Communications",
        short_name="MTPTC",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),
    _Seed(
        code="min_affaires_sociales",
        name_fr="Ministère des Affaires Sociales et du Travail",
        short_name="MAST",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),
    _Seed(
        code="min_culture",
        name_fr="Ministère de la Culture et de la Communication",
        short_name="MCC",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),
    _Seed(
        code="min_tourisme",
        name_fr="Ministère du Tourisme",
        short_name="MT",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),
    _Seed(
        code="min_environnement",
        name_fr="Ministère de l'Environnement",
        short_name="MDE",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),
    _Seed(
        code="min_jeunesse_sports",
        name_fr="Ministère de la Jeunesse, des Sports et de l'Action Civique",
        short_name="MJSAC",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),
    _Seed(
        code="min_femme",
        name_fr="Ministère à la Condition Féminine et aux Droits des Femmes",
        short_name="MCFDF",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),
    _Seed(
        code="min_haitiens_etranger",
        name_fr="Ministère des Haïtiens Vivant à l'Étranger",
        short_name="MHAVE",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),
    _Seed(
        code="min_defense",
        name_fr="Ministère de la Défense",
        short_name="MD",
        authority_type=AuthorityType.ministry,
        parent_code="primature",
    ),

    # ── Justice ──────────────────────────────────────────────────────
    _Seed(
        code="cour_cassation",
        name_fr="Cour de Cassation de la République d'Haïti",
        short_name="Cassation",
        authority_type=AuthorityType.judicial_body,
        notes="Plus haute juridiction du pouvoir judiciaire.",
    ),
    _Seed(
        code="cspj",
        name_fr="Conseil Supérieur du Pouvoir Judiciaire",
        short_name="CSPJ",
        authority_type=AuthorityType.judicial_body,
    ),

    # ── Institutions indépendantes ────────────────────────────────────
    _Seed(
        code="cep",
        name_fr="Conseil Électoral Provisoire",
        short_name="CEP",
        authority_type=AuthorityType.institution,
    ),
    _Seed(
        code="brh",
        name_fr="Banque de la République d'Haïti",
        short_name="BRH",
        authority_type=AuthorityType.institution,
        notes="Banque centrale.",
    ),
    _Seed(
        code="cscca",
        name_fr="Cour Supérieure des Comptes et du Contentieux Administratif",
        short_name="CSCCA",
        authority_type=AuthorityType.judicial_body,
    ),
    _Seed(
        code="omrh",
        name_fr="Office de Management et des Ressources Humaines",
        short_name="OMRH",
        authority_type=AuthorityType.administrative_body,
        parent_code="primature",
    ),
    _Seed(
        code="ulcc",
        name_fr="Unité de Lutte Contre la Corruption",
        short_name="ULCC",
        authority_type=AuthorityType.administrative_body,
        parent_code="primature",
    ),
    _Seed(
        code="dgi",
        name_fr="Direction Générale des Impôts",
        short_name="DGI",
        authority_type=AuthorityType.administrative_body,
        parent_code="min_finances",
    ),
    _Seed(
        code="agd",
        name_fr="Administration Générale des Douanes",
        short_name="AGD",
        authority_type=AuthorityType.administrative_body,
        parent_code="min_finances",
    ),
]


def main() -> int:
    inserted = 0
    skipped = 0
    with SessionLocal() as session:
        # Two-pass: build a code → id map after pass 1 so pass 2 can
        # resolve parent_code → parent_id.
        existing = {
            row.code: row.id
            for row in session.scalars(select(Authority).where(Authority.code.is_not(None))).all()
        }
        # Pass 1: insert without parent FKs
        for seed in _AUTHORITIES:
            if seed.code in existing:
                skipped += 1
                continue
            row = Authority(
                code=seed.code,
                name_fr=seed.name_fr,
                name_ht=seed.name_ht,
                short_name=seed.short_name,
                authority_type=seed.authority_type,
                notes=seed.notes,
            )
            session.add(row)
            session.flush()
            existing[seed.code] = row.id
            inserted += 1
        # Pass 2: wire parent FKs
        for seed in _AUTHORITIES:
            if seed.parent_code is None:
                continue
            parent_id = existing.get(seed.parent_code)
            if parent_id is None:
                _log.warning(
                    "seed_authorities: parent code %r unknown for %r",
                    seed.parent_code,
                    seed.code,
                )
                continue
            authority = session.scalar(
                select(Authority).where(Authority.code == seed.code)
            )
            if authority and authority.parent_id != parent_id:
                authority.parent_id = parent_id
        session.commit()
    print(f"seed_authorities: inserted={inserted} skipped={skipped} (already present)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
