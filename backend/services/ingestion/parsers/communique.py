"""Communiqué / avis parser.

These texts have no articles, no structural TOC — just a single block
of free prose. We bypass the article splitter entirely and produce one
``prose_body`` TocNode containing the full text.

Used for: communiqués de presse, avis ministériels, déclarations
officielles. Anything where "the document is the prose, period".
"""
from __future__ import annotations

from schemas.enums import BlockKind, LegalCategory, ParserProfile

from .base import (
    BaseParser,
    ParserContext,
    ParsedTocNode,
    ParserOutput,
    SOVEREIGNTY_RE,
)


class CommuniqueParser(BaseParser):
    PROFILE = ParserProfile.communique
    CATEGORY_GUESS = LegalCategory.communique
    EXPECTS_PROMULGATION = False
    # Communiqués don't have a structural TOC — we suppress all heading
    # patterns so the base parser produces no structural nodes.
    HEADING_PATTERNS = []

    def parse(self, ctx: ParserContext) -> ParserOutput:
        """Override the full pipeline — we don't need article-splitting
        or structural-heading detection. Just lift the prose body and
        any signatures."""
        text = self._normalize(ctx.normalized_text)
        output = ParserOutput(
            profile=self.PROFILE,
            category_guess=self.CATEGORY_GUESS,
        )

        # First line ≈ title heuristic
        first_line = next(
            (ln.strip() for ln in text.split("\n") if ln.strip()), ""
        )
        if 0 < len(first_line) < 200:
            output.title_fr = first_line

        # Sovereignty formula if present
        m = SOVEREIGNTY_RE.search(text)
        if m:
            output.toc.append(
                ParsedTocNode(
                    block_kind=BlockKind.sovereignty_formula.value,
                    key="sovereignty",
                    body_fr=m.group(0).strip(),
                    confidence=0.9,
                )
            )

        # The whole document body becomes one prose_body block
        output.toc.append(
            ParsedTocNode(
                block_kind=BlockKind.prose_body.value,
                key="body",
                body_fr=text,
                position=len(output.toc),
                confidence=0.85,
            )
        )

        # Try to lift signatures even for communiqués — the
        # extract_signatories helper expects a (formula, category) call.
        from services.ingestion.signatories_extract import extract_signatories
        try:
            sigs = extract_signatories(
                text[-2000:], category=self.CATEGORY_GUESS  # type: ignore[arg-type]
            )
            for s in sigs:
                output.signatures.append(
                    {
                        "name": s.name,
                        "role_title_fr": s.function,
                        "signing_capacity": (
                            s.signing_capacity.value
                            if s.signing_capacity is not None
                            else None
                        ),
                        "chamber": s.chamber.value if s.chamber else None,
                    }
                )
        except Exception as exc:  # noqa: BLE001
            output.warnings.append(f"signature extraction failed: {exc}")

        output.parser_confidence = self._score_confidence(output)
        output.review_required = self._should_require_review(output)
        return output

    def _should_require_review(self, output: ParserOutput) -> bool:
        """Communiqués are short, low-stakes prose — only flag for
        review when the parser produced warnings (e.g. signature
        extraction failed). No structural complexity to validate."""
        return bool(output.warnings)
