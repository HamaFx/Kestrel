# Plugin System Roadmap — Phase 1: RLS Tenant Scopes, Streaming Contexts & Query Reliability

> **For Agentic Workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all Postgres Row-Level Security (`SQLSTATE 42501`) failures and missing tenant contexts across `plugin_storage`, public plugin webhooks (`/api/plugins/public/telegram-bot/webhook/:token`), worker jobs (`paperStrategyRunnerJob`), and streaming AI tool/enricher/catalog executions, and fix Backtesting's sweep deletion and SQL query bugs.

**Architecture:**
1. `plugin_storage` and all `plg_*` tables enforce `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` with `tenant_id = current_setting('app.current_tenant', true)`. Every plugin DB entrypoint that may run outside an active `withTenantDb` scope (unauthenticated public routes, streaming chat `ReadableStream` callbacks after `withAuth` returns, and background worker jobs) must establish `withTenantDb(tenantId, ..., { userId })`.
2. Backtesting queries must push `symbol` filtering and `id`/`slug` lookup down into SQL (`drizzle-orm`) and avoid selecting multi-megabyte JSONB columns (`trades`, `equity_curve`, `logs`) when listing run summaries.

**Tech Stack:** TypeScript, Drizzle ORM (`@kestrel/db`), Next.js App Router (`apps/web`), Vitest.

---

## Global Constraints (Must Hold Across All Tasks)

- **Maintainability Gate (`pnpm check:maintainability`)**:
  - `.ts` files: **<= 350 LOC**
  - `.tsx` files: **<= 250 LOC**, **<= 4 `useState`**, **<= 2 `useEffect`**
  - Loose `.ts`/`.tsx` files in package/app `src/` roots: **<= 10**
  - Zero empty `catch {}` blocks without an explanatory comment or structured log.
- **No Over-Engineering**: Do not introduce new abstraction layers or custom connection managers. Reuse `@kestrel/db`'s existing `withTenantDb` and `getScopedDb` primitives.
- **High-Value Tests Only**: Add focused unit/integration tests that directly verify tenant scoping, webhook idempotency under RLS, and SQL filtering—do not add low-value getter/setter coverage tests.

---

## Task 1: Ensure `pluginStorage*` Queries Always Run Inside a Tenant Scope (`P0-1`)

**Files:**
- Modify: `packages/db/src/queries/plugins/storage.ts`
- Test: `packages/db/src/queries/plugins/__tests__/storage.test.ts`

### Context
`packages/db/src/queries/plugins/storage.ts` currently calls `const db = opts?.db ?? getDb();` directly in `pluginStorageGet`, `pluginStorageSet`, `pluginStorageList`, `pluginStorageDelete`, and `pluginStorageClear`. When called from a public webhook route (`/api/plugins/public/telegram-bot/webhook/:token`) or a streaming tool callback where `getScopedDb()` is `undefined`, `getDb()` acquires an unscoped pool connection with `app.current_tenant = ''`. Under `FORCE ROW LEVEL SECURITY` (`0107_plugin_system_tables.sql`), `SELECT` returns 0 rows (breaking Telegram update deduplication) and `INSERT` throws `SQLSTATE 42501`.

### Steps

- [x] **Step 1: Add a `runInPluginTenantScope` helper in `packages/db/src/queries/plugins/storage.ts`**

Update `packages/db/src/queries/plugins/storage.ts` so that whenever `opts?.db` is provided OR `getScopedDb()` is already active, it executes immediately on that handle; otherwise, it resolves `tenantId` (`resolveTenantId(scope.userId, scope.tenantId)`) and wraps the query in `withTenantDb(tenantId, (scopedDb) => fn(scopedDb, tenantId), { userId: scope.userId })`.

