# AGENTS.md — Kestrel Development Guide

> **For AI coding agents working on this repository.** Read this file before making changes. It is the public, repository-safe source of truth for engineering work. Maintainer-only infrastructure instructions belong in the untracked local `AGENTS.private.md`, copied from `AGENTS.private.md.example`.

## Project identity and release boundary

Kestrel is an open-source, BYOK, chat-driven AI market-research workspace for gold, forex, and supported crypto pairs. It is a Next.js 16 / React 19 PWA with a persistent Node.js worker, Mastra agents and durable workflows, typed market-data tools, model routing, memory, verification, and operational guardrails.

- **License:** Apache-2.0
- **Package manager:** pnpm 9.15.4
- **Node.js:** >=22.13.0
- **Repository:** https://github.com/HamaFx/Kestrel
- **Public release:** single-user self-hosted beta
- **Supported public profiles:** Simple/PGlite and Docker Compose/PostgreSQL; external PostgreSQL is operator-managed
- **Not supported publicly:** shared multi-user hosting, open registration for unrelated users, runtime RLS mode, hosted SaaS operation, or claims of an independent security audit

The maintainer-operated Vercel/GCE/managed-database deployment is a separate private topology. Do not document its project names, URLs, team identifiers, credentials, cookies, monitoring endpoints, or environment values in tracked files.

## Open-source contributor context

This repository is developed and released as open-source software under Apache-2.0. Treat every tracked change as potentially visible to users, contributors, security researchers, and downstream redistributors.

### Publicly supported OSS scope

Contributors may rely on and improve these public paths:

- Simple local development with embedded PGlite.
- Docker Compose single-user deployment with PostgreSQL and pgvector.
- Operator-managed external PostgreSQL for a single-user instance.
- BYOK AI configuration through the application.
- Optional market-data, email, storage, notifications, and observability integrations when explicitly configured.
- Public tests, release checks, setup tooling, backups, health checks, and documentation.

### Experimental and maintainer-only scope

These areas require extra caution and must not be advertised as generally supported:

- Shared multi-user hosting and runtime RLS mode.
- Tenant-aware worker, cache, memory, export, share, upload, notification, billing, and telemetry paths that are not covered by the complete isolation gate.
- Maintainer Vercel/GCE/managed-database infrastructure.
- Private provider proxies, monitoring, cron endpoints, staging environments, and production secrets.
- Hosted billing and maintainer-operated SaaS behavior.

Label changes to these areas clearly as experimental or maintainer-only. Do not silently make an unsupported mode appear production-ready.

### OSS contribution requirements

Before submitting an OSS-facing change:

1. Confirm behavior against source and tests rather than stale docs or architecture snapshots.
2. Preserve clean-checkout setup with no private environment required.
3. Keep credentials, private URLs, customer data, provider secrets, and maintainer identifiers out of code, fixtures, screenshots, logs, docs, and commits.
4. Update public documentation when commands, environment variables, deployment profiles, security boundaries, or user-visible behavior change.
5. Add or update tests for the supported Simple/Docker paths and relevant negative/security cases.
6. Run the release and security contract checks listed below.
7. Explain whether the change affects public OSS users, experimental functionality, or only the private maintainer topology.

### Public source-of-truth order

When sources disagree, use this order:

1. Current implementation and its tests.
2. Environment schemas, Compose files, package manifests, and release checks.
3. Current root-level OSS documents: `README.md`, `OPEN_SOURCE_DEPLOYMENT_MATRIX.md`, `OPEN_SOURCE_READINESS_CURRENT.md`, `SECURITY.md`, and `CONTRIBUTING.md`.
4. `docs/architecture-explorer.html` and `.json`, which are static informational snapshots only.

### Required OSS runtime boundary

Fresh public deployments must remain fail-closed with:

```text
OSS_SINGLE_USER_MODE=1
MULTI_USER_ENABLED=0
KESTREL_ENABLE_RLS=0
REGISTRATION_MODE=owner-first
```

The repository contains experimental tenant/RLS infrastructure, but complete isolation across every web, worker, cache, memory, export, share, upload, notification, billing, and telemetry path has not been proven. Do not enable or advertise shared mode without a separately reviewed isolation matrix and security gate.

## Before changing code

1. Read the relevant source and tests; do not rely on stale documentation or generated snapshots.
2. Search for existing conventions, wrappers, schemas, providers, and tests before adding new abstractions.
3. Check the package dependency direction and runtime boundary.
4. Identify whether the change affects auth, ownership, secrets, migrations, providers, billing, worker scheduling, or public release behavior.
5. Keep changes focused and prefer editing existing files.
6. Never expose secrets or private deployment information in code, logs, tests, documentation, commits, or issue reports.

