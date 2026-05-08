"""Tests for the document parser — heading detection + article splitting.

The document parser is the core of the editorial import flow. It takes
raw text and returns structured headings, articles with heading assignments,
a preamble, confidence score, and warnings.
"""
from __future__ import annotations

import pytest

from services.ingestion.document_parser import (
    DocumentParseResult,
    parse_document,
)


# ---------------------------------------------------------------------------
# Heading detection
# ---------------------------------------------------------------------------


class TestHeadingDetection:

    def test_detects_titres_and_chapitres(self):
        body = """
TITRE I — Des dispositions générales

CHAPITRE I — De l'objet

Article 1er. — La présente loi régit les marchés publics.

CHAPITRE II — Des principes

Article 2. — Les marchés respectent la transparence.
"""
        r = parse_document(body)
        assert len(r.headings) == 3
        assert r.headings[0].level == "title"
        assert r.headings[0].number == "I"
        assert r.headings[0].title_fr == "Des dispositions générales"
        assert r.headings[0].parent_key is None
        assert r.headings[1].level == "chapter"
        assert r.headings[1].parent_key == r.headings[0].key
        assert r.headings[2].level == "chapter"
        assert r.headings[2].parent_key == r.headings[0].key

    def test_detects_livres(self):
        body = """
LIVRE I — Des personnes

TITRE I — De la personnalité

Article 1er. — Toute personne jouit des droits civils.
"""
        r = parse_document(body)
        assert r.headings[0].level == "book"
        assert r.headings[1].level == "title"
        assert r.headings[1].parent_key == r.headings[0].key

    def test_detects_sections(self):
        body = """
CHAPITRE I — Des obligations

SECTION I — Des sources

Article 1er. — Les obligations naissent du contrat.
"""
        r = parse_document(body)
        assert len(r.headings) == 2
        section = r.headings[1]
        assert section.level == "section"
        assert section.parent_key == r.headings[0].key

    def test_heading_scope_resets_on_shallower_level(self):
        body = """
TITRE I — Premier titre

CHAPITRE I — Premier chapitre

Article 1er. — Premier article.

TITRE II — Deuxième titre

CHAPITRE I — Chapitre du titre II

Article 2. — Deuxième article.
"""
        r = parse_document(body)
        titre2 = next(h for h in r.headings if h.title_fr == "Deuxième titre")
        chap_t2 = next(h for h in r.headings if h.title_fr == "Chapitre du titre II")
        assert titre2.parent_key is None
        assert chap_t2.parent_key == titre2.key

    def test_no_headings_in_simple_text(self):
        body = """
Article 1er. — La présente loi régit les marchés.

Article 2. — Les marchés respectent la transparence.
"""
        r = parse_document(body)
        assert len(r.headings) == 0
        assert len(r.articles) == 2


# ---------------------------------------------------------------------------
# Article-heading assignment
# ---------------------------------------------------------------------------


class TestArticleHeadingAssignment:

    def test_articles_assigned_to_nearest_heading(self):
        body = """
CHAPITRE I — Premier

Article 1er. — Texte un.

CHAPITRE II — Deuxième

Article 2. — Texte deux.

Article 3. — Texte trois.
"""
        r = parse_document(body)
        assert r.articles[0].heading_key == r.headings[0].key
        assert r.articles[1].heading_key == r.headings[1].key
        assert r.articles[2].heading_key == r.headings[1].key

    def test_heading_path_built_correctly(self):
        body = """
TITRE I — Le titre

CHAPITRE I — Le chapitre

Article 1er. — Contenu.
"""
        r = parse_document(body)
        path = r.articles[0].heading_path
        assert len(path) == 2
        assert "Titre I" in path[0]
        assert "Chapitre I" in path[1]

    def test_articles_before_first_heading_have_no_heading(self):
        body = """
Article 1er. — Préliminaire.

CHAPITRE I — Début

Article 2. — Après heading.
"""
        r = parse_document(body)
        assert r.articles[0].heading_key is None
        assert r.articles[0].heading_path == []
        assert r.articles[1].heading_key is not None


# ---------------------------------------------------------------------------
# Preamble and confidence
# ---------------------------------------------------------------------------