```ts
// In packages/db/src/queries/plugins/storage.ts
import { and, asc, eq, gt, isNull, like, or, sql } from 'drizzle-orm';

import { getDb, getScopedDb, withTenantDb } from '../../connection';
import { pluginStorage } from '../../schema';
import { resolveTenantId } from '../../tenant';
import type {
  DbQueryOptions,
  PluginStorageEntry,
  PluginStorageListOptions,
  PluginStorageScope,
  PluginStorageSetOptions,
} from './types';

async function withPluginStorageDb<T>(
  scope: PluginStorageScope,
  opts: DbQueryOptions | undefined,
  fn: (db: ReturnType<typeof getDb>, tenantId: string) => Promise<T>,
): Promise<T> {
  const tenantId = resolveTenantId(scope.userId, scope.tenantId);
  if (opts?.db) {
    return fn(opts.db, tenantId);
  }
  const activeScopedDb = getScopedDb();
  if (activeScopedDb) {
    return fn(activeScopedDb, tenantId);
  }
  return withTenantDb(
    tenantId,
    (scopedDb) => fn(scopedDb, tenantId),
    { userId: scope.userId },
  );
}
```

- [x] **Step 2: Refactor `pluginStorageGet`, `pluginStorageSet`, `pluginStorageList`, `pluginStorageDelete`, and `pluginStorageClear` to use `withPluginStorageDb`**

Replace direct `const db = opts?.db ?? getDb();` calls in all 5 functions in `packages/db/src/queries/plugins/storage.ts` with `withPluginStorageDb(scope, opts, async (db, tenantId) => { ... })`. Keep the file under 240 LOC.

- [x] **Step 3: Write a high-value unit test in `packages/db/src/queries/plugins/__tests__/storage.test.ts`**

Verify that when `getScopedDb()` returns `undefined` and no `opts.db` is passed, `pluginStorageGet` and `pluginStorageSet` automatically invoke `withTenantDb` with the resolved `tenantId` and `userId`, and when `getScopedDb()` is already active, they reuse the active scoped handle without nesting an extra transaction.

- [x] **Step 4: Run verification**
Run: `pnpm --filter @kestrel/db test` and `pnpm --filter @kestrel/db typecheck`

---

## Task 2: Wrap Public Plugin Webhook Dispatch & Telegram Update Execution in `withTenantDb` (`P0-1`)

**Files:**
- Modify: `apps/web/src/lib/services/plugin-api.ts`
- Modify: `plugins/telegram-bot/src/webhook.ts`
- Test: `plugins/telegram-bot/src/__tests__/webhook.test.ts`

### Context
In `apps/web/src/lib/services/plugin-api.ts:210` (`dispatchPluginPublicApiRequest`), `findInstallBySetting` uses `findUserPluginInstallBySettingValue` (which already uses `withRlsBypassDb`), and then `handleTelegramWebhook` (`plugins/telegram-bot/src/webhook.ts:135`) runs `await handleTelegramUpdate(install, updateResult.data)`. Inside `handleTelegramUpdate`, the bot queries `alerts`, `trade_journal`, `plg_paper_trading_accounts`, `plg_paper_trading_positions`, and `user_settings` — all of which have `FORCE ROW LEVEL SECURITY` enabled! Without `withTenantDb(install.tenantId, ..., { userId: install.userId })`, every `/status`, `/positions`, `/alerts`, `/journal`, `/briefing`, or `/ask` command from Telegram fails RLS on tenant-scoped tables.

### Steps

- [x] **Step 1: Wrap `handleTelegramUpdate` and idempotency storage in `withTenantDb` in `plugins/telegram-bot/src/webhook.ts`**

In `plugins/telegram-bot/src/webhook.ts` (around lines 113–145):
- Import `{ withTenantDb } from '@kestrel/db';`
- After resolving `install` (`const install = await ctx.findInstallBySetting('webhookSecretHash', tokenHash);`), execute the deduplication check (`install.storage.get`), `handleTelegramUpdate(install, updateResult.data)`, and `install.storage.set` inside `withTenantDb(install.tenantId, async () => { ... }, { userId: install.userId })`.
- Also make the post-send `install.storage.set` failure non-fatal to the HTTP response (log a `ctx.log.warn` if `storage.set` fails after `handleTelegramUpdate` has already sent the Telegram reply, and still return `jsonResponse({ ok: true })` so Telegram never enters an infinite retry loop).

