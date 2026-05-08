"""Document export — generate citable PDF and DOCX downloads of legal texts.

Public API:
    render_pdf(text, *, lang, base_url) -> bytes
    render_docx(text, *, lang, base_url) -> bytes

Both produce a cover page (brand identity + metadata), the structured body
(headings + articles), and a per-page provenance footer (canonical URL +
version date) so a printed copy is verifiable and citable.
"""

from .docx import render_docx
from .pdf import render_pdf

__all__ = ["render_pdf", "render_docx"]