## Repository map

```text
apps/web       Next.js PWA, Auth.js, chat, API routes, UI, public health
apps/worker    Node.js daemon, feeds, tick processing, jobs, health server
packages/ai    Mastra agents/workflows, typed tools, routing, memory, persistence
packages/data  market-data adapters, providers, failover, caching
packages/db    Drizzle schema, migrations, PostgreSQL/PGlite clients
packages/indicators technical indicators and market structure
packages/shared schemas, environment validation, encryption, logging, types
packages/config shared TypeScript/ESLint/formatting configuration
packages/test-utils test factories, mocks, and Vitest helpers
infra/         maintainer-specific deployment assets; not the OSS contract
scripts/       setup, development, migration, release, and verification tools
docs/          static architecture artifacts only; not generated at build time
```

Dependency direction:

```text
config → shared → db + indicators → data → ai → web + worker
```

Do not introduce circular dependencies or import a downstream package from an upstream package.

## Commands

```bash
# Install
pnpm install --frozen-lockfile

# Simple local development; PGlite boots when no remote DB URL is configured
pnpm dev:local

# Docker single-user stack
./docker/init-secrets.sh
docker compose up -d --build

# Quality
pnpm typecheck
pnpm lint
pnpm turbo run test -- --run
pnpm build

# E2E; requires a running app
pnpm test:e2e
```

Release/security contract checks:

```bash
pnpm check:oss-release
pnpm check:p0-release
pnpm check:p3-release
pnpm check:route-security
pnpm check:env-contract
pnpm check:release-archive
pnpm check:dependency-report
pnpm check:single-user-release
```

Always use `-- --run` with Vitest in non-interactive commands. Do not run production-affecting scripts, deploys, migrations, backups, restores, or external-service operations without explicit operator approval.

## Database and migrations

```bash
pnpm --filter @kestrel/db migrate:gen
pnpm --filter @kestrel/db migrate:apply
```

Migration rules are load-bearing:

- Never use `drizzle-kit push` against production.
- Never edit an applied migration. Create a new migration instead.
- New migrations must be idempotent using appropriate `IF EXISTS`, `IF NOT EXISTS`, or guarded `DO $$` logic.
- Use a direct migration connection: `DIRECT_URL` or `POSTGRES_URL_NON_POOLING`. Do not use a transaction pooler for DDL.
- Check migration status before deployment and verify the result afterward.
- The migration tracking table is `drizzle.__drizzle_migrations`.
- New database features must work in PGlite where applicable; PostgreSQL-only behavior such as RLS, roles, grants, BYPASSRLS, extensions, and pgvector requires real PostgreSQL tests.
- Preserve ownership constraints and user/tenant scoping. User ID predicates are not a substitute for proven tenant isolation.
- Add schema drift, constraint, migration idempotency, and ownership tests for new database behavior.

The container runtime may apply migrations during startup. Treat migration failures as deployment failures; do not bypass them or mutate production manually without a reviewed recovery plan.

## Security and privacy

- Preserve Auth.js/NextAuth credentials authentication, bcrypt hashing, lockout, TOTP policy, persisted sessions, token-version invalidation, CSRF protection, and signed user-header validation.
- Protect strict `userId` ownership scoping in every user-data query and route.
- Keep the request proxy lightweight. Do not add database work to the request boundary.
- Use the existing auth, admin, cron, webhook, CSRF, rate-limit, body-size, and response-envelope wrappers.
- Validate external input with the project’s Zod schemas.
- Never log decrypted BYOK keys, passwords, session tokens, cookies, database URLs, provider credentials, or unredacted sensitive prompts.
- `ENCRYPTION_SECRET` is required to decrypt stored BYOK credentials. Losing it makes those credentials unrecoverable.
- Keep Sentry, Langfuse, and prompt/output capture opt-in and disclose data egress and retention when enabling them.
- Do not weaken CSP, TLS verification, cookie protections, request limits, or signature verification to make a test pass.
- Billing/webhook code must retain signature verification, idempotency, and failure handling; hosted billing is not part of the default OSS path.

## AI and tools

AI tools follow this pattern:

```text
inputSchema → module augmentation → execute → typed output → registry
```

Rules:

