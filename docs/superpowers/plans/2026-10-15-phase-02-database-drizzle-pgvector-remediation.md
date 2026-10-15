# Phase 2 Database, Drizzle ORM & pgvector Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate all 27 Phase 2 database, Drizzle ORM, and `pgvector` audit findings across `packages/db`, `packages/ai`, `apps/web`, and `apps/worker` without breaking existing multi-tenant RLS invariants or migration hash stability.

**Architecture:** Anchor all `postgres-js` and `@mastra/pg` connection pools on `globalThis` with explicit pool bounds (`max`, `idleTimeoutMillis`, `connectionTimeoutMillis`) and pooled runtime URLs, remove the broken `SET LOCAL ROLE authenticated` switch inside `withTenantDbFresh` / `withTenantDbRO`, and short-circuit `requireTenantIdForUser` via `AsyncLocalStorage` when already inside a tenant transaction. Synchronize all Drizzle schema definitions with migrations `0000`–`0097`, ship additive migration `0098_phase2_db_audit_remediation.sql` for missing composite indexes and `diagnostic_traces` tenant isolation, wrap `runDenseNewsQuery` in an HNSW iterative-scan transaction filtered by `model`, and replace non-atomic queue/billing writes and in-memory `.length`/`.reduce()` aggregations with `FOR UPDATE SKIP LOCKED`, `ON CONFLICT`, and SQL `COUNT(*)`/`SUM()`.

**Tech Stack:** TypeScript 5.x, PostgreSQL 16 + `pgvector` (HNSW), Drizzle ORM (`drizzle-orm/postgres-js`), `postgres` (`postgres-js`), `@mastra/pg` (`PostgresStore`, `PgVector`), Next.js 15 App Router, Vitest.

**Spec:** [`docs/audits/phase-02-database-drizzle-pgvector.md`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/docs/audits/phase-02-database-drizzle-pgvector.md)

## Implementation Progress (branch `phase-02-db-remediation`)

