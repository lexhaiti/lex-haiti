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

from packages.schemas.enums import BlockKind, LegalCategory, ParserProfile

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
        """If the document contains a `DISPOSITIONS TRANSITOIRES`
        marker, lift everything after it as an ``annex`` block so the
        article-splitter doesn't keep collecting articles from it."""
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
        # Drop any "articles" the splitter picked up from inside the
        # annex region — they're not normative articles.
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
