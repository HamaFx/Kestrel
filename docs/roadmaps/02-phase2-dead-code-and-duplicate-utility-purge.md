# Phase 2: Dead Code Purge, Duplicate Utility Consolidation & Root-Directory Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete all verified dead code and zero-caller modules, merge duplicated utilities across `packages/shared`, `packages/indicators`, and `apps/web`, and eliminate all 3 `looseRoots` baseline exemptions in `scripts/maintainability-baseline.json`.

**Architecture:** Remove dead files (`url-safety.ts`, `with-user-scope.ts`, deprecated `tradingview-widget.tsx` shim, unused `@kestrel/db` query modules), unify relative-time formatters into `apps/web/src/lib/formatters/datetime.ts`, unify HTTP error helpers into `apps/web/src/lib/http/api/errors.ts`, merge `indicator-registry.ts` and `registry.ts` in `packages/indicators`, and organize loose files in `packages/shared/src`, `packages/db/src`, and `apps/worker/src` into domain folders so `maintainability-baseline.json` becomes completely empty (`{ "ts": {}, "tsx": {}, "looseRoots": {} }`).

**Tech Stack:** TypeScript 7 (`tsrs`), Vitest 5, pnpm workspaces.

**Spec:** `docs/roadmaps/00-kestrel-maintainability-audit-and-master-roadmap.md` (§3.1, §3.2, §4)

**Status: COMPLETE (2026-11-02).** Commits: `f4af821d` (dead modules + SSRF checks), `65c3594a` (formatters/errors/indicator registry), `0c59ba22` (root-directory reorganization + empty baseline).
Verification on the completed tree: full `pnpm test` (15/15 packages, incl. 1893 AI tests and 1510 web tests), `pnpm typecheck` (27 tasks), `pnpm lint` (15/15), `pnpm format:check`, `pnpm check:maintainability` (`0 baselined legacy files`), `pnpm check:route-security`, `pnpm check:env-contract`, `pnpm check:knip-config` all green.

Deviations and findings worth carrying forward:

- **`formatStamp` was not a duplicate.** The local helper in `analyze-fundamental.tsx` renders UTC calendar stamps (`11-02 14:23Z`); `datetime.ts`'s `formatStamp` renders local-time compact stamps. Instead of silently changing the displayed time format, the UTC helper moved into `datetime.ts` as `formatUtcStamp` and the caller imports it. Only `formatRelative` / `formatRelativeTime` were true duplicates (canonical: `formatRelative`).
- `errors.ts` became `errors/index.ts` and `tenant.ts` became `tenant/index.ts`, so `@kestrel/shared/errors` and `./tenant` resolve to directory indexes naturally. All other moved files kept their names.
- A resolve-based codemod rewrote **196 relative specifiers** across shared/db/worker before the `git mv` operations (including `.js`-suffixed worker imports, where directory-index resolution does not apply). The legacy `apps/worker/src/scheduler.ts` re-export shim was deleted and its importers repointed to `./scheduler/index.js`.
- Ancillary path references updated beyond the plan's file list: `knip.json` entries, `scripts/check-maintainability.mjs` static-catalog paths, `scripts/check-env-contract.mjs`, `.github/labeler.yml`, `docs/configuration.md`, `packages/db/AGENTS.md`, and the worker build comment.
- `pnpm knip` after Phase 2: 8 unused files / 359 unused exports / 185 unused exported types. The remaining clusters are Phase 3/4 targets (`api-boundary.ts`, settings `_actions-*`, `xauusd`/legacy tool stacks); the `packages/db/src/queries` dead-query deletions listed in the master roadmap move to Phase 3 Task 1, which owns the split-brain resolution.

## Global Constraints

- Every package `src/` root must have `<= 10` loose `.ts` files (`RULE-F05`).
- Preserve public barrel exports in `packages/shared/src/index.ts`, `packages/db/src/index.ts`, and `packages/indicators/src/index.ts` (except for deleted dead exports) so external workspace imports do not break.
- Run `pnpm typecheck` and package tests after each task.

## Review Focus

