"""Generic OCR pipeline — PDF to text extraction.

Supports three tiers:
  1. Embedded text layer (free, fast, 100% accurate for digital PDFs)
  2. Tesseract OCR (baseline — runs on scanned pages)
  3. Premium OCR fallback (Mistral / Google Document AI — Phase 1+)

This module is document-type agnostic: it knows about PDF pages, not
about Moniteur issues or law structures.
"""
from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import List, Optional

_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# DPI for PDF-to-image rasterization. 300 is the canonical OCR sweet spot.
OCR_DPI = 300

# Tesseract language stack — French primary, Kreyòl + English fallback.
OCR_LANG = "fra+hat+eng"

# Parallel-OCR worker count. Each worker holds ~50-100 MB for Tesseract
# state. Capped to leave headroom for the rest of the system.
OCR_WORKER_COUNT = max(
    1,
    min(
        int(os.environ.get("LEX_OCR_WORKERS", "0") or 0)
        or max(2, (os.cpu_count() or 4) - 2),
        8,
    ),
)

# Below this threshold (chars per page) we treat the page as scanned-only
# and fall through to OCR.
TEXT_LAYER_MIN_CHARS_PER_PAGE = 80


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


class OCRUnavailable(RuntimeError):
    """Raised when pytesseract / pdf2image / poppler / tesseract aren't
    importable or callable."""


def extract_text_from_pdf(
    pdf_path: str, *, max_pages: Optional[int] = None
) -> List[str]:
    """Return one OCR'd text block per page of the given PDF.

    ``max_pages`` caps how many pages are processed — useful when only the
    cover pages are needed (metadata extraction).

    Falls back to a deterministic stub when OCR dependencies are missing
    (CI / unit tests without Tesseract).
    """
    try:
        return _extract_text_real(pdf_path, max_pages=max_pages)
    except OCRUnavailable as e:
        _log.warning("OCR unavailable, falling back to stub: %s", e)
        return _extract_text_stub(pdf_path)


# ---------------------------------------------------------------------------
# Implementation
# ---------------------------------------------------------------------------


def _extract_text_real(
    pdf_path: str, *, max_pages: Optional[int] = None
) -> List[str]:
    """Strategy: try the embedded text layer first, fall through to
    Tesseract OCR for pages that look scanned. OCR is parallelized
    across ``OCR_WORKER_COUNT`` processes."""
    if not Path(pdf_path).exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    text_layer = _try_text_layer(pdf_path, max_pages=max_pages)
    needs_ocr = [
        i
        for i, t in enumerate(text_layer)
        if len(t) < TEXT_LAYER_MIN_CHARS_PER_PAGE
    ]

    if not needs_ocr:
        _log.info("PDF text-layered, skipped OCR for all %d pages", len(text_layer))
        return [_clean_ocr_text(t) for t in text_layer]

    try:
        import pytesseract  # noqa: F401, PLC0415
        from pdf2image import pdfinfo_from_path  # noqa: PLC0415
    except ImportError as e:
        raise OCRUnavailable(f"OCR libs not installed: {e}") from e

    try:
        info = pdfinfo_from_path(pdf_path)
        total_pages = int(info.get("Pages", len(text_layer))) if info else len(text_layer)
    except Exception:
        total_pages = len(text_layer)
    if max_pages is not None:
        total_pages = min(total_pages, max_pages)

    keep_text_layer: dict[int, str] = {
        i: text_layer[i]
        for i in range(min(len(text_layer), total_pages))
        if i not in set(needs_ocr)
    }

    use_pool = OCR_WORKER_COUNT > 1 and len(needs_ocr) > 1
    ocr_results: dict[int, str] = {}

    if use_pool:
        from concurrent.futures import ProcessPoolExecutor, as_completed  # noqa: PLC0415

        os.environ.setdefault("OBJC_DISABLE_INITIALIZE_FORK_SAFETY", "YES")
        _log.info(
            "OCR pool: %d workers, %d pages to OCR",
            OCR_WORKER_COUNT, len(needs_ocr),
        )
        with ProcessPoolExecutor(max_workers=OCR_WORKER_COUNT) as pool:
            futures = {
                pool.submit(
                    _ocr_one_page, pdf_path, page_idx, OCR_DPI, OCR_LANG
                ): page_idx
                for page_idx in needs_ocr
            }
            for fut in as_completed(futures):
                page_idx = futures[fut]
                try:
                    ocr_results[page_idx] = fut.result()
                except Exception as e:  # noqa: BLE001
                    _log.warning("OCR failed on page %d: %s", page_idx + 1, e)
                    ocr_results[page_idx] = ""
    else:
        for page_idx in needs_ocr:
            try:
                ocr_results[page_idx] = _ocr_one_page(
                    pdf_path, page_idx, OCR_DPI, OCR_LANG
                )
            except Exception as e:  # noqa: BLE001
                _log.warning("OCR failed on page %d: %s", page_idx + 1, e)
                ocr_results[page_idx] = ""

    out: List[str] = []
    for i in range(total_pages):
        if i in ocr_results:
            out.append(_clean_ocr_text(ocr_results[i]))
        elif i in keep_text_layer:
            out.append(_clean_ocr_text(keep_text_layer[i]))
        else:
            out.append("")

    _log.info(
        "Extracted %d pages (%d via OCR, %d via text layer)",
        len(out), len(needs_ocr), len(out) - len(needs_ocr),
    )
    return out


