"""Tests for header_split + signatories_extract + the new
official_formula slicing in article_split.

Uses the 2017 PNH loi shape (LOI N°: CL-007-09-09, modified Article
29 of the Loi organique PNH) as the canonical happy-path fixture.
"""
from __future__ import annotations

from datetime import date

from packages.schemas.enums import (
    LegalCategory,
    SignatoryChamber,
    SigningCapacity,
)
from services.ingestion.article_split import split_into_articles
from services.ingestion.header_split import split_header
from services.ingestion.signatories_extract import extract_signatories


# Canonical 2017 PNH loi text — assembled from pages 1-3 of the
# Spécial N° 5 Moniteur. Shortened where possible while keeping the
# structural patterns the parser depends on.
PNH_LOI_2017 = """LIBERTÉ ÉGALITÉ FRATERNITÉ
RÉPUBLIQUE D'HAÏTI

CORPS LÉGISLATIF

LOI N°: CL-007-09-09

LOI PORTANT MODIFICATION DE L'ARTICLE 29 DE LA LOI ORGANIQUE
DE LA POLICE NATIONALE D'HAÏTI

Vu les articles 9, 17, 19, 24 de la Constitution ;

Considérant que la défense et la protection des Droits ;

Le Corps Législatif a voté la Loi suivante :

Article 1.- L'Article 29 de la Loi organique est modifié comme suit.

Article 2.- La présente Loi abroge toutes lois ou dispositions de lois.

Votée au Sénat de la République, le mardi 18 août 2009, An 206e de l'Indépendance.

Sénateur Kély C. BASTIEN, Président
Sénateur Pierre Franky EXIUS, Premier Secrétaire
Sénateur Jean Willy JEAN BAPTISTE, Deuxième Secrétaire

Votée à la Chambre des Députés, le dimanche 13 septembre 2009, An 206e de l'Indépendance

Député Levaillant LOUIS JEUNE, Président
Député Francenet DENIUS, Premier Secrétaire
Député Mioli CHARLES-PIERRE, Deuxième Secrétaire

LIBERTÉ ÉGALITÉ FRATERNITÉ
RÉPUBLIQUE D'HAÏTI
AU NOM DE LA RÉPUBLIQUE

Donné au Palais National, à Port-au-Prince, le 23 janvier 2017, An 214e de l'Indépendance.

Jocelerme PRIVERT, Président Provisoire de la République
"""


def test_header_split_lifts_number_authority_and_title() -> None:
    h = split_header(PNH_LOI_2017, category=LegalCategory.loi)
    assert h.official_number == "CL-007-09-09"
    assert h.issuing_authority == "CORPS LÉGISLATIF"
    # The title sits on the first line after the LOI N° line; it's
    # acceptable that we capture only the first line — the editor
    # confirms the canonical title in `LegalText.title_fr`.
    assert h.title_line is not None
    assert h.title_line.startswith("LOI PORTANT MODIFICATION")


def test_header_split_falls_back_to_category_default() -> None:
    body = "Article 1.- Quelque chose."
    h = split_header(body, category=LegalCategory.loi)
    assert h.official_number is None
    assert h.issuing_authority == "CORPS LÉGISLATIF"

    h_decret = split_header(body, category=LegalCategory.decret)
    assert h_decret.issuing_authority == "LE PRÉSIDENT DE LA RÉPUBLIQUE"


def test_split_into_articles_slices_official_formula() -> None:
    # Pre-strip the header so the body the article splitter sees mirrors
    # what document_parser gives it in production.
    h = split_header(PNH_LOI_2017, category=LegalCategory.loi)
    result = split_into_articles(h.body_without_header)

    assert len(result.articles) == 2
    assert result.articles[0].number == "1"
    assert result.articles[1].number == "2"

    # Article 2's body should END at "abroge toutes lois ou
    # dispositions de lois." — NOT include "Votée au Sénat …" — that
    # was the bug. The closing sentence's period is preserved.
    assert result.articles[1].body.endswith(".")
    assert "Votée au Sénat" not in result.articles[1].body
    assert "Donné au Palais" not in result.articles[1].body

    # The formula starts with the post-dispositif marker.
    assert result.official_formula is not None
    assert result.official_formula.startswith("Votée au Sénat")
    assert "Jocelerme PRIVERT" in result.official_formula


def test_extract_signatories_for_loi_pnh_2017() -> None:
    h = split_header(PNH_LOI_2017, category=LegalCategory.loi)
    result = split_into_articles(h.body_without_header)

    sigs = extract_signatories(result.official_formula, category=LegalCategory.loi)

    # Expect 7 signatories: 3 senate + 3 chamber + 1 president
    assert len(sigs) == 7

    # Sénat block — first one presiding, others attesting
    senat = [s for s in sigs if s.chamber == SignatoryChamber.senat]
    assert len(senat) == 3
    assert senat[0].name == "Kély C. BASTIEN"
    assert senat[0].signing_capacity == SigningCapacity.presiding
    assert senat[0].signed_at == date(2009, 8, 18)
    assert all(s.signing_capacity == SigningCapacity.attesting for s in senat[1:])

    # Chambre block — same pattern
    chambre = [s for s in sigs if s.chamber == SignatoryChamber.chambre]
    assert len(chambre) == 3
    assert chambre[0].name == "Levaillant LOUIS JEUNE"
    assert chambre[0].signing_capacity == SigningCapacity.presiding
    assert chambre[0].signed_at == date(2009, 9, 13)

    # Promulgation — single signer, capacity = promulgating (it's a loi)
    promulg = [s for s in sigs if s.chamber == SignatoryChamber.executive]
    assert len(promulg) == 1
    assert promulg[0].name == "Jocelerme PRIVERT"
    assert promulg[0].signing_capacity == SigningCapacity.promulgating
    assert promulg[0].signed_at == date(2017, 1, 23)


def test_extract_signatories_for_decret_marks_authoring() -> None:
    """On a décret, the head-of-state signs as the issuing authority
    (capacity=authoring), not as a promulgator."""
    formula = """Donné au Palais National, à Port-au-Prince, le 8 novembre 2024, An 221e de l'Indépendance.

Leslie VOLTAIRE, Coordonnateur du Conseil Présidentiel
"""
    sigs = extract_signatories(formula, category=LegalCategory.decret)
    assert len(sigs) == 1
    assert sigs[0].name == "Leslie VOLTAIRE"
    assert sigs[0].signing_capacity == SigningCapacity.authoring
    assert sigs[0].signed_at == date(2024, 11, 8)


def test_split_into_articles_handles_empty_body() -> None:
    r = split_into_articles("")
    assert r.articles == []
    assert r.preamble == ""
    assert r.official_formula is None


def test_split_into_articles_no_marker_leaves_formula_none() -> None:
    body = "Article 1.- Texte sans bloc final.\n\nArticle 2.- Autre texte sans formule."
    r = split_into_articles(body)
    assert len(r.articles) == 2
    assert r.official_formula is None
    # Article 2's body keeps its full content when no marker present.
    assert r.articles[1].body.endswith("formule.")