- `packages/shared/src/safe-url.ts` (`assertSafeOutboundUrl`, `isSafeOutboundUrl`) defaults to `protocols: ['https:']`. Before deleting `packages/shared/src/url-safety.ts`, ensure `safe-url.ts` also blocks cloud metadata hostnames (`metadata.google.internal`, `instance-data.ec2.internal`, `localhost.localdomain`) and `0.0.0.0/8` + `::` IPv6 unspecified addresses that `url-safety.ts` checked.
- `apps/web/src/lib/formatters/format.ts` (`formatRelative(timestamp: number | string | Date, now?: number)`) accepts `number | string | Date`, whereas `formatRelativeTime(iso: string, now?: number)` in `format-number.ts` only accepted `string`. When merging them into `datetime.ts`, accept `number | string | Date` and alias `formatRelativeTime = formatRelative` (or update the 6 admin table callers) so no caller breaks.
- `packages/shared/package.json` exposes deep subpath exports (`@kestrel/shared/logger`, `@kestrel/shared/encryption`, `@kestrel/shared/env`, `@kestrel/shared/env-secrets`, `@kestrel/shared/vault`, `@kestrel/shared/byok`, `@kestrel/shared/metrics-export`, `@kestrel/shared/log-stream`). Keep subpath entry compatibility via `package.json` `exports` mapping when moving loose files in `packages/shared/src/` into subdirectories!

---

### Task 1: Merge `url-safety.ts` into `safe-url.ts` and Delete Dead Modules (`url-safety.ts`, `with-user-scope.ts`, `tradingview-widget.tsx` shim)

**Files:**

- Modify: `packages/shared/src/safe-url.ts:1-85`
- Modify: `packages/shared/test/safe-url.test.ts:1-40`
- Modify: `packages/shared/src/index.ts:105-115`
- Delete: `packages/shared/src/url-safety.ts`
- Delete: `packages/shared/test/url-safety.test.ts`
- Modify: `packages/db/src/index.ts:44-47`
- Delete: `packages/db/src/with-user-scope.ts`
- Delete: `packages/db/test/with-user-scope.test.ts`
- Delete: `apps/web/src/app/(app)/chart/[symbol]/_components/tradingview-widget.tsx`

**Interfaces:**

- Consumes: `assertSafeOutboundUrl`, `isSafeOutboundUrl` in `packages/shared/src/safe-url.ts`.
- Produces: Unified SSRF URL validator in `packages/shared/src/safe-url.ts`; removal of 3 dead modules and 2 dead test files.

- [x] **Step 1: Add cloud metadata hostnames and `0.0.0.0/8` + `::` checks to `packages/shared/test/safe-url.test.ts`**

Add assertions to `packages/shared/test/safe-url.test.ts`:

```ts
it('blocks cloud metadata hostnames and unspecified addresses', () => {
  expect(isSafeOutboundUrl('https://metadata.google.internal/computeMetadata/v1/')).toBe(false);
  expect(isSafeOutboundUrl('https://instance-data.ec2.internal/latest/meta-data/')).toBe(false);
  expect(isSafeOutboundUrl('https://0.0.0.0/')).toBe(false);
  expect(isSafeOutboundUrl('https://[::]/')).toBe(false);
});
```

- [x] **Step 2: Run `@kestrel/shared` test to verify the new test fails on `metadata.google.internal` / `0.0.0.0`**

Run: `pnpm --filter @kestrel/shared test`  
Expected: FAIL on `metadata.google.internal` and `0.0.0.0`.

- [x] **Step 3: Enhance `packages/shared/src/safe-url.ts` and delete `url-safety.ts`, `with-user-scope.ts`, and the dead `tradingview-widget.tsx` shim**

1. In `packages/shared/src/safe-url.ts`: Add `['0.0.0.0', 8]` to `PRIVATE_IPV4`, add `'metadata.google.internal'`, `'instance-data.ec2.internal'`, `'localhost.localdomain'` to blocked hostnames in `isPrivateHostname`, and check `host === '::'` in `isIpv6`.
2. Remove `export * from './url-safety';` from `packages/shared/src/index.ts` and delete `packages/shared/src/url-safety.ts` and `packages/shared/test/url-safety.test.ts`.
3. Remove `export { withUserScope } from './with-user-scope';` from `packages/db/src/index.ts` and delete `packages/db/src/with-user-scope.ts` and `packages/db/test/with-user-scope.test.ts`.
4. Delete `apps/web/src/app/(app)/chart/[symbol]/_components/tradingview-widget.tsx`.

- [x] **Step 4: Run tests and typecheck to verify everything passes**

Run:

```bash
pnpm --filter @kestrel/shared test
pnpm --filter @kestrel/db test
pnpm typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add -A packages/shared packages/db apps/web
git commit -m "refactor(shared,db,web): remove dead url-safety, with-user-scope, and chart widget shim"
```

---

### Task 2: Consolidate Duplicate Formatters (`formatRelative` / `formatRelativeTime` / `formatStamp`), Error Envelopes (`jsonApiError`), and Indicator Registries

**Files:**

- Modify: `apps/web/src/lib/formatters/datetime.ts:1-130`
- Modify: `apps/web/src/lib/formatters/format-number.ts:1-65`
- Delete: `apps/web/src/lib/formatters/format.ts`
- Modify: `apps/web/src/components/chat/parts/analyze-fundamental.tsx:25-35,125-145`
- Modify: `apps/web/src/lib/http/api/errors.ts:1-95`
- Delete: `apps/web/src/lib/http/api-errors.ts`
- Modify: `packages/indicators/src/registry.ts:1-90`
- Delete: `packages/indicators/src/indicator-registry.ts`
- Modify: `packages/indicators/src/index.ts:1-40`

**Interfaces:**

- Consumes: `apps/web/src/lib/formatters/datetime.ts`, `apps/web/src/lib/http/api/errors.ts`, `packages/indicators/src/registry.ts`.
- Produces: Single canonical `formatRelative` in `datetime.ts`; single `jsonApiError` + `errorResponse` module in `lib/http/api/errors.ts`; single `registry.ts` in `packages/indicators`.

- [x] **Step 1: Move `formatRelative` into `apps/web/src/lib/formatters/datetime.ts` and remove duplicate `formatRelativeTime` and local `formatStamp`**

1. Move `formatRelative(timestamp: number | string | Date, now?: number): string` from `apps/web/src/lib/formatters/format.ts` into `apps/web/src/lib/formatters/datetime.ts`.
2. In `apps/web/src/lib/formatters/format-number.ts`, delete `formatRelativeTime` (keep only `formatMs`, `formatNumber`, `formatAbsoluteTime`).
3. Update imports of `formatRelative` (from `@/lib/formatters/format` → `@/lib/formatters/datetime`) and `formatRelativeTime` (in the 6 `admin/_components/*` files → `formatRelative` from `@/lib/formatters/datetime`), and delete `apps/web/src/lib/formatters/format.ts`.
4. In `apps/web/src/components/chat/parts/analyze-fundamental.tsx`, delete the local `function formatStamp(iso: string)` at line 129 and import `{ formatStamp } from '@/lib/formatters/datetime'`.

- [x] **Step 2: Consolidate `jsonApiError` into `apps/web/src/lib/http/api/errors.ts`**

1. Move `jsonApiError` from `apps/web/src/lib/http/api-errors.ts` into `apps/web/src/lib/http/api/errors.ts` and re-export it from `apps/web/src/lib/http/api/index.ts`.
2. Update the 7 admin routes (`apps/web/src/app/api/admin/{impersonate,flush,onboarding/reset,feedback/[id],diagnostics/trace/[id],users/[id]/role,regression-cases/[id]}/route.ts`) and `apps/web/test/api-errors.test.ts` to import `jsonApiError` from `@/lib/http/api`.
3. Delete `apps/web/src/lib/http/api-errors.ts`.

- [x] **Step 3: Merge `packages/indicators/src/indicator-registry.ts` and `packages/indicators/src/registry.ts`**

Combine `IndicatorRegistry`, `indicatorRegistry`, `IndicatorPlugin`, `parseIndicatorParams`, and `computeIndicator` into `packages/indicators/src/registry.ts` (~240 LOC total, well under the 350 LOC limit), update `packages/indicators/src/index.ts`, and delete `packages/indicators/src/indicator-registry.ts`.

- [x] **Step 4: Run tests and typecheck across `@kestrel/indicators` and `@kestrel/web`**

Run:

```bash
pnpm --filter @kestrel/indicators test
pnpm --filter @kestrel/web test
pnpm typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add -A packages/indicators apps/web
git commit -m "refactor(web,indicators): consolidate duplicate formatters, error helpers, and indicator registry"
```

---

### Task 3: Reorganize Loose Root Files in `packages/shared/src`, `packages/db/src`, and `apps/worker/src` and Empty `maintainability-baseline.json`

**Files:**