```ts
// In plugins/telegram-bot/src/webhook.ts
  try {
    return await withTenantDb(
      install.tenantId,
      async () => {
        const idempotencyKey = String(updateResult.data.update_id);
        const already = await install.storage.get<{ processedAt: string }>(
          UPDATE_COLLECTION,
          idempotencyKey,
        );
        if (already) {
          return jsonResponse({ ok: true, deduped: true });
        }

        await handleTelegramUpdate(install, updateResult.data);

        try {
          await install.storage.set(
            UPDATE_COLLECTION,
            idempotencyKey,
            { processedAt: new Date().toISOString() },
            { ttlSeconds: UPDATE_TTL_SECONDS },
          );
        } catch (storageErr) {
          ctx.log.warn('telegram webhook dedupe write failed after handling update', {
            userId: install.userId,
            updateId: updateResult.data.update_id,
            err: storageErr instanceof Error ? storageErr.message : String(storageErr),
          });
        }
        return jsonResponse({ ok: true });
      },
      { userId: install.userId },
    );
  } catch (err) {
```

- [x] **Step 2: Add a high-value webhook test in `plugins/telegram-bot/src/__tests__/webhook.test.ts`**

Test two critical behaviors:
1. Duplicate `update_id` returns `{ ok: true, deduped: true }` without invoking `handleTelegramUpdate` a second time.
2. `handleTelegramWebhook` executes inside `withTenantDb(install.tenantId, ..., { userId: install.userId })` and still returns HTTP 200 `{ ok: true }` if the post-execution idempotency `storage.set` throws, preventing infinite Telegram webhook retry loops.

- [x] **Step 3: Run verification**
Run: `pnpm --filter @kestrel/plugin-telegram-bot test` and `pnpm --filter @kestrel/plugin-telegram-bot typecheck`

---

## Task 3: Wrap `paperStrategyRunnerJob` in `withTenantDb` (`P0-2`)

**Files:**
- Modify: `plugins/paper-trading/src/jobs/strategy-runner.ts`

### Context
`plugins/paper-trading/src/jobs/market-watch.ts:49` and `plugins/paper-trading/src/tick.ts:111` both wrap per-user execution in `withTenantDb(user.tenantId, () => ..., { userId: user.userId })`, whereas `plugins/paper-trading/src/jobs/strategy-runner.ts:43` calls `await runStrategyRunsForUser(user.userId, settings, ctx.signal)` directly without `withTenantDb`.

### Steps

- [x] **Step 1: Add `withTenantDb` wrapper in `plugins/paper-trading/src/jobs/strategy-runner.ts`**

Import `{ withTenantDb } from '@kestrel/db';` in `plugins/paper-trading/src/jobs/strategy-runner.ts` and wrap `runStrategyRunsForUser`:

```ts
// In plugins/paper-trading/src/jobs/strategy-runner.ts
import { withTenantDb } from '@kestrel/db';
// ...
      try {
        const settings = parsePaperSettings(user.settings);
        const outcome = await withTenantDb(
          user.tenantId,
          () => runStrategyRunsForUser(user.userId, settings, ctx.signal),
          { userId: user.userId },
        );
        evaluated += outcome.evaluated;
        flips += outcome.flips;
      } catch (err) {
```

- [x] **Step 2: Run verification**
Run: `pnpm --filter @kestrel/plugin-paper-trading test` and `pnpm --filter @kestrel/plugin-paper-trading typecheck`

---

## Task 4: Ensure Streaming AI Tool Calls, Enrichers, & Agent Catalog Entrypoints Have Active `withTenantDb` Scope (`P1-1`)

**Files:**
- Modify: `packages/ai/src/plugins/mastra-tools.ts`
- Modify: `packages/ai/src/plugins/enrichers.ts`
- Modify: `packages/ai/src/plugins/agent-catalog.ts`
- Modify: `packages/ai/src/plugins/subagent-delegator.ts`