def _ocr_one_page(pdf_path: str, page_idx: int, dpi: int, lang: str) -> str:
    """OCR a single PDF page. Designed to run inside a process-pool worker."""
    os.environ.setdefault("OBJC_DISABLE_INITIALIZE_FORK_SAFETY", "YES")
    import pytesseract  # noqa: PLC0415
    from pdf2image import convert_from_path  # noqa: PLC0415

    page_no = page_idx + 1  # poppler is 1-indexed
    images = convert_from_path(
        pdf_path, dpi=dpi, first_page=page_no, last_page=page_no
    )
    if not images:
        return ""
    try:
        return pytesseract.image_to_string(images[0], lang=lang)
    except pytesseract.TesseractNotFoundError as e:
        raise RuntimeError("tesseract binary not on PATH") from e


def _try_text_layer(
    pdf_path: str, *, max_pages: Optional[int] = None
) -> List[str]:
    """Return the embedded text-layer per page, or empty list if unavailable."""
    try:
        from pypdf import PdfReader  # noqa: PLC0415
    except ImportError:
        return []
    try:
        reader = PdfReader(pdf_path)
        pages = reader.pages
        if max_pages is not None:
            pages = pages[:max_pages]
        return [page.extract_text() or "" for page in pages]
    except Exception as e:  # noqa: BLE001
        _log.warning("text-layer extraction failed: %s", e)
        return []


def _clean_ocr_text(raw: str) -> str:
    """Light post-processing — collapse whitespace runs, drop noise lines."""
    lines: list[str] = []
    for line in raw.splitlines():
        cleaned = re.sub(r"\s+", " ", line).strip()
        if len(cleaned) < 3 and not re.search(r"[A-Za-zÀ-ÿ]", cleaned):
            continue
        lines.append(cleaned)
    return "\n".join(lines).strip()


def _extract_text_stub(pdf_path: str) -> List[str]:
    """Mock OCR output for testing without Tesseract."""
    name = Path(pdf_path).stem if pdf_path else "mock"
    seed = sum(ord(c) for c in name) % 7

    page1 = (
        "REPUBLIQUE D'HAÏTI\n\n"
        "PALAIS NATIONAL\n\n"
        f"LOI N° {2026 - seed}-{14 + seed} portant organisation du système national de "
        "passation des marchés publics et abrogeant toute disposition antérieure contraire.\n\n"
        "Le Président de la République,\n"
        f"Vu la Constitution amendée du 26 mars {1987 + seed % 3} ;\n"
        "Vu le décret du 4 février 2003 ;\n\n"
        "Considérant qu'il est nécessaire d'encadrer la passation des marchés publics "
        "afin de garantir la transparence et l'égalité de traitement des soumissionnaires ;\n\n"
        "ARRÊTE :\n\n"
        "Article 1er. — La présente loi régit les marchés publics conclus par l'État, "
        "les collectivités territoriales et les organismes publics autonomes."
    )
    page2 = (
        "DÉCRET du 18 février 2026 fixant les modalités d'application de la loi "
        f"n° {2026 - seed}-{14 + seed}.\n\n"
        "Le Président de la République,\n"
        "Sur le rapport du Premier Ministre, du Ministre de l'Économie et des Finances "
        "et du Ministre de la Justice ;\n\n"
        "DÉCRÈTE :\n\n"
        "Article 1er. — Les seuils prévus à l'article 12 de la loi sont fixés à :\n"
        "  a) 5 000 000 gourdes pour les marchés de fournitures et services ;\n"
        "  b) 10 000 000 gourdes pour les marchés de travaux."
    )
    page3 = (
        "ARRÊTÉ du 22 février 2026 du Ministère de la Justice et de la Sécurité publique "
        "portant nomination de magistrats au Tribunal de Première Instance de Port-au-Prince.\n\n"
        "Le Ministre de la Justice et de la Sécurité publique,\n"
        "Vu la Constitution ;\n\n"
        "ARRÊTE :\n\n"
        "Article 1er. — Sont nommés en qualité de juges au Tribunal de Première Instance "
        "de Port-au-Prince les personnes dont les noms suivent : […]"
    )

    return [page1, page2, page3]
