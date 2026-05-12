"""Shared base for every legal-text parser profile.

Each profile inherits from ``BaseParser`` and overrides ONLY the parts
that differ from the generic flow. The 80% that is shared lives here:

  - regex patterns (article boundaries, structural headings, signatures)
  - text normalisation
  - article-content AST seeding
  - confidence scoring
  - output assembly into ``ParserOutput``

Profiles override:

  - ``HEADING_PATTERNS`` (different depth — Constitution has Partie;
    arrêtés rarely have anything below Section)
  - ``EXPECTS_PROMULGATION`` (loi/code/constitution = True; rest = False)
  - ``classify_block`` (visa? considérant? enacting? — same regex base,
    different priorities per profile)
  - ``finalize`` (per-profile cleanup, e.g. attach "DISPOSITIONS
    TRANSITOIRES" as annex for Constitutions)

This keeps the inheritance shallow (one level) and the DRY high — each
profile is typically 20–80 lines of code that overrides 2–4 hooks.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import ClassVar, Optional, Pattern

from packages.schemas.enums import (
    BlockKind,
    HeadingLevel,
    LegalCategory,
    ParserProfile,
)
from services.ingestion.article_split import (
    _normalize_number,
    split_into_articles,
)
from services.ingestion.header_split import (
    HeaderParts,
    split_header,
)
from services.ingestion.signatories_extract import (
    extract_signatories,
)

_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Shared types
# ---------------------------------------------------------------------------


@dataclass
class ParserContext:
    """Inputs handed to ``BaseParser.parse``. Cheap to construct."""

    normalized_text: str
    raw_pages: Optional[list[str]] = None  # per-page text if available
    language_hint: str = "fr"
    config: dict = field(default_factory=dict)


@dataclass
class ParsedTocNode:
    """Shape returned by the parser for one TocNode candidate.

    Stays simple — string-based ``block_kind`` and ``level`` so we can
    serialise straight into an ImportDraft JSONB column without dragging
    enum types through the JSON layer.

    ``source_start_line`` / ``source_end_line`` are 1-indexed line numbers
    in the **normalised** input text. Editor UIs use them to jump from a
    TOC entry to its exact location in the OCR transcript, and to
    highlight the source region that produced this node.
    """

    block_kind: str
    level: Optional[str] = None
    key: str = ""
    number: Optional[str] = None
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    body_fr: Optional[str] = None
    body_ht: Optional[str] = None
    position: int = 0
    parent_key: Optional[str] = None
    confidence: float = 1.0
    source_start_line: Optional[int] = None
    source_end_line: Optional[int] = None


@dataclass
class ParsedArticleDraft:
    """One article as a parser candidate. Content stays flat at parse
    time; the rich-text editor or a follow-up pass builds the AST."""

    number: str
    toc_node_key: Optional[str] = None
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    text_fr: Optional[str] = None
    text_ht: Optional[str] = None
    confidence: float = 1.0
    heading_path: list[str] = field(default_factory=list)
    # Line range in the normalised source text. Editors use it to
    # locate the article body inside the OCR transcript when reviewing
    # parsed candidates.
    source_start_line: Optional[int] = None
    source_end_line: Optional[int] = None


@dataclass
class IssuingAuthority:
    """One institution officially issuing a legal text.

    Multiple authorities can co-issue a single text (``conjoint``
    ministerial arrêtés are common in Haiti — Justice + Intérieur +
    Defense …). Each entry here represents one such authority; the
    parent ``ParserOutput.issuing_authorities`` is the full ordered list.

    Distinct from ``ParserOutput.signatures``: an authority is an
    institution, a signature is a person. A single authority may
    contribute multiple signatures (the minister + the secretary-general
    both sign), and a single person may sign on behalf of multiple
    authorities — they're different concepts and tracked separately.
    """

    name: str
    role: Optional[str] = None        # "Ministre de la Justice", "Conseil Municipal", …
    jurisdiction: Optional[str] = None  # "HT", or commune name for local authorities
    confidence: float = 0.8


@dataclass
class ParserOutput:
    """What every profile's ``parse`` returns. Designed to map directly
    onto an ``ImportDraft`` row — every field here corresponds to a
    JSONB column on that table."""

    profile: ParserProfile
    category_guess: Optional[LegalCategory] = None
    title_fr: Optional[str] = None
    title_ht: Optional[str] = None
    metadata: dict = field(default_factory=dict)
    toc: list[ParsedTocNode] = field(default_factory=list)
    articles: list[ParsedArticleDraft] = field(default_factory=list)
    promulgation: Optional[dict] = None
    signatures: list[dict] = field(default_factory=list)
    # Institutions issuing the text (vs. signatures, which are people).
    # A conjoint text has multiple authorities — the list is ordered
    # left-to-right as they appear on the cover.
    issuing_authorities: list[IssuingAuthority] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    parser_confidence: float = 0.0
    # Explicit "this candidate should not auto-promote" flag.
    # Recomputed by ``BaseParser.parse`` after every run using
    # ``_should_require_review`` — profiles can override that hook for
    # category-specific thresholds (Codes & Constitutions always
    # require review, Communiqués only when warnings are present).
    review_required: bool = True

    def to_dict(self) -> dict:
        """JSONB-friendly representation — flattens enums to their string
        values and dataclasses to plain dicts. Use this when persisting
        the output to a JSONB column or sending it over the wire.
        """
        return {
            "profile": self.profile.value,
            "category_guess": (
                self.category_guess.value if self.category_guess else None
            ),
            "title_fr": self.title_fr,
            "title_ht": self.title_ht,
            "metadata": dict(self.metadata),
            "toc": [
                {
                    "block_kind": n.block_kind,
                    "level": n.level,
                    "key": n.key,
                    "number": n.number,
                    "title_fr": n.title_fr,
                    "title_ht": n.title_ht,
                    "body_fr": n.body_fr,
                    "body_ht": n.body_ht,
                    "position": n.position,
                    "parent_key": n.parent_key,
                    "confidence": n.confidence,
                    "source_start_line": n.source_start_line,
                    "source_end_line": n.source_end_line,
                }
                for n in self.toc
            ],
            "articles": [
                {
                    "number": a.number,
                    "toc_node_key": a.toc_node_key,
                    "title_fr": a.title_fr,
                    "title_ht": a.title_ht,
                    "text_fr": a.text_fr,
                    "text_ht": a.text_ht,
                    "confidence": a.confidence,
                    "heading_path": list(a.heading_path),
                    "source_start_line": a.source_start_line,
                    "source_end_line": a.source_end_line,
                }
                for a in self.articles
            ],
            "promulgation": self.promulgation,
            "signatures": list(self.signatures),
            "issuing_authorities": [
                {
                    "name": a.name,
                    "role": a.role,
                    "jurisdiction": a.jurisdiction,
                    "confidence": a.confidence,
                }
                for a in self.issuing_authorities
            ],
            "warnings": list(self.warnings),
            "parser_confidence": self.parser_confidence,
            "review_required": self.review_required,
        }


# ---------------------------------------------------------------------------
# Shared regex — kept in one place
# ---------------------------------------------------------------------------


_HEADING_PATTERNS_DEFAULT: list[tuple[HeadingLevel, Pattern[str]]] = [
    # Most-specific first so a "PARTIE I" doesn't match the "TITRE" pattern.
    (
        HeadingLevel.part,
        re.compile(
            r"^\s*PARTIE\s+([IVXLCDM\d]+)\s*[\.\-—]?\s*(.+)?$",
            re.IGNORECASE | re.MULTILINE,
        ),
    ),
    (
        HeadingLevel.book,
        re.compile(
            r"^\s*LIVRE\s+([IVXLCDM\d]+(?:er|ère|e)?)\s*[\.\-—]?\s*(.+)?$",
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
    (
        HeadingLevel.subsection,
        re.compile(
            r"^\s*SOUS-SECTION\s+([IVXLCDM\d]+(?:re|ère|e)?)\s*[\.\-—]?\s*(.+)?$",
            re.IGNORECASE | re.MULTILINE,
        ),
    ),
]


# Sovereignty + standard formal-block patterns. Each profile may add or
# reorder. The visa/considérant/enacting block detection is line-based
# rather than block-based — easier to debug, easier to override.

SOVEREIGNTY_RE = re.compile(
    r"^\s*Au\s+nom\s+(?:de\s+la\s+R[ée]publique|du\s+Peuple\s+Ha[ïi]tien)\b.*$",
    re.IGNORECASE | re.MULTILINE,
)

VISA_LINE_RE = re.compile(r"^\s*Vu\b\s+.+$", re.MULTILINE)
CONSIDERANT_LINE_RE = re.compile(
    r"^\s*Consid[ée]rant\b\s+.+$",
    re.MULTILINE,
)
ENACTING_RE = re.compile(
    r"^\s*(?:Le\s+Corps\s+l[ée]gislatif\s+a\s+vot[ée]\s+la\s+loi\s+suivante\s*:|"
    r"D[ée]cr[èe]te\s*:|Arr[êe]te\s*:|Promulgue\s+(?:la\s+loi|le\s+pr[ée]sent\s+d[ée]cret)\s+suivant)\s*$",
    re.IGNORECASE | re.MULTILINE,
)

# Explicit "PRÉAMBULE" header on its own line — typical for
# Constitutions and some Codes which carry a labelled preamble block
# rather than the implicit "everything before the enacting formula"
# preamble used by lois. Matched as a standalone line so prose
# references like "le préambule de la Constitution" don't trigger.
PREAMBLE_HEADER_RE = re.compile(
    r"^\s*PR[ÉE]AMBULE\s*$",
    re.IGNORECASE | re.MULTILINE,
)


# ---------------------------------------------------------------------------
# BaseParser
# ---------------------------------------------------------------------------


class BaseParser:
    """Shared parsing behaviour. Override the class attributes /
    ``finalize`` hook in subclasses to specialise."""

    PROFILE: ClassVar[ParserProfile] = ParserProfile.generic
    CATEGORY_GUESS: ClassVar[Optional[LegalCategory]] = None
    EXPECTS_PROMULGATION: ClassVar[bool] = False
    HEADING_PATTERNS: ClassVar[list[tuple[HeadingLevel, Pattern[str]]]] = (
        _HEADING_PATTERNS_DEFAULT
    )

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    def parse(self, ctx: ParserContext) -> ParserOutput:
        """Run the full pipeline. Profiles typically don't override this."""
        text = self._normalize(ctx.normalized_text)
        # Store the normalised text on self temporarily so the line-number
        # helpers below can resolve absolute offsets without threading the
        # full text through every call. Cleared at the end of parse().
        self._current_text = text

        output = ParserOutput(
            profile=self.PROFILE,
            category_guess=self.CATEGORY_GUESS,
        )

        # 1. Page-1 metadata via split_header (header_split.py).
        try:
            header: HeaderParts = split_header(text)
            output.title_fr = header.title_line or None
            output.metadata["official_number"] = header.official_number
            output.metadata["issuing_authority_text"] = header.issuing_authority
            # Issuing-authority as a first-class field — derived from the
            # header's free-text issuer string. Profiles override
            # ``_extract_issuing_authorities`` for richer logic (e.g.
            # conjoint arrêtés where the header lists 3 ministries).
            output.issuing_authorities = self._extract_issuing_authorities(
                text, header
            )
            # Continue parsing from body_without_header so the article
            # splitter doesn't re-encounter the title.
            body_text = header.body_without_header or text
        except Exception:  # noqa: BLE001 — header extraction is best-effort
            body_text = text

        # 2. Formal blocks (preamble / visa / considérant / enacting)
        formal_blocks, body_after_formals = self._extract_formal_blocks(body_text)
        for i, block in enumerate(formal_blocks):
            block.position = i
        output.toc.extend(formal_blocks)

        # 3. Structural TOC
        structural = self._extract_structural_headings(body_after_formals)
        # Position offset = after formal blocks
        for i, node in enumerate(structural, start=len(formal_blocks)):
            node.position = i
        output.toc.extend(structural)

        # 4. Articles
        split = split_into_articles(body_after_formals)
        for art in split.articles:
            # Backfill source-line range from the article body's
            # location in the full normalised text. Best-effort: when
            # the body string isn't unique in the document (rare for
            # real articles), we use the first occurrence.
            start_line, end_line = self._locate_lines(text, art.body)
            output.articles.append(
                ParsedArticleDraft(
                    number=art.number,
                    title_fr=getattr(art, "title", None),
                    # article_split.py uses `body` for the article body
                    text_fr=art.body,
                    toc_node_key=self._nearest_structural_key(
                        art, structural
                    ),
                    confidence=1.0,
                    source_start_line=start_line,
                    source_end_line=end_line,
                )
            )
        if split.official_formula:
            f_start, f_end = self._locate_lines(text, split.official_formula)
            output.toc.append(
                ParsedTocNode(
                    block_kind=BlockKind.closing_formula.value,
                    key="closing-formula",
                    body_fr=split.official_formula,
                    position=len(output.toc),
                    confidence=0.9,
                    source_start_line=f_start,
                    source_end_line=f_end,
                )
            )

        # 5. Signatures — fed from the post-articles official_formula
        #    block when present, falling back to the tail of the document.
        formula_text = split.official_formula or text[-3000:]
        if self.CATEGORY_GUESS is not None and formula_text:
            try:
                sigs = extract_signatories(
                    formula_text, category=self.CATEGORY_GUESS
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
            except Exception as exc:  # noqa: BLE001 — non-fatal
                output.warnings.append(f"signature extraction failed: {exc}")

        # 6. Promulgation (optional, profile-specific)
        if self.EXPECTS_PROMULGATION:
            output.promulgation = self._extract_promulgation(text)

        # 7. Per-profile cleanup
        self.finalize(ctx, output)

        # 8. Confidence + review flag
        output.parser_confidence = self._score_confidence(output)
        output.review_required = self._should_require_review(output)
        self._current_text = ""
        return output

    # ------------------------------------------------------------------
    # Hooks — override in subclasses
    # ------------------------------------------------------------------

    def finalize(
        self, ctx: ParserContext, output: ParserOutput
    ) -> None:  # pragma: no cover - default is a no-op
        """Per-profile fixup. Default: nothing."""
        return None

    # ------------------------------------------------------------------
    # Building blocks (mostly shared)
    # ------------------------------------------------------------------

    def _normalize(self, text: str) -> str:
        """Light text normalisation — collapse whitespace, dehyphenate
        line breaks. Profiles can extend by overriding."""
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # join hyphenated breaks
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def _extract_formal_blocks(
        self, text: str
    ) -> tuple[list[ParsedTocNode], str]:
        """Pull the preamble / visa / considérant / enacting blocks off
        the top of the document. Returns the blocks plus the remainder
        of the text after the enacting formula (where articles begin).
        """
        blocks: list[ParsedTocNode] = []

        # Sovereignty formula — if present, lift it as its own block.
        m = SOVEREIGNTY_RE.search(text)
        if m:
            s_start, s_end = self._locate_lines(text, m.group(0))
            blocks.append(
                ParsedTocNode(
                    block_kind=BlockKind.sovereignty_formula.value,
                    key="sovereignty",
                    body_fr=m.group(0).strip(),
                    confidence=0.95,
                    source_start_line=s_start,
                    source_end_line=s_end,
                )
            )

        # Find enacting formula — everything between sovereignty and
        # this is candidate-formal-block territory.
        enacting = ENACTING_RE.search(text)
        if enacting:
            cutoff = enacting.end()
            head = text[: enacting.start()]
            body = text[cutoff:]
        else:
            cutoff = 0
            head = text[:0]
            body = text

        # Visa lines
        visa_matches = list(VISA_LINE_RE.finditer(head))
        visas = [m.group(0).strip() for m in visa_matches]
        if visas:
            v_start, _ = self._locate_lines(text, visa_matches[0].group(0))
            _, v_end = self._locate_lines(text, visa_matches[-1].group(0))
            blocks.append(
                ParsedTocNode(
                    block_kind=BlockKind.visa.value,
                    key="visas",
                    body_fr="\n".join(visas),
                    confidence=0.85,
                    source_start_line=v_start,
                    source_end_line=v_end,
                )
            )

        # Considérant lines
        cons_matches = list(CONSIDERANT_LINE_RE.finditer(head))
        considerants = [m.group(0).strip() for m in cons_matches]
        if considerants:
            c_start, _ = self._locate_lines(text, cons_matches[0].group(0))
            _, c_end = self._locate_lines(text, cons_matches[-1].group(0))
            blocks.append(
                ParsedTocNode(
                    block_kind=BlockKind.considerant.value,
                    key="considerants",
                    body_fr="\n".join(considerants),
                    confidence=0.85,
                    source_start_line=c_start,
                    source_end_line=c_end,
                )
            )

        # Explicit ``PRÉAMBULE`` header — Constitutions and many Codes
        # carry a labelled preamble block instead of the implicit
        # "everything before the enacting formula" preamble used by lois.
        # When the label is present, extract its body (up to the first
        # structural heading) and DROP that region from `body` so the
        # article splitter doesn't pull the preamble prose back in.
        preamble_explicit = self._extract_labelled_preamble(text)
        if preamble_explicit is not None:
            preamble_text, preamble_end = preamble_explicit
            p_start, p_end = self._locate_lines(text, preamble_text)
            blocks.append(
                ParsedTocNode(
                    block_kind=BlockKind.preamble.value,
                    key="preamble",
                    title_fr="Préambule",
                    body_fr=preamble_text,
                    confidence=0.95,
                    source_start_line=p_start,
                    source_end_line=p_end,
                )
            )
            # When no enacting formula was found, `body` was the whole
            # text; chop the preamble region off the front.
            if not enacting and preamble_end is not None:
                body = text[preamble_end:]

        # Heuristic preamble = everything in `head` that isn't
        # sovereignty / visa / considérant. Only runs when no explicit
        # PRÉAMBULE label was found above, otherwise we'd double-count.
        if head.strip() and preamble_explicit is None:
            stripped = SOVEREIGNTY_RE.sub("", head)
            stripped = VISA_LINE_RE.sub("", stripped)
            stripped = CONSIDERANT_LINE_RE.sub("", stripped).strip()
            if len(stripped) >= 80:
                blocks.append(
                    ParsedTocNode(
                        block_kind=BlockKind.preamble.value,
                        key="preamble",
                        body_fr=stripped,
                        confidence=0.7,
                    )
                )

        if enacting:
            e_start, e_end = self._locate_lines(text, enacting.group(0))
            blocks.append(
                ParsedTocNode(
                    block_kind=BlockKind.enacting_formula.value,
                    key="enacting-formula",
                    body_fr=enacting.group(0).strip(),
                    confidence=0.95,
                    source_start_line=e_start,
                    source_end_line=e_end,
                )
            )

        return blocks, body

    def _extract_labelled_preamble(
        self, text: str
    ) -> Optional[tuple[str, int]]:
        """Find an explicit ``PRÉAMBULE`` header and return
        ``(preamble_body, preamble_end_offset)``, or ``None`` if no
        labelled preamble is present.

        The body runs from just after the label to whichever comes
        first: the next structural heading (PARTIE / LIVRE / TITRE /
        CHAPITRE / SECTION / SOUS-SECTION), the next formal-block
        marker (visa / considérant / enacting / sovereignty), or end
        of text. ``preamble_end_offset`` is the character offset where
        the preamble body ends — the caller uses it to chop the
        preamble region out of the post-formal-blocks body so the
        article splitter doesn't see the preamble prose.
        """
        marker = PREAMBLE_HEADER_RE.search(text)
        if not marker:
            return None
        body_start = marker.end()

        end_candidates: list[int] = [len(text)]
        for _level, pat in self.HEADING_PATTERNS:
            m = pat.search(text, body_start)
            if m:
                end_candidates.append(m.start())
        for marker_re in (
            SOVEREIGNTY_RE,
            VISA_LINE_RE,
            CONSIDERANT_LINE_RE,
            ENACTING_RE,
        ):
            m = marker_re.search(text, body_start)
            if m:
                end_candidates.append(m.start())
        body_end = min(end_candidates)
        preamble_body = text[body_start:body_end].strip()
        if not preamble_body:
            return None
        return preamble_body, body_end

    def _extract_structural_headings(self, text: str) -> list[ParsedTocNode]:
        """Walk the text for structural headings using ``HEADING_PATTERNS``.
        Builds parent/child relationships by remembering the most recent
        header at each depth.
        """
        nodes: list[ParsedTocNode] = []
        most_recent: dict[HeadingLevel, str] = {}
        levels_in_order = [lvl for lvl, _ in self.HEADING_PATTERNS]
        depth_index = {lvl: i for i, lvl in enumerate(levels_in_order)}

        # Walk in source order — interleave matches from all patterns.
        # Use a single pass collecting (start, level, match) and sort.
        events: list[tuple[int, HeadingLevel, re.Match[str]]] = []
        for level, pat in self.HEADING_PATTERNS:
            for m in pat.finditer(text):
                events.append((m.start(), level, m))
        events.sort(key=lambda e: e[0])

        for _, level, m in events:
            number = m.group(1) or ""
            title = (m.group(2) or "").strip() if m.lastindex and m.lastindex >= 2 else ""
            key = self._make_structural_key(level, number)
            # Find parent: the most recent heading shallower than this one
            parent_key: Optional[str] = None
            this_depth = depth_index[level]
            for shallower in levels_in_order[:this_depth]:
                if shallower in most_recent:
                    parent_key = most_recent[shallower]
            most_recent[level] = key
            # Clear deeper levels — they no longer apply under a new
            # heading at this depth
            for deeper in levels_in_order[this_depth + 1 :]:
                most_recent.pop(deeper, None)

            # Source-line is the line where the heading match starts.
            # `text` here is `body_after_formals`, so resolve against
            # the full normalised text for an absolute line number.
            start_line, end_line = self._locate_lines(
                self._current_text, m.group(0)
            )

            nodes.append(
                ParsedTocNode(
                    block_kind=BlockKind.structural.value,
                    level=level.value,
                    key=key,
                    number=number,
                    title_fr=title or None,
                    parent_key=parent_key,
                    confidence=0.92,
                    source_start_line=start_line,
                    source_end_line=end_line,
                )
            )
        return nodes

    @staticmethod
    def _make_structural_key(level: HeadingLevel, number: str) -> str:
        normalized = re.sub(r"[^A-Za-z0-9]+", "-", number.strip().lower())
        return f"{level.value}-{normalized}" if normalized else level.value

    def _nearest_structural_key(
        self, article, structural: list[ParsedTocNode]
    ) -> Optional[str]:
        """Find the deepest structural TOC node whose text the article
        sits under. Uses character offsets when available, falls back
        to "last seen" structural key."""
        if not structural:
            return None
        # The current article_split doesn't expose offsets cleanly, so
        # we fall back to the last-seen heading. Profiles that need
        # offset-accurate parent assignment can override this hook.
        return structural[-1].key

    def _extract_promulgation(self, text: str) -> Optional[dict]:
        """Default promulgation extractor — look for a "Le Président de
        la République ordonne..." block. Profiles override for
        non-standard promulgation formulae."""
        # Find the standard promulgation formula
        m = re.search(
            r"(Le\s+Pr[ée]sident\s+(?:de\s+la\s+R[ée]publique|provisoire\s+de\s+la\s+R[ée]publique)\s+ordonne\s+que\s+la\s+loi\s+ci[\-\s]dessus\s+soit[^.]*\.?)",
            text,
            re.IGNORECASE,
        )
        if not m:
            return None
        return {
            "promulgation_formula_fr": m.group(1).strip(),
            "sovereignty_formula": None,
            "promulgation_date": None,
            "location": None,
            "signers": [],
        }

    def _score_confidence(self, output: ParserOutput) -> float:
        """Aggregate parser confidence — coarse but useful. Profiles
        can override for category-specific weightings."""
        score = 0.0
        weight_sum = 0.0
        if output.title_fr:
            score += 0.95
            weight_sum += 1
        if output.toc:
            score += min(1.0, len(output.toc) / 10) * 0.9
            weight_sum += 1
        if output.articles:
            score += min(1.0, len(output.articles) / 10) * 0.9
            weight_sum += 1
        if output.metadata.get("official_number"):
            score += 0.85
            weight_sum += 1
        if output.signatures:
            score += 0.7
            weight_sum += 1
        if weight_sum == 0:
            return 0.0
        return round(score / weight_sum, 2)

    # ------------------------------------------------------------------
    # New hooks (Phase A)
    # ------------------------------------------------------------------

    def _locate_lines(
        self, full_text: str, fragment: str
    ) -> tuple[Optional[int], Optional[int]]:
        """Best-effort line-range for ``fragment`` inside ``full_text``.

        Returns ``(start_line, end_line)`` as 1-indexed line numbers, or
        ``(None, None)`` if the fragment can't be located cleanly. Used
        for ``source_start_line`` / ``source_end_line`` so the editor
        UI can highlight the matched region in the OCR transcript.

        Heuristic: searches for the first 60 characters of ``fragment``
        in ``full_text``. Real article bodies and heading lines are
        unique enough at 60 chars that this works in practice; on
        ambiguous matches we return the first occurrence.
        """
        if not full_text or not fragment:
            return None, None
        needle = fragment.strip()
        if not needle:
            return None, None
        # Cap the search needle — long needles produce nothing when the
        # fragment was normalised differently than the source.
        probe = needle[:60]
        idx = full_text.find(probe)
        if idx < 0:
            return None, None
        start_line = full_text.count("\n", 0, idx) + 1
        # End line = line of the last char in the actual fragment region.
        end_idx = min(idx + len(needle), len(full_text)) - 1
        end_line = full_text.count("\n", 0, end_idx) + 1
        return start_line, end_line

    def _extract_issuing_authorities(
        self, text: str, header
    ) -> list[IssuingAuthority]:
        """Default issuing-authority extraction — single authority from
        the header's free-text issuer string.

        Profiles override for conjoint documents (ministerial arrêtés
        with 2+ co-issuing ministries) or for non-header issuer
        patterns. ``header`` is the ``HeaderParts`` returned by
        ``split_header`` — never ``None`` in this code path because we
        only call this when split_header succeeded.
        """
        raw = getattr(header, "issuing_authority", None)
        if not raw or not str(raw).strip():
            return []
        return [
            IssuingAuthority(
                name=str(raw).strip(),
                jurisdiction="HT",
                confidence=0.7,
            )
        ]

    def _should_require_review(self, output: ParserOutput) -> bool:
        """Profile-specific rule for whether a parsed candidate must be
        reviewed by a human before promotion to a LegalText.

        Default: require review when confidence < 0.6 or any warnings
        were produced. Profiles override to be stricter (Constitutions
        and Codes always require review regardless of confidence) or
        more permissive (Communiqués only require review on warnings).
        """
        if output.parser_confidence < 0.6:
            return True
        if output.warnings:
            return True
        return False


__all__ = [
    "BaseParser",
    "IssuingAuthority",
    "ParserContext",
    "ParserOutput",
    "ParsedTocNode",
    "ParsedArticleDraft",
]
