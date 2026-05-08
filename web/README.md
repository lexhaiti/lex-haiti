# LexHaïti — Web

The public-facing Next.js frontend for [LexHaïti](https://lexhaiti.ht), the open digital infrastructure of Haitian law.

This package is **self-contained**. It has its own `package.json`, lockfile, tests, and config, and reaches the rest of the system only through:

- the LexHaïti REST API (default `http://localhost:8000`, configurable)
- a Postgres `auth` schema for Auth.js editor sign-ins (magic links via Mailpit in dev)

You can run, test, and deploy this directory without anything else from the parent monorepo.

## Stack

- Next.js 14 (App Router, React 18, React Compiler enabled)
- TypeScript strict
- Tailwind CSS
- Auth.js v5 (NextAuth) with `@auth/pg-adapter`, magic-link email provider
- Vitest + Playwright for tests
- `openapi-typescript` for type generation against the backend OpenAPI spec

## Run locally

```bash
# 1. Install
pnpm install        # or npm install / yarn install

# 2. Configure environment — copy .env.local.example to .env.local and fill in.
#    See the example file for the full list (AUTH_SECRET, DATABASE_URL,
#    SMTP_*, LEXHAITI_API_INTERNAL_URL, ...).
cp .env.local.example .env.local

# 3. Start the dev server
pnpm dev
```

Open `http://localhost:3000`. Public pages work without any auth; editor flows require a magic-link sign-in at `/sign-in`.

## Generate API types

The frontend's typed API client mirrors the backend's OpenAPI schema. After backend changes, regenerate:

```bash
pnpm api:types        # writes src/lib/api-types.ts from http://127.0.0.1:8000/openapi.json
```

Set `OPENAPI_URL` to point at a deployed backend if you don't have one running locally.

## Tests

```bash
pnpm test             # vitest in watch mode
pnpm test:run         # one-shot run, used by CI
```

## Project layout

```
src/
├── app/              # Next.js App Router routes (RSC + client components)
├── components/       # UI components (atoms, sections, page-scoped)
│   ├── ui/           # Radix-based primitives (button, sheet, select, ...)
│   ├── home/         # Landing page sections
│   ├── law-details/  # Article viewer, TOC, editor bar, metadata editor
│   ├── all-laws/     # /lois listing + filters
│   └── shared/       # Brand, badges, cards
├── i18n/             # FR / KW translations and language context
├── lib/
│   ├── api/          # Typed REST client wired to /api/v1
│   ├── api-types.ts  # generated — do not hand-edit
│   └── hooks/        # Reusable React hooks
└── server/           # Auth.js config, server-only utilities
```

## License

Apache 2.0. See repository root.