### Context
In Next.js streaming routes (`/api/chat`), `withAuth` wraps the route handler in `withTenantDbFresh`. As soon as `POST /api/chat` returns `new Response(stream)`, `withTenantDbFresh`'s callback resolves and commits the transaction before the stream body finishes executing tool calls or recording agent telemetry. If `getScopedDb()` is `undefined` when a plugin tool, enricher, or custom-agent telemetry recorder runs, any query against RLS-protected tables (`plg_*`, `trade_journal`, `alerts`, `plugin_storage`) fails or lacks `app.current_tenant`.

### Steps

- [x] **Step 1: Add a shared `runWithPluginTenantScope` helper in `packages/ai/src/plugins/runtime.ts` and export it**

In `packages/ai/src/plugins/runtime.ts`, import `{ getScopedDb, resolveTenantId, withTenantDb } from '@kestrel/db';` and export:

```ts
export async function runWithPluginTenantScope<T>(
  userId: string,
  tenantId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (getScopedDb()) {
    return fn();
  }
  const resolvedTenant = resolveTenantId(userId, tenantId);
  return withTenantDb(resolvedTenant, () => fn(), { userId });
}
```

- [x] **Step 2: Wrap `tool.execute`, `entry.enrich`, `entry.listForUser`, `entry.getForUser`, and `entry.recordRun` in `runWithPluginTenantScope`**

1. In `packages/ai/src/plugins/mastra-tools.ts:71`:
   Wrap `await tool.execute(input as never, ctx)` inside `await runWithPluginTenantScope(ctx.userId, ctx.tenantId, () => tool.execute(input as never, ctx))`.
2. In `packages/ai/src/plugins/enrichers.ts:78`:
   Wrap `entry.enrich(...)` inside `runWithPluginTenantScope(input.userId, tenantId, () => entry.enrich(...))`.
3. In `packages/ai/src/plugins/agent-catalog.ts:178,204`:
   Wrap `entry.listForUser({ userId, tenantId })` and `entry.getForUser({ userId, tenantId, idOrSlug })` inside `runWithPluginTenantScope(userId, tenantId, () => ...)`.
4. In `packages/ai/src/plugins/subagent-delegator.ts:87`:
   Wrap `entry.recordRun(record)` inside `runWithPluginTenantScope(record.userId, record.tenantId, () => entry.recordRun!(record))`.

- [x] **Step 3: Run verification**
Run: `pnpm --filter @kestrel/ai test` and `pnpm --filter @kestrel/ai typecheck`

---

## Task 5: Fix Backtesting Sweep Orphan on Uninstall, SQL `symbol` Filtering, & Strategy Lookup (`P1-2`, `P1-3`, `P1-4`)

**Files:**
- Modify: `plugins/backtesting/src/db/queries/runs.ts`
- Modify: `plugins/backtesting/src/db/queries/strategies.ts`
- Modify: `plugins/backtesting/src/services/run-service.ts`
- Test: `plugins/backtesting/src/__tests__/queries.test.ts`

### Context
1. `deleteAllBacktestData(userId)` (`plugins/backtesting/src/db/queries/runs.ts:154`) deletes `backtestRuns` and `backtestStrategies`, leaving `backtestSweeps` rows orphaned when uninstalling with `wipeData: true`.
2. `listRunSummaries` (`plugins/backtesting/src/services/run-service.ts:307`) calls `listBacktestRuns(userId, { limit: opts.limit ?? 10 })` and then filters by `opts.symbol` in JavaScript. If the 10 most recent runs are for `EURUSD` (e.g. from a sweep), querying `symbol: 'XAUUSD'` returns `[]` even when completed `XAUUSD` runs exist! And `listBacktestRuns` does `SELECT *` including `trades`, `equity_curve`, `source`, `logs`, and `rejected_signals` JSONB columns.
3. `getBacktestStrategy(userId, idOrSlug)` (`plugins/backtesting/src/db/queries/strategies.ts:57`) loads all strategies for `userId` into memory and calls `.find()` in JS instead of filtering in SQL.

