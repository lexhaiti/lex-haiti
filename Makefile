.PHONY: help \
        up down logs ps psql redis \
        install migrate revision dev test lint boundaries format clean \
        web-install web-dev web-test web-build

# Docker compose
COMPOSE := docker compose

# Backend Python — invoked via the venv binaries (absolute paths so cd works).
PYBIN   := $(CURDIR)/backend/.venv/bin
ALEMBIC := $(PYBIN)/alembic -c $(CURDIR)/backend/migrations/alembic.ini

help:
	@echo "LexHaïti — single Makefile, three layers"
	@echo ""
	@echo "Dev stack (Docker)  — see docker-compose.yml at the root"
	@echo "  make up           Start dev stack (Postgres+pgvector, Redis, MinIO, Mailpit)"
	@echo "  make down         Stop dev stack"
	@echo "  make logs         Tail dev-stack logs"
	@echo "  make ps           List dev-stack containers"
	@echo "  make psql         Open psql against the lexhaiti database"
	@echo "  make redis        Open redis-cli"
	@echo ""
	@echo "Backend (Python — backend/)"
	@echo "  make install      Create backend/.venv if missing, then pip install -e \".[dev,ingestion]\""
	@echo "  make migrate      Apply pending Alembic migrations"
	@echo "  make revision M='msg'   Create a new Alembic revision"
	@echo "  make dev          Run the API with hot reload (uvicorn api.main:app)"
	@echo "  make test         Run backend pytest (41 tests)"
	@echo "  make lint         ruff + mypy"
	@echo "  make boundaries   lint-imports — verify bounded-context boundaries"
	@echo "  make format       ruff format"
	@echo "  make clean        Remove backend caches"
	@echo ""
	@echo "Frontend (Node — web/)"
	@echo "  make web-install  pnpm install"
	@echo "  make web-dev      Run Next.js dev server"
	@echo "  make web-test     Run vitest (one-shot)"
	@echo "  make web-build    Build Next.js for production"
	@echo ""
	@echo "First-time setup:  make up && make install && make migrate && make web-install"

# -----------------------------------------------------------------------
# Dev stack
# -----------------------------------------------------------------------
up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

psql:
	$(COMPOSE) exec db psql -U lexhaiti -d lexhaiti

redis:
	$(COMPOSE) exec redis redis-cli

# -----------------------------------------------------------------------
# Backend (Python)
# -----------------------------------------------------------------------
install:
	@if [ ! -x "$(PYBIN)/python" ]; then \
		echo "Creating backend/.venv ..."; \
		cd backend && python3 -m venv .venv; \
	fi
	$(PYBIN)/pip install --upgrade pip
	cd backend && $(PYBIN)/pip install -e ".[dev,ingestion]"

migrate:
	cd backend && $(ALEMBIC) upgrade head

revision:
	cd backend && $(ALEMBIC) revision -m "$(M)"

dev:
	cd backend && $(PYBIN)/uvicorn api.main:app --reload --host 0.0.0.0 --port 8000

# RQ worker — run alongside `make dev` to consume background jobs.
# - DYLD_FALLBACK_LIBRARY_PATH: Homebrew's poppler / pango / cairo libs
#   for WeasyPrint + pdf2image FFI bindings.
# - OBJC_DISABLE_INITIALIZE_FORK_SAFETY: macOS-only. Apple's libobjc
#   refuses to run in a forked child if Cocoa framework init is in
#   flight in the parent. RQ uses fork() for each job; libraries we
#   load (Tesseract, Pillow, …) touch Cocoa indirectly, which crashes
#   the work-horse with `objc[…]: +[NSCharacterSet initialize] may have
#   been in progress in another thread when fork() was called`.
#   The env var disables the safety check (safe for our use; we don't
#   call AppKit from worker code).
worker:
	cd backend && DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES $(PYBIN)/rq worker default --url $${REDIS_URL:-redis://localhost:6379/0}

test:
	cd backend && $(PYBIN)/pytest

lint:
	cd backend && $(PYBIN)/ruff check . && $(PYBIN)/mypy .

boundaries:
	cd backend && $(PYBIN)/lint-imports

format:
	cd backend && $(PYBIN)/ruff format .

clean:
	cd backend && find . -type d \( -name __pycache__ -o -name .pytest_cache -o -name .mypy_cache -o -name .ruff_cache -o -name .import_linter_cache \) -exec rm -rf {} + 2>/dev/null || true

# -----------------------------------------------------------------------
# Frontend (Node)
# -----------------------------------------------------------------------
web-install:
	cd web && pnpm install

web-dev:
	cd web && pnpm dev

web-test:
	cd web && pnpm test:run

web-build:
	cd web && pnpm build
