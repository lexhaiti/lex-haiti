"""Domain rules for the LegalText lifecycle.

The Haitian legal-act taxonomy splits into TWO families:

  Family A — LEGISLATIVE acts that are voted by a parliamentary body
  AND require promulgation by the executive. Constitutions, lois, codes.

  Family B — EXECUTIVE / ADMINISTRATIVE acts that are issued directly by
  an executive or administrative authority. They do not require
  promulgation. Décrets, arrêtés, circulaires, communiqués, avis,
  ordonnances of the executive.

These rules are encoded here once so the parser, the publish validator,
and the editorial UI all enforce the same invariants. Violations are
returned as *warnings*, not errors — Haitian legal history is full of
irregular acts (de-facto governments, transitional periods, etc.).
The editor can publish over warnings with a written justification, but
the system never silently accepts a malformed document.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from schemas.enums import LegalCategory

if TYPE_CHECKING:  # pragma: no cover
    from services.corpus.models import LegalText


REQUIRES_PROMULGATION: frozenset[LegalCategory] = frozenset(
    {
        LegalCategory.constitution,
        LegalCategory.loi,
        LegalCategory.code,
    }
)
"""Legislative categories — these need an adopting body AND a
promulgating authority AND a Promulgation row."""


EXECUTIVE_ADMIN: frozenset[LegalCategory] = frozenset(
    {
        LegalCategory.decret,
        LegalCategory.arrete,
        LegalCategory.circulaire,
        LegalCategory.convention,
        LegalCategory.ordonnance,
        LegalCategory.communique,
        LegalCategory.avis,
        LegalCategory.other_regulatory,
    }
)
"""Executive / administrative categories — issued directly. Must have
no adopting body and no separate promulgation."""


def requires_promulgation(category: LegalCategory) -> bool:
    """Return True if this category requires a separate promulgation
    act (Family A). Used by the publish validator and the parser
    profile selector."""

    return category in REQUIRES_PROMULGATION


def is_executive_or_admin(category: LegalCategory) -> bool:
    """Return True for Family B (no promulgation needed)."""

    return category in EXECUTIVE_ADMIN


@dataclass
class ValidationIssue:
    """One domain-rule violation. ``severity`` is 'error' to block publish,
    'warning' to surface in the editorial UI but still permit publish
    with a written justification."""

    code: str        # machine-readable, e.g. 'missing_adopting_body'
    message_fr: str  # editor-facing French message
    severity: str    # 'warning' | 'error'


def validate_legal_text_for_publish(text: "LegalText") -> list[ValidationIssue]:
    """Run domain rules over a LegalText before transitioning it to
    ``editorial_status=published``. Returns a list of issues — empty
    list means "all clear".

    Currently every issue is a 'warning' — the publish endpoint can
    accept an override flag. Once the corpus is mature, we'll promote
    some warnings to 'error'.
    """
    issues: list[ValidationIssue] = []

    if requires_promulgation(text.category):
        # Family A — legislative
        if text.adopting_body_id is None:
            issues.append(
                ValidationIssue(
                    code="missing_adopting_body",
                    message_fr=(
                        "Ce texte législatif n'a pas d'autorité d'adoption "
                        "rattachée. Indiquez l'autorité (Sénat / Chambre / "
                        "Corps législatif) avant publication."
                    ),
                    severity="warning",
                )
            )
        if text.promulgating_authority_id is None:
            issues.append(
                ValidationIssue(
                    code="missing_promulgating_authority",
                    message_fr=(
                        "Ce texte législatif n'a pas d'autorité de "
                        "promulgation rattachée. Indiquez la Présidence ou "
                        "l'autorité exécutive concernée."
                    ),
                    severity="warning",
                )
            )
        if (
            text.adopting_body_id is not None
            and text.adopting_body_id == text.promulgating_authority_id
        ):
            issues.append(
                ValidationIssue(
                    code="same_adopting_and_promulgating",
                    message_fr=(
                        "L'autorité adoptante et l'autorité de "
                        "promulgation sont identiques — ces deux rôles "
                        "devraient relever d'organes différents."
                    ),
                    severity="warning",
                )
            )
        # Promulgation row is optional during transition; we only check
        # it for legislative texts via the relationship if loaded.
        # The publish service performs the actual lookup.
    else:
        # Family B — executive / administrative
        if text.adopting_body_id is not None:
            issues.append(
                ValidationIssue(
                    code="unexpected_adopting_body",
                    message_fr=(
                        f"Un texte de catégorie « {text.category.value} » "
                        "ne devrait pas avoir d'autorité d'adoption — "
                        "il est émis directement, sans vote parlementaire."
                    ),
                    severity="warning",
                )
            )
        if text.promulgating_authority_id is not None:
            issues.append(
                ValidationIssue(
                    code="unexpected_promulgating_authority",
                    message_fr=(
                        f"Un texte de catégorie « {text.category.value} » "
                        "ne devrait pas avoir d'autorité de promulgation "
                        "distincte de son autorité émettrice."
                    ),
                    severity="warning",
                )
            )

    if text.issuing_authority_id is None and text.legacy_issuing_authority_text is None:
        issues.append(
            ValidationIssue(
                code="missing_issuing_authority",
                message_fr=(
                    "Aucune autorité émettrice rattachée. Tous les textes "
                    "de l'État ont une autorité émettrice (assemblée, "
                    "président, ministre, etc.)."
                ),
                severity="warning",
            )
        )

    return issues


__all__ = [
    "REQUIRES_PROMULGATION",
    "EXECUTIVE_ADMIN",
    "requires_promulgation",
    "is_executive_or_admin",
    "validate_legal_text_for_publish",
    "ValidationIssue",
]
