# syntax=docker/dockerfile:1.7
#
# LexHaïti backend image — runs the FastAPI app or the RQ worker out
# of the same artefact, selected at container start by the CMD. Multi-
# stage build keeps the final image small (no compiler toolchain).

# ---------------------------------------------------------------------
# 1. Builder — installs Python deps in a venv we copy into the runtime
# ---------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Build deps: weasyprint pulls in pango+cairo; psycopg2-binary is
# wheel-only so no compiler needed for it.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpango-1.0-0 libpangoft2-1.0-0 libcairo2 libffi-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

COPY pyproject.toml ./
# Install dependencies — the project itself is installed in the
# runtime stage so source edits don't invalidate the wheel cache.
RUN pip install --upgrade pip && \
    pip install ".[ingestion]"

# ---------------------------------------------------------------------
# 2. Runtime — slim image, OCR + PDF rendering tools, app code
# ---------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:${PATH}" \
    PYTHONPATH=/app

# Runtime deps:
# - libpango / cairo: weasyprint PDF rendering
# - tesseract-ocr + tesseract-ocr-fra: OCR for Moniteur PDFs
# - poppler-utils: pdf2image (pdftoppm) for PDF → image conversion
# - libpq5: psycopg2 runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangoft2-1.0-0 libcairo2 \
    tesseract-ocr tesseract-ocr-fra \
    poppler-utils \
    libpq5 \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Non-root user — Container Apps runs containers as whatever UID you
# set; keeping it explicit means local `docker run` matches.
RUN useradd --create-home --shell /bin/bash app

COPY --from=builder /opt/venv /opt/venv

# Persistent file dir for uploaded Moniteur PDFs in the prototype.
# Wire a Container Apps volume mount at this path in prod so files
# survive container restarts. ``boto3`` storage will replace this once
# the storage adapter ships. Created as root then chown'd so the
# non-root runtime user can write to it.
ENV MONITEUR_PDF_DIR=/data/moniteur
RUN mkdir -p /data/moniteur && chown -R app:app /data

WORKDIR /app
COPY --chown=app:app . /app
USER app

EXPOSE 8000

# Default CMD runs the API. The worker container in Container Apps
# overrides this with ``rq worker``. Both containers share the image.
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
