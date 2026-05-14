"""Constitution parser.

The 1987 Constitution and several of the 18 prior Haitian constitutions
use a deeper structural TOC than ordinary lois:

  Partie → Titre → Chapitre → Section → Sous-section

(``Livre`` is absent from the 1987 text but appears in 1843, 1846 etc.)

They also typically end with a "DISPOSITIONS TRANSITOIRES" annex block
that the generic parser would silently treat as more articles.
"""
from __future__ import annotations

import re

from schemas.enums import BlockKind, LegalCategory, ParserProfile

from .base import BaseParser, ParserContext, ParsedTocNode, ParserOutput


_TRANSITIONAL_RE = re.compile(
    r"\bDISPOSITIONS\s+TRANSITOIRES\b",
    re.IGNORECASE,
)


class ConstitutionParser(BaseParser):
    PROFILE = ParserProfile.constitution
    CATEGORY_GUESS = LegalCategory.constitution
    EXPECTS_PROMULGATION = True

    def finalize(self, ctx: ParserContext, output: ParserOutput) -> None:
        """Treat a ``DISPOSITIONS TRANSITOIRES`` block correctly based
        on whether it's a structural-heading title or an orphan label:

        - **Structural-heading title** (the common case in Haitian
          constitutions — TITRE XIV / TITRE XIII bears the title
          "DES DISPOSITIONS TRANSITOIRES"). The titre is already in
          ``output.toc`` and its articles are real normative articles
          of the constitution (Article 285 onward in 1987). **Do
          nothing.** No annex block, no article stripping.

        - **Orphan label** (the heading-less case — bare
          "DISPOSITIONS TRANSITOIRES" line followed by article-like
          text, no enclosing TITRE). Lift the trailing region as an
          ``annex`` TOC block and drop any "articles" the splitter
          picked up from inside it. This path was the original use
          case and shows up in older constitutions / drafts that
          lack proper TITRE wrapping.
        """
        # Check whether a structural heading already covers the
        # DISPOSITIONS TRANSITOIRES block by name. If yes, leave the
        # output as-is — the parser already classified everything
        # correctly.
        for node in output.toc:
            if node.block_kind != BlockKind.structural.value:
                continue
            title = (node.title_fr or "").upper()
            if "DISPOSITIONS TRANSITOIRES" in title:
                return

        text = ctx.normalized_text
        m = _TRANSITIONAL_RE.search(text)
        if not m:
            return
        annex_body = text[m.start():].strip()
        if not annex_body:
            return
        output.toc.append(
            ParsedTocNode(
                block_kind=BlockKind.annex.value,
                key="dispositions-transitoires",
                title_fr="Dispositions transitoires",
                body_fr=annex_body,
                position=len(output.toc),
                confidence=0.85,
            )
        )
        cutoff = m.start()
        before_annex_articles = []
        for art in output.articles:
            text_position = ctx.normalized_text.find(art.text_fr or art.number)
            if text_position == -1 or text_position < cutoff:
                before_annex_articles.append(art)
        output.articles = before_annex_articles

    def _should_require_review(self, output: ParserOutput) -> bool:
        """Constitutions are foundational texts — every promotion must
        be reviewed regardless of parser confidence."""
        return True
