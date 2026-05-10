# LexHaïti

> Open digital infrastructure for Haitian law.

**LexHaïti** is a free, structured, citable digital corpus of Haitian law — the Codes, statutes, decrees, *Le Moniteur*, and court decisions — published as a bilingual (French / Kreyòl) public good with permanent URLs and machine-readable provenance.

This repository contains the technical foundation: a Next.js frontend, a Python modular-monolith backend, and the editorial pipeline that ingests scans into a structured, queryable corpus.

## Structure

- `web/` — Next.js 14 frontend (TypeScript, Tailwind, App Router with RSC), self-contained
- `backend/` — Python modular monolith, self-contained (own `pyproject.toml`, `.venv`, `Makefile`)
  - `api/` — FastAPI routes + main entrypoint
  - `services/` — bounded-context domain modules (corpus, ingestion, enrichment, search, editorial, auth)
  - `packages/schemas/` — shared Pydantic v2 schemas (single source of truth for data shapes)
  - `workers/` — RQ background workers (OCR, embeddings, ingestion)
  - `scripts/` — CLI utilities (seed, ingest, structure, export)
  - `migrations/` — Alembic migrations
  - `tests/` — pytest suite
- `docker-compose.yml` — dev stack (Postgres + pgvector, Redis, MinIO, Mailpit)

Layer and bounded-context boundaries (`api → services → packages`; `services.corpus` independent of `editorial/search/enrichment/ingestion`) are enforced by `lint-imports` contracts in `backend/pyproject.toml` — run with `make boundaries`.

## Quick start (Phase 0)

A single root `Makefile` drives Docker, backend, and frontend. Run everything from the repo root.

```bash
# 1. Configure env files alongside their projects
cp backend/.env.example backend/.env             # edit if needed
cp web/.env.local.example web/.env.local         # fill in AUTH_SECRET, DATABASE_URL, ...

# 2. Boot
make up           # Postgres+pgvector, Redis, MinIO, Mailpit
make install      # creates backend/.venv if missing, pip install -e ".[dev,ingestion]"
make migrate      # apply Alembic migrations
make web-install  # pnpm install in web/

# 3. Develop
make dev          # uvicorn api.main:app --reload (port 8000)
make web-dev      # next dev (port 3000)
```

`make help` lists every target. Env files live with their projects: backend reads `backend/.env`; frontend reads `web/.env.local`.

## Stack

- **Backend** Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.x, Alembic
- **Frontend** Next.js 14 (App Router, RSC), TypeScript strict, Tailwind
- **Database** Postgres 16 with `pgvector` — one instance, `public_corpus` schema
- **Storage** S3-compatible (MinIO in dev, Backblaze B2 in prod)
- **Jobs** Redis + RQ
- **OCR** Tesseract baseline, premium fallback for low-confidence pages
- **Embeddings** `intfloat/multilingual-e5-large` (1024 dim)

## Architectural principles

- **Modular monolith.** No microservices. Workers are the same codebase invoked differently.
- **Layered.** Routes don't query the DB directly; services hold domain logic and don't import FastAPI; repositories return typed Pydantic objects.
- **Editorial review is mandatory.** Automated stages produce candidates with `status='draft'`; nothing goes public without an editor flipping `status='published'`.
- **Provenance is first-class.** Every artifact has a back-reference to its source.
- **Versioning is on the article, not the text.** When an article is amended, a new `article_versions` row is created — the article ID and its URL stay stable.
- **Permalinks are forever.** Once published, a URL resolves forever.
- **Bilingual native.** Every text-bearing column has `_fr` and `_ht` variants.

## Status

Phase 0 — bootstrapping the public corpus and editorial pipeline.

## License (proposed)

- **Code**: Apache 2.0
- **Legal corpus data**: CC0 (public-domain sources); CC-BY for editorial enrichments
- **Editorial commentary**: CC-BY-SA
