"""LexHaïti-branded Moniteur PDF — Jinja2 + WeasyPrint."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

# Same dlopen workaround as services/corpus/export/pdf.py — WeasyPrint
# loads Pango / Cairo via dlopen at import time and Homebrew installs
# them off the default loader path on macOS. Set the var BEFORE the
# weasyprint import so the FFI find the libs. Harmless on Linux/CI.
if sys.platform == "darwin":
    _existing = os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
    _candidates = ["/opt/homebrew/lib", "/usr/local/lib"]
    _additions = [p for p in _candidates if p not in _existing]
    if _additions:
        os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = ":".join(
            [*_additions, _existing] if _existing else _additions
        )

from jinja2 import Environment, FileSystemLoader, select_autoescape  # noqa: E402
from weasyprint import HTML  # noqa: E402

from services.corpus.models import MoniteurEntry, MoniteurIssue  # noqa: E402

_TEMPLATES_DIR = Path(__file__).parent / "templates"
_CSS_PATH = _TEMPLATES_DIR / "moniteur_issue.css"

_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


_CATEGORY_LABEL = {
    "constitution": "Constitution",
    "code": "Code",
    "loi": "Loi",
    "decret": "Décret",
    "arrete": "Arrêté",
    "circulaire": "Circulaire",
    "convention": "Convention",
    "ordonnance": "Ordonnance",
    "communique": "Communiqué",
    "promulgation": "Promulgation",
    "errata": "Errata",
    "autre": "Document",
}

_MONTHS_FR = [
    "",
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]


def _format_long_date_fr(d) -> str:
    if not d:
        return ""
    return f"{d.day} {_MONTHS_FR[d.month]} {d.year}"


def _smart_issue_number(raw: str) -> str:
    if not raw:
        return ""
    return f"N° {raw}" if raw[0].isdigit() else raw


def _moniteur_annee(year: int) -> int:
    """Le Moniteur was founded in 1845 — first published année was 1846.
    Mirrors the helper in web/src/app/moniteur/[id]/page.tsx."""
    return max(1, year - 1845)


def _entry_label(entry: MoniteurEntry) -> str:
    cat = (entry.detected_category.value if entry.detected_category else None) or "autre"
    return _CATEGORY_LABEL.get(cat, "Document")


def _ordered_entries(issue: MoniteurIssue) -> list[MoniteurEntry]:
    """All entries (top-level + companion children) in print order.

    Companion documents — promulgation letters, correspondances,
    communiqués, errata, autres — appear on their own pages in the
    printed Moniteur, so a faithful export has to list them too.
    They used to be skipped here; now the export includes them
    alongside the law they accompany, ordered by where they actually
    sit in the original issue.

    Sort key is ``(page_from, position, id)`` so entries follow the
    printed-Moniteur reading order. Rows missing a page hint trail
    at the end (sentinel ``10**9``), sorted by their saved position
    so the editor's intended order still shows up when no page is
    known. The on-screen detail page uses the same key — what you
    see in the browser is what lands in the PDF."""
    return sorted(
        issue.entries,
        key=lambda e: (
            e.page_from if e.page_from is not None else 10**9,
            e.position,
            e.id,
        ),
    )


def render_issue_pdf(
    issue: MoniteurIssue,
    *,
    base_url: str = "https://lexhaiti.org",
) -> bytes:
    """Render a Moniteur issue as a branded PDF.

    Cover page → Sommaire → one section per top-level entry. Footer on
    body pages carries the lexhaiti.org permalink so a printed copy is
    always traceable back to its source.
    """
    entries = _ordered_entries(issue)
    permalink = f"{base_url.rstrip('/')}/moniteur/{issue.id}"

    template = _env.get_template("moniteur_issue.html")
    html_str = template.render(
        issue=issue,
        entries=entries,
        number_display=_smart_issue_number(issue.number),
        annee=_moniteur_annee(issue.year),
        publication_date=_format_long_date_fr(issue.publication_date),
        entry_label=_entry_label,
        base_url=base_url,
        permalink=permalink,
        generated_at=datetime.now(timezone.utc),
        css_inline=_CSS_PATH.read_text(encoding="utf-8"),
    )

    return HTML(string=html_str, base_url=str(_TEMPLATES_DIR)).write_pdf()
