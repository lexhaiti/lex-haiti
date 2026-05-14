"""Article-content AST schema.

The AST is a recursive tree of ``ContentNode`` rows stored as JSONB on
``article_versions.content_ast_fr`` / ``content_ast_ht``. Strict
Pydantic validation runs on every write — drift between parsers /
manual edits / AST flatteners is what causes silent rendering bugs in
legal-text platforms, so we lock the shape here once.

The flattener (``flatten_to_text``) is the canonical way to go from
AST → plain text. ``ArticleVersion.text_fr`` is regenerated from the
AST when it exists.
"""
from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ContentKind(str, Enum):
    paragraph = "paragraph"
    ordered_list = "ordered_list"
    unordered_list = "unordered_list"
    list_item = "list_item"
    quote = "quote"
    table = "table"
    table_row = "table_row"
    table_cell = "table_cell"
    figure = "figure"
    raw_html = "raw_html"


class ListMarkerStyle(str, Enum):
    ordinal_degree = "ordinal_degree"  # 1°, 2°, 3°
    lower_alpha_paren = "lower_alpha_paren"  # a), b), c)
    upper_alpha_paren = "upper_alpha_paren"  # A), B), C)
    upper_roman = "upper_roman"  # I., II., III.
    lower_roman = "lower_roman"  # i., ii., iii.
    arabic_dot = "arabic_dot"  # 1., 2., 3.
    arabic_paren = "arabic_paren"  # 1), 2), 3)
    bullet = "bullet"  # •
    dash = "dash"  # —


class ContentNode(BaseModel):
    """One node in an article's content AST. Recursive via ``children``.

    Validation rules (service-layer):
      - ``kind=paragraph`` MUST have non-empty ``text``, MAY have no
        children.
      - ``kind in (ordered_list, unordered_list)`` MUST have children,
        MAY have ``marker_style``, MUST NOT have ``text``.
      - ``kind=list_item`` MUST have ``text`` OR ``children`` (typically
        both for nested-list items).
      - ``kind=table`` MUST have ``rows`` / ``cols`` set + children of
        kind ``table_row``.
      - ``kind=raw_html`` requires editor approval before publish.
    """

    kind: ContentKind
    text: Optional[str] = None
    children: List["ContentNode"] = Field(default_factory=list)
    # Lists
    marker: Optional[str] = None
    marker_style: Optional[ListMarkerStyle] = None
    # Tables
    rows: Optional[int] = None
    cols: Optional[int] = None
    headers: Optional[List[str]] = None
    # Stable anchor within the article — used by citation graphs that
    # target a specific point inside an article ("Art. 5, point 1°, a)")
    anchor: Optional[str] = None
    # Provenance — same enum as TocNode.source
    source: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


ContentNode.model_rebuild()


class ArticleContentAst(BaseModel):
    """The whole article body as a list of top-level nodes."""

    nodes: List[ContentNode] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


def flatten_to_text(ast: ArticleContentAst, *, indent: str = "") -> str:
    """Deterministically render an AST to plain text.

    The output is what gets written to ``ArticleVersion.text_fr`` / ``_ht``
    for FTS + back-compat surfaces. Idempotent: flattening twice yields
    the same string.

    Rules:
      - Paragraphs are newline-separated.
      - List items render with their marker (or generated marker if
        none was supplied) and indent by 2 spaces per nesting level.
      - Tables render as Markdown-like pipe tables.
      - ``raw_html`` is emitted verbatim (no HTML stripping — the
        editor accepted the risk by using this kind).
    """
    out: list[str] = []
    for node in ast.nodes:
        out.append(_flatten_node(node, indent=indent))
    return "\n\n".join(s for s in out if s).strip()


def _flatten_node(node: ContentNode, *, indent: str) -> str:
    if node.kind == ContentKind.paragraph:
        return f"{indent}{(node.text or '').strip()}"
    if node.kind == ContentKind.quote:
        return "\n".join(f"{indent}> {line}" for line in (node.text or '').splitlines())
    if node.kind in (ContentKind.ordered_list, ContentKind.unordered_list):
        rendered: list[str] = []
        for i, child in enumerate(node.children):
            marker = child.marker or _generated_marker(node.marker_style, i)
            head = f"{indent}{marker} {(child.text or '').strip()}"
            if child.children:
                nested = _flatten_node(
                    ContentNode(kind=node.kind, children=child.children, marker_style=child.marker_style),
                    indent=indent + "  ",
                )
                rendered.append(f"{head}\n{nested}")
            else:
                rendered.append(head)
        return "\n".join(rendered)
    if node.kind == ContentKind.table:
        # Minimal pipe-table renderer
        lines: list[str] = []
        if node.headers:
            lines.append("| " + " | ".join(node.headers) + " |")
            lines.append("|" + "|".join("---" for _ in node.headers) + "|")
        for row in node.children:
            cells = [(c.text or "").strip() for c in row.children]
            lines.append("| " + " | ".join(cells) + " |")
        return "\n".join(indent + ln for ln in lines)
    if node.kind == ContentKind.raw_html:
        return node.text or ""
    if node.kind == ContentKind.figure:
        return f"{indent}[Figure: {(node.text or '').strip()}]"
    # list_item / table_row / table_cell never appear at the top level
    return (node.text or "").strip()


def _generated_marker(style: Optional[ListMarkerStyle], i: int) -> str:
    if style is None or style == ListMarkerStyle.bullet:
        return "•"
    if style == ListMarkerStyle.dash:
        return "—"
    if style == ListMarkerStyle.ordinal_degree:
        return f"{i + 1}°"
    if style == ListMarkerStyle.lower_alpha_paren:
        return f"{chr(ord('a') + i)})"
    if style == ListMarkerStyle.upper_alpha_paren:
        return f"{chr(ord('A') + i)})"
    if style == ListMarkerStyle.upper_roman:
        return f"{_to_roman(i + 1)}."
    if style == ListMarkerStyle.lower_roman:
        return f"{_to_roman(i + 1).lower()}."
    if style == ListMarkerStyle.arabic_dot:
        return f"{i + 1}."
    if style == ListMarkerStyle.arabic_paren:
        return f"{i + 1})"
    return "•"


def _to_roman(n: int) -> str:
    if not 0 < n < 4000:
        return str(n)
    pairs = (
        (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
        (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
        (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
    )
    out = []
    for value, letter in pairs:
        while n >= value:
            out.append(letter)
            n -= value
    return "".join(out)
