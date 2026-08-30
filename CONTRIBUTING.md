# Contributing to Kestrel

Thank you for contributing to Kestrel. This guide covers the supported development workflow for the open-source repository.

> **Public release boundary:** Kestrel is currently a single-user, self-hosted beta. Shared multi-user/RLS hosting is intentionally unsupported. Read [OPEN_SOURCE_DEPLOYMENT_MATRIX.md](OPEN_SOURCE_DEPLOYMENT_MATRIX.md) and [OPEN_SOURCE_READINESS_CURRENT.md](OPEN_SOURCE_READINESS_CURRENT.md) before changing deployment, auth, database, or tenant code.

## 1. Prerequisites

| Requirement | Version | Verify |
| --- | --- | --- |
| Node.js | `>=22.13.0` | `node --version` |
| pnpm | `9.15.4` | `pnpm --version` |
| Git | Any current version | `git --version` |
| Docker | Optional; required for Docker/PostgreSQL mode | `docker --version` |

PGlite boots automatically for local development, so a database installation is not required for Simple mode.

## 2. Quick start

```bash
git clone https://github.com/<your-username>/Kestrel.git
cd Kestrel
pnpm setup
```

The setup wizard supports Simple/PGlite and Docker modes, generated local secrets, dry-run output, JSON output, and optional launch. Configure an AI provider key after registering through **Settings → API Keys**.

Manual Simple-mode setup:

```bash
pnpm install --frozen-lockfile
pnpm dev:local
```

Manual Docker setup:

```bash
./docker/init-secrets.sh
docker compose up -d --build
```

Do not set `MULTI_USER_ENABLED=1`, `KESTREL_ENABLE_RLS=1`, or `REGISTRATION_MODE=open` for the public single-user release.

## 3. Repository structure

```text
config → shared → db + indicators → data → ai → web + worker
```

| Package/app | Path | Responsibility |
| --- | --- | --- |
| `@kestrel/config` | `packages/config/` | Shared TypeScript, ESLint, and formatting configuration |
| `@kestrel/shared` | `packages/shared/` | Zod schemas, environment validation, encryption, logging, shared types |
| `@kestrel/db` | `packages/db/` | Drizzle schema, migrations, PostgreSQL/PGlite clients |
| `@kestrel/indicators` | `packages/indicators/` | Technical indicators and market-structure calculations |
| `@kestrel/data` | `packages/data/` | Market-data providers, adapters, failover, and caching |
| `@kestrel/ai` | `packages/ai/` | Mastra agents/workflows, typed tools, routing, memory, persistence |
| `@kestrel/test-utils` | `packages/test-utils/` | Shared test factories, mocks, and Vitest helpers |
| `@kestrel/web` | `apps/web/` | Next.js 16 PWA, Auth.js, chat, API routes, and UI |
| `@kestrel/worker` | `apps/worker/` | Persistent worker for feeds, candles, jobs, and health endpoints |

## 4. Coding conventions

- Use `kebab-case.ts` for modules and `PascalCase.tsx` for React components.
- Keep TypeScript strict and avoid `any` unless the reason is documented.
- Validate package boundaries and external input with the existing Zod schemas.
- Use `import type` for type-only imports.
- Keep request-scoped state in `AsyncLocalStorage`; do not use module-level mutable request state.
- Inside `packages/ai`, resolve database and model dependencies through the typed DI tokens. In apps and other packages, use the project’s existing direct database convention.
- Preserve the standardized `{ data }` / `{ error }` API envelope.
- Do not log decrypted provider keys, tokens, passwords, or raw sensitive prompts.

### Database rules

- Define tables in `packages/db/src/schema/` and export them from the schema index.
- User-owned data must preserve the project’s ownership and tenant columns/constraints.
- New migrations must be idempotent and compatible with PGlite where applicable.
- Generate migrations with `pnpm --filter @kestrel/db migrate:gen`.
- Never edit an applied migration.
- Never run `drizzle-kit push` against production.
- Use a direct migration connection (`DIRECT_URL` or `POSTGRES_URL_NON_POOLING`), not a transaction pooler.
- Add tests for schema drift, constraints, migration idempotency, and ownership behavior.

### AI tools

Follow the existing `inputSchema → module augmentation → execute` pattern. Add the input/output schema, implementation, registry entry, tool name, UI part where needed, and tests. Use `getToolContext()` rather than global state.

### API routes

Use the established auth, admin, cron, CSRF, rate-limit, body-parser, and response-envelope wrappers. Validate request bodies at the boundary and add route tests for anonymous access, invalid input, ownership, and authorization failures.

## 5. Verification workflow

Run the relevant checks before opening a PR:

```bash
pnpm typecheck
pnpm lint
pnpm turbo run test -- --run
pnpm build
```

For release-facing changes, also run:

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

E2E tests require a running app:

```bash
pnpm dev:local
pnpm test:e2e
```

## 6. Testing expectations

- Co-locate unit tests with the module or use the package’s existing `test/` convention.
- Add tests for every new AI tool, API route, provider, indicator, migration, and security-sensitive behavior.
- Use shared fixtures and mocks from `@kestrel/test-utils`.
- Always pass `--run` to Vitest in CI/non-interactive commands.
- PostgreSQL-only RLS tests must use disposable PostgreSQL and must not claim PGlite proves RLS.
- E2E tests should cover auth, ownership, CSRF, responsive behavior, accessibility, health, and critical user journeys.

## 7. Pull requests

1. Create a branch from `main` using `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`, `perf/`, or `ci/`.
2. Keep changes focused; split large work where practical.
3. Update user-facing documentation and changelog entries when behavior changes.
4. Include migration, environment, deployment, security, and rollback implications in the PR description.
5. Run the required checks and use the PR template.

## 8. High-risk areas

- **Auth and ownership:** never regress to a single-password gate or remove user scoping.
- **BYOK encryption:** never log or expose decrypted credentials; protect `ENCRYPTION_SECRET`.
- **RLS/shared mode:** remains unsupported until complete tenant isolation is proven across web, worker, cache, memory, exports, shares, notifications, billing, and telemetry.
- **Risk calculations:** preserve precision and test edge cases.
- **Request proxy:** keep it lightweight and security-focused; do not add database work there.
- **Billing/webhooks:** preserve signature verification, idempotency, and failure handling; hosted billing is not part of the default OSS path.

## 9. Releases and CI

Changesets are available for package release metadata, but the application/Docker release contract is maintained separately and must include source revision, image metadata, SBOM/provenance, and deployment notes when applicable. Do not assume published workspace packages alone constitute a complete Kestrel release.

CI workflows cover fast PR checks, slower main/nightly checks, container publication, dependency/security analysis, and release automation. Keep release-critical jobs fail-closed; do not hide failures with `continue-on-error`.

## 10. Help and conduct

- Start with [README.md](README.md), [OPEN_SOURCE_DEPLOYMENT_MATRIX.md](OPEN_SOURCE_DEPLOYMENT_MATRIX.md), and [SECURITY.md](SECURITY.md).
- Use GitHub issues for reproducible bugs and feature requests.
- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
- Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Contributions are licensed under Apache-2.0.
