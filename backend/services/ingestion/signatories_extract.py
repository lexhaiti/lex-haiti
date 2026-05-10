"""Extract `LegalSigner` rows from a parsed `official_formula` string.

Once the article splitter has set aside the post-dispositif block, this
module parses out the named individuals signing it — bureau Sénat (3),
bureau Chambre (3), Président, ministres, etc. — and infers their
`signing_capacity` and `chamber` from the surrounding text:

  - Names appearing under "Votée au Sénat" → `chamber=senat`
        - first one in the block → `presiding`
        - subsequent → `attesting`
  - Names appearing under "Votée à la Chambre" → `chamber=chambre`
        - same presiding/attesting split
  - Names appearing in the "Donné au …" / "Fait à …" trailer →
        - on a Loi → `promulgating` (President signs to enforce, didn't author)
        - on a Décret/Arrêté → `authoring` (signer IS the issuing authority)
  - Ministers below a presidential `Donné` block → `countersigning`
  - Coordonnateur of a CPT block → `authoring` (signs as the body)

The regex is permissive — Haitian OCR introduces typos and weird
unicode; the editor reviews the parsed rows in the MetadataEditor UI.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Optional

from packages.schemas.enums import (
    LegalCategory,
    SignatoryChamber,
    SigningCapacity,
)


@dataclass
class ExtractedSignatory:
    """Output shape for one parsed signatory row.

    Mirrors `LegalSignerCreate` so the calling import pipeline can
    create rows directly.
    """

    name: str
    function_fr: str
    function_ht: Optional[str]
    signing_capacity: SigningCapacity
    chamber: Optional[SignatoryChamber]
    signed_at: Optional[date]
    position: int


# Common French / Haitian month names → numeric. Lower-case keys so
# the lookup is case-insensitive.
_MONTHS_FR = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "août": 8, "aout": 8,
    "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12, "decembre": 12,
}

# "le mardi 18 août 2009" / "le 23 janvier 2017" — matches the date
# inside a Votée or Donné formula. Day-of-week is optional.
_DATE_INLINE_RE = re.compile(
    r"""
    le\s+
    (?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*
    (\d{1,2})\s+
    (\w+)\s+                  # month name
    (\d{4})
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Title keywords that anchor titled signatory recognition (chamber
# bureau members, ministers, etc.). Captures `Title Name`. The boundary
# allows `.` INSIDE the name (e.g. "Kély C. BASTIEN") and only stops
# at a real separator: `,` `;` newline, or a recognised role suffix.
_TITLED_SIGNATORY_RE = re.compile(
    r"""
    ^[\s ]*
    (S[ée]nateur|D[ée]put[ée]|Ministre|Pr[ée]sident|Coordonnateur|G[ée]n[ée]ral)
    \s+
    ([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ][\wÀ-ÿ\.\-\s']+?)   # name — `.` allowed inside
    (?:[,;\n]|\s+(?=Pr[ée]sident|Premier|Deuxi[èe]me|Coordonnateur|Ministre))
    """,
    re.MULTILINE | re.VERBOSE,
)

# Untitled signatory used in the promulgation footer (Donné au …):
# "Jocelerme PRIVERT, Président Provisoire de la République".
# The leading name carries no title prefix — we anchor on the trailing
# role keyword instead. ALL-CAPS or Title-Cased given names + UPPER
# family name typical of Haitian official drafting.
_UNTITLED_SIGNATORY_RE = re.compile(
    r"""
    ^[\s ]*
    ([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ][\wÀ-ÿ\.\-\s']{2,80}?)   # name
    \s*[,;]\s*
    (Pr[ée]sident(?:e)?(?:\s+(?:Provisoire|du\s+S[ée]nat|de\s+la\s+R[ée]publique|de\s+la\s+Chambre|du\s+Conseil(?:[^\n]+)?))?
     |Coordonnateur(?:[^\n]+)?
     |Ministre\s+de[^\n]+
     |Premier\s+Ministre)
    """,
    re.MULTILINE | re.VERBOSE,
)


def _parse_inline_date(text: str) -> Optional[date]:
    m = _DATE_INLINE_RE.search(text)
    if not m:
        return None
    day = int(m.group(1))
    month_name = m.group(2).lower().rstrip(",.;")
    year = int(m.group(3))
    month = _MONTHS_FR.get(month_name)
    if month is None:
        return None
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _block_for(formula: str, anchor: str) -> Optional[str]:
    """Slice the section of `formula` that follows the named anchor
    (e.g. "Votée au Sénat") and runs to the next anchor or end-of-text.
    Returns None when the anchor is absent."""
    anchors_re = re.compile(
        r"(Vot[ée]e\s+au\s+S[ée]nat|Vot[ée]e\s+à\s+la\s+Chambre|Donn[ée]\s+(?:au|à)|Fait\s+(?:au|à)|LIBERT[ÉE]\s+[ÉE]GALIT[ÉE])",
        re.IGNORECASE,
    )
    matches = list(anchors_re.finditer(formula))
    for i, m in enumerate(matches):
        if anchor.lower() in m.group(0).lower():
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(formula)
            return formula[start:end]
    return None


def _signers_in_chamber_block(
    block: str,
    *,
    chamber: SignatoryChamber,
    base_position: int,
    signed_at: Optional[date],
) -> list[ExtractedSignatory]:
    """Extract signatory rows from a chamber bureau block (Sénat / Chambre).

    The first row is the bureau président (`presiding`); subsequent rows
    are secrétaires (`attesting`). All carry the chamber.
    """
    out: list[ExtractedSignatory] = []
    for idx, m in enumerate(_TITLED_SIGNATORY_RE.finditer(block)):
        title = m.group(1).strip()
        name = m.group(2).strip().rstrip(",.;")
        # The role suffix sits between the name and the next punctuation.
        rest = block[m.end() : m.end() + 80]
        role_match = re.search(
            r"^\s*(Pr[ée]sident(?:e)?(?:\s+(?:Provisoire|du\s+S[ée]nat|de\s+la\s+R[ée]publique|de\s+la\s+Chambre))?|Premier\s+Secr[ée]taire|Deuxi[èe]me\s+Secr[ée]taire|Coordonnateur(?:\s+du\s+CPT)?|Ministre\s+de[^,;\n]+)",
            rest,
        )
        role = role_match.group(1).strip() if role_match else title

        capacity = (
            SigningCapacity.presiding if idx == 0 else SigningCapacity.attesting
        )

        out.append(
            ExtractedSignatory(
                name=name,
                function_fr=role,
                function_ht=None,
                signing_capacity=capacity,
                chamber=chamber,
                signed_at=signed_at,
                position=base_position + idx,
            )
        )
    return out


def _signers_in_promulgation_block(
    block: str,
    *,
    base_position: int,
    signed_at: Optional[date],
    primary_capacity: SigningCapacity,
) -> list[ExtractedSignatory]:
    """Extract signatory rows from the post-Donné / post-Fait block.

    The first signer carries `primary_capacity` (promulgating for a loi,
    authoring for a décret/arrêté). Subsequent signers are
    countersigners.

    Uses a different regex than chamber blocks because the head-of-
    state line typically lacks a title prefix ("Jocelerme PRIVERT,
    Président Provisoire de la République" — the role is the SUFFIX).
    """
    out: list[ExtractedSignatory] = []
    seen_names: set[str] = set()
    for idx, m in enumerate(_UNTITLED_SIGNATORY_RE.finditer(block)):
        name = m.group(1).strip().rstrip(",.;")
        role = m.group(2).strip()
        # De-dupe — the regex can over-match when the name appears in
        # the formula prose elsewhere.
        if name in seen_names:
            continue
        seen_names.add(name)

        capacity = (
            primary_capacity
            if idx == 0
            else SigningCapacity.countersigning
        )

        out.append(
            ExtractedSignatory(
                name=name,
                function_fr=role,
                function_ht=None,
                signing_capacity=capacity,
                chamber=SignatoryChamber.executive,
                signed_at=signed_at,
                position=base_position + idx,
            )
        )
    return out


def extract_signatories(
    formula: Optional[str],
    *,
    category: LegalCategory,
) -> list[ExtractedSignatory]:
    """Parse `official_formula` text into structured `ExtractedSignatory`.

    Empty / null formula → returns []. The pipeline writes whatever
    rows it gets; the editor adds / corrects via the MetadataEditor.
    """
    if not formula or not formula.strip():
        return []

    out: list[ExtractedSignatory] = []
    cursor = 0

    # ----- Sénat block -------------------------------------------------
    senat_block = _block_for(formula, "Votée au Sénat")
    if senat_block:
        rows = _signers_in_chamber_block(
            senat_block,
            chamber=SignatoryChamber.senat,
            base_position=cursor,
            signed_at=_parse_inline_date(senat_block),
        )
        out.extend(rows)
        cursor += len(rows)

    # ----- Chambre block ----------------------------------------------
    chambre_block = _block_for(formula, "Votée à la Chambre")
    if chambre_block:
        rows = _signers_in_chamber_block(
            chambre_block,
            chamber=SignatoryChamber.chambre,
            base_position=cursor,
            signed_at=_parse_inline_date(chambre_block),
        )
        out.extend(rows)
        cursor += len(rows)

    # ----- Promulgation block (Donné au … / Fait à …) -----------------
    # On a loi: the President signs to *promulgate* (didn't author).
    # On a décret/arrêté: the signer IS the issuing authority → authoring.
    donne_block = (
        _block_for(formula, "Donné au")
        or _block_for(formula, "Donné à")
        or _block_for(formula, "Fait au")
        or _block_for(formula, "Fait à")
    )
    if donne_block:
        primary = (
            SigningCapacity.promulgating
            if category == LegalCategory.loi
            else SigningCapacity.authoring
        )
        rows = _signers_in_promulgation_block(
            donne_block,
            base_position=cursor,
            signed_at=_parse_inline_date(donne_block),
            primary_capacity=primary,
        )
        out.extend(rows)
        cursor += len(rows)

    return out