### Steps

- [x] **Step 1: Update `plugins/backtesting/src/db/queries/runs.ts`**

1. Import `backtestSweeps` from `../tables`.
2. Add `symbol?: string;` to `ListRunsOptions` and push `if (opts.symbol) conditions.push(eq(backtestRuns.symbol, opts.symbol.trim().toUpperCase()));` into the SQL `WHERE` clause in `listBacktestRuns`.
3. Add a lightweight `listBacktestRunSummaryRows(userId: string, opts: ListRunsOptions = {})` function that selects only summary columns (excluding `source`, `trades`, `equityCurve`, `logs`, and `rejectedSignals`) with the same SQL `WHERE` clause (`userId`, `strategyId`, `status`, `symbol`) and `ORDER BY created_at DESC LIMIT ...`.
4. In `deleteAllBacktestData(userId: string)`, also delete from `backtestSweeps`:
```ts
export async function deleteAllBacktestData(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(backtestRuns).where(eq(backtestRuns.userId, userId));
  await db.delete(backtestSweeps).where(eq(backtestSweeps.userId, userId));
  await db.delete(backtestStrategies).where(eq(backtestStrategies.userId, userId));
}
```

- [x] **Step 2: Update `listRunSummaries` in `plugins/backtesting/src/services/run-service.ts`**

Have `listRunSummaries` call `listBacktestRunSummaryRows(userId, { limit: opts.limit ?? 10, status: opts.status, symbol: opts.symbol })` directly so `symbol` is filtered in Postgres before `LIMIT` is applied and heavy JSONB blobs are not transferred.

- [x] **Step 3: Filter `getBacktestStrategy` in SQL in `plugins/backtesting/src/db/queries/strategies.ts`**

Replace the full-table scan in `getBacktestStrategy(userId: string, idOrSlug: string)`:

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getBacktestStrategy(
  userId: string,
  idOrSlug: string,
): Promise<BacktestStrategyRow | null> {
  const db = getDb();
  const key = idOrSlug.trim();
  const matchCondition = UUID_RE.test(key)
    ? or(eq(backtestStrategies.id, key), eq(backtestStrategies.slug, key))
    : eq(backtestStrategies.slug, key);
  const rows = await db
    .select()
    .from(backtestStrategies)
    .where(and(eq(backtestStrategies.userId, userId), matchCondition))
    .limit(1);
  return rows[0] ?? null;
}
```

- [x] **Step 4: Add a focused unit test in `plugins/backtesting/src/__tests__/queries.test.ts`**

Verify that:
1. `deleteAllBacktestData` deletes from `backtestRuns`, `backtestSweeps`, and `backtestStrategies`.
2. `listRunSummaries` passes `symbol` (normalized to uppercase) into the query layer rather than slicing before filtering.

- [x] **Step 5: Run full Phase 1 verification**
Run:
- `pnpm --filter @kestrel/db test`
- `pnpm --filter @kestrel/plugin-backtesting test`
- `pnpm --filter @kestrel/plugin-paper-trading test`
- `pnpm --filter @kestrel/plugin-telegram-bot test`
- `pnpm typecheck`
- `pnpm check:maintainability`

---

## Review Focus (Phase 1 Self-Check)

1. Confirm `packages/db/src/queries/plugins/storage.ts` never executes a raw `getDb()` query without an active `getScopedDb()` or `withTenantDb(...)` wrapper.
2. Confirm `/api/plugins/public/telegram-bot/webhook/:token` executes `install.storage.get`, `handleTelegramUpdate`, and `install.storage.set` inside `withTenantDb(install.tenantId, ..., { userId: install.userId })`.
3. Confirm `plugins/paper-trading/src/jobs/strategy-runner.ts` wraps `runStrategyRunsForUser` in `withTenantDb`.
4. Confirm `deleteAllBacktestData` deletes `backtestSweeps` rows.
5. Confirm all modified `.ts` files remain under 350 LOC (`pnpm check:maintainability`).
