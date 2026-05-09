"""Moniteur PDF export — renders a LexHaïti-branded version of a
*Le Moniteur* issue (cover + sommaire + per-entry content) so visitors
can download a clean, citable copy instead of the original scan.

Mirrors `services.corpus.export` in shape: Jinja2 HTML + CSS through
WeasyPrint. The two modules don't share templates; the Moniteur layout
is masthead-driven (newspaper feel) while the law-detail layout is
metadata-grid-driven (legal document feel).
"""

from .pdf import render_issue_pdf

__all__ = ["render_issue_pdf"]
