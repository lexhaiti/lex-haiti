"""Shared formatting helpers for PDF and DOCX export.

Keeps locale-aware date/label rendering and the heading-tree assembly in
one place so PDF and DOCX layouts stay in lockstep.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Iterable, Optional

from schemas.article import ArticleEmbed
from schemas.heading import LegalHeadingRead
from schemas.legal_text import LegalTextRead

# Inline list markers commonly used in French / Haitian legal drafting:
#   a) b) c)  — lowercase Latin (most common)
#   1) 2) 3)  — Arabic with paren
#   1° 2° 3°  — ordinal degree (used for "premièrement, deuxièmement…")
#
# We split a paragraph BEFORE such a marker if it follows other content in
# the same paragraph, so each item lands on its own line. The marker stays
# attached to the item it labels.
_INLINE_LIST_MARKER = re.compile(
    r"(?<=\S)\s+(?=(?:[a-z]\)|\d+\)|\d+°)\s)",
)

# French month names — *Le Moniteur* and Haitian legal texts always cite
# dates in French long form ("4 juin 2014"), never numeric.
_MONTHS_FR = [
    "",
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
]

# Kreyòl month names — used when lang=ht.
_MONTHS_HT = [
    "",
    "janvye",
    "fevriye",
    "mas",
    "avril",
    "me",
    "jen",
    "jiyè",
    "out",
    "septanm",
    "oktòb",
    "novanm",
    "desanm",
]

CATEGORY_LABEL_FR = {
    "constitution": "Constitution",
    "code": "Code",
    "loi": "Loi",
    "decret": "Décret",
    "arrete": "Arrêté",
    "circulaire": "Circulaire",
    "convention": "Convention",
    "ordonnance": "Ordonnance",
    "reglement": "Règlement",
}

CATEGORY_LABEL_HT = {
    "constitution": "Konstitisyon",
    "code": "Kòd",
    "loi": "Lwa",
    "decret": "Dekrè",
    "arrete": "Arete",
    "circulaire": "Sirkilè",
    "convention": "Konvansyon",
    "ordonnance": "Òdonans",
    "reglement": "Règleman",
}

STATUS_LABEL_FR = {
    "in_force": "En vigueur",
    "abrogated": "Abrogé",
    "amended": "Modifié",
    "suspended": "Suspendu",
    "draft": "Brouillon",
}

STATUS_LABEL_HT = {
    "in_force": "An vigè",
    "abrogated": "Abwoje",
    "amended": "Modifye",
    "suspended": "Sispann",
    "draft": "Bouyon",
}

HEADING_LABEL_FR = {
    "book": "Livre",
    "title": "Titre",
    "chapter": "Chapitre",
    "section": "Section",
    "subsection": "Sous-section",
    "part": "Partie",
}

HEADING_LABEL_HT = {
    "book": "Liv",
    "title": "Tit",
    "chapter": "Chapit",
    "section": "Seksyon",
    "subsection": "Sou-seksyon",
    "part": "Pati",
}


@dataclass
class ExportLabels:
    """Locale-bound strings used across both PDF and DOCX renderers."""

    lang: str
    cover_brand_tagline: str
    cover_promulgation: str
    cover_publication: str
    cover_moniteur: str
    cover_status: str
    cover_articles: str
    cover_generated: str
    article: str
    preamble: str
    footer_source: str
    footer_version: str
    no_haitian_translation: str

    def category(self, value: Optional[str]) -> str:
        if not value:
            return ""
        table = CATEGORY_LABEL_HT if self.lang == "ht" else CATEGORY_LABEL_FR
        return table.get(value, value)

    def status(self, value: Optional[str]) -> str:
        if not value:
            return ""
        table = STATUS_LABEL_HT if self.lang == "ht" else STATUS_LABEL_FR
        return table.get(value, value)

    def heading(self, level: Optional[str]) -> str:
        if not level:
            return ""
        table = HEADING_LABEL_HT if self.lang == "ht" else HEADING_LABEL_FR
        return table.get(level, level.capitalize())


def labels_for(lang: str) -> ExportLabels:
    if lang == "ht":
        return ExportLabels(
            lang="ht",
            cover_brand_tagline="Pòtal jiridik Repiblik Ayiti",
            cover_promulgation="Pwomilgasyon",
            cover_publication="Piblikasyon",
            cover_moniteur="Le Moniteur",
            cover_status="Estati",
            cover_articles="Atik",
            cover_generated="Dokiman jenere",
            article="Atik",
            preamble="Preanbil",
            footer_source="Sous",
            footer_version="Vèsyon",
            no_haitian_translation=(
                "Tradiksyon kreyòl la pa disponib toujou. "
                "Tèks la parèt nan vèsyon franse li."
            ),
        )
    return ExportLabels(
        lang="fr",
        cover_brand_tagline="Portail juridique de la République d'Haïti",
        cover_promulgation="Promulgation",
        cover_publication="Publication",
        cover_moniteur="Le Moniteur",
        cover_status="Statut",
        cover_articles="Articles",
        cover_generated="Document généré",
        article="Article",
        preamble="Préambule",
        footer_source="Source",
        footer_version="Version",
        no_haitian_translation="",
    )


def fmt_date(value: Optional[date | datetime], lang: str = "fr") -> str:
    """Render a date in French/Kreyòl long form ("4 juin 2014" / "4 jen 2014")."""
    if value is None:
        return "—"
    months = _MONTHS_HT if lang == "ht" else _MONTHS_FR
    if isinstance(value, datetime):
        value = value.date()
    return f"{value.day} {months[value.month]} {value.year}"


def pick_localized(fr: Optional[str], ht: Optional[str], lang: str) -> Optional[str]:
    """Pick the language-appropriate field, falling back to FR if HT is empty."""
    if lang == "ht" and ht:
        return ht
    return fr


@dataclass
class HeadingNode:
    """Tree node assembled from the flat headings list."""

    heading: LegalHeadingRead
    children: list["HeadingNode"]
    articles: list[ArticleEmbed]


@dataclass
class ExportTree:
    """Hierarchical assembly of a legal text ready to render.

    Articles attached to a heading are listed under that heading; orphan
    articles (heading_id None) are surfaced at the top of `orphan_articles`.
    """

    text: LegalTextRead
    roots: list[HeadingNode]
    orphan_articles: list[ArticleEmbed]


def build_export_tree(text: LegalTextRead) -> ExportTree:
    """Group articles under their heading and assemble a parent/child tree."""
    by_id: dict[int, HeadingNode] = {
        h.id: HeadingNode(heading=h, children=[], articles=[]) for h in text.headings
    }
    roots: list[HeadingNode] = []
    for h in sorted(text.headings, key=lambda x: (x.position, x.id)):
        node = by_id[h.id]
        if h.parent_id and h.parent_id in by_id:
            by_id[h.parent_id].children.append(node)
        else:
            roots.append(node)

    orphans: list[ArticleEmbed] = []
    for a in sorted(text.articles, key=lambda x: x.position):
        if a.heading_id and a.heading_id in by_id:
            by_id[a.heading_id].articles.append(a)
        else:
            orphans.append(a)

    return ExportTree(text=text, roots=roots, orphan_articles=orphans)


def split_alineas(content: Optional[str]) -> list[str]:
    """Split an article body into alinéas — one entry per blank-line block.

    Inline lettered/numbered list markers (`a)`, `b)`, `1°`, …) inside an
    alinéa are then promoted to their own entries so each item renders on
    its own line.
    """
    if not content:
        return []
    raw_paragraphs = [
        p.strip() for p in content.replace("\r\n", "\n").split("\n\n") if p.strip()
    ]
    out: list[str] = []
    for para in raw_paragraphs:
        for piece in _INLINE_LIST_MARKER.split(para):
            piece = piece.strip()
            if piece:
                out.append(piece)
    return out


def is_list_item(text: str) -> bool:
    """True if a paragraph starts with a lettered / numbered list marker.

    Used by renderers to indent list items relative to the lead-in line.
    """
    return bool(re.match(r"^(?:[a-z]\)|\d+\)|\d+°)\s", text))


def article_label(article: ArticleEmbed, labels: ExportLabels) -> str:
    return f"{labels.article} {article.number}"
