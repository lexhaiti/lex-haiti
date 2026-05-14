"""Tests for the Constituante (Constitution) signatory extractor.

The 1987 Constitution's closing formula carries a 58-member
Assemblée Nationale Constituante listed by group (Président /
Vice-Président / Secrétaires / Membres), not the Sénat/Chambre/Donné
pattern used for ordinary lois. ``extract_signatories`` dispatches on
``category`` and runs the dedicated Constituante extractor when the
category is ``constitution``.
"""

from schemas.enums import (
    LegalCategory,
    SignatoryChamber,
    SigningCapacity,
)
from services.ingestion.signatories_extract import extract_signatories


def test_constituante_president_vice_secretaires_membres():
    """Each group label switches the role assigned to subsequent name
    lines. Honorifics (Me. / M. / Mme / Dr.) are preserved on the name
    so the editor can keep or strip them after review."""
    formula = (
        "Donné au Palais Législatif, à Port-au-Prince, le 10 mars 1987.\n\n"
        "Signataires\n\n"
        "Me. Emile JOASSAINT fils\n"
        "Role: Président de l'Assemblée Constituante\n\n"
        "Me. Jean SUPPLICE\n"
        "Role: Vice-Président de l'Assemblée Constituante\n\n"
        "Les Secrétaires:\n\n"
        "Mme Bathilde Barbancourt\n"
        "M. Jacques Saint-Louis\n"
        "Me. Raphael Michel Adelson\n\n"
        "Les Membres:\n\n"
        "M. Danel Anglade\n"
        "M. Yvon Auguste\n"
        "Dr. Georges Greffin\n"
    )
    sigs = extract_signatories(formula, category=LegalCategory.constitution)
    assert len(sigs) == 8

    # President + Vice — role lifted from the inline "Role:" override
    assert sigs[0].name.endswith("JOASSAINT fils")
    assert sigs[0].function_fr == "Président de l'Assemblée Constituante"
    assert sigs[1].function_fr == "Vice-Président de l'Assemblée Constituante"

    # Secretaries — three after the "Les Secrétaires:" label
    assert all(
        s.function_fr == "Secrétaire de l'Assemblée Constituante"
        for s in sigs[2:5]
    )
    # Members — three after the "Les Membres:" label
    assert all(
        s.function_fr == "Membre de l'Assemblée Constituante"
        for s in sigs[5:8]
    )

    # All Constituante signers are AUTHORING the Constitution (they
    # don't promulgate it) and have no chamber (sui-generis body).
    for s in sigs:
        assert s.signing_capacity == SigningCapacity.authoring
        assert s.chamber is None


def test_constituante_stop_marker_blocks_sovereignty_leak():
    """The extractor must stop at the AU NOM DE LA RÉPUBLIQUE
    sovereignty marker. Without the stop guard, the regex would
    happily ingest the marker line as a "member" and keep going into
    the devise."""
    formula = (
        "Signataires\n\n"
        "Me. Emile JOASSAINT fils\n"
        "M. Yvon Auguste\n\n"
        "AU NOM DE LA REPUBLIQUE\n"
        "LIBERTÉ ÉGALITÉ FRATERNITÉ\n"
    )
    sigs = extract_signatories(formula, category=LegalCategory.constitution)
    assert len(sigs) == 2
    names = [s.name for s in sigs]
    assert all("RÉPUBLIQUE" not in n.upper() for n in names)
    assert all("LIBERT" not in n.upper() for n in names)


def test_constituante_deduplicates_repeated_names():
    """OCR'd Constituante blocks sometimes list the same name twice
    across page breaks. The extractor dedupes on uppercased name."""
    formula = (
        "Signataires\n"
        "M. Yvon Auguste\n"
        "M. Yvon Auguste\n"  # OCR duplicate from page break
        "M. Karl Auguste\n"
    )
    sigs = extract_signatories(formula, category=LegalCategory.constitution)
    assert len(sigs) == 2
    assert sigs[0].name == "M. Yvon Auguste"
    assert sigs[1].name == "M. Karl Auguste"


def test_constituante_falls_back_when_no_signataires_header():
    """When ``category=constitution`` but the closing formula has no
    "Signataires:" header, the extractor returns the empty list — it
    does NOT fall back to the loi/decret Sénat/Chambre patterns,
    which would produce noise."""
    formula = "Donné au Palais Législatif, à Port-au-Prince, le 10 mars 1987.\n"
    sigs = extract_signatories(formula, category=LegalCategory.constitution)
    assert sigs == []


def test_non_constitution_categories_unaffected():
    """The Constituante branch fires only on category=constitution.
    A loi with the same "Signataires" word in its formula must still
    flow through the Sénat / Chambre / Donné parser."""
    formula = (
        "Votée au Sénat, en sa séance du 12 mars 2020.\n\n"
        "Sénateur Jean DUPONT, Président\n"
        "Sénateur Marie MARTIN, Secrétaire\n\n"
        "Votée à la Chambre, en sa séance du 14 mars 2020.\n\n"
        "Député Pierre PETIT, Président\n"
    )
    sigs = extract_signatories(formula, category=LegalCategory.loi)
    # We don't assert exact count — the existing loi parser owns the
    # parsing here; we just check the constituante branch DIDN'T
    # short-circuit and the Sénat/Chambre split was applied.
    chambers = {s.chamber for s in sigs}
    assert SignatoryChamber.senat in chambers or SignatoryChamber.chambre in chambers
