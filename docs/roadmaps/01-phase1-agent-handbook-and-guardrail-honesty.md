# Phase 1: Agent Handbook (`AGENTS.md`), Repo Hygiene & Guardrail Honesty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish deterministic AI-agent context (`AGENTS.md` + `CLAUDE.md`), fix all current lint and formatting failures, remove scratch artifacts, and restore truthful dead-code detection in `knip.json`.

**Architecture:** Un-ignore `AGENTS.md` and `CLAUDE.md` in `.gitignore`, author a concise (<60-line) root `AGENTS.md` plus package-scoped `AGENTS.md` files for `packages/ai`, `packages/db`, `apps/web`, and `apps/worker`, fix the 5 ESLint diagnostics and 36 Prettier warnings, and replace the wildcard `src/**/*.{ts,tsx}` entry globs in `knip.json` with real package entry points.

**Tech Stack:** pnpm 12, Turborepo, TypeScript 7 (`tsrs`), ESLint 9, Prettier 3, Knip 6, Vitest 5.

**Spec:** `docs/roadmaps/00-kestrel-maintainability-audit-and-master-roadmap.md` (§2, §3.1)

**Status: COMPLETE (2026-11-02).** Commits: `01b13d2e` (hygiene, lint, prettier), `7c71f298` (root + package handbooks), `4692c2a0` (Knip honesty + guard script).
Verification on the completed tree: `pnpm lint` (15/15 workspaces, 0 errors / 0 warnings), `pnpm format:check`, `pnpm typecheck` (27 tasks), `pnpm check:maintainability`, `pnpm check:route-security`, `pnpm check:env-contract`, `pnpm check:knip-config` all green; full test suite green.

Deviations and findings worth carrying forward:

- The audit's "1 error, 4 warnings" came from a turbo run that aborted early. A complete `pnpm lint` surfaced 20 additional pre-existing ESLint errors in `packages/ai` (mostly `import()` type annotations in tests, two dead initial assignments, one deep relative import, `console.log` in a script); all were fixed in `01b13d2e` so the "fix all lint failures" goal could actually pass.
- Prettier formatting pushed `apps/web/src/components/chat/parts/compact-telemetry-row.tsx` from 250 to 258 LOC; it was refactored (status class/label constants) back to exactly 250 to keep `RULE-F02` green.
- `@data/*` needed more plumbing than the plan listed to stay build-safe: `packages/data/tsconfig.json` paths, a `packages/data/vitest.config.ts` alias, and generalizing `scripts/rewrite-dist-imports.mjs` to rewrite `@data/*` in published output. Verified by rebuilding `@kestrel/data`.
- `pnpm check:knip-config` is a local script; it is **not yet wired into `.github/workflows/ci-fast.yml`** (CI still runs `pnpm knip` directly). Recommended follow-up.
- With honest entries, `pnpm knip --no-progress` reports 9 unused files / 360 unused exports / 185 unused exported types (real findings: dead re-exports, unused components, dead barrels). Clearing these is Phase 3/4 work; until then the CI Knip step stays red by design rather than by gaming.

## Global Constraints

- Backend `.ts` files MUST stay `<= 350` LOC (`RULE-F01`), React `.tsx` files `<= 250` LOC (`RULE-F02`), `<= 4` `useState`, `<= 2` `useEffect` (`RULE-F03`), enforced by `pnpm check:maintainability`.
- Never weaken `scripts/check-maintainability.mjs`, `scripts/check-route-security.mjs`, or `scripts/check-env-contract.mjs` to make checks pass.
- Root `AGENTS.md` must stay under 65 lines and contain only non-obvious architecture rules, exact verification commands, and strict boundaries.

## Review Focus

