"""Promote the 2025-batch moniteur entries to ``LegalText`` rows.

Each entry in ``data/moniteur_batch_2025.py`` whose
``detected_category`` is in ``PROMOTABLE_TYPES`` (loi, decret,
arrete, …) becomes a ``LegalText`` so it shows up under
``/lois`` and not only buried inside the Moniteur sommaire. The
existing ``MoniteurRepository.promote_entry()`` does all the
parsing — extracts ``visas_fr``, ``considerants_fr``,
``enacting_formula_fr``, ``preamble_fr`` from the raw_text via
``split_preamble`` and parses articles via ``parse_document``.

This script is idempotent: it checks ``entry.promoted_legal_text_id``
before promoting, so re-running it is a no-op for entries that
already point at a LegalText. The resolution entry is intentionally
skipped — resolutions aren't in PROMOTABLE_TYPES (a resolution is
the deliberation, the companion arrêté is the regulatory act).

Slugs and categories are mapped explicitly in ``PROMOTION_PLAN``
below — automated slug generation from a title would produce
unwieldy URLs for long ministerial-act titles, so we hand-pick a
short stable form.

Usage::

    .venv/bin/python scripts/promote_moniteur_batch.py        # local
    # OR via Container Apps Job swap on prod (same pattern as the
    # other batch scripts).
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from sqlalchemy import func  # noqa: E402

from schemas.enums import EditorialStatus, LegalCategory  # noqa: E402
from services.corpus.models import MoniteurEntry, MoniteurIssue  # noqa: E402
from services.ingestion.moniteur.repository import MoniteurRepository  # noqa: E402


@dataclass(frozen=True)
class PromotionTarget:
    year: int
    issue_number: str
    position: int
    slug: str
    title_fr: str
    category: LegalCategory
    description_fr: str | None = None


# Hand-picked slugs and titles. Kept short and verb-free so URLs
# stay readable; expanded forms live on the LegalText row's
# ``description_fr``.
PROMOTION_PLAN: list[PromotionTarget] = [
    PromotionTarget(
        year=1936,
        issue_number="40",
        position=0,
        slug="loi-credit-avenue-trujillo-1936",
        title_fr=(
            "Loi du 5 mai 1936 ouvrant un crédit extraordinaire pour "
            "l'embellissement de l'Avenue du Président Trujillo"
        ),
        category=LegalCategory.loi,
        description_fr=(
            "Crédit extraordinaire de 113 000 gourdes au Département des "
            "Travaux Publics pour l'aménagement de l'ancienne Rue "
            "Républicaine renommée Avenue du Président Trujillo. Travaux "
            "déclarés d'utilité publique."
        ),
    ),
    PromotionTarget(
        year=1936,
        issue_number="40",
        position=2,
        slug="arrete-origine-importations-1936",
        title_fr=(
            "Arrêté du 7 mai 1936 modifiant l'article 1er de l'Arrêté "
            "du 22 mai 1935 sur l'indication d'origine des marchandises "
            "importées"
        ),
        category=LegalCategory.arrete,
        description_fr=(
            "Précise la manière d'indiquer le nom géographique du pays "
            "d'origine sur les marchandises importées pour bénéficier du "
            "tarif minimum, et reporte au 27 mai 1936 l'entrée en vigueur "
            "de l'arrêté du 22 mai 1935."
        ),
    ),
    PromotionTarget(
        year=1936,
        issue_number="40",
        position=3,
        slug="arrete-pensions-lefevre-moise-1936",
        title_fr=(
            "Arrêté du 5 mai 1936 approuvant la liquidation des pensions "
            "des Dames Lefèvre et Moïse"
        ),
        category=LegalCategory.arrete,
        description_fr=(
            "Approbation de pensions de 60 gourdes chacune pour les "
            "anciennes directrices d'école Emogène Lefèvre (Émery) et Vve "
            "Honoré dite Grandisson Moïse (Quartier-Morin), inscrites au "
            "Grand Livre des pensions."
        ),
    ),
    PromotionTarget(
        year=2006,
        issue_number="53",
        position=0,
        slug="decret-fonction-publique-territoriale-2006",
        title_fr=(
            "Décret du 7 juin 2006 fixant les principes fondamentaux de "
            "gestion des emplois de la Fonction Publique Territoriale et "
            "de ses Établissements Publics"
        ),
        category=LegalCategory.decret,
        description_fr=(
            "Pose le cadre normatif de la Fonction Publique Territoriale "
            "haïtienne : statut des emplois permanents et contractuels "
            "dans les Sections Communales, Communes et Départements, "
            "Conseil Supérieur de la Fonction Publique Territoriale, "
            "Institut National de l'Administration Territoriale (INAT), "
            "cinq catégories d'emplois A-E."
        ),
    ),
    PromotionTarget(
        year=2020,
        issue_number="102",
        position=0,
        slug="arrete-pnpps-2020",
        title_fr=(
            "Arrêté du 5 juin 2020 sanctionnant le Document de Politique "
            "Nationale de Protection et de Promotion Sociales (PNPPS)"
        ),
        category=LegalCategory.arrete,
        description_fr=(
            "Sanction officielle, par le Président Jovenel Moïse, du "
            "document de référence en matière de protection sociale — "
            "outil pour casser la reproduction intergénérationnelle de "
            "la pauvreté."
        ),
    ),
    PromotionTarget(
        year=2024,
        issue_number="Spécial 57",
        position=1,
        slug="arrete-nomination-pm-fils-aime-2024",
        title_fr=(
            "Arrêté du 8 novembre 2024 nommant le citoyen Alix Didier "
            "Fils-Aimé Premier Ministre"
        ),
        category=LegalCategory.arrete,
        description_fr=(
            "Nomination du citoyen Alix Didier Fils-Aimé au poste de "
            "Premier Ministre par le Conseil Présidentiel de Transition, "
            "conformément à la résolution prise par consensus le 8 "
            "novembre 2024."
        ),
    ),
    PromotionTarget(
        year=2025,
        issue_number="Spécial 51",
        position=0,
        slug="decret-etat-urgence-ouest-artibonite-centre-2025",
        title_fr=(
            "Décret du 8 août 2025 instaurant l'état d'urgence sur les "
            "Départements de l'Ouest, de l'Artibonite et du Centre pour "
            "trois mois"
        ),
        category=LegalCategory.decret,
        description_fr=(
            "État d'urgence du 9 août au 9 novembre 2025. Habilite le "
            "Gouvernement à prendre vingt-trois mesures (déblocage de "
            "fonds, réquisitions, contrôle des voies, engagement des "
            "Forces Armées) face à la violence des gangs armés et à la "
            "situation humanitaire dans les trois départements."
        ),
    ),
]


def _resolve_db_url() -> str | None:
    url = os.environ.get("DATABASE_URL")
    if url and url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return url


def main() -> int:
    import argparse  # noqa: PLC0415

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help=(
            "Delete the legal_texts named in PROMOTION_PLAN before "
            "re-promoting. Use after a parser change (mentions, signers, "
            "split_preamble) to refresh the parsed content of an already-"
            "promoted batch. Skips deletion of any slug that isn't in "
            "PROMOTION_PLAN — never touches unrelated rows."
        ),
    )
    args = parser.parse_args()

    db_url = _resolve_db_url()
    if not db_url:
        print("ERROR: DATABASE_URL is not set. Refusing to run.", file=sys.stderr)
        return 30

    engine = create_engine(
        db_url,
        pool_pre_ping=True,
        connect_args={"options": "-csearch_path=public_corpus,public"},
    )
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    promoted = 0
    skipped_existing: list[str] = []
    skipped_missing: list[str] = []

    # Also honour FORCE_REFRESH=1 so the Container Apps Job can pass
    # the flag through an env var (the ``az containerapp job`` CLI
    # eats double-dash flags before they reach the command).
    force = args.force or os.environ.get("FORCE_REFRESH") == "1"
    if force:
        # Force-refresh path: delete only the legal_texts whose slugs
        # are in the batch plan. CASCADE drops their articles,
        # headings, signers. The moniteur_entries' promoted_legal_text_id
        # is set to NULL automatically (ON DELETE SET NULL), so the
        # promotion loop below sees them as un-promoted and re-creates.
        from services.corpus.models import LegalText  # noqa: PLC0415

        slugs_to_clear = [t.slug for t in PROMOTION_PLAN]
        with Session() as session:
            n = session.query(LegalText).filter(
                LegalText.slug.in_(slugs_to_clear)
            ).delete(synchronize_session=False)
            session.commit()
            print(f"--force: deleted {n} stale legal_texts before re-promotion")

    with Session() as session:
        repo = MoniteurRepository(session)
        for target in PROMOTION_PLAN:
            entry = session.execute(
                select(MoniteurEntry)
                .join(MoniteurIssue, MoniteurEntry.issue_id == MoniteurIssue.id)
                .where(
                    MoniteurIssue.year == target.year,
                    MoniteurIssue.number == target.issue_number,
                    MoniteurEntry.position == target.position,
                )
            ).scalar_one_or_none()
            if entry is None:
                skipped_missing.append(
                    f"{target.year}/{target.issue_number}#{target.position}"
                )
                continue
            if entry.promoted_legal_text_id is not None:
                # Already promoted — make sure it's published. Cheap
                # safety net for the case where an earlier run
                # promoted but didn't flip editorial_status.
                from services.corpus.models import LegalText  # noqa: PLC0415
                lt = session.get(LegalText, entry.promoted_legal_text_id)
                if lt is not None and lt.editorial_status != EditorialStatus.published:
                    lt.editorial_status = EditorialStatus.published
                    lt.published_at = func.now()
                    print(
                        f"  ↻ {target.year}/{target.issue_number}#{target.position}  "
                        f"→  published existing legal_text_id={lt.id}"
                    )
                skipped_existing.append(target.slug)
                continue
            legal_text = repo.promote_entry(
                entry,
                slug=target.slug,
                title_fr=target.title_fr,
                category=target.category,
                description_fr=target.description_fr,
            )
            session.flush()
            entry.promoted_legal_text_id = legal_text.id
            # Publish immediately — these are historical, fully
            # transcribed acts; there's no editorial gate to clear.
            # The promote_entry default is ``draft`` so an editor can
            # review parser output for fresh OCR uploads, which isn't
            # the situation here.
            legal_text.editorial_status = EditorialStatus.published
            legal_text.published_at = func.now()
            promoted += 1
            print(
                f"  ✓ {target.year}/{target.issue_number}#{target.position}  "
                f"→  legal_text_id={legal_text.id}  slug={target.slug}"
            )
        session.commit()

    print(
        f"\nDone. promoted={promoted}  "
        f"already-promoted={len(skipped_existing)}  "
        f"missing-entry={len(skipped_missing)}"
    )
    if skipped_existing:
        print(f"  already had a legal_text: {', '.join(skipped_existing)}")
    if skipped_missing:
        print(f"  no entry on this DB:      {', '.join(skipped_missing)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