- Modify: `packages/shared/package.json`
- Move: loose files in `packages/shared/src/*` into `packages/shared/src/{crypto,observability,domain,errors,runtime}/`
- Move: loose files in `packages/db/src/*` into `packages/db/src/{connection,tenant,ops}/`
- Move: loose files in `apps/worker/src/*` into `apps/worker/src/{runtime,streams,scheduler}/`
- Modify: `scripts/maintainability-baseline.json`

**Interfaces:**

- Consumes: All subpath exports declared in `packages/shared/package.json` and `packages/db/package.json`.
- Produces: `<= 10` loose files in every `src/` root across the entire monorepo; `scripts/maintainability-baseline.json` reduced to `{ "ts": {}, "tsx": {}, "looseRoots": {} }`.

- [x] **Step 1: Group loose files in `packages/shared/src` (currently 23 loose files → `<= 6` loose files)**

Move loose files in `packages/shared/src/` into logical domain subdirectories while updating `packages/shared/src/index.ts` and `packages/shared/package.json` `exports`:

- `src/crypto/`: `encryption.ts`, `byok.ts`, `vault.ts`
- `src/observability/`: `metrics.ts`, `metrics-export.ts` (merge barrel into `src/metrics-export/index.ts`), `observability.ts`, `log-stream.ts`, `logger.ts` (merge barrel into `src/logger/index.ts`)
- `src/errors/`: `errors.ts`, `error-patterns.ts`, `bug-report.ts`, `resilience.ts`
- `src/domain/`: `symbols.ts`, `symbol-catalog.ts` (merge barrel into `src/symbol-catalog/index.ts`), `timeframes.ts`, `market-phase.ts`
- `src/runtime/`: `capabilities.ts`, `container.ts`, `feature-flags.ts`, `safe-url.ts`, `env.ts` (merge into `src/env/index.ts`), `env-secrets.ts` (move into `src/env/secrets.ts`)
- Keep only `src/index.ts` at the root of `packages/shared/src/`! Update `packages/shared/package.json` `exports` (`./encryption` → `./dist/crypto/encryption.js`, `./logger` → `./dist/logger/index.js`, etc.) so all external `@kestrel/shared/<subpath>` imports work without changes.

- [x] **Step 2: Group loose files in `packages/db/src` (currently 12 loose files → `<= 6` loose files)**

Move loose files in `packages/db/src/`:

- Move `tenant.ts` and `with-user-tenant.ts` into `src/tenant/` (`src/tenant/index.ts`).
- Move `rate-limit.ts`, `provider-quota.ts`, `active-users.ts`, `query-cancellation.ts` into `src/ops/`.
- Fold `retention.ts` into `src/retention/index.ts` and `queue.ts` into `src/queue/index.ts` (update `packages/db/package.json` `./queue` export to `./dist/queue/index.js`).
- Keep only `index.ts`, `client.ts`, `migration-plan.ts`, and `test-utils.ts` at the root of `packages/db/src/` (4 files <= 10).

- [x] **Step 3: Group loose files in `apps/worker/src` (currently 14 loose files → `<= 6` loose files)**

Move loose files in `apps/worker/src/`:

- Fold `scheduler.ts` into `src/scheduler/index.ts`.
- Move `base-ws-consumer.ts`, `tick-bus.ts`, `symbol-manager.ts` into `src/streams/`.
- Move `cron-lock.ts`, `plugin-jobs.ts`, `backtest-queue.ts` into `src/scheduler/`.
- Move `http-server.ts`, `healthchecks.ts`, `sd-notify.ts`, `tenant-router.ts` into `src/runtime/`.
- Keep only `index.ts`, `env.ts`, and `log.ts` at the root of `apps/worker/src/` (3 files <= 10).

- [x] **Step 4: Empty `scripts/maintainability-baseline.json` and run `pnpm check:maintainability`**

Write `scripts/maintainability-baseline.json`:

```json
{
  "ts": {},
  "tsx": {},
  "looseRoots": {}
}
```

Run:

```bash
pnpm check:maintainability
pnpm typecheck
pnpm test
```

Expected: `check-maintainability: PASS (0 baselined legacy files)`, `typecheck` PASS, `test` PASS.

- [x] **Step 5: Commit**

```bash
git add -A packages/shared packages/db apps/worker scripts/maintainability-baseline.json
git commit -m "refactor(shared,db,worker): organize loose src root files and clear maintainability baseline to zero"
```
