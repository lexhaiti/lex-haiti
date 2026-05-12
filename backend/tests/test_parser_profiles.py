"""Tests for the typ-specific parser profiles (`services.ingestion.parsers`).

Pure text-in / output-out tests — no DB, no OCR. Covers the
profile-specific quirks each parser knows about: Constitutions carry an
explicit ``PRÉAMBULE`` header and end with ``DISPOSITIONS TRANSITOIRES``
as an annex; Lois use the implicit-preamble + Vu/Considérant pattern;
etc.
"""

from packages.schemas.enums import BlockKind, LegalCategory, ParserProfile
from services.ingestion.parsers import (
    ParserContext,
    get_parser,
    profile_for_category,
)


# --------------------------------------------------------------------------- #
# ConstitutionParser — PRÉAMBULE + DISPOSITIONS TRANSITOIRES + structural TOC #
# --------------------------------------------------------------------------- #


def _toc_by_kind(output, kind: BlockKind):
    return [n for n in output.toc if n.block_kind == kind.value]


def test_constitution_extracts_labelled_preamble():
    """An explicit ``PRÉAMBULE`` header followed by prose must be
    captured as a preamble block, with the label stripped from the
    body and high confidence (0.95). This is the path Constitutions
    use — they don't carry an implicit "before enacting formula"
    preamble because there is no enacting formula in a Constitution."""
    text = (
        "CONSTITUTION DE LA RÉPUBLIQUE D'HAÏTI\n\n"
        "PRÉAMBULE\n\n"
        "Le peuple haïtien proclame la présente Constitution.\n\n"
        "TITRE Ier — De la République d'Haïti\n\n"
        "Article 1er. — Haïti est une République indivisible."
    )
    parser = get_parser(profile_for_category(LegalCategory.constitution))
    out = parser.parse(ParserContext(normalized_text=text))

    preambles = _toc_by_kind(out, BlockKind.preamble)
    assert len(preambles) == 1
    p = preambles[0]
    # Label stripped — body contains only the prose, not "PRÉAMBULE"
    assert "PRÉAMBULE" not in (p.body_fr or "")
    assert "Le peuple haïtien" in (p.body_fr or "")
    # High confidence for the explicit label path
    assert p.confidence >= 0.9


def test_constitution_strips_dispositions_transitoires_annex():
    """A standalone ``DISPOSITIONS TRANSITOIRES`` header marks the
    transitional dispositions annex. The articles before it stay
    normative; the articles inside it must be dropped from
    ``output.articles`` (they're handled separately as an ``annex``
    block) and must not leak into the preceding article's body."""
    text = (
        "CONSTITUTION DE LA RÉPUBLIQUE D'HAÏTI\n\n"
        "Article 11. — Possède la nationalité haïtienne tout enfant.\n\n"
        "DISPOSITIONS TRANSITOIRES\n\n"
        "Article 282. — La présente Constitution entrera en vigueur."
    )
    parser = get_parser(profile_for_category(LegalCategory.constitution))
    out = parser.parse(ParserContext(normalized_text=text))

    article_numbers = [a.number for a in out.articles]
    assert article_numbers == ["11"]
    # Article 11's body must NOT leak DISPOSITIONS into it.
    art_11 = out.articles[0]
    assert "DISPOSITIONS" not in (art_11.text_fr or "")
    assert "282" not in (art_11.text_fr or "")

    # The annex block was lifted with its full content (incl. Article 282).
    annexes = _toc_by_kind(out, BlockKind.annex)
    assert len(annexes) == 1
    assert "Article 282" in (annexes[0].body_fr or "")


def test_constitution_handles_part_titre_chapitre_hierarchy():
    """The Constitution profile must recognise the deeper structural
    hierarchy used by Haitian constitutions: PARTIE > TITRE > CHAPITRE.
    The default heading patterns from BaseParser cover all three."""
    text = (
        "CONSTITUTION\n\n"
        "PARTIE I — Des principes généraux\n\n"
        "TITRE Ier — De la souveraineté\n\n"
        "CHAPITRE Ier — Du territoire\n\n"
        "Article 1er. — Haïti est indivisible."
    )
    parser = get_parser(profile_for_category(LegalCategory.constitution))
    out = parser.parse(ParserContext(normalized_text=text))

    levels = [n.level for n in out.toc if n.block_kind == BlockKind.structural.value]
    assert "part" in levels
    assert "title" in levels
    assert "chapter" in levels


# --------------------------------------------------------------------------- #
# LoiParser — implicit preamble + visa/considérant/enacting formula           #
# --------------------------------------------------------------------------- #


def test_loi_extracts_implicit_preamble_visas_considerants_enacting():
    """For a loi, the formal-block extractor walks the head (text before
    the enacting formula) and lifts Vu / Considérant lines into their
    own blocks. The enacting line itself becomes its own block."""
    text = (
        "LOI N° 2026-01 portant test des marchés publics.\n\n"
        "Vu la Constitution du 29 mars 1987 ;\n"
        "Vu le Code Civil ;\n\n"
        "Considérant qu'il est nécessaire de réguler les marchés ;\n\n"
        "Le Corps législatif a voté la loi suivante :\n\n"
        "Article 1er. — Le présent texte régit les marchés.\n"
    )
    parser = get_parser(ParserProfile.loi)
    out = parser.parse(ParserContext(normalized_text=text))

    kinds = {n.block_kind for n in out.toc}
    assert BlockKind.visa.value in kinds
    assert BlockKind.considerant.value in kinds
    assert BlockKind.enacting_formula.value in kinds
    assert [a.number for a in out.articles] == ["1"]


# --------------------------------------------------------------------------- #
# profile_for_category — exhaustive coverage of the mapping table             #
# --------------------------------------------------------------------------- #


def test_profile_for_category_full_table():
    """One row per LegalCategory value — verifies the mapping table
    stays in sync with the enum. Anything not in the map falls back to
    the generic profile (convention, errata, autre, other_regulatory)."""
    mapping = {
        LegalCategory.constitution: ParserProfile.constitution,
        LegalCategory.code: ParserProfile.code,
        LegalCategory.loi: ParserProfile.loi,
        LegalCategory.decret: ParserProfile.executive_act,
        LegalCategory.arrete: ParserProfile.executive_act,
        LegalCategory.circulaire: ParserProfile.circulaire,
        LegalCategory.communique: ParserProfile.communique,
        LegalCategory.ordonnance: ParserProfile.executive_act,
        LegalCategory.avis: ParserProfile.communique,
        # Fallbacks → generic
        LegalCategory.convention: ParserProfile.generic,
        LegalCategory.other_regulatory: ParserProfile.generic,
    }
    for cat, expected in mapping.items():
        assert profile_for_category(cat) == expected, (
            f"{cat.value} → expected {expected.value}"
        )
