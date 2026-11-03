# Kestrel — Agent Engineering Handbook

Self-hosted multi-user BYOK AI trading research platform (Next.js 16, React 19, Mastra, Drizzle ORM, PostgreSQL 16 + pgvector, Turborepo, pnpm 12, TypeScript 7 `tsrs`).

## Verification Gates (Run Before Every Commit)

- Fast inner loop: `pnpm check:fast` (parallel guards + Oxlint + affected typecheck/test with `NODE_COMPILE_CACHE`)
- Typecheck all packages: `pnpm typecheck` (parallel `tsrs --noEmit`; does not build dependencies)
- Lint all packages: `pnpm lint` (`oxlint`, Rust-native)
- Format check: `pnpm format:check` (`oxfmt`)
- Single package test: `pnpm --filter @kestrel/<pkg> test`
- All static guards in parallel: `pnpm check:guards`
- Pre-commit hooks (lefthook) run Oxlint, Oxfmt, and the secret scanner on staged files.
- Formatting is `oxfmt`; do not add Prettier configuration or plugins.

## Hard Architectural & Code-Shape Rules

- **File Size Gates (`scripts/check-maintainability.mjs`):**
  - Backend `.ts` files: `<= 350` LOC (`RULE-F01`). Static catalogs: `<= 500` LOC (`RULE-F04`).
  - React `.tsx` files: `<= 250` LOC (`RULE-F02`), `<= 4` `useState`, `<= 2` `useEffect` (`RULE-F03`).
  - Package `src/` roots: `<= 10` loose files (`RULE-F05`). Place modules inside domain subdirectories.
  - Zero empty `catch {}` blocks (`RULE-R01`) and zero `@typescript-eslint/no-explicit-any`.
- **Single Source of Truth (Anti-Duplication):**
  - Search with ripgrep before creating any helper, schema, query, or tool.
  - `@kestrel/shared`: Zod schemas, symbol catalog, env contracts, encryption, `assertSafeOutboundUrl`.
  - `@kestrel/db`: Drizzle schema, migrations, RLS (`withUserTenant`, `withTenantDb`, `withAdminDb`), and canonical SQL queries.
  - `@kestrel/data`: Market data adapters (`getPriceWithMeta`, `getCandlesWithMeta`). Never drop freshness/staleness metadata.
  - `@kestrel/indicators`: Pure technical indicator math plus objective swing and session-level structure.
  - `@kestrel/ai`: Mastra agents, committee workflows, tools, memory/RAG, and integer-cent budget reservations.
- **Multi-Tenant & RLS Safety:**
  - Every tenant read/write in RSCs, Server Actions, or Worker jobs MUST run inside `withUserTenant(userId, ...)` (or `withUserTenantRO` for read-only callbacks). Cross-tenant system jobs MUST use `withAdminDb(...)`.
  - Applications (`apps/web`, `apps/worker`) import `getDb` and the scope wrappers from `@kestrel/db`. `@kestrel/ai` keeps its DI-aware `getDb()` internal; it is not re-exported.
- **Boundary Honesty:**
  - `apps/web/src/app/api/**/*.ts` are controllers: they call `@/lib/services/*` and never import `@kestrel/ai`, `@kestrel/data`, or `@kestrel/db` directly (Oxlint enforces `@kestrel/shared` as the only exception).
  - `src/lib/services/*` must contain real domain orchestration or queries, never a 1-line re-export of a package. Pass-through shims and `services/db.ts` escape hatches are forbidden.
- **Protected Guardrails (Never Game or Weaken):**
  - Never modify `scripts/check-*.mjs`, `scripts/maintainability-baseline.json`, `knip.json`, or `packages/config/eslint/index.js` to silence a failure. Fix the underlying code.
  - Never create pass-through re-export shims for moved files; update callers directly and delete the old file.
