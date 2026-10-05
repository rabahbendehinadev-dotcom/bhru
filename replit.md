# BHRU

A PostgreSQL-backed SaaS foundation for unlock server owners, with separate platform subscriber administration and subscriber business dashboards.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server on the managed workflow's PORT
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm build:bhru` — build the frontend plus API and prepare the unified production runtime
- `pnpm db:migrate` — explicitly apply reviewed SQL migrations after building
- `pnpm start` — unified Express/static production-mode runtime
- `node artifacts/api-server/dist/admin-promote.mjs --email ADMIN_EMAIL --password-stdin` — bootstrap the first independent administrator; never register/promote a subscriber. Docker runtime: `node /app/admin-promote.mjs ...`.
- Required env: `DATABASE_URL`, `SESSION_SECRET` (at least 32 random characters), `PLATFORM_ADMIN_PATH` (unique URL segment, no slash); runtime `PORT`, production `NODE_ENV=production`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL; application schema managed by explicit SQL migrations
- Validation: generated Zod schemas from OpenAPI
- API codegen: Orval (from OpenAPI spec)
- Build: Vite frontend + esbuild ESM Node bundles

## Where things live

- Database source of truth: `lib/db/src/migrations/`, with a checksum migration ledger.
- API source of truth: `lib/api-spec/openapi.yaml`; regenerate, never hand-edit generated clients/schemas.
- API routes and server authorization: `artifacts/api-server/src/`.
- BHRU frontend: `artifacts/bhru/src/`; store is a server-state facade, not a browser database.

## Architecture decisions

- SQL migrations are manual, transactional, non-destructive and rerunnable. Never use Drizzle schema push against this schema; those scripts are intentionally disabled.
- Independent administrator identities in `platform_admin_users`, sessions in `platform_admin_sessions` and domain-separated `bhru_admin_session` cookies; subscribers remain in `account_users`/`sessions` with `bhru_session`. Passwords use scrypt. No admin registration, subscriber status, plan or licence.
- Docker runs the API and static frontend in one non-root Node process; no automatic startup migrations.

## Product

Real registration/login, platform-admin subscriber and plan management, server-side licence enforcement, audit logs and activations. Business-module navigation is preserved; unbuilt modules remain deferred.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Build before migration; migration before first startup. DATABASE_URL must target the intended environment.
- The post-merge setup installs dependencies only; it never pushes or resets the database.
- Test scripts deliberately refuse invocation from a production environment and must only use Development PostgreSQL.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- `DOKPLOY_DEPLOYMENT.md` — external PostgreSQL, runtime env, explicit migration/admin commands, Docker/Dokploy setup.
- `BHRU_DEVELOPMENT_REPORT.md` — scope, schema, auth/session implementation and verification results.