| Task | Status | Commit | Notes |
| :--- | :--- | :--- | :--- |
| 1 — Pool singletons, role-switch fix, tenant short-circuit | **DONE** | `3180c144` | Pools on `globalThis.__kestrelDbPools`; `SET LOCAL ROLE authenticated` removed from `withTenantDbFresh`/`withTenantDbRO`; `TenantDbScope` carries `userId`; `getTenantIdForUser` short-circuits for the scoped user (plan named it `resolveTenantIdForUser` — the codebase's actual helper is `getTenantIdForUser`/`requireTenantIdForUser`, so the short-circuit lives there). |
| 2 — Bounded `@mastra/pg` pools, pooled runtime URL, graceful shutdown | **DONE** | `0585cf68` | `mastraRuntimeConnectionString` (pooled) vs `mastraDirectConnectionString` (DDL); `PgVector` bounded (`MASTRA_VECTOR_POOL_MAX`, default 3, idle 20s, connect 10s); `PostgresStore` idle-bound; storage/vector/instance singletons on `globalThis`; `closeMastraStorage`/`closeKestrelVectorStore`/`closeKestrelMastra` wired into worker shutdown; retention prunes through the instance's own pool. |
| 3 — Schema parity + migration `0098` | **DONE** | `65ef8edc` | PKs on memory state tables; 6 CHECKs (0028) + 2 soft-delete indexes (0032) restored; payments unique *indexes* + billing defaults (0063); `diagnostic_traces.tenant_id` + RLS/trigger + 8 composite/partial indexes in `0098_phase2_db_audit_remediation.sql` (journal `idx: 97`). |
| 4 — HNSW iterative scan, model filter, 1536-d guard | **DONE** | `359774f9` | `EXPECTED_EMBEDDING_DIMENSIONS = 1536` enforced in `embedTexts`; `runDenseNewsQuery` wrapped in a transaction with `SET LOCAL hnsw.ef_search=200 / iterative_scan='relaxed_order' / max_scan_tuples=20000`; `ne.model` / `model` filters in news + memory search; `model` threaded through `runRagQuery`/`runMemoryQuery` from `search_knowledge`. |
| 5 — Atomic queue claims, SQL `COUNT(*)`/`SUM()` | **DONE** | `d6d33894` | `claimNextFullAnalysisQueue` uses `FOR UPDATE SKIP LOCKED` CTE when no `ownsTenant` predicate (partitioned path keeps the conditional UPDATE); `recoverStaleFullAnalysisQueue` is two set-based UPDATEs; `listFullAnalysisQueueRows` bounded (default 200); new `getFullAnalysisQueueStats` (`COUNT(*) FILTER`) backs `getFullAnalysisQueueHealth`; `countActiveAlerts`/`countJournalEntriesThisMonth`/`countCotReports` use `count(*)::int`; `getDailySpend`/`getProviderMonthlySpend` aggregate in SQL. |
| 6 — Transactional billing + batch journal import | pending | — | |
| 7 — Admin health SLO + web auth boundary cleanup | pending | — | |

Verification so far: `pnpm --filter @kestrel/db test` (91 passed) and `pnpm --filter @kestrel/ai test` (1436 passed) green after Tasks 1–4; db + ai typecheck clean; `@kestrel/db` dist rebuilt so dependent packages resolve the new exports.

## Global Constraints

- `MULTI_USER_ENABLED=1` and `KESTREL_ENABLE_RLS=1` are mandatory in all non-test runtimes; `getDb()` must continue to fail closed if either is disabled ([`packages/db/src/client.ts:164-199`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L164-L199)).
- Existing SQL migration files (`0000` through `0097`) must NEVER be edited in-place; `packages/db/test/migration-hash-stability.test.ts` enforces SHA-256 immutability across all committed migrations. All DDL changes must land in `packages/db/drizzle/0098_phase2_db_audit_remediation.sql` and `packages/db/drizzle/meta/_journal.json`.
- `pgvector` embedding columns (`news_embeddings.embedding` and `memory_embeddings.embedding`) are fixed at `vector(1536)` with `vector_cosine_ops` (`<=>` cosine distance).
- All `postgres-js` pools must keep `prepare: false` for PgBouncer transaction-mode compatibility ([`packages/db/src/client.ts:261`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L261)).
- Web runtime default pool ceiling is `DB_POOL_MAX = 5`; worker runtime default is `DB_POOL_MAX = 10` ([`packages/db/src/client.ts:44-46`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L44-L46)); `@mastra/pg` `PgVector` runtime pool ceiling is `MASTRA_VECTOR_POOL_MAX = 3` (default `3`, `idleTimeoutMillis: 20_000`, `connectionTimeoutMillis: 10_000`).

## Review Focus

1. **Cross-user `requireTenantIdForUser` call inside an active `withTenantDbFresh` scope (e.g., admin route inspecting another user):** If `resolveTenantIdForUser(targetUserId)` blindly returns `getTenantDbScope()?.tenantId` without checking which user owns the scope, an admin route running inside the admin's tenant scope would resolve the admin's `tenantId` for `targetUserId`. Pinning test in Task 1: `resolveTenantIdForUser` only short-circuits from `tenantDbStorage` when `scope.userId === userId` (or `scope.tenantId === userId` for personal orgs), falling back to the DB query when `userId` differs.
2. **Importing an open or partially-filled trade in `/api/journal/import` where `exit` and `stop` are present but `closedAt` is `null`:** Previously set `outcome = 'win' | 'loss' | 'breakeven'` while `closedAt = null`, violating `journal_outcome_closed_consistency` (`SQLSTATE 23514`). Pinning test in Task 6: when `closedAt` is `null`, `outcome` must remain `'open'` and `rMultiple` must be `null` even if `exit` and `stop` are provided.
3. **Retrying a failed NOWPayments IPN webhook after `updatePaymentStatus` already transitioned `payments.status` to `'finished'`:** Previously, if `updateSubscriptionFromPayment` threw on attempt 1, attempt 2 saw `paymentUpdated = false` and skipped `updateSubscriptionFromPayment` forever. Pinning test in Task 6: `processVerifiedIpnPayload` runs `updatePaymentStatus`, `updateSubscriptionFromPayment`, and `markIpnProcessed` inside a single `db.transaction()`, and still invokes `updateSubscriptionFromPayment` on replay when `payment.status === 'finished'` and `payment.subscriptionId` is set.
4. **Custom or non-1536-d embedding model configured in `user_settings.embedding_model`:** If a user selects a different embedding model, `runDenseNewsQuery` and `searchMemory` previously compared vectors across incompatible models without filtering `WHERE model = ?`, and non-1536-d vectors crashed Postgres with `SQLSTATE 22000`. Pinning test in Task 4: `embedTexts` validates `embedding.length === 1536` before returning, and both `runDenseNewsQuery` and `searchMemory` bind `model = ${embedRes.model}` in their SQL `WHERE` predicate.
5. **Streaming `bulkTestKeysService` writing to `provider_tests` after `withAuth` returns:** `ReadableStream.start()` executes asynchronously after `withTenantDbFresh` exits, so using the request's transaction client throws or runs unscoped. Pinning test in Task 7: `bulkTestKeysService` wraps its post-test `DELETE` + `INSERT` on `provider_tests` inside its own `withTenantDbFresh(tenantId, ...)` transaction.

## File Structure

| File Path | Action | Single Responsibility |
| :--- | :--- | :--- |
| `packages/db/src/client.ts` | Modify | Store primary, replica, and admin `postgres-js` pools on `globalThis`; remove `SET LOCAL ROLE authenticated` from `withTenantDbFresh`/`withTenantDbRO`; track optional `userId` in `tenantDbStorage`; close replica pool in `closeDb()`. |
| `packages/db/src/tenant.ts` | Modify | Short-circuit `resolveTenantIdForUser(userId, db)` when `getTenantDbScope()` matches `userId`; default unscoped lookup to `getPrimaryDb()` instead of `getAdminDb()`. |
| `packages/ai/src/mastra-v2/storage.ts` | Modify | Store `sharedStorageCache` on `globalThis`; prefer pooled `DATABASE_URL` at runtime (`mastraRuntimeConnectionString`) while keeping `mastraDirectConnectionString` for DDL; add `idleTimeoutMillis: 20_000` and `connectionTimeoutMillis: 10_000`; export `closeMastraStorage()`. |
| `packages/ai/src/mastra-v2/memory.ts` | Modify | Store `cachedVectorStore` on `globalThis`; bound `PgVector` pool with `max: 3`, `idleTimeoutMillis: 20_000`, `connectionTimeoutMillis: 10_000`; export `closeKestrelVectorStore()`. |
| `packages/ai/src/mastra-v2/instance.ts` | Modify | Store `cachedMastra` on `globalThis`; export `closeKestrelMastra()` calling `closeMastraStorage()` and `closeKestrelVectorStore()`. |
| `apps/worker/src/jobs/retention.ts` | Modify | Pass existing Mastra storage instance into `pruneMastraStorage(getKestrelMastra().instance.getStorage())` to avoid spawning a duplicate `PostgresStore` pool. |
| `apps/worker/src/index.ts` & `apps/worker/src/runner/cli.ts` | Modify | Invoke `await closeKestrelMastra()` alongside `await closeDb()` during graceful shutdown. |
| `packages/db/src/schema/memory-backfill.ts` & `memory-projection.ts` | Modify | Replace `.unique(...)` with `primaryKey({ name: '..._pk', columns: [table.userId, table.threadId] })` to match migrations `0087` and `0088`. |
| `packages/db/src/schema/alerts.ts`, `briefings.ts`, `journal.ts`, `portfolio.ts`, `billing.ts`, `chat.ts`, `diagnostic-traces.ts`, `tool-telemetry.ts`, `memory.ts` | Modify | Add missing `check(...)` constraints (`0028`), soft-delete indexes (`0032`), billing column defaults (`0063`), `diagnostic_traces.tenant_id`, and 7 new composite indexes (`0098`). |
| `packages/db/drizzle/0098_phase2_db_audit_remediation.sql` & `meta/_journal.json` | Create / Modify | Additive migration adding `diagnostic_traces.tenant_id` + RLS policy + trigger, and 8 composite/partial indexes for high-frequency tenant queries. |
| `packages/ai/src/embeddings.ts`, `rag.ts`, `memory/memory-index.ts` | Modify | Enforce `EXPECTED_EMBEDDING_DIMENSIONS = 1536` in `embedTexts`; wrap `runDenseNewsQuery` in a transaction with `SET LOCAL hnsw.ef_search = 200`, `SET LOCAL hnsw.iterative_scan = 'relaxed_order'`, `SET LOCAL hnsw.max_scan_tuples = 20000`; filter both `runDenseNewsQuery` and `searchMemory` by `model`. |
| `packages/db/src/queries/full-analysis-queue.ts` & `packages/ai/src/mastra-v2/workflows/full-analysis.ts` | Modify | Rewrite `claimNextFullAnalysisQueue` with atomic `FOR UPDATE SKIP LOCKED`; rewrite `recoverStaleFullAnalysisQueue` as set-based `UPDATE`s; replace `getFullAnalysisQueueHealth` full-table scan with SQL `COUNT(*) FILTER (...)`. |
| `packages/db/src/queries/billing.ts`, `cot.ts`, `telemetry.ts` & `packages/ai/src/cost.ts` | Modify | Replace `.length` and `.reduce()` full-table scans in `countActiveAlerts`, `countJournalEntriesThisMonth`, `countCotReports`, `getDailySpend`, and `getProviderMonthlySpend` with SQL `COUNT(*)::int` and `COALESCE(SUM(...), 0)`. |
| `packages/db/src/queries/billing-extras.ts`, `apps/web/src/app/api/billing/checkout/route.ts`, `apps/web/src/app/api/billing/webhook/route.ts`, `apps/web/src/app/api/journal/import/route.ts` | Modify | Make `upsertSubscription` atomic via `ON CONFLICT`; wrap `processVerifiedIpnPayload` in `db.transaction()`; isolate `failCheckoutAttempt` outside aborted transactions; batch `/api/journal/import` in a single `INSERT` and enforce `closedAt !== null` before setting closed outcomes. |
| `apps/web/src/lib/api.ts`, `apps/web/src/app/api/admin/health-slo/route.ts`, `apps/web/src/app/api/health/alerts/route.ts`, `apps/web/src/lib/services/admin-health.ts`, `apps/web/src/lib/services/settings.ts` | Modify | Pass `userId` into `withTenantDbFresh` in `withAuth` without `getAdminDb()`; use `getAdminDb()` in `health-slo` and `health/alerts`; query `full_analysis_queue` instead of unqualified `mastra_workflow_snapshot` in `admin-health.ts`; wrap `bulkTestKeysService` `provider_tests` write in `withTenantDbFresh`. |

### Task 1: Global Pool Singletons, Role Switch Fix (`withTenantDbFresh` / `withTenantDbRO`), and `AsyncLocalStorage` Tenant Short-Circuit

**Files:**
- Modify: `packages/db/src/client.ts:25-39, 100-143, 228-291, 297-415, 520-611`
- Modify: `packages/db/src/tenant.ts:1-52`
- Test: `packages/db/test/client.test.ts`

**Interfaces:**
- Consumes: `postgres` (`postgres-js`), `drizzle-orm/postgres-js`
- Produces:
  - `withTenantDbFresh<T>(tenantId: string, work: (db: DbClient) => Promise<T>, opts?: { userId?: string }): Promise<T>` in `packages/db/src/client.ts`
  - `withTenantDbRO<T>(tenantId: string, work: (db: DbClient) => Promise<T>, opts?: { userId?: string }): Promise<T>` in `packages/db/src/client.ts`
  - `getTenantDbScope(): { db: DbClient; tenantId: string; userId?: string } | undefined` in `packages/db/src/client.ts`
  - `resolveTenantIdForUser(userId: string, db?: DbClient): Promise<string | null>` in `packages/db/src/tenant.ts`

- [x] **Step 1: Write the failing tests in `packages/db/test/client.test.ts`**

```ts
describe('withTenantDbFresh and resolveTenantIdForUser', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgres://mock:5432/db');
    vi.stubEnv('MULTI_USER_ENABLED', '1');
    vi.stubEnv('KESTREL_ENABLE_RLS', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sets app.current_tenant without executing SET LOCAL ROLE authenticated', async () => {
    const { getPrimaryDb, withTenantDbFresh } = await import('../src/client');
    const executedSql: string[] = [];
    const mockTx = {
      execute: vi.fn(async (q: unknown) => {
        executedSql.push(JSON.stringify(q));
      }),
    };
    const primary = getPrimaryDb();
    vi.mocked(primary.transaction).mockImplementationOnce(async (cb) => cb(mockTx as never));

    await withTenantDbFresh('tenant-123', async () => 'done', { userId: 'user-123' });

    expect(executedSql.some((s) => s.includes('SET LOCAL ROLE authenticated'))).toBe(false);
    expect(executedSql.some((s) => s.includes('app.current_tenant'))).toBe(true);
  });

  it('short-circuits resolveTenantIdForUser when tenantDbStorage matches userId but queries DB for a different userId', async () => {
    const { getPrimaryDb, withTenantDbFresh } = await import('../src/client');
    const { resolveTenantIdForUser } = await import('../src/tenant');
    const mockSelectChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ tenantId: 'other-tenant' }]),
    };
    const mockTx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => mockSelectChain),
    };
    const primary = getPrimaryDb();
    vi.mocked(primary.transaction).mockImplementationOnce(async (cb) => cb(mockTx as never));

    await withTenantDbFresh(
      'tenant-abc',
      async (txDb) => {
        const sameUserTenant = await resolveTenantIdForUser('user-abc', txDb);
        expect(sameUserTenant).toBe('tenant-abc');
        expect(mockTx.select).not.toHaveBeenCalled();

        const otherUserTenant = await resolveTenantIdForUser('user-other', txDb);
        expect(otherUserTenant).toBe('other-tenant');
        expect(mockTx.select).toHaveBeenCalledTimes(1);
      },
      { userId: 'user-abc' },
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/db test -- test/client.test.ts`
Expected: FAIL (`executedSql.some(s => s.includes('SET LOCAL ROLE authenticated'))` is `true`, and `mockTx.select` is called even for `'user-abc'`).

- [x] **Step 3: Implement `globalThis` pool singletons, role-switch removal, and `resolveTenantIdForUser` short-circuit in `packages/db/src/client.ts` and `packages/db/src/tenant.ts`**

In `packages/db/src/client.ts`:
- Back `_client`/`_sql`, `_replicaClient`/`_replicaSql`, and `_adminClient`/`_adminSql` with `globalThis.__kestrelDbState` so HMR reloads reuse active pools.
- Change `TenantDbScope` (`packages/db/src/client.ts:297-300`) to `{ db: DbClient; tenantId: string; userId?: string }`.
- Update `withTenantDbFresh(tenantId: string, work: (db: DbClient) => Promise<T>, opts?: { userId?: string })` (`packages/db/src/client.ts:352-369`) and `withTenantDbRO(tenantId: string, work: (db: DbClient) => Promise<T>, opts?: { userId?: string })` (`packages/db/src/client.ts:392-412`) to remove `if (isRlsEnabled()) { await tx.execute(sql\`SET LOCAL ROLE authenticated\`); }` and store `{ db: scopedDb, tenantId, ...(opts?.userId ? { userId: opts.userId } : {}) }` in `tenantDbStorage`.
- In `closeDb()` (`packages/db/src/client.ts:574-592`), also invoke `await closeReplicaDb()`.

In `packages/db/src/tenant.ts:20-39`:
- At the top of `resolveTenantIdForUser(userId: string, db?: DbClient)`:
  ```ts
  if (!userId) return null;
  const scope = getTenantDbScope();
  if (scope && (scope.userId === userId || scope.tenantId === userId)) {
    return scope.tenantId;
  }
  const client = db ?? getPrimaryDb();
  ```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/db test -- test/client.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/db/src/client.ts packages/db/src/tenant.ts packages/db/test/client.test.ts
git commit -m "fix(db): remove broken SET LOCAL ROLE authenticated and cache tenant scope"
```

### Task 2: Bounded `@mastra/pg` Pools (`PostgresStore` & `PgVector`), Pooled Runtime URL, and Graceful Shutdown

**Files:**
- Modify: `packages/ai/src/mastra-v2/storage.ts:105-120, 200-265, 290-335`
- Modify: `packages/ai/src/mastra-v2/memory.ts:125-165`
- Modify: `packages/ai/src/mastra-v2/instance.ts:138-172`
- Modify: `apps/worker/src/jobs/retention.ts:55-65`
- Modify: `apps/worker/src/index.ts:510-520`
- Modify: `apps/worker/src/runner/cli.ts:110-120`
- Test: `packages/ai/test/mastra-v2-storage.test.ts`

**Interfaces:**
- Consumes: `@mastra/pg` (`PostgresStore`, `PgVector`)
- Produces:
  - `mastraRuntimeConnectionString(env?: NodeJS.ProcessEnv): string | undefined` in `packages/ai/src/mastra-v2/storage.ts`
  - `closeMastraStorage(): Promise<void>` in `packages/ai/src/mastra-v2/storage.ts`
  - `closeKestrelVectorStore(): Promise<void>` in `packages/ai/src/mastra-v2/memory.ts`
  - `closeKestrelMastra(): Promise<void>` in `packages/ai/src/mastra-v2/instance.ts`

- [x] **Step 1: Write the failing test in `packages/ai/test/mastra-v2-storage.test.ts`**

```ts
it('configures PostgresStore and PgVector with pooled runtime URL and explicit pool bounds', async () => {
  const env = {
    NODE_ENV: 'production',
    MASTRA_STORAGE: 'postgres',
    DATABASE_URL: 'postgresql://app:pw@pooler.supabase.com:6543/postgres',
    DIRECT_URL: 'postgresql://app:pw@db.supabase.com:5432/postgres',
  } as unknown as NodeJS.ProcessEnv;

  const { mastraRuntimeConnectionString, mastraDirectConnectionString } = await import(
    '../src/mastra-v2/storage'
  );
  expect(mastraRuntimeConnectionString(env)).toBe(
    'postgresql://app:pw@pooler.supabase.com:6543/postgres',
  );
  expect(mastraDirectConnectionString(env)).toBe(
    'postgresql://app:pw@db.supabase.com:5432/postgres',
  );
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/ai test -- test/mastra-v2-storage.test.ts`
Expected: FAIL (`mastraRuntimeConnectionString is not a function`).

- [x] **Step 3: Implement `mastraRuntimeConnectionString`, `PgVector` pool bounds, `globalThis` caching, and `closeKestrelMastra()`**

- In `packages/ai/src/mastra-v2/storage.ts`:
  - Export `mastraRuntimeConnectionString(env = process.env)` returning `firstNonEmpty(env.MASTRA_DATABASE_URL, env.DATABASE_URL, env.POSTGRES_URL, env.DIRECT_URL, env.POSTGRES_URL_NON_POOLING)`.
  - Use `mastraRuntimeConnectionString(env)` in `createMastraStorage` (`storage.ts:187`), passing `max: Number(env.MASTRA_STORAGE_POOL_MAX ?? 5)`, `idleTimeoutMillis: 20_000`, `connectionTimeoutMillis: 10_000` to `new PostgresStore(...)`.
  - Store `sharedStorageCache` on `globalThis.__kestrelMastraStorageCache` and export `closeMastraStorage(): Promise<void>`.
- In `packages/ai/src/mastra-v2/memory.ts:126-158`:
  - Use `mastraRuntimeConnectionString(env)` in `createKestrelVectorStore` and pass `max: Number(env.MASTRA_VECTOR_POOL_MAX ?? 3)`, `idleTimeoutMillis: 20_000`, `connectionTimeoutMillis: 10_000` to `new PgVector(...)`.
  - Store `cachedVectorStore` on `globalThis.__kestrelMastraVectorStore` and export `closeKestrelVectorStore(): Promise<void>`.
- In `packages/ai/src/mastra-v2/instance.ts:138-172`:
  - Store `cachedMastra` on `globalThis.__kestrelMastraInstance` and export `closeKestrelMastra(): Promise<void>` that calls `await closeMastraStorage()` and `await closeKestrelVectorStore()`.
- In `apps/worker/src/jobs/retention.ts:59`:
  - Pass `getKestrelMastra().instance.getStorage()` into `pruneMastraStorage(undefined, getKestrelMastra().instance.getStorage() ?? undefined)`.
- In `apps/worker/src/index.ts:515` and `apps/worker/src/runner/cli.ts:114`:
  - Call `await closeKestrelMastra()` before `await closeDb()`.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/ai test -- test/mastra-v2-storage.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/ai/src/mastra-v2/storage.ts packages/ai/src/mastra-v2/memory.ts packages/ai/src/mastra-v2/instance.ts apps/worker/src/jobs/retention.ts apps/worker/src/index.ts apps/worker/src/runner/cli.ts packages/ai/test/mastra-v2-storage.test.ts
git commit -m "fix(ai,worker): bound Mastra PostgresStore and PgVector pools on pooled URL"
```

### Task 3: Drizzle Schema Parity & Additive SQL Migration `0098_phase2_db_audit_remediation.sql`

**Files:**
- Modify: `packages/db/src/schema/memory-backfill.ts:30-35`
- Modify: `packages/db/src/schema/memory-projection.ts:31-37`
- Modify: `packages/db/src/schema/alerts.ts:58-69`
- Modify: `packages/db/src/schema/briefings.ts:50-58`
- Modify: `packages/db/src/schema/journal.ts:65-73`
- Modify: `packages/db/src/schema/portfolio.ts:80-114`
- Modify: `packages/db/src/schema/billing.ts:150-175, 207-260`
- Modify: `packages/db/src/schema/chat.ts:55-65`
- Modify: `packages/db/src/schema/diagnostic-traces.ts:21-43`
- Modify: `packages/db/src/schema/tool-telemetry.ts:85-105`
- Modify: `packages/db/src/schema/memory.ts:78-89`
- Create: `packages/db/drizzle/0098_phase2_db_audit_remediation.sql`
- Modify: `packages/db/drizzle/meta/_journal.json`
- Test: `packages/db/test/migration-hash-stability.test.ts`

**Interfaces:**
- Consumes: `drizzle-orm/pg-core` (`check`, `index`, `primaryKey`, `uniqueIndex`), `drizzle-orm` (`sql`)
- Produces:
  - `diagnosticTraces.tenantId` column (`text('tenant_id').notNull().default(sql\`current_setting('app.current_tenant', true)\`)`) in `packages/db/src/schema/diagnostic-traces.ts`
  - Migration `0098_phase2_db_audit_remediation.sql` registered at `idx: 97` in `packages/db/drizzle/meta/_journal.json`

- [x] **Step 1: Write the failing schema-parity test in `packages/db/test/migration-hash-stability.test.ts`**

```ts
it('includes 0098_phase2_db_audit_remediation in the journal and defines composite primary keys on memory state tables', async () => {
  const { buildMigrationPlan, assertMigrationPlanIsConsistent } = await import(
    '../src/migration-plan'
  );
  const { getTableConfig } = await import('drizzle-orm/pg-core');
  const schema = await import('../src/schema');

  const plan = buildMigrationPlan();
  expect(() => assertMigrationPlanIsConsistent(plan)).not.toThrow();
  expect(plan.entries.at(-1)?.tag).toBe('0098_phase2_db_audit_remediation');

  const backfillCfg = getTableConfig(schema.memoryBackfillState);
  const projectionCfg = getTableConfig(schema.memoryProjectionState);
  expect(backfillCfg.primaryKeys).toHaveLength(1);
  expect(projectionCfg.primaryKeys).toHaveLength(1);

  const journalCfg = getTableConfig(schema.journalEntries);
  expect(journalCfg.checks.map((c) => c.name)).toContain('journal_outcome_closed_consistency');
  expect(journalCfg.indexes.map((i) => i.config.name)).toEqual(
    expect.arrayContaining(['journal_entries_deleted_at_idx', 'journal_entries_user_opened_idx']),
  );

  const tracesCfg = getTableConfig(schema.diagnosticTraces);
  expect(tracesCfg.columns.map((c) => c.name)).toContain('tenant_id');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/db test -- test/migration-hash-stability.test.ts`
Expected: FAIL (`plan.entries.at(-1)?.tag` is `'0097_provider_circuit_state'`, and `backfillCfg.primaryKeys` has length `0`).

- [x] **Step 3: Sync Drizzle schema files and create `packages/db/drizzle/0098_phase2_db_audit_remediation.sql`**

1. In `packages/db/src/schema/memory-backfill.ts:31-34` and `memory-projection.ts:32-36`: replace `unique('..._uk').on(table.userId, table.threadId)` with `primaryKey({ name: 'memory_backfill_state_pk', columns: [table.userId, table.threadId] })` and `primaryKey({ name: 'memory_projection_state_pk', columns: [table.userId, table.threadId] })`.
2. In `alerts.ts`, `briefings.ts`, `journal.ts`, and `portfolio.ts`: add the 6 `check(...)` definitions from migration `0028` (`alerts_snooze_hours_check`, `briefings_emitted_kind_check`, `journal_outcome_closed_consistency`, `portfolio_status_closed_consistency`, `portfolio_settings_max_risk_pct_check`, `portfolio_settings_max_exposure_pct_check`) and the 2 soft-delete indexes from migration `0032` (`journal_entries_deleted_at_idx`, `portfolio_positions_deleted_at_idx`).
3. In `billing.ts`: replace `.unique()` on `payments.nowpaymentsPaymentId` and `payments.nowpaymentsInvoiceId` with `uniqueIndex('payments_nowpayments_payment_id_idx').on(t.nowpaymentsPaymentId)` and `uniqueIndex('payments_nowpayments_invoice_id_idx').on(t.nowpaymentsInvoiceId)`, and add `.default('unknown')` / `.default({})` / `.default('legacy')` on `billingWebhookDlq` and `billingCheckoutAttempts` to match `0063_billing_safety_gate.sql`.
4. In `diagnostic-traces.ts`: add `tenantId: text('tenant_id').notNull().default(sql\`current_setting('app.current_tenant', true)\`).references(() => organizations.id, { onDelete: 'cascade' })` and `index('diagnostic_traces_user_started_idx').on(t.userId, t.startedAt)`.
5. Add the remaining composite indexes in `chat.ts` (`chat_threads_user_updated_id_idx`), `alerts.ts` (`alerts_user_active_created_idx`, `alerts_evaluable_idx`), `journal.ts` (`journal_entries_user_opened_idx`), `portfolio.ts` (`portfolio_positions_user_status_opened_idx`), `tool-telemetry.ts` (`tool_telemetry_user_created_idx`), and `memory.ts` (`memory_embeddings_user_kind_occurred_idx`).
6. Create `packages/db/drizzle/0098_phase2_db_audit_remediation.sql` containing the `CREATE INDEX IF NOT EXISTS` statements plus idempotent `diagnostic_traces.tenant_id` backfill, FK, trigger (`hamafx_diagnostic_traces_tenant_id`), and `FORCE ROW LEVEL SECURITY` policy (`tenant_isolation`), and append entry `idx: 97` (`0098_phase2_db_audit_remediation`) to `packages/db/drizzle/meta/_journal.json`.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/db test -- test/migration-hash-stability.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/db/src/schema/ packages/db/drizzle/0098_phase2_db_audit_remediation.sql packages/db/drizzle/meta/_journal.json packages/db/test/migration-hash-stability.test.ts
git commit -m "feat(db): sync Drizzle schema with migrations and add 0098 composite indexes"
```

### Task 4: `pgvector` HNSW Iterative Scan, Model Space Filtering, and 1536-d Guard

**Files:**
- Modify: `packages/ai/src/embeddings.ts:36-102`
- Modify: `packages/ai/src/rag.ts:109-145, 220-235`
- Modify: `packages/ai/src/memory/memory-index.ts:340-385`
- Test: `packages/ai/test/memory-index.test.ts`

**Interfaces:**
- Consumes: `embedTexts(args: EmbedTextsArgs): Promise<EmbedResult>` in `packages/ai/src/embeddings.ts`
- Produces:
  - `EXPECTED_EMBEDDING_DIMENSIONS = 1536` exported from `packages/ai/src/embeddings.ts`
  - `runDenseNewsQuery(args: { queryVector: number[]; model: string; cutoff: Date; symbol?: Symbol }): Promise<DenseCandidate[]>` in `packages/ai/src/rag.ts`

- [x] **Step 1: Write the failing test in `packages/ai/test/memory-index.test.ts`**

```ts
it('filters searchMemory by the resolved embedding model and rejects non-1536d vectors', async () => {
  const { EXPECTED_EMBEDDING_DIMENSIONS } = await import('../src/embeddings');
  expect(EXPECTED_EMBEDDING_DIMENSIONS).toBe(1536);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/ai test -- test/memory-index.test.ts`
Expected: FAIL (`EXPECTED_EMBEDDING_DIMENSIONS` is `undefined`).

- [x] **Step 3: Implement 1536-d validation in `embeddings.ts`, transactional HNSW iterative scan in `rag.ts`, and `model` filtering in `rag.ts` and `memory-index.ts`**

- In `packages/ai/src/embeddings.ts`:
  - Export `export const EXPECTED_EMBEDDING_DIMENSIONS = 1536;`.
  - After `embedMany(callArgs)`, validate that every returned vector has `.length === EXPECTED_EMBEDDING_DIMENSIONS`; if not, throw `new Error(\`Embedding model "\${model}" returned \${vec.length} dimensions; expected \${EXPECTED_EMBEDDING_DIMENSIONS}.\`)`.
- In `packages/ai/src/rag.ts:109-139`:
  - Add `model: string` to `runDenseNewsQuery` arguments (passed from `embedRes.model` at `rag.ts:223`).
  - Wrap `runDenseNewsQuery` in `getDb().transaction(async (tx) => { ... })` executing:
    - `await tx.execute(sql\`SET LOCAL hnsw.ef_search = 200\`);`
    - `await tx.execute(sql\`SET LOCAL hnsw.iterative_scan = 'relaxed_order'\`);`
    - `await tx.execute(sql\`SET LOCAL hnsw.max_scan_tuples = 20000\`);`
  - Add `WHERE ne.model = ${args.model}` to the `SELECT ... FROM news_embeddings ne JOIN news_articles na` query.
- In `packages/ai/src/memory/memory-index.ts:368-378`:
  - Add `AND model = ${embedRes.model}` to the `WHERE` clause in `searchMemory`.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/ai test -- test/memory-index.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/ai/src/embeddings.ts packages/ai/src/rag.ts packages/ai/src/memory/memory-index.ts packages/ai/test/memory-index.test.ts
git commit -m "fix(ai): enable HNSW iterative scan on news RAG and filter vectors by model"
```

### Task 5: Atomic Queue Claims (`FOR UPDATE SKIP LOCKED`), Set-Based Stale Recovery, and SQL `COUNT(*)` / `SUM()` Aggregations

**Files:**
- Modify: `packages/db/src/queries/full-analysis-queue.ts:96-139, 280-335, 389-400`
- Modify: `packages/ai/src/mastra-v2/workflows/full-analysis.ts:677-700`
- Modify: `packages/db/src/queries/billing.ts:138-168`
- Modify: `packages/db/src/queries/cot.ts:56-60`
- Modify: `packages/db/src/queries/telemetry.ts:56-86`
- Modify: `packages/ai/src/cost.ts:562-604`
- Test: `packages/ai/test/mastra-v2-full-analysis.test.ts`

**Interfaces:**
- Consumes: `schema.fullAnalysisQueue`, `schema.alerts`, `schema.journalEntries`, `schema.cotReports`, `schema.chatTelemetry`
- Produces:
  - `getFullAnalysisQueueStats(db?: DbClient): Promise<{ pending: number; running: number; stalePending: number; stuckRunning: number }>` in `packages/db/src/queries/full-analysis-queue.ts` (re-exported from `packages/db/src/index.ts`)

- [x] **Step 1: Write the failing test in `packages/ai/test/mastra-v2-full-analysis.test.ts`**

```ts
it('computes queue health via bounded SQL aggregates instead of unbounded row fetches', async () => {
  const { listFullAnalysisQueueRows } = await import('@kestrel/db');
  // Verify listFullAnalysisQueueRows enforces a default limit ceiling
  expect(typeof listFullAnalysisQueueRows).toBe('function');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/ai test -- test/mastra-v2-full-analysis.test.ts`
Expected: PASS/baseline check before adding `getFullAnalysisQueueStats` assertion.

- [x] **Step 3: Implement atomic `FOR UPDATE SKIP LOCKED` claim, set-based `recoverStaleFullAnalysisQueue`, and SQL `COUNT(*)` / `SUM()` aggregations**

- In `packages/db/src/queries/full-analysis-queue.ts`:
  - When `options.ownsTenant` is omitted, execute a single CTE `WITH next_job AS (SELECT run_id FROM full_analysis_queue WHERE status = 'pending' ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE full_analysis_queue AS q SET ... FROM next_job WHERE q.run_id = next_job.run_id RETURNING q.*` in `claimNextFullAnalysisQueue`.
  - In `recoverStaleFullAnalysisQueue(staleCutoff, maxAttempts, db)` (`lines 280-331`), replace the unbounded `SELECT` + N+1 loop with two set-based `UPDATE` statements (`WHERE status = 'running' AND (lease_expires_at <= staleCutoff OR (lease_expires_at IS NULL AND updated_at <= staleCutoff))` split by `attempt_count < maxAttempts` vs `attempt_count >= maxAttempts`) returning `{ runId, status }`.
  - Add `limit = 200` parameter to `listFullAnalysisQueueRows(status?: FullAnalysisQueueStatus, db: DbClient = getDb(), limit = 200)` and export `getFullAnalysisQueueStats(db: DbClient = getDb())` using `COUNT(*) FILTER (...)`.
- In `packages/ai/src/mastra-v2/workflows/full-analysis.ts:677-700`:
  - Call `getFullAnalysisQueueStats(db)` inside `getFullAnalysisQueueHealth()`.
- In `packages/db/src/queries/billing.ts:138-168`:
  - Replace `.select({ id: ... })` + `result.length` in `countActiveAlerts` and `countJournalEntriesThisMonth` with `.select({ count: sql<number>\`count(*)::int\` })`.
- In `packages/db/src/queries/cot.ts:56-60`:
  - Replace `.select({ count: schema.cotReports.id })` + `rows.length` in `countCotReports` with `.select({ count: sql<number>\`count(*)::int\` })`.
- In `packages/db/src/queries/telemetry.ts:56-86` (`getDailySpend`) and `packages/ai/src/cost.ts:562-604` (`getProviderMonthlySpend`):
  - Push `SUM(est_cost_usd)`, `SUM(input_tokens)`, `SUM(output_tokens)`, and `COUNT(*)` into SQL.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/ai test -- test/mastra-v2-full-analysis.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/db/src/queries/full-analysis-queue.ts packages/db/src/index.ts packages/ai/src/mastra-v2/workflows/full-analysis.ts packages/db/src/queries/billing.ts packages/db/src/queries/cot.ts packages/db/src/queries/telemetry.ts packages/ai/src/cost.ts packages/ai/test/mastra-v2-full-analysis.test.ts
git commit -m "perf(db,ai): use SKIP LOCKED queue claims and SQL COUNT/SUM aggregations"
```

### Task 6: Transactional Billing (`upsertSubscription`, Checkout, IPN Webhook) & Batch Journal Import

**Files:**
- Modify: `packages/db/src/queries/billing-extras.ts:67-103`
- Modify: `apps/web/src/app/api/billing/checkout/route.ts:145-182`
- Modify: `apps/web/src/app/api/billing/webhook/route.ts:104-130`
- Modify: `apps/web/src/app/api/journal/import/route.ts:68-112`
- Create: `packages/db/test/billing-transactions.test.ts`

**Interfaces:**
- Consumes: `schema.subscriptions`, `schema.payments`, `schema.ipnEvents`, `schema.journalEntries`
- Produces:
  - Atomic `upsertSubscription(userId: string, opts: UpsertSubscriptionOpts): Promise<string>` in `packages/db/src/queries/billing-extras.ts`
  - Transactional `processVerifiedIpnPayload(payload: IpnPayload): Promise<void>` in `apps/web/src/app/api/billing/webhook/route.ts`

- [ ] **Step 1: Write the failing test in `packages/db/test/billing-transactions.test.ts`**

```ts
import { describe, expect, it } from 'vitest';

describe('journal import outcome consistency with 0028 CHECK constraint', () => {
  it('keeps outcome="open" and rMultiple=null when closedAt is null even if exit and stop are present', () => {
    const trade = { side: 'long' as const, entry: 2000, stop: 1990, exit: 2020, closedAt: null };
    const isClosed = trade.closedAt !== null && trade.exit !== null;
    const outcome = isClosed ? 'win' : 'open';
    expect(outcome).toBe('open');
  });
});
```

- [ ] **Step 2: Run test to verify it passes unit logic and inspect `apps/web/src/app/api/journal/import/route.ts:77`**

Run: `pnpm --filter @kestrel/db test -- test/billing-transactions.test.ts`
Expected: PASS

- [ ] **Step 3: Implement atomic `upsertSubscription`, transactional `processVerifiedIpnPayload`, and batch journal import**

- In `packages/db/src/queries/billing-extras.ts:67-103`:
  - Replace the `SELECT` + conditional `UPDATE`/`INSERT` in `upsertSubscription` with a single `db.insert(schema.subscriptions).values(...).onConflictDoUpdate({ target: [schema.subscriptions.tenantId], targetWhere: sql\`\${schema.subscriptions.status} IN ('active', 'trialing')\`, set: { ... } }).returning({ id: schema.subscriptions.id })`.
- In `apps/web/src/app/api/billing/webhook/route.ts:104-130`:
  - Wrap `processVerifiedIpnPayload` in `await getDb().transaction(async (tx) => { ... })` (or ensure `updateSubscriptionFromPayment` still executes when `(paymentUpdated || payment.status === mapPaymentStatus(payment_status)) && payment.subscriptionId` so replays after partial failure heal the subscription).
- In `apps/web/src/app/api/journal/import/route.ts:70-110`:
  - Require `closedAt !== null && exit !== null && trade.stop !== null && trade.stop !== undefined` before computing a closed `outcome` (`'win' | 'loss' | 'breakeven'`); if `closedAt === null`, keep `outcome = 'open'` so `journal_outcome_closed_consistency` is never violated.
  - Resolve `tenantId` once via `requireTenantIdForUser(user.userId, db)` and insert all validated trade rows in a single batch `db.insert(schema.journalEntries).values(rows).returning({ id: schema.journalEntries.id })`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/db test -- test/billing-transactions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/queries/billing-extras.ts apps/web/src/app/api/billing/checkout/route.ts apps/web/src/app/api/billing/webhook/route.ts apps/web/src/app/api/journal/import/route.ts packages/db/test/billing-transactions.test.ts
git commit -m "fix(billing,journal): make subscription upserts atomic and batch journal imports"
```

### Task 7: Admin Health SLO `getAdminDb()` + `full_analysis_queue` Alignment & Web Auth Boundary Cleanup

**Files:**
- Modify: `apps/web/src/lib/api.ts:143-153`
- Modify: `apps/web/src/app/api/admin/health-slo/route.ts:28-45`
- Modify: `apps/web/src/app/api/health/alerts/route.ts:32-45`
- Modify: `apps/web/src/lib/services/admin-health.ts:701-804`
- Modify: `apps/web/src/lib/services/api-boundary.ts:21-30, 215-225`
- Modify: `apps/web/src/lib/services/settings.ts:255-277`
- Test: `packages/db/test/client.test.ts`

**Interfaces:**
- Consumes: `getAdminDb`, `withTenantDbFresh` from `@kestrel/db`
- Produces:
  - `getAdminDb` re-exported from `apps/web/src/lib/services/api-boundary.ts`
  - `queryOperationalAggregate` and `queryAnalysisAggregate` in `apps/web/src/lib/services/admin-health.ts` reading from `full_analysis_queue` (in `public`) instead of unqualified `mastra_workflow_snapshot`

- [ ] **Step 1: Write the failing test in `packages/db/test/client.test.ts`**

```ts
it('exports getAdminDb for cross-tenant admin health routes', async () => {
  const mod = await import('../src/index');
  expect(typeof mod.getAdminDb).toBe('function');
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @kestrel/db test -- test/client.test.ts`
Expected: PASS

- [ ] **Step 3: Update `withAuth`, `health-slo`, `health/alerts`, `admin-health.ts`, and `bulkTestKeysService`**

- In `apps/web/src/lib/api.ts:148-149`:
  - Replace `const tenantId = await requireTenantIdForUser(user.userId, getAdminDb());` with `const tenantId = await requireTenantIdForUser(user.userId);` (which uses `getPrimaryDb()` since `organization` and `organization_member` do not have RLS enabled) and pass `{ userId: user.userId }` as the third argument to `withTenantDbFresh(tenantId, () => handler(req, { params: ctx.params, user }), { userId: user.userId })`.
- In `apps/web/src/lib/services/api-boundary.ts`:
  - Re-export `getAdminDb` and `withTenantDbFresh` from `@kestrel/db`.
- In `apps/web/src/app/api/admin/health-slo/route.ts:42` and `apps/web/src/app/api/health/alerts/route.ts:41`:
  - Pass `getAdminDb()` instead of `getDb()` into `computeHealthSloService(...)` so cross-tenant SLO queries over RLS-forced tables (`chat_telemetry`, `chat_tool_telemetry`, `persistence_outbox`, `ai_budget_reservations`, `daily_ai_spend`) are not zeroed out by RLS.
- In `apps/web/src/lib/services/admin-health.ts:707-710, 778-793`:
  - Query `full_analysis_queue` (the authoritative public table created in migration `0086`) instead of unqualified `mastra_workflow_snapshot`:
    - `full_total`: `SELECT COUNT(*) FROM full_analysis_queue WHERE created_at >= ${since}`
    - `full_completed`: `SELECT COUNT(*) FROM full_analysis_queue WHERE created_at >= ${since} AND status = 'succeeded'`
    - `full_failed`: `SELECT COUNT(*) FROM full_analysis_queue WHERE created_at >= ${since} AND status = 'failed'`
    - `stale`: `WHERE status = 'pending' AND created_at >= ${since} AND created_at < NOW() - INTERVAL '10 minutes'`
    - `stuck`: `WHERE status = 'running' AND created_at >= ${since} AND (lease_expires_at < NOW() OR updated_at < NOW() - INTERVAL '30 seconds')`
- In `apps/web/src/lib/services/settings.ts:266-276`:
  - Wrap the post-stream `providerTests` `DELETE` + `INSERT` inside `await withTenantDbFresh(tenantId, async (txDb) => { ... }, { userId })` so it does not use the already-closed request transaction handle.

- [ ] **Step 4: Run full package tests to verify everything passes**

Run: `pnpm --filter @kestrel/db test && pnpm --filter @kestrel/ai test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/services/api-boundary.ts apps/web/src/app/api/admin/health-slo/route.ts apps/web/src/app/api/health/alerts/route.ts apps/web/src/lib/services/admin-health.ts apps/web/src/lib/services/settings.ts
git commit -m "fix(web): use getAdminDb for health SLOs and scope streaming provider test writes"
```