- `apps/web/AGENTS.md` contains a `<!-- BEGIN:nextjs-agent-rules -->` block managed by `next dev`; keep that block intact at the top of `apps/web/AGENTS.md` and append Kestrel-specific web rules below it so `next dev` never dirties the working tree.
- `.prettierignore` must ignore `.entire/`, `.opencode/`, and `.tmp/` so agent session logs never break `pnpm format:check`.
- `apps/worker/test/queue-health.test.ts:77` uses `typeof import('@kestrel/db/queue')` which violates `@typescript-eslint/consistent-type-imports`; replace with a top-level `import type * as DbQueueModule from '@kestrel/db/queue'`.
- `packages/data/src/providers/biquote/rest/call.ts` and `ohlc.ts` use `../../../cache/throttle` and `../../../errors` (3 levels up), triggering `no-restricted-imports`; use `@data/cache/throttle` and `@data/errors` (or configure `@data/*` path alias in `packages/data/tsconfig.json`).
- `apps/worker/src/jobs/fred-actuals.ts` uses `import * as ai from '@kestrel/ai'`, triggering `no-restricted-imports`; import `listFredEventsMissingActual`, `parseFredEventId`, `patchEventActual`, and `upsertEvents` via named imports from `@kestrel/ai`.

---

### Task 1: Clean Scratch Files, Fix `.gitignore` & `.prettierignore`, and Restore `lint` + `format:check` to Green

**Files:**

- Modify: `.gitignore:90-102`
- Modify: `.prettierignore:1-20`
- Modify: `apps/worker/test/queue-health.test.ts:15-80`
- Modify: `apps/worker/src/jobs/fred-actuals.ts:24-35`
- Modify: `packages/data/src/providers/biquote/rest/call.ts:20-26`
- Modify: `packages/data/src/providers/biquote/rest/ohlc.ts:24-30`
- Modify: `packages/data/tsconfig.json`

**Interfaces:**

- Consumes: `@kestrel/db/queue`, `@kestrel/ai`, `@kestrel/data` internal modules.
- Produces: Zero errors and zero warnings on `pnpm lint` and `pnpm format:check`.

- [x] **Step 1: Update `.gitignore` to allow tracked `AGENTS.md` and `CLAUDE.md` while ignoring `.entire/` and `.opencode/`**

In `.gitignore`, replace lines 97–102:

```gitignore
# AI agent local state (keep AGENTS.md and CLAUDE.md tracked!)
AGENTS.override.md
CLAUDE.local.md
.agents/
.entire/
.opencode/
.vercel
```

- [x] **Step 2: Update `.prettierignore` to exclude agent runtime directories and scratch folders**

Append to `.prettierignore`:

```prettierignore
.entire
.opencode
.tmp
.agents
.claude
.codex
```

- [x] **Step 3: Fix the ESLint error in `apps/worker/test/queue-health.test.ts` and warning in `apps/worker/src/jobs/fred-actuals.ts`**

In `apps/worker/test/queue-health.test.ts`, add `import type * as DbQueueModule from '@kestrel/db/queue';` at line 25 and change line 77 to:

```ts
vi.mock('@kestrel/db/queue', async (importOriginal) => {
  const actual = await importOriginal<typeof DbQueueModule>();
```

In `apps/worker/src/jobs/fred-actuals.ts`, replace `import * as ai from '@kestrel/ai'` with:

```ts
import {
  listFredEventsMissingActual,
  parseFredEventId,
  patchEventActual,
  upsertEvents,
} from '@kestrel/ai';
```

- [x] **Step 4: Fix the 3 deep-relative import warnings in `packages/data/src/providers/biquote/rest/{call,ohlc}.ts`**

Ensure `packages/data/tsconfig.json` maps `"@data/*": ["./src/*"]` (matching `@ai/*` in `packages/ai/tsconfig.json`), and update `call.ts` and `ohlc.ts` to import from `@data/cache/throttle` and `@data/errors`.

- [x] **Step 5: Run Prettier write and verify `lint`, `format:check`, and `typecheck` all pass with zero warnings**

Run:

```bash
rm -rf .tmp
pnpm format
pnpm lint
pnpm format:check
pnpm typecheck
```

Expected: All commands exit `0` with `0 errors, 0 warnings`.

- [x] **Step 6: Commit**

```bash
git add .gitignore .prettierignore apps/ packages/ docs/
git commit -m "chore(hygiene): unignore AGENTS.md, fix all lint/prettier issues, and ignore agent temp dirs"
```

---

### Task 2: Author Root `AGENTS.md`, `CLAUDE.md`, and Package-Scoped `AGENTS.md` Files

