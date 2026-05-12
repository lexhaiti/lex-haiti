"""Tests for the article splitter (`services.ingestion.article_split`).

Pure-regex, no DB. Covers the heading variants found in real Haitian
laws (Article 1er, ARTICLE 12, Art. 5, dotted/bis suffixes) plus the
edge cases the splitter has to gracefully handle (no headings, empty
input, paragraph-internal "article" mentions).
"""

from services.ingestion.article_split import (
    ParsedArticle,
    SplitResult,
    split_into_articles,
)


# --------------------------------------------------------------------------- #
# Happy path                                                                   #
# --------------------------------------------------------------------------- #

def test_splits_simple_three_articles():
    body = (
        "Considérant ceci.\n\n"
        "Article 1. Premier article.\n\n"
        "Article 2. Deuxième article.\n\n"
        "Article 3. Troisième article."
    )
    r = split_into_articles(body)
    assert r.preamble == "Considérant ceci."
    assert [a.number for a in r.articles] == ["1", "2", "3"]
    assert r.articles[0].body == "Premier article."
    assert r.articles[2].body == "Troisième article."


def test_handles_all_heading_variants():
    body = (
        "Article 1er. — Variante 1er avec emdash.\n\n"
        "Article 2.- Variante point-tiret.\n\n"
        "Article 3 — Variante espace-emdash.\n\n"
        "Art. 4. Variante abréviation.\n\n"
        "ARTICLE 5 : Variante majuscule + colon.\n\n"
        "Article 6bis Variante bis.\n\n"
        "Article 7.1 Variante dotted (Constitution-style)."
    )
    r = split_into_articles(body)
    nums = [a.number for a in r.articles]
    assert nums == ["1", "2", "3", "4", "5", "6bis", "7.1"]
    # Bodies should not start with leading separator characters.
    for a in r.articles:
        assert not a.body.startswith(("—", "-", ".", ":", " "))


def test_normalizes_first_article_suffix():
    """`1er`, `1ère`, `1e` all become `1`."""
    body = "Article 1er. Premier.\n\nArticle 1ère. Aussi.\n\nArticle 1e. Encore."
    r = split_into_articles(body)
    # Three distinct articles whose normalized number is "1" each.
    # (We don't dedupe — that's the editor's call when reviewing.)
    assert all(a.number == "1" for a in r.articles)
    assert len(r.articles) == 3


def test_preamble_captures_everything_before_first_article():
    body = (
        "LOI N° 2026-50 portant exemple.\n"
        "Le Président de la République,\n"
        "Vu la Constitution amendée du 26 mars 1987 ;\n"
        "ARRÊTE :\n\n"
        "Article 1. Le contenu commence ici."
    )
    r = split_into_articles(body)
    assert "LOI N° 2026-50" in r.preamble
    assert "Vu la Constitution" in r.preamble
    assert "ARRÊTE" in r.preamble
    assert "Le contenu commence ici" not in r.preamble
    assert r.articles[0].body == "Le contenu commence ici."


# --------------------------------------------------------------------------- #
# Edge cases                                                                   #
# --------------------------------------------------------------------------- #


def test_empty_body_returns_empty_result():
    assert split_into_articles("") == SplitResult(preamble="", articles=[])
    assert split_into_articles("   \n\n  ") == SplitResult(preamble="", articles=[])


def test_no_article_headings_keeps_body_as_preamble():
    body = "Just a paragraph with no article markers."
    r = split_into_articles(body)
    assert r.preamble == body
    assert r.articles == []


def test_paragraph_internal_article_reference_is_not_a_heading():
    """Match `Article N` only at line-start, so `…selon l'article 12 de…`
    in the middle of a paragraph doesn't get split as a heading."""
    body = (
        "Article 1. La présente loi vise les articles 12 et 13 de la Constitution\n"
        "ainsi que l'article 7 du Code Civil.\n\n"
        "Article 2. Suite."
    )
    r = split_into_articles(body)
    assert [a.number for a in r.articles] == ["1", "2"]
    # Article 1's body should still mention the inline references.
    assert "articles 12 et 13" in r.articles[0].body
    assert "Code Civil" in r.articles[0].body