class TestPreambleAndConfidence:

    def test_preamble_captured(self):
        body = """
Le Président de la République,
Vu la Constitution ;
ARRÊTE :

Article 1er. — Premier article.
"""
        r = parse_document(body)
        assert "Président" in r.preamble
        assert "ARRÊTE" in r.preamble
        assert len(r.articles) == 1

    def test_empty_document(self):
        r = parse_document("")
        assert r.parser_confidence == 0.0
        assert len(r.warnings) >= 1
        assert "empty" in r.warnings[0].lower()

    def test_whitespace_only_document(self):
        r = parse_document("   \n\n  ")
        assert r.parser_confidence == 0.0

    def test_no_articles_low_confidence(self):
        r = parse_document("Just some random text with no legal structure.")
        assert r.parser_confidence < 0.5
        assert any("preamble" in w.lower() for w in r.warnings)

    def test_well_structured_high_confidence(self):
        body = """
Article 1er. — Premier article avec un long texte.
Article 2. — Deuxième article.
Article 3. — Troisième article.
"""
        r = parse_document(body)
        assert r.parser_confidence >= 0.7

    def test_non_sequential_articles_warning(self):
        body = """
Article 1er. — Premier.
Article 5. — Cinquième sans les intermédiaires.
Article 3. — Retour en arrière.
"""
        r = parse_document(body)
        assert any("non-sequential" in w.lower() for w in r.warnings)


# ---------------------------------------------------------------------------
# Key uniqueness
# ---------------------------------------------------------------------------


class TestKeyUniqueness:

    def test_duplicate_heading_numbers_get_unique_keys(self):
        body = """
TITRE I — Premier titre

CHAPITRE I — Premier chapitre

Article 1er. — Premier.

TITRE II — Deuxième titre

CHAPITRE I — Deuxième chapitre (même numéro)

Article 2. — Deuxième.
"""
        r = parse_document(body)
        keys = [h.key for h in r.headings]
        assert len(keys) == len(set(keys)), f"Duplicate keys: {keys}"


# ---------------------------------------------------------------------------
# Full integration
# ---------------------------------------------------------------------------


class TestFullParse:

    def test_realistic_law(self):
        body = """
Le Président de la République,
Vu la Constitution amendée du 26 mars 1987 ;
Considérant qu'il est nécessaire de réglementer ;
ARRÊTE :

TITRE I — Des dispositions générales

CHAPITRE I — De l'objet et du champ d'application

Article 1er. — La présente loi régit les marchés publics conclus par
l'État, les collectivités territoriales et les organismes publics.

Article 2. — Sont soumis aux dispositions de la présente loi tous les
marchés de fournitures, services et travaux.

CHAPITRE II — Des principes fondamentaux

Article 3. — Les marchés publics respectent les principes de liberté
d'accès, d'égalité de traitement et de transparence.

Article 4. — La personne publique ne peut exiger des candidats que les
conditions nécessaires à l'exécution du marché.

TITRE II — Des procédures de passation

Article 5. — La passation des marchés publics obéit aux règles
définies dans le présent titre.
"""
        r = parse_document(body)

        assert len(r.headings) == 4  # 2 titles + 2 chapters
        assert len(r.articles) == 5
        assert "Président" in r.preamble
        assert r.parser_confidence >= 0.7

        # Check heading hierarchy
        titre1 = r.headings[0]
        chap1 = r.headings[1]
        chap2 = r.headings[2]
        titre2 = r.headings[3]

        assert titre1.level == "title"
        assert chap1.parent_key == titre1.key
        assert chap2.parent_key == titre1.key
        assert titre2.level == "title"
        assert titre2.parent_key is None

        # Check article assignments
        assert r.articles[0].heading_key == chap1.key  # Art 1 → Chap I
        assert r.articles[1].heading_key == chap1.key  # Art 2 → Chap I
        assert r.articles[2].heading_key == chap2.key  # Art 3 → Chap II
        assert r.articles[3].heading_key == chap2.key  # Art 4 → Chap II
        assert r.articles[4].heading_key == titre2.key  # Art 5 → Titre II
