# LexHaïti

> Open digital infrastructure for Haitian law.

**LexHaïti Public** — a free, structured, citable digital corpus of Haitian law: Codes, statutes, decrees, court decisions, and *Le Moniteur*.

This repository contains the technical foundation for **Layer 1 (Public)**.

## Structure

- `web/` — Next.js 14 frontend (TypeScript, Tailwind) — self-contained, lift-and-shift to its own repo
- `backend/` — Python modular monolith — self-contained, with its own `pyproject.toml`, `.venv`, `Makefile`
  - `api/` — FastAPI routes + main entrypoint
  - `services/` — domain logic (corpus, ingestion, enrichment, search, editorial, auth)
  - `packages/schemas/` — shared Pydantic schemas
  - `workers/` — RQ background workers
  - `scripts/` — CLI utilities (seed, ingest, structure)
  - `migrations/` — Alembic (incl. `alembic.ini`)
  - `tests/` — backend integration + smoke tests
- `docker-compose.yml` — dev stack (Postgres+pgvector, Redis, MinIO, Mailpit)
- `docs/` — Architecture, ADRs, planning documents

Bounded-context boundaries are enforced by `lint-imports` via the contracts in `pyproject.toml` (`make boundaries`).

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

See [CLAUDE.md](CLAUDE.md) for project context. See [docs/decisions/ADR-001-foundational-stack.md](docs/decisions/ADR-001-foundational-stack.md) for the foundational stack decisions.

## Status

Phase 0 — bootstrapping. Two-engineer founding team.

## License (proposed)

- **Code**: Apache 2.0
- **Legal corpus data**: CC0 (public-domain sources); CC-BY for editorial enrichments
- **Editorial commentary**: CC-BY-SA
