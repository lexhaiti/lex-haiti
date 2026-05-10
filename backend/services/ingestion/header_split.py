"""Extract page-1 header metadata: official_number + issuing_authority.

Haitian official acts open with a stereotyped header block. After the
Moniteur masthead and the SOMMAIRE box, every act runs:

    LIBERTÉ ÉGALITÉ FRATERNITÉ
    RÉPUBLIQUE D'HAÏTI
    [issuing authority — institution name, possibly multi-line]
    LOI N°: CL-007-09-09         (or DÉCRET / ARRÊTÉ N°: …)
    [Title]
    Vu …                          (← visas start here)

This module slices off:
  - `official_number` — the prefixed identifier on the "LOI N°" line
  - `issuing_authority` — the line(s) between the devise banner and
    the official-number line

Both are nullable: many older or non-standard documents lack one or
both. Default `issuing_authority` is derived from `category` when the
explicit header is absent (loi → CORPS LÉGISLATIF, etc.).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from packages.schemas.enums import LegalCategory


@dataclass
class HeaderParts:
    """Output of `split_header`.

    `body_without_header` is the document text with the parsed lines
    removed, so the article splitter doesn't trip on the same content
    twice.
    """

    official_number: Optional[str]
    issuing_authority: Optional[str]
    title_line: Optional[str]
    body_without_header: str


# "LOI N°: CL-007-09-09", "DÉCRET N° A-…", "ARRÊTÉ NO …", etc.
# Captures the prefixed number; the prefix letters indicate the act
# type (CL = Corps Législatif, D = Décret, A = Arrêté).
_OFFICIAL_NUMBER_RE = re.compile(
    r"""
    ^[\s ]*
    (?:LOI|DÉCRET|DECRET|ARR[ÊE]T[ÉE]|CIRCULAIRE|CONVENTION)
    \s+N[°o]:?\s*
    ([A-Z]+-\d+(?:[-/]\d+)*)         # group 1 = the identifier
    """,
    re.MULTILINE | re.VERBOSE,
)

# "LIBERTÉ ÉGALITÉ FRATERNITÉ" devise banner — used as the upper bound
# of the issuing-authority window.
_DEVISE_RE = re.compile(
    r"^[\s ]*LIBERT[ÉE]\s+[ÉE]GALIT[ÉE]\s+FRATERNIT[ÉE]\s*$",
    re.MULTILINE,
)

# "RÉPUBLIQUE D'HAÏTI" line that follows the devise — also a common
# anchor for the start of the authority block.
_REPUBLIQUE_RE = re.compile(
    r"^[\s ]*R[ÉE]PUBLIQUE\s+D['']\s*HA[ÏI]TI\s*$",
    re.MULTILINE,
)

# Default authority per category — the canonical organ for each
# Haitian act type. Used when the parser doesn't find an explicit
# authority block (most older documents, or ones with mangled OCR
# at the top).
_DEFAULT_AUTHORITY: dict[LegalCategory, str] = {
    LegalCategory.loi: "CORPS LÉGISLATIF",
    LegalCategory.decret: "LE PRÉSIDENT DE LA RÉPUBLIQUE",
    LegalCategory.arrete: "LE MINISTRE",  # often joint — parser tries to read the explicit lines first
    LegalCategory.circulaire: "LE MINISTRE",
    LegalCategory.constitution: "LE PEUPLE HAÏTIEN",
    # Convention has no canonical default — left to the editor.
    # Code is composite — built from many laws, no single authority.
}


def split_header(
    body: str, *, category: Optional[LegalCategory] = None
) -> HeaderParts:
    """Extract official_number + issuing_authority from the document head.

    Strategy:
      1. Find the official-number line (LOI N°: …) — that anchors the
         end of the authority window.
      2. Find the most recent RÉPUBLIQUE D'HAÏTI line BEFORE the
         official-number line — that anchors the start of the window.
      3. Lines strictly between the two = `issuing_authority`.
      4. If the explicit authority is empty / missing, fall back to the
         category's default.
      5. Drop the matched header lines from the returned body so the
         article splitter doesn't re-process them.

    Robust to missing pieces: any of the three (number, authority,
    title) can come back as None. The parser fills what it finds.
    """
    if not body or not body.strip():
        return HeaderParts(
            official_number=None,
            issuing_authority=_DEFAULT_AUTHORITY.get(category) if category else None,
            title_line=None,
            body_without_header=body,
        )

    number_match = _OFFICIAL_NUMBER_RE.search(body)
    official_number = number_match.group(1).strip() if number_match else None

    issuing_authority: Optional[str] = None
    title_line: Optional[str] = None

    if number_match:
        # Look for the start anchor (RÉPUBLIQUE) BEFORE the number line.
        republique_match = None
        for m in _REPUBLIQUE_RE.finditer(body[: number_match.start()]):
            republique_match = m  # keep walking; want the LAST one
        # Fallback to the devise banner if RÉPUBLIQUE isn't isolated
        # (some docs collapse the two lines into one).
        if republique_match is None:
            for m in _DEVISE_RE.finditer(body[: number_match.start()]):
                republique_match = m

        if republique_match is not None:
            authority_block = body[republique_match.end() : number_match.start()]
            # Clean up: drop blank lines, strip each line, rejoin.
            lines = [
                ln.strip()
                for ln in authority_block.splitlines()
                if ln.strip()
            ]
            if lines:
                issuing_authority = "\n".join(lines)

        # Title line is the first non-blank line AFTER the number,
        # before the visas start. Often "LOI PORTANT MODIFICATION DE …".
        # We capture it for editor convenience but the LegalText.title_fr
        # remains the canonical title source — the editor confirms it.
        post_number = body[number_match.end() :].lstrip("\n")
        for line in post_number.splitlines():
            cleaned = line.strip()
            if not cleaned:
                continue
            if cleaned.startswith("Vu ") or cleaned.startswith("Considérant"):
                break  # entered the visas/considérants
            title_line = cleaned
            break

    # Fallback to category default if no explicit authority was found.
    if issuing_authority is None and category is not None:
        issuing_authority = _DEFAULT_AUTHORITY.get(category)

    # Strip the matched header lines from the body so the downstream
    # article splitter doesn't re-encounter them. We slice at the
    # position right AFTER the title line (or the number line if no
    # title was found).
    body_without_header = body
    if number_match:
        # Find where the title-line ends in the original body (inclusive).
        cut_position = number_match.end()
        if title_line:
            title_pos = body.find(title_line, number_match.end())
            if title_pos >= 0:
                cut_position = title_pos + len(title_line)
        body_without_header = body[cut_position:].lstrip("\n")

    return HeaderParts(
        official_number=official_number,
        issuing_authority=issuing_authority,
        title_line=title_line,
        body_without_header=body_without_header,
    )
