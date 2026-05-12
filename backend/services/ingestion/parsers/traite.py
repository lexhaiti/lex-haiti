"""Treaty / Convention / Accord parser.

International legal texts have a structure that diverges enough from
domestic legislation to warrant its own profile:

  - **Préambule**: parties and high-level motivations ("Les Parties
    contractantes, désireuses de…").
  - **Parties**: explicit list of signatory states / organisations,
    often labelled "Les Hautes Parties contractantes" or simply
    enumerated above the preamble.
  - **Définitions** ("Aux fins du présent traité, on entend par…"):
    optional but common in modern treaties.
  - **Articles**: numbered, similar to domestic acts but typically
    shallower (no LIVRE/TITRE, often just SECTION + ARTICLE).
  - **Annexes / Protocoles**: appended documents with their own
    article numbering, sometimes attached at signature, sometimes
    later via separate protocol.
  - **Clauses finales**: signature, ratification, entry-into-force.

The parser stays close to ``BaseParser`` — most of the shared
behaviour (formal blocks, structural headings, article splitting)
applies. We override:

  - ``HEADING_PATTERNS``: drop PARTIE/LIVRE (too domestic) and add
    ANNEXE / PROTOCOLE on top of the standard TITRE/CHAPITRE/SECTION.
  - ``finalize``: lift Annexe / Protocole blocks as separate TOC
    entries with their own block_kind, and extract the "parties"
    list when present.
  - ``_extract_issuing_authorities``: parties (the signatory states)
    ARE the issuing authorities for a treaty — populate the list
    from the parsed parties block.

Legal status uses the treaty-specific values from ``LegalStatus``:
``signed`` (signature deposited, not yet ratified), ``ratified``
(ratified but not yet promulgated), ``in_force`` (after promulgation),
``denounced``, ``abrogated``.
"""
from __future__ import annotations

import re
from typing import ClassVar, Optional, Pattern

from packages.schemas.enums import (
    BlockKind,
    HeadingLevel,
    LegalCategory,
    ParserProfile,
)

from .base import (
    BaseParser,
    IssuingAuthority,
    ParsedTocNode,
    ParserContext,
    ParserOutput,
)


# Treaty heading patterns — shallower than domestic codes, with
# ANNEXE / PROTOCOLE as top-level structural markers. Roman or Arabic
# numerals; trailing title optional ("ANNEXE I — Liste des espèces").
_TRAITE_HEADING_PATTERNS: list[tuple[HeadingLevel, Pattern[str]]] = [
    (
        HeadingLevel.book,  # we reuse `book` as the conceptual level for ANNEXE
        re.compile(
            r"^\s*ANNEXE\s+([IVXLCDM\d]+(?:er|ère|e)?)\s*[\.\-—]?\s*(.+)?$",
            re.IGNORECASE | re.MULTILINE,
        ),
    ),
    (
        HeadingLevel.title,
        re.compile(
            r"^\s*PROTOCOLE\s+([IVXLCDM\d]+(?:er|ère|e)?)?\s*[\.\-—]?\s*(.+)?$",
            re.IGNORECASE | re.MULTILINE,
        ),
    ),
    (
        HeadingLevel.title,
        re.compile(
            r"^\s*TITRE\s+([IVXLCDM\d]+(?:er|ère|e)?)\s*[\.\-—]?\s*(.+)?$",
            re.IGNORECASE | re.MULTILINE,
        ),
    ),
    (
        HeadingLevel.chapter,
        re.compile(
            r"^\s*CHAPITRE\s+([IVXLCDM\d]+(?:er|ère|e)?)\s*[\.\-—]?\s*(.+)?$",
            re.IGNORECASE | re.MULTILINE,
        ),
    ),
    (
        HeadingLevel.section,
        re.compile(
            r"^\s*SECTION\s+([IVXLCDM\d]+(?:re|ère|e)?)\s*[\.\-—]?\s*(.+)?$",
            re.IGNORECASE | re.MULTILINE,
        ),
    ),
]


# "Les Hautes Parties contractantes" / "Les États parties" / etc.
# Match the introductory header so we can lift the following lines
# as the parties block.
_PARTIES_HEADER_RE = re.compile(
    r"^\s*(?:Les\s+Hautes\s+Parties\s+contractantes|"
    r"Les\s+(?:[ÉE]tats|Parties)\s+(?:contractant(?:e)?s|signataires)|"
    r"Entre)\s*[:\-—]?\s*$",
    re.IGNORECASE | re.MULTILINE,
)


class TraiteParser(BaseParser):
    PROFILE: ClassVar[ParserProfile] = ParserProfile.traite
    CATEGORY_GUESS: ClassVar[Optional[LegalCategory]] = LegalCategory.convention
    EXPECTS_PROMULGATION: ClassVar[bool] = False  # ratified, not promulgated
    HEADING_PATTERNS: ClassVar[list[tuple[HeadingLevel, Pattern[str]]]] = (
        _TRAITE_HEADING_PATTERNS
    )

    def finalize(self, ctx: ParserContext, output: ParserOutput) -> None:
        """Lift the parties block as its own TOC entry and surface the
        list of signatory parties as issuing_authorities."""
        text = ctx.normalized_text
        parties_text, parties_lines = self._extract_parties_block(text)
        if parties_text:
            start_line, end_line = parties_lines
            output.toc.insert(
                0,
                ParsedTocNode(
                    block_kind=BlockKind.preamble.value,
                    key="parties",
                    title_fr="Parties contractantes",
                    body_fr=parties_text,
                    confidence=0.85,
                    position=0,
                    source_start_line=start_line,
                    source_end_line=end_line,
                ),
            )
            # Re-number positions after the insert
            for i, node in enumerate(output.toc):
                node.position = i
            # Each non-blank line in the parties block is one party →
            # turn them into IssuingAuthority entries. Cap at 30 to
            # avoid an unbounded list when OCR concatenates blocks.
            party_lines = [
                ln.strip()
                for ln in parties_text.splitlines()
                if ln.strip() and len(ln.strip()) > 2
            ][:30]
            output.issuing_authorities = [
                IssuingAuthority(
                    name=line,
                    role="État signataire",
                    confidence=0.7,
                )
                for line in party_lines
            ]

    def _extract_parties_block(
        self, text: str
    ) -> tuple[Optional[str], tuple[Optional[int], Optional[int]]]:
        """Return ``(parties_body, (start_line, end_line))`` or
        ``(None, (None, None))`` if no parties header was found.

        Body runs from just after the header to the next structural
        heading / formal-block marker — same strategy as
        ``_extract_labelled_preamble``.
        """
        m = _PARTIES_HEADER_RE.search(text)
        if not m:
            return None, (None, None)
        body_start = m.end()
        end_candidates: list[int] = [len(text)]
        for _level, pat in self.HEADING_PATTERNS:
            nm = pat.search(text, body_start)
            if nm:
                end_candidates.append(nm.start())
        body_end = min(end_candidates)
        body = text[body_start:body_end].strip()
        if not body:
            return None, (None, None)
        start_line, end_line = self._locate_lines(text, body)
        return body, (start_line, end_line)

    def _should_require_review(self, output: ParserOutput) -> bool:
        """Treaties touch international relations and ratification — every
        promotion is reviewed regardless of parser confidence."""
        return True
