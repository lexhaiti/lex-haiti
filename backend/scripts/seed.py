"""Seed script — inserts a fake LegalText, Decision, and Citation for testing.

Run from project root after `make migrate`:
    python -m scripts.seed

Contents:
  - LegalText `exemple-loi-paternite` with 3 articles + 1 chapter heading + 1 signer
  - Decision  `cassation-2020-01-15-paternite` (Cour de cassation, civile)
  - Citation  decision → article 2 (relation: applies)
  - Citation  decision → article 3 (relation: cites)

The data is intentionally small but exercises every relationship in the schema.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import select

from api.db import SessionLocal
from packages.schemas.enums import (
    CitationNodeType,
    CitationRelation,
    CourtType,
    EditorialStatus,
    ExtractionMethod,
    HeadingLevel,
    LegalCategory,
    LegalStatus,
)
from services.corpus.models import (
    Article,
    ArticleVersion,
    Citation,
    Decision,
    LegalHeading,
    LegalSigner,
    LegalText,
)

SEED_SLUG = "exemple-loi-paternite"
SEED_DECISION_SLUG = "cassation-2020-01-15-paternite"


def seed() -> None:
    with SessionLocal() as session:
        existing = session.execute(
            select(LegalText).where(LegalText.slug == SEED_SLUG)
        ).scalar_one_or_none()
        if existing:
            print(f"Seed already present (id={existing.id}, slug={existing.slug}).")
            return

        article_ids: dict[str, int] = {}

        text = LegalText(
            slug=SEED_SLUG,
            category=LegalCategory.loi,
            jurisdiction="HT",
            title_fr="Loi sur la paternité responsable (exemple seed)",
            title_ht="Lwa sou patènite responsab (egzanp seed)",
            description_fr=(
                "Loi exemple insérée par le seed pour valider l'API de bout en bout."
            ),
            description_ht="Lwa egzanp pou tès API bout an bout.",
            promulgation_date=date(2014, 5, 30),
            publication_date=date(2014, 6, 4),
            moniteur_ref="N° 47 du 4 juin 2014",
            status=LegalStatus.in_force,
            editorial_status=EditorialStatus.published,
        )
        session.add(text)
        session.flush()

        heading = LegalHeading(
            legal_text_id=text.id,
            parent_id=None,
            level=HeadingLevel.chapter,
            key="ch1",
            number="I",
            title_fr="Dispositions générales",
            title_ht="Dispozisyon jeneral",
            position=0,
        )
        session.add(heading)
        session.flush()

        articles_seed: list[tuple[str, str, str, str]] = [
            (
                "1",
                "art-1",
                "La paternité est un devoir et un droit reconnus par la présente loi.",
                "Patènite a se yon devwa ak yon dwa ke lwa sa a rekonèt.",
            ),
            (
                "2",
                "art-2",
                "Toute reconnaissance volontaire de paternité est définitive.",
                "Tout rekonèsans volontè patènite se definitif.",
            ),
            (
                "3",
                "art-3",
                "Les frais médicaux liés à la grossesse incombent au père reconnu.",
                "Frè medikal ki lye ak gwosès yo se papa rekoni an ki responsab.",
            ),
        ]

        for idx, (number, slug, text_fr, text_ht) in enumerate(articles_seed):
            article = Article(
                legal_text_id=text.id,
                heading_id=heading.id,
                number=number,
                slug=slug,
                position=idx,
                domain_tags=["famille", "paternité"],
            )
            session.add(article)
            session.flush()
            article_ids[number] = article.id

            version = ArticleVersion(
                article_id=article.id,
                version_number=1,
                text_fr=text_fr,
                text_ht=text_ht,
                effective_from=date(2014, 6, 4),
                editorial_status=EditorialStatus.published,
            )
            session.add(version)
            session.flush()

            article.current_version_id = version.id

        signer = LegalSigner(
            legal_text_id=text.id,
            name="Le Président de la République",
            function_fr="Président de la République",
            function_ht="Prezidan Repiblik la",
            position=0,
        )
        session.add(signer)

        # ---------------------------------------------------------------
        # Decision (jurisprudence)
        # ---------------------------------------------------------------
        decision = Decision(
            slug=SEED_DECISION_SLUG,
            court=CourtType.cassation,
            chamber="civile",
            formation="ordinaire",
            case_number="2020-1234",
            decision_date=date(2020, 1, 15),
            parties_anonymized=True,
            summary_fr=(
                "Arrêt portant interprétation de la Loi sur la paternité "
                "responsable. La Cour confirme le caractère définitif de la "
                "reconnaissance volontaire de paternité."
            ),
            headnotes_fr=(
                "La reconnaissance volontaire de paternité, une fois "
                "consentie, est définitive et irrévocable."
            ),
            full_text_fr=(
                "Attendu que la reconnaissance volontaire de paternité, "
                "consentie par le défendeur en application de l'article 2 "
                "de la Loi sur la paternité responsable, présente un "
                "caractère définitif que la Cour ne saurait remettre en "
                "cause sans violer la lettre du texte ; "
                "Par ces motifs, rejette le pourvoi."
            ),
            outcome="rejet",
            editorial_status=EditorialStatus.published,
            published_at=None,
        )
        session.add(decision)
        session.flush()

        # ---------------------------------------------------------------
        # Citations (the Legal Graph)
        # ---------------------------------------------------------------
        # Decision applies article 2.
        session.add(
            Citation(
                source_node_type=CitationNodeType.decision,
                source_node_id=decision.id,
                target_node_type=CitationNodeType.article,
                target_node_id=article_ids["2"],
                relation=CitationRelation.applies,
                source_paragraph=(
                    "en application de l'article 2 de la Loi sur la "
                    "paternité responsable"
                ),
                confidence=Decimal("0.95"),
                extraction_method=ExtractionMethod.manual,
                validated_by="seed",
                editorial_status=EditorialStatus.published,
            )
        )
        # Decision cites article 3 in passing.
        session.add(
            Citation(
                source_node_type=CitationNodeType.decision,
                source_node_id=decision.id,
                target_node_type=CitationNodeType.article,
                target_node_id=article_ids["3"],
                relation=CitationRelation.cites,
                confidence=Decimal("0.80"),
                extraction_method=ExtractionMethod.manual,
                validated_by="seed",
                editorial_status=EditorialStatus.published,
            )
        )

        session.commit()
        print(
            f"Seeded LegalText id={text.id} slug={text.slug}, "
            f"Decision id={decision.id} slug={decision.slug}, "
            f"+ 2 citations"
        )


if __name__ == "__main__":
    seed()
