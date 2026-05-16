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

from schemas.enums import (
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


# Modern inline signature format used in 2020-era arrêtés and CPT
# acts: ``Le Président Jovenel MOÏSE — Le Premier Ministre Joseph
# JOUTHE — Le Ministre de la Planification … Joseph JOUTHE — …``.
# Single regex won't split the role from the name reliably when the
# role contains "Ministre de la Planification et de la Coopération
# Externe" — every word in "Coopération Externe" is also Capitalised.
# Strategy: split the block on em-dash / semicolon / newline into
# chunks, then in each chunk match the trailing
# ``Firstname[ Middle…] LASTNAME`` pattern from the end. Everything
# before is the role.

# A name candidate: 1-2 Title-Cased given names + a final UPPER-CASE
# surname (optionally hyphenated, accented). Anchored at end of chunk.
# Stopped at 2 firstnames intentionally: 3+ would over-eat into the
# role for ministerial titles like ``Le Ministre de la Planification
# et de la Coopération Externe Joseph JOUTHE`` (where "Coopération
# Externe" Title-Case-matches the firstname slot). The trade-off:
# we miss the rare 3-firstname name; the editor adds them via the
# SignersEditor afterward. Single given-name "X. Y. NAME" initials
# are allowed via the ``\.?`` inside the firstname pattern.
_INLINE_NAME_RE = re.compile(
    r"""
    (?:^|[\s\-—])
    (
      (?:[A-ZÀ-Ÿ][a-zà-ÿ\-']+\.?\s+){1,2}
      [A-ZÀ-Ÿ]{2,}[A-ZÀ-ŸA-Z\-']*
      (?:[\s\-][A-ZÀ-Ÿ]{2,}[A-ZÀ-ŸA-Z\-']*)*
    )
    \s*$
    """,
    re.VERBOSE,
)
_INLINE_ROLE_PREFIX_RE = re.compile(
    r"""
    ^\s*
    (?:Par(?:\s+Le\s+Conseil\s+Pr[ée]sidentiel\s+de\s+Transition)?\s*:?\s*)?
    (
      (?:Le|La)\s+(?:Pr[ée]sident(?:e)?(?:[\s\-]Pr[ée]sident(?:e)?)?
                    |Conseiller(?:[\s\-]Pr[ée]sident)?(?:e)?
                    |Conseill[èe]re(?:[\s\-]Pr[ée]sidente)?
                    |Premier\s+Ministre
                    |Conseiller\s+Sp[ée]cial(?:e)?
                    |Ministre)
      [^,;]*?
    )
    \s+$
    """,
    re.VERBOSE | re.IGNORECASE,
)


# Tail words of French ministerial role titles that ``_INLINE_NAME_RE``
# can pick up as if they were first names (``Le Ministre de la
# Planification et de la Coopération Externe Joseph JOUTHE`` →
# regex sees "Externe Joseph JOUTHE"). Stripped from the start of the
# captured name and prepended back onto the role.
_ROLE_TAIL_STOPLIST: frozenset[str] = frozenset({
    # Role keywords — the name regex's firstname slot allows
    # Title-Cased tokens, which over-captures the role lemma itself.
    "Président", "President", "Présidente", "Presidente",
    "Ministre", "Premier",
    "Conseiller", "Conseillère", "Conseillere",
    "Coordonnateur", "Coordonnatrice",
    "Secrétaire", "Secretaire", "Vice", "Adjoint",
    "Femme",  # caught as "Femme Pédrica SAINT-JEAN" — tail of "des Droits de la Femme"
    # Ministry-tail nouns / qualifiers.
    "Externe", "Coopération", "Coopèration",
    "Cultes", "Étrangères", "Etrangeres",
    "Publique", "Publics", "Publiques",
    "Industrie", "Industrie,", "Commerce",
    "Défense", "Defense",
    "Finances", "Économie", "Economie",
    "Tourisme",
    "Environnement",
    "Justice", "Sécurité", "Securite",
    "Travail", "Travaux", "Transports", "Communications",
    "Sociales", "Civique", "Culture", "Communication",
    "Intérieur", "Interieur", "Collectivités", "Collectivites",
    "Territoriales",
    "Agriculture", "Naturelles", "Développement", "Developpement",
    "Rural",
    "Santé", "Sante", "Population",
    "Condition", "Féminine", "Feminine", "Droits",
    "Éducation", "Education", "Nationale", "Formation", "Professionnelle",
    "Haïtiens", "Haitiens", "Étranger", "Etranger",
    "Femmes", "Jeunesse", "Sports",
    "Affaires",
    "Ressources",
    "Action",
    "Planification",
})


def _strip_role_tail_from_name(role: str, name: str) -> tuple[str, str]:
    """If the captured ``name`` starts with a French ministerial tail
    word (``Externe Joseph JOUTHE``), peel that prefix off and move it
    back onto the role. Walks token-by-token from the left."""
    tokens = name.split()
    moved: list[str] = []
    while tokens and tokens[0] in _ROLE_TAIL_STOPLIST:
        moved.append(tokens.pop(0))
    if not moved:
        return role, name
    return f"{role} {' '.join(moved)}".strip(), " ".join(tokens)


def _signers_inline(block: str, signed_at: Optional[date], base_position: int,
                    primary_capacity: SigningCapacity) -> list[ExtractedSignatory]:
    """Extract signers from the modern inline format.

    Splits the block on em-dash / semicolon / newline separators, then
    for each chunk matches the trailing ``…Role Firstname LASTNAME``
    pattern by anchoring the name regex at the end of the chunk.
    Names are deduped; the first valid match carries
    ``primary_capacity``, rest are countersigners. A stoplist of
    French ministry-tail words (``Externe``, ``Cultes``, …) is moved
    back into the role when the regex over-eats them as firstnames.
    """
    out: list[ExtractedSignatory] = []
    seen: set[str] = set()
    # Split on em-dash, en-dash, semicolon, double-newline.
    chunks = re.split(r"\s*[—–;]\s*|\n{2,}", block)
    for raw in chunks:
        chunk = raw.strip().rstrip(".,")
        # Skip the "Donné au … le DATE" prologue.
        if chunk.lower().startswith(("donné", "fait")):
            continue
        # Drop the "Par :" preamble that sometimes opens the first chunk.
        chunk = re.sub(r"^\s*Par\s*:?\s*", "", chunk)
        m = _INLINE_NAME_RE.search(chunk)
        if not m:
            continue
        name = m.group(1).strip().rstrip(",.;")
        before = chunk[: m.start(1)].rstrip()
        # Stoplist FIRST: the name regex eats role lemmas like
        # ``Président`` / ``Ministre`` into the firstname slot, which
        # blocks the role-prefix match below. Peel them off the name
        # and put them back on the role-pre stub before validating.
        peeled, name = _strip_role_tail_from_name("", name)
        role_pre = (before + (" " + peeled if peeled else "")).strip()
        role_match = _INLINE_ROLE_PREFIX_RE.match(role_pre + " ")
        if not role_match:
            continue
        role = role_match.group(1).strip().rstrip(",.;")
        if not name:
            continue
        if name in seen:
            continue
        seen.add(name)
        capacity = (
            primary_capacity
            if not out
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
                position=base_position + len(out),
            )
        )
    return out