**Files:**

- Create: `AGENTS.md`
- Create: `CLAUDE.md`
- Modify: `apps/web/AGENTS.md`
- Create: `packages/ai/AGENTS.md`
- Create: `packages/db/AGENTS.md`
- Create: `apps/worker/AGENTS.md`

**Interfaces:**

- Consumes: Repository conventions enforced by `scripts/check-maintainability.mjs`, `scripts/check-route-security.mjs`, and `scripts/check-env-contract.mjs`.
- Produces: Deterministic context loaded automatically by Claude Code, Codex, Cursor, Gemini, OpenCode, and Copilot.

- [x] **Step 1: Create root `AGENTS.md` (<60 lines) and `CLAUDE.md`**

Write `/data/home/Kestrel/AGENTS.md`:

```markdown
# Kestrel — Agent Engineering Handbook

Self-hosted multi-user BYOK AI trading research platform (Next.js 16, React 19, Mastra, Drizzle ORM, PostgreSQL 16 + pgvector, Turborepo, pnpm 12, TypeScript 7 `tsrs`).

## Verification Gates (Run Before Every Commit)

- Typecheck all packages: `pnpm typecheck` (uses `tsrs --noEmit`)
- Lint all packages: `pnpm lint`
- Single package test: `pnpm --filter @kestrel/<pkg> test`
- Maintainability & security gates: `pnpm check:maintainability && pnpm check:route-security && pnpm check:env-contract`

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
  - `@kestrel/indicators`: Pure SMC and technical indicator math.
  - `@kestrel/ai`: Mastra agents, committee workflows, tools, memory/RAG, and integer-cent budget reservations.
- **Multi-Tenant & RLS Safety:**
  - Every tenant read/write in RSCs, Server Actions, or Worker jobs MUST run inside `withUserTenant(userId, ...)` (or `withUserTenantRO`). Cross-tenant system jobs MUST use `withAdminDb(...)`.
- **Protected Guardrails (Never Game or Weaken):**
  - Never modify `scripts/check-*.mjs`, `scripts/maintainability-baseline.json`, `knip.json`, or `packages/config/eslint/index.js` to silence a failure. Fix the underlying code.
  - Never create pass-through re-export shims for moved files; update callers directly and delete the old file.
```

Write `/data/home/Kestrel/CLAUDE.md`:

```markdown
@AGENTS.md
```

- [x] **Step 2: Create package-scoped `AGENTS.md` files in `apps/web`, `apps/worker`, `packages/ai`, and `packages/db`**

- In `apps/web/AGENTS.md`: Preserve the `<!-- BEGIN:nextjs-agent-rules -->...<!-- END:nextjs-agent-rules -->` block at lines 1–11, and append rules for `/api/**` routes (`withAuth`, `withAdminAuth`, `withCronAuth`, `parseJsonBody`, `errorResponse`), RSC tenant scoping (`withUserTenantRO`), and UI design tokens (`surface-panel`, `surface-well`, `surface-chip`).
- In `packages/ai/AGENTS.md`: Document Mastra v2 agent/workflow conventions, tool registration, `createGenerationLedger()`, and integer-cent budget reservation rules.
- In `packages/db/AGENTS.md`: Document Drizzle schema conventions (`numeric(20,8)` for accumulated money, `double precision` for OHLC), migration monotonic `when` timestamps in `drizzle/meta/_journal.json`, and `kestrel_app` RLS grants.
- In `apps/worker/AGENTS.md`: Document `JOBS` registry (`src/jobs/index.ts`), `AbortSignal` propagation, `withUserTenant` / `withAdminDb` requirements, and pg-boss dead-letter queues.

- [x] **Step 3: Verify formatting and maintainability checks pass**

Run:

```bash
pnpm format:check && pnpm check:maintainability
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add AGENTS.md CLAUDE.md apps/web/AGENTS.md apps/worker/AGENTS.md packages/ai/AGENTS.md packages/db/AGENTS.md
git commit -m "docs(agents): add root and package-scoped AGENTS.md and CLAUDE.md handbooks"
```

---

### Task 3: Fix `knip.json` Guardrail Gaming to Enable Real Dead-Code Detection

**Files:**

