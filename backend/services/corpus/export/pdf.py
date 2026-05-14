"""PDF generator — Jinja2-rendered HTML/CSS → WeasyPrint."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# WeasyPrint loads Pango / GObject / Cairo via dlopen at import time. On macOS
# Homebrew installs them under /opt/homebrew/lib (Apple Silicon) or
# /usr/local/lib (Intel), neither of which is on the default loader path. Set
# DYLD_FALLBACK_LIBRARY_PATH BEFORE importing weasyprint so the FFI find
# the libs. On Linux/CI these paths don't exist; setting the var is harmless.
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

from schemas.legal_text import LegalTextRead  # noqa: E402

from . import _common  # noqa: E402

_TEMPLATES_DIR = Path(__file__).parent / "templates"
_CSS_PATH = _TEMPLATES_DIR / "legal_text.css"

_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


def render_pdf(
    text: LegalTextRead,
    *,
    lang: str = "fr",
    base_url: str = "https://lexhaiti.org",
) -> bytes:
    """Render a legal text as a fully-formatted PDF.

    The output has a cover page (brand identity + metadata), structured body
    (headings + articles), and a per-page provenance footer. The permalink in
    the footer points back to the canonical page on lexhaiti.org so a printed
    copy is always verifiable.
    """
    labels = _common.labels_for(lang)
    tree = _common.build_export_tree(text)
    permalink = f"{base_url.rstrip('/')}/lois/{text.slug}"

    template = _env.get_template("legal_text.html")
    html_str = template.render(
        text=text,
        tree=tree,
        labels=labels,
        pick=lambda fr, ht: _common.pick_localized(fr, ht, lang) or "",
        fmt_date=lambda d: _common.fmt_date(d, lang),
        split_alineas=_common.split_alineas,
        is_list_item=_common.is_list_item,
        article_label=lambda a: _common.article_label(a, labels),
        base_url=base_url,
        permalink=permalink,
        generated_at=datetime.now(timezone.utc),
        css_inline=_CSS_PATH.read_text(encoding="utf-8"),
    )

    return HTML(string=html_str, base_url=str(_TEMPLATES_DIR)).write_pdf()