# ----- Constituante (Constitution) signatory patterns ----------------------

# "Signataires" header that introduces the Constituante membership list.
# Used as the anchor — anything above is the "Donné au Palais Législatif…"
# preamble (where the date lives), anything below is the membership block.
_CONSTITUANTE_HEADER_RE = re.compile(
    r"^\s*Signataires\s*:?\s*$",
    re.IGNORECASE | re.MULTILINE,
)

# Group labels inside the Constituante block — each introduces a list of
# names where every member shares the same role.
_CONSTITUANTE_GROUP_RE = re.compile(
    r"^\s*(?:Les\s+)?(Pr[ée]sident|Vice[-\s]?Pr[ée]sident|Secr[ée]taires?|Membres?|Constituant[se]?)\s*[:\-]?\s*$",
    re.IGNORECASE | re.MULTILINE,
)

# One signatory line — "Me. Emile JOASSAINT fils" / "Dr. Louis Roy" /
# "Mme Bathilde Barbancourt" / "M. Jacques Saint-Louis". Title prefix
# (Me. / M. / Mme / Dr.) is optional. The name proper is greedy up to
# the end-of-line so multi-part surnames (« Saint-Louis », « Pierre-
# Louis ») survive. Rejects lines that look like role labels (caught
# by the group regex above) by requiring the line to NOT start with
# one of the group keywords.
_CONSTITUANTE_NAME_LINE_RE = re.compile(
    r"""
    ^\s*
    (?!(?:Les\s+)?(?:Pr[ée]sident|Vice|Secr[ée]taire|Membre|Constituant)\b)
    (?:(Me\.|M\.|Mme\.?|Mlle\.?|Dr\.?|Pr\.?|Pasteur)\s+)?     # honorific (optional)
    ([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ][\wÀ-ÿ\.\-\s']{2,80}?)              # name
    \s*$
    """,
    re.MULTILINE | re.VERBOSE,
)

# Role suffix sometimes carried on a following line — "Role: Président
# de l'Assemblée Constituante". When present, attach to the preceding
# name and skip the implicit group-role fallback.
_CONSTITUANTE_ROLE_INLINE_RE = re.compile(
    r"^\s*Role\s*:\s*(.+?)\s*$",
    re.IGNORECASE | re.MULTILINE,
)

# Stop tokens — when we hit one of these inside the block, the
# membership list has ended and downstream content (sovereignty
# formula, separator, devise, ...) follows. Without this the extractor
# would happily slurp the AU NOM DE LA REPUBLIQUE flag as a "member".
_CONSTITUANTE_STOP_RE = re.compile(
    r"^\s*(?:AU\s+NOM\s+DE\s+LA\s+REPUBLIQUE|RÉPUBLIQUE\s+D|LIBERT[ÉE]\s+|"
    r"DEVISE|FAIT\s+|DONN[ÉE]\s+)",
    re.IGNORECASE | re.MULTILINE,
)


