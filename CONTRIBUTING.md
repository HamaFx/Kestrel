# Contributing to Kestrel

Thank you for your interest in contributing to **Kestrel**! Kestrel is an open-source, self-hosted AI trading research and execution copilot licensed under the [Apache License 2.0](LICENSE).

Whether you are adding a technical indicator, improving market-data failover, refining the 4-Desk AI Committee prompts, or building a new plugin, this guide covers the workflow and architectural invariants every pull request must satisfy.

## Prerequisites

- **Node.js:** `>=22.22.2` (`.nvmrc` pins `22.23.3`)
- **Package Manager:** `pnpm >=12.0` (`corepack enable && corepack prepare pnpm@12.14.0 --activate`)
- **Database:** Docker Desktop or Docker Engine (for PostgreSQL 16 + `pgvector`)

## Local Development Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/<your-username>/Kestrel.git
cd Kestrel

# 2. Start the local PostgreSQL 16 + pgvector container
docker compose up -d db

# 3. Install workspace dependencies (installs lefthook git hooks automatically)
pnpm install

# 4. Run the interactive setup wizard (creates .env / .env.local and secrets)
pnpm setup

# 5. Start the Next.js web app and worker in watch mode
pnpm dev
```

## Pull Request Workflow

1. Create a feature or bugfix branch from `main` (`git checkout -b feat/your-feature`).
2. Follow the repository's architectural and code-shape rules in [`AGENTS.md`](AGENTS.md).
3. Run the verification suite before pushing:

```
+------------ [ PR VERIFICATION GATE ] ------------+
|                                                  |
| ●  1. check:guards  8 static security/shape gates|
| │                                                |
| ●  2. knip          zero unused files or exports |
| │                                                |
| ●  3. lint & fmt    oxlint + oxfmt --check       |
| │                                                |
| ●  4. typecheck     tsrs parallel across 15 pkgs |
| │                                                |
| ○  5. vitest        affected unit & rls suites   |
+--------------------------------------------------+
```

```bash
pnpm check:guards
pnpm knip
pnpm format:check
pnpm check:fast
```

## Architectural & Code-Shape Rules

- **File Size Caps (`scripts/check-maintainability.mjs`):**
  - Backend `.ts` files must stay `<= 500` LOC (`RULE-F01`); static catalogs `<= 500` LOC (`RULE-F04`).
  - React `.tsx` components must stay `<= 450` LOC (`RULE-F02`). Keep cohesive components whole rather than shattering them into single-caller micro-files.
  - Package `src/` roots may contain at most `10` loose files (`RULE-F05`).
  - Zero empty `catch {}` blocks (`RULE-R01`) and zero `any` types (`@typescript-eslint/no-explicit-any`).
- **Multi-Tenant PostgreSQL RLS Safety:**
  - Every user-scoped read or write in React Server Components, Server Actions, API routes, or Worker jobs must run inside `withUserTenant(userId, ...)` or `withUserTenantRO(userId, ...)`.
  - Cross-tenant background jobs must explicitly use `withAdminDb(...)`.
- **Type Checking & Compilation (`tsrs`):**
  - Workspace `typecheck` and package `build` scripts use **tsrs** (the Rust port of the TypeScript 7 compiler). Run `pnpm typecheck` across the monorepo or `pnpm --filter @kestrel/<pkg> typecheck` for a single package.
  - Internal packages expose `"@kestrel/source": "./src/index.ts"` so local development and tests resolve TypeScript sources directly without a preliminary build step.
- **High-Value Testing Rules:**
  - Keep the test suite fast and behavioral. Do not write source-grepping (`readFileSync`) tests, CSS class assertions, or mocked Drizzle query-chain tests. See [`AGENTS.md`](AGENTS.md) for the full anti-bloat testing policy.

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <concise description>
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`.

## Code of Conduct & Security

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). If you discover a security vulnerability, please follow the private disclosure instructions in [`SECURITY.md`](SECURITY.md).