- Use existing tool context through `getToolContext()` and `AsyncLocalStorage`; never use global request state.
- Inside `packages/ai`, resolve database/model dependencies through typed DI tokens (`DB`, `LLM_CLIENT`); do not bypass the container with direct database resolution.
- In apps and other packages, follow the existing direct `getDb()` convention.
- Add schemas, registry entries, tool names, UI parts where needed, and tests for every new tool.
- Preserve mutation confirmation workflows; read-only tools must not gain hidden mutation behavior.
- Keep prompt-injection detection, Unicode normalization, citation enforcement, budgets, rate limits, and loop limits intact.
- Provider behavior, prices, rate limits, licensing, and redistribution rights are operator responsibilities.
- `KESTREL_OFFLINE_MODE=1` provides deterministic synthetic market-data behavior; it does not replace a configured AI model for normal chat flows.

## Market data and failover

- Use the existing `runWithFailover([{ name, run }])` pattern.
- Do not add direct provider calls that bypass health-aware ordering, caching, or provider error classification.
- Validate provider inputs and outputs at package boundaries.
- Treat external content as untrusted input and preserve SSRF protections for web search/fetch paths.
- Never claim live, current, or accurate market data without the appropriate tool result and citation behavior.

## Worker and scheduling

The worker handles live feeds, tick buffering, one-minute candle aggregation, durable jobs, and health endpoints. The canonical health endpoints are:

```text
/health/live   process liveness
/health/ready  dependency/feed readiness
```

Compatibility aliases may exist, but new code should use the canonical paths. Keep worker health/proxy ports private by default and require explicit operator controls before public exposure.

Define one scheduler owner per deployment profile. Avoid overlapping embedded, Docker, VM, Vercel, and manual cron mechanisms. Preserve job leases, heartbeats, stale recovery, idempotency, timeouts, and graceful shutdown.

## Frontend and API conventions

- Use React Server Components by default; add client components only for browser state, events, or APIs that require them.
- Preserve accessible labels, keyboard navigation, semantic landmarks, responsive behavior, and the existing design tokens.
- Keep CSP nonces on scripts that require them.
- API responses use `{ data: ... }` or `{ error: { code, message, details } }`.
- Add anonymous, invalid-input, ownership, authorization, CSRF, rate-limit, and oversized-body tests for security-sensitive routes.
- Do not expose internal errors, credentials, stack traces, or provider secrets to clients.

## Testing expectations

Every change should include the narrowest useful regression test. In particular:

- New tools: AI package tests and UI part tests where applicable.
- New API routes: route tests for auth, validation, ownership, and failure paths.
- New providers: mocked provider tests, failover tests, empty/error responses, and licensing notes.
- New indicators/risk logic: edge-case and property tests; preserve numerical precision.
- New tables/migrations: PGlite compatibility, migration-chain, constraints, and ownership tests.
- New security behavior: request-boundary and negative tests.
- PostgreSQL RLS tests: disposable real PostgreSQL only; PGlite cannot prove RLS.
- E2E changes: update the relevant Playwright coverage and avoid test-order dependence.

## File naming

- `kebab-case.ts` for modules, utilities, and tools
- `PascalCase.tsx` for React components
- `_prefix.ts` for private/internal modules
- `.test.ts` / `.test.tsx` for Vitest tests
- `route.ts` for Next.js route handlers
- `page.tsx` for App Router pages

## Release and documentation rules

- Public documentation must describe only verified behavior and supported profiles.
- Keep maintainer-specific Vercel/GCE/Supabase details out of public docs and tracked agent instructions.
- Update `README.md`, `OPEN_SOURCE_DEPLOYMENT_MATRIX.md`, `docs/README.md`, `docs/configuration.md`, `docs/troubleshooting.md`, `docs/architecture.md`, `docs/release.md`, readiness records, and `CHANGELOG.md` when public behavior or release boundaries change.
- Treat `docs/architecture-explorer.html` and `.json` as static informational snapshots; do not make runtime code depend on them.
- Run current-tree and Git-history secret scans before public release.
- Audit dependency licenses, fonts, icons, images, screenshots, provider trademarks, and sample data before redistribution.
- Record application version, source revision, image digest, migration state, SBOM/provenance, and rollback information for releases.

## What not to change casually

- Authentication, authorization, ownership, or single-user safety gates
- Request-proxy security logic
- Provider failover and SSRF protections
- BYOK encryption and secret redaction
- Migration history or migration tracking behavior
- AI tool registration and mutation confirmation boundaries
- AsyncLocalStorage request context
- Worker lease/idempotency/scheduler behavior
- Public release disclaimers and unsupported-mode guards

If a change affects one of these areas, explain the invariant, add regression tests, and document the operational impact.

## Maintainer-only instructions

For private production operations, copy `AGENTS.private.md.example` to the local, ignored `AGENTS.private.md` and populate it without secrets in tracked files. It supplements this file but does not override its safety rules. The example covers deployment review, migration approval, worker operations, backup/restore, monitoring, incidents, and rollback.
