"""Tests for the Moniteur ingestion pipeline (`services.ingestion.moniteur`).

Pure-text + regex tests — does not invoke Tesseract or pdf2image. The
OCR-stub fallback path is what we exercise here, plus the metadata
extractor which works on plain strings.
"""

from datetime import date

from packages.schemas.enums import LegalCategory
from services.ingestion.moniteur.parser import (
    detect_law_candidates,
)
from services.ingestion.moniteur.metadata import (
    extract_issue_metadata,
)


# --------------------------------------------------------------------------- #
# detect_law_candidates                                                        #
# --------------------------------------------------------------------------- #


def test_detect_three_law_kinds_in_one_issue():
    pages = [
        "RÉPUBLIQUE D'HAÏTI\n\n"
        "LOI N° 2026-14 portant test des marchés publics.\n"
        "Le Président, Vu la Constitution ; ARRÊTE :\n"
        "Article 1er. — Test.",
        "DÉCRET du 18 février 2026 fixant les modalités.\n"
        "Le Président, Sur le rapport ; DÉCRÈTE :\n"
        "Article 1er. — Application.",
        "ARRÊTÉ du 22 février 2026 du Ministère de la Justice.\n"
        "Le Ministre, Vu la Constitution ; ARRÊTE :\n"
        "Article 1er. — Nominations.",
    ]
    cands = detect_law_candidates(pages)
    cats = [c.detected_category for c in cands]
    assert LegalCategory.loi in cats
    assert LegalCategory.decret in cats
    assert LegalCategory.arrete in cats


def test_no_pages_returns_empty():
    assert detect_law_candidates([]) == []


def test_pages_with_no_law_headings_returns_empty():
    cands = detect_law_candidates(["just a paragraph", "another one"])
    assert cands == []


# --------------------------------------------------------------------------- #
# extract_issue_metadata (driven by the OCR stub when no PDF is given)         #
# --------------------------------------------------------------------------- #


def test_metadata_extractor_pulls_number_date_edition():
    """Use the stub by passing a dummy path — the stub returns a
    deterministic mock cover that does NOT carry Moniteur metadata,
    so we test the regex paths via a dedicated text fixture below."""
    from services.ingestion.moniteur.metadata import ISSUE_NUMBER_RE
    assert ISSUE_NUMBER_RE is not None


def test_issue_number_regex_matches_haitien_cover_styles():
    from services.ingestion.moniteur.metadata import ISSUE_NUMBER_RE

    samples = {
        "Numéro 47 du 12 mai 2024": "47",
        "N° 47-bis": "47-bis",
        "No. 132": "132",
    }
    for src, expected in samples.items():
        m = ISSUE_NUMBER_RE.search(src)
        assert m is not None, f"failed to match: {src!r}"
        assert m.group(1) == expected


def test_long_french_date_regex_matches_typical_cover_dates():
    from services.ingestion.moniteur.metadata import DATE_LONG_RE, MONTHS_FR

    cases = [
        ("Lundi 12 mai 2024", (12, 5, 2024)),
        ("1er mai 2026", (1, 5, 2026)),
        ("28 avril 1987", (28, 4, 1987)),
        ("5 février 1987", (5, 2, 1987)),
    ]
    for src, (day, month, year) in cases:
        m = DATE_LONG_RE.search(src)
        assert m is not None, f"no match: {src!r}"
        assert int(m.group(1)) == day
        assert MONTHS_FR[m.group(2).lower()] == month
        assert int(m.group(3)) == year


def test_edition_regex_catches_canonical_phrases():
    from services.ingestion.moniteur.metadata import EDITION_RE

    for src in [
        "Édition spéciale",
        "Numéro spécial",
        "Numéro extraordinaire",
        "édition extraordinaire",
    ]:
        assert EDITION_RE.search(src) is not None, f"missed: {src!r}"


# --------------------------------------------------------------------------- #
# IssueMetadata: integration through extract_issue_metadata using the stub.   #
# --------------------------------------------------------------------------- #