def test_drops_articles_with_empty_bodies():
    """When two headings sit back-to-back with nothing between them
    (usually OCR noise), the empty article shouldn't make it into
    output."""
    body = "Article 1.\n\nArticle 2. Vraie article."
    r = split_into_articles(body)
    assert [a.number for a in r.articles] == ["2"]
    assert r.articles[0].body == "Vraie article."


def test_returns_parsed_article_dataclass():
    """Sanity-check the public type."""
    r = split_into_articles("Article 1. test.")
    assert isinstance(r, SplitResult)
    assert isinstance(r.articles[0], ParsedArticle)
    assert r.articles[0].title is None  # default — no title detection yet


# --------------------------------------------------------------------------- #
# Hard / soft boundaries: DISPOSITIONS TRANSITOIRES + structural headings     #
# --------------------------------------------------------------------------- #


def test_dispositions_transitoires_is_a_hard_stop():
    """A standalone DISPOSITIONS TRANSITOIRES header must cut the body
    before its position — articles inside the transitional block are
    handled separately by the parser profile (as an `annex`) and must
    never leak into the preceding article's body."""
    body = (
        "Article 11. — Possède la nationalité haïtienne tout enfant.\n\n"
        "DISPOSITIONS TRANSITOIRES\n\n"
        "Article 282. — La présente Constitution entrera en vigueur."
    )
    r = split_into_articles(body)
    assert [a.number for a in r.articles] == ["11"]
    assert "DISPOSITIONS" not in r.articles[0].body
    assert "282" not in r.articles[0].body
    assert r.articles[0].body.endswith("tout enfant.")


def test_inline_dispositions_transitoires_does_not_trigger_cut():
    """An inline reference to "dispositions transitoires" inside an
    article body must NOT trigger the hard stop — only the standalone
    header form on its own line cuts. Otherwise prose like "la loi
    prévoit des dispositions transitoires…" would silently truncate
    every loi that mentions them."""
    body = (
        "Article 1. — La loi prévoit des dispositions transitoires "
        "applicables aux contrats en cours.\n\n"
        "Article 2. — Cette disposition entre en vigueur."
    )
    r = split_into_articles(body)
    assert [a.number for a in r.articles] == ["1", "2"]
    assert "dispositions transitoires" in r.articles[0].body


def test_structural_heading_between_articles_ends_previous_body():
    """When a TITRE / CHAPITRE header sits between two articles, the
    previous article's body must end at the heading — otherwise the
    structural label silently becomes prose trailing the article body."""
    body = (
        "Article 2. — Les couleurs nationales sont le bleu et le rouge.\n\n"
        "TITRE II\n"
        "DES HAÏTIENS ET DE LEURS DROITS\n\n"
        "CHAPITRE Ier — De la nationalité haïtienne\n\n"
        "Article 11. — Possède la nationalité haïtienne tout enfant."
    )
    r = split_into_articles(body)
    assert [a.number for a in r.articles] == ["2", "11"]
    # Article 2's body must NOT swallow TITRE II / CHAPITRE Ier
    assert "TITRE" not in r.articles[0].body
    assert "CHAPITRE" not in r.articles[0].body
    assert r.articles[0].body.endswith("bleu et le rouge.")


def test_structural_heading_in_prose_does_not_cut():
    """Inline prose references like "Le présent TITRE concerne…" must
    NOT be mistaken for a structural-heading boundary. The regex is
    line-anchored and requires a Roman/digit number right after the
    keyword — "Le présent TITRE concerne" doesn't match."""
    body = (
        "Article 1. — Le présent TITRE concerne les droits fondamentaux "
        "et garantit la liberté d'expression.\n\n"
        "Article 2. — La suite."
    )
    r = split_into_articles(body)
    assert [a.number for a in r.articles] == ["1", "2"]
    assert "TITRE concerne" in r.articles[0].body