def _extract_constituante_signers(
    formula: str, base_position: int
) -> list[ExtractedSignatory]:
    """Parse the Constituante membership block following "Signataires:".

    Walks line by line, tracking a "current group" role (Président /
    Vice-Président / Secrétaires / Membres / Constituants). Each name
    line under a group inherits that role unless a following "Role:"
    line overrides it. The implicit fallback role is "Membre de
    l'Assemblée Constituante" so names without an explicit group still
    land with a meaningful function_fr.

    Returns ExtractedSignatory rows with:
      - ``chamber = None`` (the Constituante is neither Sénat nor
        Chambre — it's a sui-generis body, so leave chamber blank)
      - ``signing_capacity = SigningCapacity.authoring`` (Constituantes
        author the Constitution they sign; they don't promulgate it)
    """
    header = _CONSTITUANTE_HEADER_RE.search(formula)
    if not header:
        return []

    # Cap the membership block at the next clear "stop" marker so we
    # don't ingest the sovereignty formula or trailing devise lines.
    body_start = header.end()
    stop = _CONSTITUANTE_STOP_RE.search(formula, body_start)
    body_end = stop.start() if stop else len(formula)
    block = formula[body_start:body_end]
    if not block.strip():
        return []

    out: list[ExtractedSignatory] = []
    current_group = "Membre"  # implicit default
    pos = base_position
    seen_names: set[str] = set()

    for raw_line in block.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        # Group label switches the current role for subsequent names.
        grp = _CONSTITUANTE_GROUP_RE.match(line)
        if grp:
            current_group = grp.group(1).strip().rstrip("s")  # singular form
            continue

        # Inline "Role: …" attaches to the previous emitted signatory.
        role_inline = _CONSTITUANTE_ROLE_INLINE_RE.match(line)
        if role_inline and out:
            out[-1] = ExtractedSignatory(
                name=out[-1].name,
                function_fr=role_inline.group(1).strip(),
                function_ht=out[-1].function_ht,
                signing_capacity=out[-1].signing_capacity,
                chamber=out[-1].chamber,
                signed_at=out[-1].signed_at,
                position=out[-1].position,
            )
            continue

        # Name line — strip honorific, capture surname, normalise.
        name_match = _CONSTITUANTE_NAME_LINE_RE.match(line)
        if not name_match:
            continue
        honorific = (name_match.group(1) or "").strip()
        name_proper = name_match.group(2).strip()
        full_name = f"{honorific} {name_proper}".strip() if honorific else name_proper
        # Dedupe: an OCR'd Constituante block sometimes lists the same
        # name twice across page breaks. Cheap key on the upper-cased
        # form so case + honorific drift don't fool the check.
        dedupe_key = re.sub(r"\s+", " ", full_name.upper())
        if dedupe_key in seen_names:
            continue
        seen_names.add(dedupe_key)

        function = _CONSTITUANTE_GROUP_FUNCTION.get(
            current_group.lower(),
            "Membre de l'Assemblée Constituante",
        )
        out.append(
            ExtractedSignatory(
                name=full_name,
                function_fr=function,
                function_ht=None,
                signing_capacity=SigningCapacity.authoring,
                chamber=None,
                signed_at=None,
                position=pos,
            )
        )
        pos += 1

    return out


# Map raw group label → canonical function_fr label. Lower-cased keys,
# singular form (the regex strips trailing 's').
_CONSTITUANTE_GROUP_FUNCTION: dict[str, str] = {
    "président": "Président de l'Assemblée Constituante",
    "president": "Président de l'Assemblée Constituante",
    "vice-président": "Vice-Président de l'Assemblée Constituante",
    "vice président": "Vice-Président de l'Assemblée Constituante",
    "vice-president": "Vice-Président de l'Assemblée Constituante",
    "secrétaire": "Secrétaire de l'Assemblée Constituante",
    "secretaire": "Secrétaire de l'Assemblée Constituante",
    "membre": "Membre de l'Assemblée Constituante",
    "constituant": "Membre de l'Assemblée Constituante",
}


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

    # ----- Constituante (Constitutions) -------------------------------
    # When the closing block carries the "Signataires:" header used by
    # Haitian Constituantes (1987, 1843, …), parse the named-member
    # list directly. Skips the Sénat / Chambre / Donné patterns that
    # don't apply to a Constituent Assembly.
    if category == LegalCategory.constitution:
        constituante_rows = _extract_constituante_signers(
            formula, base_position=cursor
        )
        if constituante_rows:
            out.extend(constituante_rows)
            return out  # Constitutions never carry Sénat / Chambre / Donné

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
        if not rows:
            # Fallback for the modern inline format used in 2020-era
            # arrêtés and CPT acts: ``Le Président NAME — Le Premier
            # Ministre NAME — Le Ministre de … NAME — …``.
            # The line-anchored _UNTITLED_SIGNATORY_RE expects
            # ``NAME, Role`` per line and finds zero rows on these.
            rows = _signers_inline(
                donne_block,
                signed_at=_parse_inline_date(donne_block),
                base_position=cursor,
                primary_capacity=primary,
            )
        out.extend(rows)
        cursor += len(rows)

    return out
