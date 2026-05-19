"""Post-promotion fixes on the inbox-promoted ``LegalText`` rows.

The promotion pass left two columns short:

  * ``official_title_fr`` was NULL on one row (#177 — first commit
    happened before the column was added to the construct call,
    re-runs of the script set it on the rest).

  * ``description_fr`` is NULL on every one of the 28 inbox-promoted
    drafts (the parser doesn't generate descriptions; the
    promotion script didn't either). The public LawDetail page
    and the editorial list both read this field, so blank rows
    look broken.

Fix:
  - For every Inbox-promoted ``LegalText`` (those whose
    ``moniteur_issue_id`` points at a row with edition_label
    ``Inbox laws-2026`` OR the 3 originally-ingested ones), fill
    ``official_title_fr = title_fr`` when null, and synthesise a
    one-sentence ``description_fr`` from the title + Moniteur ref.

Idempotent.
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select  # noqa: E402

from api.db import SessionLocal  # noqa: E402
from services.corpus.models import LegalText, MoniteurIssue  # noqa: E402


def _format_moniteur_ref(issue: MoniteurIssue | None) -> str | None:
    if issue is None:
        return None
    n = issue.number or ""
    if n.startswith("Inbox-") or not n:
        return None
    if n[:1].isdigit():
        prefix = f"N° {n}"
    else:
        prefix = n
    if issue.publication_date:
        return f"Publié au Moniteur {prefix} du {issue.publication_date.strftime('%d/%m/%Y')}."
    return f"Publié au Moniteur {prefix} ({issue.year})."


def _format_publication_sentence(text: LegalText, issue: MoniteurIssue | None) -> str:
    ref = _format_moniteur_ref(issue)
    if ref:
        return ref
    if text.publication_date:
        return f"Texte publié le {text.publication_date.strftime('%d/%m/%Y')}."
    return ""


def _category_label(cat) -> str:
    return {
        "constitution": "Constitution",
        "code": "Code",
        "loi": "Loi",
        "loi_constitutionnelle": "Loi constitutionnelle",
        "decret": "Décret",
        "arrete": "Arrêté",
        "circulaire": "Circulaire",
        "convention": "Accord / Convention",
        "ordonnance": "Ordonnance",
        "communique": "Communiqué",
        "avis": "Avis",
        "other_regulatory": "Texte réglementaire",
    }.get(getattr(cat, "value", str(cat)), "Texte légal")


def main() -> None:
    fixed_official = 0
    fixed_description = 0
    unchanged = 0

    with SessionLocal() as s:
        # Pull every LegalText whose moniteur_issue.edition_label is the
        # inbox tag OR one of the three pre-existing inbox-ingestions
        # (#174 / #175 / #176).
        rows = s.scalars(
            select(LegalText)
            .join(
                MoniteurIssue, LegalText.moniteur_issue_id == MoniteurIssue.id
            )
            .where(MoniteurIssue.edition_label == "Inbox laws-2026")
        ).all()

        for lt in rows:
            issue = lt.moniteur_issue
            dirty = False
            if not lt.official_title_fr and lt.title_fr:
                lt.official_title_fr = lt.title_fr
                fixed_official += 1
                dirty = True
            if not lt.description_fr:
                cat_label = _category_label(lt.category)
                pub = _format_publication_sentence(lt, issue)
                # The description is a one-liner: ``{Catégorie} relatif à
                # {sujet}. {publication}``. Strip a leading ``Décret du
                # …`` style date prefix so the description doesn't echo
                # the title verbatim.
                title = lt.title_fr or ""
                # Drop a leading ``Décret du <date>`` / ``Loi du <date>``
                # so what remains is the subject of the act.
                import re

                subject = re.sub(
                    r"^(?:Décret(?:-loi)?|Loi(?:\s+constitutionnelle)?|Arrêté(?:\s+Présidentiel)?|Avis|Règlement|Accord|Compilation)s?\s+(?:du\s+\d{1,2}\w*\s+\w+\s+\d{4}\s+)?",
                    "",
                    title,
                    flags=re.IGNORECASE,
                )
                subject = subject.strip().rstrip(".") or title
                # Lowercase first letter for natural reading
                if subject and subject[0].isupper() and len(subject) > 1 and not subject[1].isupper():
                    subject = subject[0].lower() + subject[1:]
                pieces = [f"{cat_label} {subject}."]
                if pub:
                    pieces.append(pub)
                lt.description_fr = " ".join(pieces)
                fixed_description += 1
                dirty = True
            if not dirty:
                unchanged += 1
        s.commit()

    print(
        f"Done. official_title_fr filled={fixed_official}, "
        f"description_fr filled={fixed_description}, "
        f"unchanged={unchanged}"
    )


if __name__ == "__main__":
    main()