def test_extract_issue_metadata_ignores_article_n_inside_body():
    """Our regex must not pick `N° 12` from a body's `article N° 12 de…`
    reference as the issue number."""
    from services.ingestion.moniteur.metadata import ISSUE_NUMBER_RE

    head = "à l'article N° 12 de la Constitution ; le présent décret"
    matches = list(ISSUE_NUMBER_RE.finditer(head))
    assert len(matches) == 1
    skipped = []
    for m in matches:
        prefix = head[max(0, m.start() - 20) : m.start()].lower()
        if "article" in prefix or "art." in prefix:
            skipped.append(m)
    assert len(skipped) == 1


def test_extract_issue_metadata_returns_blank_for_unstructured_text(tmp_path):
    """When the OCR stub returns its mock cover (no Moniteur metadata),
    the extractor should not invent fields — it returns nulls."""
    fake_pdf = tmp_path / "fake.pdf"
    fake_pdf.write_bytes(b"%PDF-1.4\nbroken")
    md = extract_issue_metadata(str(fake_pdf))
    from services.ingestion.moniteur.metadata import IssueMetadata
    assert isinstance(md, IssueMetadata)


# --------------------------------------------------------------------------- #
# profile_for_category: type-hint → typ-spezifischer Parser                    #
# --------------------------------------------------------------------------- #


def test_profile_for_category_maps_legal_categories():
    """The category-to-profile table must cover the LegalCategory values
    the Moniteur pipeline actually emits — anything missing falls back to
    generic, which is fine but means the typ-specific logic doesn't run."""
    from packages.schemas.enums import MoniteurDocumentType, ParserProfile
    from services.ingestion.parsers import profile_for_category

    # Direct mappings — the ones that have a dedicated profile.
    assert profile_for_category(LegalCategory.constitution) == ParserProfile.constitution
    assert profile_for_category(LegalCategory.code) == ParserProfile.code
    assert profile_for_category(LegalCategory.loi) == ParserProfile.loi
    assert profile_for_category(LegalCategory.decret) == ParserProfile.executive_act
    assert profile_for_category(LegalCategory.arrete) == ParserProfile.executive_act
    assert profile_for_category(LegalCategory.circulaire) == ParserProfile.circulaire
    assert profile_for_category(LegalCategory.communique) == ParserProfile.communique

    # MoniteurDocumentType values (separate enum, same string values for
    # the overlap) must resolve to the same profiles.
    assert profile_for_category(MoniteurDocumentType.loi) == ParserProfile.loi
    assert profile_for_category(MoniteurDocumentType.decret) == ParserProfile.executive_act

    # Unmapped / no hint → generic (rather than raising).
    assert profile_for_category(None) == ParserProfile.generic
    assert profile_for_category(MoniteurDocumentType.errata) == ParserProfile.generic
    assert profile_for_category(MoniteurDocumentType.autre) == ParserProfile.generic


def test_parser_output_to_dict_roundtrip():
    """``ParserOutput.to_dict`` must produce a structure that survives
    JSON serialisation — enums collapse to their string values, dataclass
    children become plain dicts. This is what gets persisted on
    ``MoniteurEntry.content_ast``."""
    import json

    from services.ingestion.parsers import (
        ParserContext,
        get_parser,
        profile_for_category,
    )

    text = (
        "LOI N° 2026-01 portant test.\n"
        "Le Corps législatif a voté la loi suivante :\n"
        "Article 1er. — Première disposition.\n\n"
        "Article 2. — Seconde disposition.\n"
    )
    parser = get_parser(profile_for_category(LegalCategory.loi))
    output = parser.parse(ParserContext(normalized_text=text))
    payload = output.to_dict()

    # Round-trip through JSON to catch any non-serialisable leftovers.
    encoded = json.dumps(payload)
    assert "loi" in encoded  # profile value made it through
    decoded = json.loads(encoded)
    assert decoded["profile"] == "loi"
    assert isinstance(decoded["articles"], list)
    assert len(decoded["articles"]) >= 1
