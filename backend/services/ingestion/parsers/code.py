"""Code parser.

Haitian Codes (Civil, Pénal, Travail, Commerce, …) share a deeper TOC
than ordinary lois:

  Livre → Titre → Chapitre → Section → Sous-section

…and they don't carry their own preamble / visa / considérant / enacting
formula (they were enacted by an underlying loi long ago; the Code as
served is the consolidated text). They DO have a promulgation history
but the corpus typically renders the consolidated text without the
promulgation block.
"""
from __future__ import annotations

from packages.schemas.enums import LegalCategory, ParserProfile

from .base import BaseParser, ParserContext, ParserOutput


class CodeParser(BaseParser):
    PROFILE = ParserProfile.code
    CATEGORY_GUESS = LegalCategory.code
    # Codes are served as consolidated texts; promulgation belongs to
    # the underlying loi history, not to the Code itself.
    EXPECTS_PROMULGATION = False

    def finalize(self, ctx: ParserContext, output: ParserOutput) -> None:
        """Codes rarely have preamble / visa / considérant on the
        consolidated text — drop any low-confidence formal blocks the
        base parser surfaced so they don't pollute the output."""
        output.toc = [
            node
            for node in output.toc
            if node.block_kind in {"structural", "annex", "closing_formula"}
            or (node.confidence is not None and node.confidence >= 0.9)
        ]
        # Re-number positions after the cull
        for i, node in enumerate(output.toc):
            node.position = i