- Modify: `knip.json:1-95`
- Create: `scripts/check-knip-config.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: Workspace `package.json` `exports` fields and Next.js App Router conventions (`page.tsx`, `layout.tsx`, `route.ts`, `actions.ts`, `instrumentation.ts`, `proxy.ts`).
- Produces: Honest `knip.json` configuration where `src/**/*.{ts,tsx}` wildcard entry globs are forbidden.

- [x] **Step 1: Write `scripts/check-knip-config.mjs` to forbid wildcard `src/**/*` entry points in `knip.json`**

```js
#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const knip = JSON.parse(readFileSync(resolve(import.meta.dirname, '../knip.json'), 'utf8'));
const violations = [];
for (const [workspace, cfg] of Object.entries(knip.workspaces ?? {})) {
  for (const entry of cfg.entry ?? []) {
    if (/^src\/\*\*/.test(entry)) {
      violations.push(
        `${workspace}: forbidden wildcard entry "${entry}" (disables dead-file detection)`,
      );
    }
  }
}
if (violations.length > 0) {
  console.error('knip.json validation failed:\n' + violations.map((v) => `  - ${v}`).join('\n'));
  process.exit(1);
}
console.log('knip.json validation passed.');
```

- [x] **Step 2: Run `node scripts/check-knip-config.mjs` to verify it catches the current gamed config**

Run: `node scripts/check-knip-config.mjs`  
Expected: FAIL with 9 workspace violations (`apps/web`, `apps/worker`, `packages/ai`, `packages/data`, `packages/db`, `packages/indicators`, `packages/plugin-sdk`, `packages/test-utils`, `plugins/*`).

- [x] **Step 3: Update `knip.json` to use true entry points for every workspace**

Update `knip.json` so each workspace lists only its real entry points (matching its `package.json` `exports` and Next.js App Router entry files):

- `apps/web`: `["src/app/**/{page,layout,loading,error,not-found,route,opengraph-image}.{ts,tsx}", "src/app/**/actions.ts", "src/instrumentation.ts", "src/proxy.ts", "scripts/**/*.mjs", "test/**/*.{test,spec}.{ts,tsx}", "test/vitest.setup.ts", "tests/**/*.spec.ts"]`
- `apps/worker`: `["src/index.ts", "src/runner/cli.ts", "test/**/*.test.ts"]`
- `packages/ai`: `["src/index.ts", "src/mastra-v2/index.ts", "src/mastra-v2/studio-server.ts", "src/persistence/index.ts", "src/budget/cost.ts", "src/models/{model,byok-providers,circuit-breaker,embeddings}.ts", "src/routing/index.ts", "src/memory/memory-index/index.ts", "src/tools/{index,market,analysis,journal,system,web,by-domain}.ts", "src/eval/*.ts", "src/plugins/index.ts", "test/**/*.test.ts"]`
- `packages/data`: `["src/index.ts", "src/providers/{biquote,binance,finnhub,fred,cftc,marketaux,candles-1m,live-ticks}/index.ts", "src/cache/throttle.ts", "test/**/*.test.ts"]`
- `packages/db`: `["src/index.ts", "src/client.ts", "src/queue.ts", "src/schema/index.ts", "src/queries/index.ts", "scripts/**/*.{ts,mjs}", "test/**/*.test.ts"]`
- `packages/indicators`: `["src/index.ts", "test/**/*.test.ts"]`
- `packages/plugin-sdk`: `["src/index.ts", "src/ui/index.ts", "src/host/index.ts", "test/**/*.test.ts"]`
- `packages/test-utils`: `["src/index.ts", "test/**/*.test.ts"]`
- `plugins/*`: `["src/index.ts", "src/server.ts", "src/ui/index.tsx", "test/**/*.test.ts"]`

- [x] **Step 4: Run `node scripts/check-knip-config.mjs` to verify it passes**

Run: `node scripts/check-knip-config.mjs`  
Expected: PASS (`knip.json validation passed.`).

- [x] **Step 5: Commit**

```bash
git add knip.json scripts/check-knip-config.mjs
git commit -m "chore(knip): replace wildcard src/** entry globs with real workspace entrypoints"
```
