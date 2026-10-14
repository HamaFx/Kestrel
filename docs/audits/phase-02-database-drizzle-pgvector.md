# Kestrel Phase 2 Technical Audit: PostgreSQL, Drizzle ORM & pgvector Architecture

**Repository:** [`HamaFx/Kestrel`](https://github.com/HamaFx/Kestrel) | **Target Revision:** [`c82f247033fc332aa5b7534e4e74aee38019a8f7`](https://github.com/HamaFx/Kestrel/commit/c82f247033fc332aa5b7534e4e74aee38019a8f7) | **Audit Scope:** `packages/db`, `packages/ai`, `packages/data`, `apps/web`, `apps/worker`  
**Operating Gate:** Read-Only Phase 2 Gate (Zero repository files modified; awaiting review and sign-off before applying schema, migration, or code changes)

## Executive Assertion: Connection Pool Multiplication, Role-Grant Deadlocks, and Unfiltered HNSW Joins Threaten Multi-Tenant Stability at Scale

Kestrel's database layer has evolved through 97 migrations ([`packages/db/drizzle/meta/_journal.json:1-691`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/meta/_journal.json#L1-L691)) and 38 Drizzle schema modules ([`packages/db/src/schema/index.ts:1-54`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/index.ts#L1-L54)) into a multi-tenant PostgreSQL + `pgvector` architecture with Row-Level Security (RLS), durable workflow queues, and transactional outbox recovery. However, an end-to-end trace across every database client, migration, vector query, and consumer reveals **27 concrete architectural defects** across four pillars that cause `CONNECTION_CLOSED` pool exhaustion, RLS permission failures, silent vector search recall drops, and race conditions under concurrent load:

| Severity | Count | Key Architectural Risk Summary |
| :--- | :---: | :--- |
| **CRITICAL (P0)** | **6** | (1) `SET LOCAL ROLE authenticated` in `withTenantDbFresh` / `withTenantDbRO` conflicts with migration `0070` (revoked `authenticated` grants) and migration `0094` (`kestrel_app` `NOINHERIT`); (2) Unbounded `PgVector` (`max=10`) + duplicate `PostgresStore` (`max=5`) direct non-pooled pools bypass PgBouncer; (3) Module-scoped pool singletons leak connections across Next.js HMR; (4) `runDenseNewsQuery` lacks `hnsw.iterative_scan` and post-filters joined `news_articles` metadata; (5) `upsertSubscription` race violates `subscriptions_tenant_active_idx`; (6) `claimNextFullAnalysisQueue` & `recoverStaleFullAnalysisQueue` issue N+1 sequential `UPDATE` loops without `FOR UPDATE SKIP LOCKED`. |
| **HIGH (P1)** | **10** | (1) Every `withAuth` web request requires `getAdminDb()` (`ADMIN_DATABASE_URL`), opening a second 5-conn pool per serverless instance; (2) `withCancellablePostgresQuery` creates and destroys a TCP/TLS client per query; (3) `closeDb()` and worker shutdown never close `@mastra/pg` `PostgresStore` or `PgVector` pools; (4) PK vs. Unique constraint drift on `memory_backfill_state` & `memory_projection_state`; (5) Missing 6 SQL `CHECK` constraints and 2 soft-delete indexes in Drizzle schema; (6) `news_embeddings` and `memory_embeddings` hardcode `vector(1536)` and never filter by `model` during `<=>` search; (7) Checkout & IPN webhook multi-step writes lack `db.transaction()`; (8) `countActiveAlerts`, `countJournalEntriesThisMonth`, and `countCotReports` pull full tables into Node.js memory to compute `.length`; (9) `requireTenantIdForUser` executes a redundant DB join even when `AsyncLocalStorage` already holds `tenantId`; (10) `diagnostic_traces` stores user-scoped data without `tenant_id` or RLS isolation. |
| **MEDIUM (P2)** | **7** | (1) Unused `pgEnum` declarations in `enums.ts` vs. `text` columns in schema; (2) Column default drift on `billing_webhook_dlq` & `billing_checkout_attempts`; (3) Journal CSV import (`/api/journal/import`) runs up to 200 sequential `INSERT` + `requireTenantIdForUser` queries outside a batch; (4) `checkAllUsageAlerts` runs a 4-query N+1 loop per user across all users; (5) Unbounded `SELECT` queries in `getDailySpend`, `getProviderMonthlySpend`, `listMtdAgentOpinions`, `computeStats`, and `listFullAnalysisQueueRows`; (6) Missing composite indexes on `alerts(user_id, active, created_at)`, `chat_threads(user_id, updated_at DESC, id DESC)`, `journal_entries(user_id, opened_at DESC)`, and `diagnostic_traces(user_id, started_at DESC)`; (7) Missing foreign keys and `text` vs. `uuid` drift on `thread_id` in `full_analysis_queue`, `mutation_executions`, `memory_backfill_state`, and `memory_projection_state`. |
| **LOW (P3)** | **4** | (1) Journal sequence gap (`0058` → `0060`, missing `0059`) in `_journal.json`; (2) `withUserScope` helper is exported but unused; (3) `/api/admin/architecture-explorer` removed while `/api/admin/health-slo` runs 7 concurrent raw SQL queries on unscoped `getDb()` against RLS-forced tables and unqualified `mastra_workflow_snapshot`; (4) `provider_tests` bulk rewrite in `settings.ts` executes outside the tenant transaction after stream return. |

## Pillar 1: Connection Pool Lifecycle & `CONNECTION_CLOSED` Resilience

### 1.1 Complete Inventory of PostgreSQL Client & Pool Instantiations

Across the monorepo, Kestrel instantiates **14 distinct PostgreSQL clients/pools** using two different driver stacks (`postgres` / `postgres-js` for Drizzle and `pg` / `node-postgres` inside `@mastra/pg`):

| # | Location (`file:line`) | Driver | Singleton Scope | `max` | `idle_timeout` | `connect_timeout` | `max_lifetime` | `prepare` | Closed in `closeDb()`? |
| :-: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | [`packages/db/src/client.ts:250-264`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L250-L264) (`getPrimaryDb`) | `postgres-js` | Module `let _sql` ([`client.ts:28-29`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L28-L29)) | `DB_POOL_MAX` (`5` web / `10` worker) | `DB_IDLE_TIMEOUT` (`20s`) | `DB_CONNECT_TIMEOUT` (`10s`) | `1800s` (30m) | `false` | Yes ([`client.ts:574-592`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L574-L592)) |
| 2 | [`packages/db/src/client.ts:126-140`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L126-L140) (`getDbRO`) | `postgres-js` | Module `let _replicaSql` ([`client.ts:103-104`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L103-L104)) | `DB_POOL_MAX` (`5` / `10`) | `DB_IDLE_TIMEOUT` (`20s`) | `DB_CONNECT_TIMEOUT` (`10s`) | `1800s` (30m) | `false` | Only via `closeReplicaDb()` ([`client.ts:601-610`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L601-L610)) |
| 3 | [`packages/db/src/client.ts:546-559`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L546-L559) (`getAdminDb`) | `postgres-js` | Module `let _adminSql` ([`client.ts:523-524`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L523-L524)) | `DB_POOL_MAX` (`5` / `10`) | `DB_IDLE_TIMEOUT` (`20s`) | `DB_CONNECT_TIMEOUT` (`10s`) | `1800s` (30m) | `false` | Yes ([`client.ts:581-588`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L581-L588)) |
| 4 | [`packages/db/src/query-cancellation.ts:28`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/query-cancellation.ts#L28) (`withCancellablePostgresQuery`) | `postgres-js` | **Ephemeral per-call** | `1` | `5s` | `10s` | **Unset** | `false` | Self-closes in `finally` ([`query-cancellation.ts:33`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/query-cancellation.ts#L33)) |
| 5 | [`packages/ai/src/mastra-v2/storage.ts:208-215`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/storage.ts#L208-L215) (`createMastraStorage`) | `@mastra/pg` (`pg.Pool`) | Module `let cachedMastra` ([`instance.ts:138`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/instance.ts#L138)) | `5` | **Unset** (`10s` `pg` default) | **Unset** (`0` = infinite!) | **Unset** | N/A (`pg`) | **NO** |
| 6 | [`packages/ai/src/mastra-v2/storage.ts:231-259`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/storage.ts#L231-L259) (`getSharedMastraStorage`) | `@mastra/pg` (`pg.Pool`) | Module `let sharedStorageCache` ([`storage.ts:231`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/storage.ts#L231)) | `5` | **Unset** | **Unset** (`0` = infinite!) | **Unset** | N/A (`pg`) | **NO** |
| 7 | [`packages/ai/src/mastra-v2/memory.ts:140-158`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/memory.ts#L140-L158) (`getKestrelVectorStore`) | `@mastra/pg` (`PgVector` `pg.Pool`) | Module `let cachedVectorStore` ([`memory.ts:152`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/memory.ts#L152)) | **Unset (`10` `pg` default!)** | **Unset** | **Unset** (`0` = infinite!) | **Unset** | N/A (`pg`) | **NO** |
| 8 | [`apps/web/scripts/migrate-runtime.mjs:74-86`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/scripts/migrate-runtime.mjs#L74-L86) | `postgres-js` | CLI script | `1` | `10s` | `10s` | `60s` | `false` | CLI exit ([`migrate-runtime.mjs:170`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/scripts/migrate-runtime.mjs#L170)) |
| 9 | [`apps/web/scripts/wait-for-db.mjs:15-20`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/scripts/wait-for-db.mjs#L15-L20) | `postgres-js` | CLI script | `1` | `5s` | `5s` | Unset | Default | CLI exit ([`wait-for-db.mjs:23`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/scripts/wait-for-db.mjs#L23)) |
| 10-14 | [`migrate-apply.mjs:99`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/scripts/migrate-apply.mjs#L99), [`migrate-status.mjs:99`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/scripts/migrate-status.mjs#L99), [`install-extensions.mjs:64`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/scripts/install-extensions.mjs#L64), [`migration-reconcile.mjs:122`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/scripts/migration-reconcile.mjs#L122), [`rotate-encryption-secret.mjs:83`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/scripts/rotate-encryption-secret.mjs#L83) | `postgres-js` | CLI scripts | `1` | `5s`–`20s` | `10s` | `60s` / Unset | `false` | CLI exit |

### 1.2 Detailed Findings — Pillar 1

#### Finding P1-01 (CRITICAL / P0): `SET LOCAL ROLE authenticated` in `withTenantDbFresh` and `withTenantDbRO` Fails Under Migration `0070` and Migration `0094`
- **Locations:**
  - [`packages/db/src/client.ts:362-365`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L362-L365) (`withTenantDbFresh`)
  - [`packages/db/src/client.ts:405-408`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L405-L408) (`withTenantDbRO`)
  - [`packages/db/drizzle/0070_restrict_public_api_grants.sql:8-23`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0070_restrict_public_api_grants.sql#L8-L23)
  - [`packages/db/drizzle/0094_shared_app_role.sql:16-24`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0094_shared_app_role.sql#L16-L24)
  - [`apps/web/src/lib/api.ts:148-149`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/lib/api.ts#L148-L149) (`withAuth`)
  - [`apps/web/src/lib/services/market.ts:77`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/lib/services/market.ts#L77) (`loadUserMarketPrefs`)
- **Root Cause Analysis:**
  1. In [`packages/db/src/client.ts:362-365`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L362-L365) and [`packages/db/src/client.ts:405-408`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L405-L408), whenever `isRlsEnabled()` is `true` (mandatory in production per [`packages/db/src/client.ts:164-199`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L164-L199)), `withTenantDbFresh` and `withTenantDbRO` execute:
     ```ts
     if (isRlsEnabled()) {
       await tx.execute(sql`SET LOCAL ROLE authenticated`);
     }
     await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);
     ```
  2. However, migration [`packages/db/drizzle/0070_restrict_public_api_grants.sql:8-15`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0070_restrict_public_api_grants.sql#L8-L15) explicitly revoked all table and sequence privileges from `authenticated`:
     ```sql
     REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA "public" FROM "anon", "authenticated";
     REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "public" FROM "anon", "authenticated";
     ```
  3. Later, migration [`packages/db/drizzle/0094_shared_app_role.sql:16-39`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0094_shared_app_role.sql#L16-L39) created `kestrel_app` (`WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`) and granted `SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kestrel_app`, **without** granting `authenticated` to `kestrel_app` or restoring table privileges to `authenticated`.
  4. Consequently:
     - When `DATABASE_URL` connects as `kestrel_app`, `SET LOCAL ROLE authenticated` immediately fails with `ERROR: permission denied to set role "authenticated" (SQLSTATE 42501)`.
     - When `DATABASE_URL` connects as `postgres` (or a superuser/pooler role that can `SET ROLE authenticated`), `SET LOCAL ROLE authenticated` switches the transaction's effective role to `authenticated`, which has **zero table grants** after migration `0070`, causing the first query inside `withTenantDbFresh` or `withTenantDbRO` to fail with `ERROR: permission denied for table ... (SQLSTATE 42501)`.
  5. Note also that [`packages/db/test/postgres-rls-isolation.test.ts:33-37`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/test/postgres-rls-isolation.test.ts#L33-L37) creates synthetic policies referencing `current_setting('kestrel.tenant_id', true)` instead of `current_setting('app.current_tenant', true)` and never tests `withTenantDbFresh` against the real migration chain.

#### Finding P1-02 (CRITICAL / P0): Unbounded Direct-Connection `@mastra/pg` Pools (`PostgresStore` + `PgVector`) Bypass PgBouncer and Exhaust `max_connections`
- **Locations:**
  - [`packages/ai/src/mastra-v2/storage.ts:105-115`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/storage.ts#L105-L115) (`mastraDirectConnectionString`)
  - [`packages/ai/src/mastra-v2/storage.ts:208-215`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/storage.ts#L208-L215) (`createMastraStorage`)
  - [`packages/ai/src/mastra-v2/storage.ts:231-259`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/storage.ts#L231-L259) (`getSharedMastraStorage`)
  - [`packages/ai/src/mastra-v2/memory.ts:140-158`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/memory.ts#L140-L158) (`createKestrelVectorStore` / `getKestrelVectorStore`)
  - [`apps/worker/src/jobs/retention.ts:59`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/worker/src/jobs/retention.ts#L59) (`pruneMastraStorage()` called without `existingStorage`)
- **Root Cause Analysis:**
  1. Both `createMastraStorage` ([`packages/ai/src/mastra-v2/storage.ts:187`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/storage.ts#L187)) and `createKestrelVectorStore` ([`packages/ai/src/mastra-v2/memory.ts:130`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/memory.ts#L130)) resolve their connection URL via `mastraDirectConnectionString(env)` ([`packages/ai/src/mastra-v2/storage.ts:105-115`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/storage.ts#L105-L115)), which prioritizes `DIRECT_URL` and `POSTGRES_URL_NON_POOLING` over `DATABASE_URL`.
  2. While DDL migrations legitimately require a non-pooled connection, routing **runtime** Mastra storage and vector operations over `DIRECT_URL` bypasses Supabase's PgBouncer pooler (port `6543`) and connects directly to PostgreSQL (port `5432`, where `max_connections` is typically 60 on small/medium instances).
  3. Worse, `createKestrelVectorStore` ([`packages/ai/src/mastra-v2/memory.ts:140-145`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/memory.ts#L140-L145)) passes **no `max`, `idleTimeoutMillis`, or `connectionTimeoutMillis`** to `new PgVector(...)`:
     ```ts
     return new PgVector({
       id: 'kestrel-mastra-vector',
       connectionString,
       schemaName,
       ...(ssl !== undefined ? { ssl } : {}),
     });
     ```
     Inside `@mastra/pg`, `PgVector` instantiates `new pg.Pool(...)` with `node-postgres` defaults: **`max: 10`**, `connectionTimeoutMillis: 0` (infinite wait!), and `idleTimeoutMillis: 10000`.
  4. In addition, `createMastraStorage` ([`packages/ai/src/mastra-v2/storage.ts:208-215`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/storage.ts#L208-L215)) passes `max: 5` to `new PostgresStore(...)` (without `idleTimeoutMillis` or `connectionTimeoutMillis`), and `getSharedMastraStorage` ([`packages/ai/src/mastra-v2/storage.ts:249-259`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/storage.ts#L249-L259)) creates a **second** `PostgresStore` (`max: 5`) whenever `pruneMastraStorage()` is called without passing `existingStorage`—which happens every day in [`apps/worker/src/jobs/retention.ts:59`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/worker/src/jobs/retention.ts#L59)!
  5. Across just 10 concurrent Vercel serverless instances + 1 worker:
     - Drizzle `_sql` (`5` × 10) + Drizzle `_adminSql` (`5` × 10) = 100 pooled connections.
     - Mastra `PostgresStore` (`5` × 10) + `PgVector` (`10` × 10) + worker (`5 + 5 + 10`) = **170 direct non-pooled PostgreSQL connections**, exhausting PostgreSQL `max_connections` (SQLSTATE `53300`) and causing abrupt `CONNECTION_CLOSED` errors across both web and worker.

#### Finding P1-03 (CRITICAL / P0): Module-Scoped Pool Singletons Leak Connections During Next.js HMR and Lack Graceful Shutdown Coverage
- **Locations:**
  - [`packages/db/src/client.ts:28-29`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L28-L29) (`_client`, `_sql`)
  - [`packages/db/src/client.ts:103-104`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L103-L104) (`_replicaClient`, `_replicaSql`)
  - [`packages/db/src/client.ts:523-524`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L523-L524) (`_adminClient`, `_adminSql`)
  - [`packages/ai/src/mastra-v2/instance.ts:138`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/instance.ts#L138) (`cachedMastra`)
  - [`packages/ai/src/mastra-v2/storage.ts:231`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/storage.ts#L231) (`sharedStorageCache`)
  - [`packages/ai/src/mastra-v2/memory.ts:152`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/memory.ts#L152) (`cachedVectorStore`)
  - [`packages/db/src/client.ts:574-592`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L574-L592) (`closeDb`)
  - [`apps/worker/src/index.ts:515`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/worker/src/index.ts#L515) & [`apps/worker/src/runner/cli.ts:114`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/worker/src/runner/cli.ts#L114)
- **Root Cause Analysis:**
  1. All 6 database/storage singletons are stored in module-scoped `let` variables rather than attached to `globalThis`. In Next.js App Router (`apps/web`), hot module replacement (HMR) and separate route bundle evaluations re-evaluate module scope, stranding previous `postgres()` and `pg.Pool` instances in memory until their idle timers expire (or forever if active).
  2. `closeDb()` ([`packages/db/src/client.ts:574-592`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L574-L592)) closes `_sql` and `_adminSql`, but **does not call `closeReplicaDb()`** ([`packages/db/src/client.ts:601-610`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L601-L610)), and worker shutdown ([`apps/worker/src/index.ts:515`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/worker/src/index.ts#L515), [`apps/worker/src/runner/cli.ts:114`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/worker/src/runner/cli.ts#L114)) never disconnects `cachedVectorStore.disconnect()` or `cachedMastra`'s `PostgresStore`, leaving dangling `pg.Pool` sockets on SIGTERM.

#### Finding P1-04 (HIGH / P1): Every Authenticated Web API Request Instantiates `getAdminDb()` (`ADMIN_DATABASE_URL`) Alongside `getDb()`
- **Locations:**
  - [`apps/web/src/lib/api.ts:148-149`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/lib/api.ts#L148-L149) (`withAuth`)
  - [`packages/db/src/client.ts:535-562`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L535-L562) (`getAdminDb`)
  - [`packages/db/src/client.ts:270-291`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L270-L291) (`requireAdminDbForRls`)
- **Root Cause Analysis:**
  1. In [`apps/web/src/lib/api.ts:148-149`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/lib/api.ts#L148-L149), `withAuth` resolves the user's tenant ID before opening the tenant transaction:
     ```ts
     const tenantId = await requireTenantIdForUser(user.userId, getAdminDb());
     return await withTenantDbFresh(tenantId, () => handler(req, { params: ctx.params, user }));
     ```
  2. Calling `getAdminDb()` in `withAuth` means every Next.js serverless function instance that serves authenticated traffic must have `ADMIN_DATABASE_URL` (the `BYPASSRLS` role `hamafx_admin`) configured in the web tier and maintains **two** active pools (`_adminSql` with `max: 5` and `_sql` with `max: 5`).
  3. Worse, `organization` and `organization_member` **do not have RLS enabled** ([`packages/db/drizzle/0038_phase3_rls_cutover.sql:303-304`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0038_phase3_rls_cutover.sql#L303-L304): *"Tables NOT getting RLS... organization, organization_member, user"*). Therefore, `requireTenantIdForUser` does **not** need a `BYPASSRLS` connection (`getAdminDb()`) to read `organization_member`! Using `getPrimaryDb()` (or encoding `tenantId` in the signed session/proxy header alongside `x-user-id`) eliminates both the need for `ADMIN_DATABASE_URL` in the web runtime and the extra database round-trip + second pool on every request.

#### Finding P1-05 (HIGH / P1): `withCancellablePostgresQuery` Creates an Ephemeral TCP+TLS Connection Per Call
- **Locations:**
  - [`packages/db/src/query-cancellation.ts:14-35`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/query-cancellation.ts#L14-L35)
- **Root Cause Analysis:**
  - `withCancellablePostgresQuery` calls `const client = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 10, prepare: false })` ([`packages/db/src/query-cancellation.ts:21-28`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/query-cancellation.ts#L21-L28)) and `await client.end({ timeout: 5 })` in `finally` ([`packages/db/src/query-cancellation.ts:33`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/query-cancellation.ts#L33)).
  - If used on any request path, every invocation performs a full TCP + TLS + Postgres authentication handshake and tears it down. Currently, `withCancellablePostgresQuery` is exported from [`packages/db/src/index.ts:358`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/index.ts#L358) with zero production call sites, making it dead footgun code that should either be removed or refactored to use `statement_timeout` on a pooled transaction (`SET LOCAL statement_timeout = ...`).

#### Finding P1-06 (LOW / P3): Admin Health & Architecture Explorer Endpoint Audit (`/api/admin/health-slo` & `/api/admin/architecture-explorer`)
- **Locations:**
  - [`apps/web/src/app/api/admin/health-slo/route.ts:39-46`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/app/api/admin/health-slo/route.ts#L39-L46)
  - [`apps/web/src/lib/services/admin-health.ts:217-255`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/lib/services/admin-health.ts#L217-L255) & [`apps/web/src/lib/services/admin-health.ts:618-833`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/lib/services/admin-health.ts#L618-L833)
  - [`apps/web/src/app/api/health/alerts/route.ts:38-50`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/app/api/health/alerts/route.ts#L38-L50)
  - [`apps/web/src/lib/admin-auth.ts:44-75`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/lib/admin-auth.ts#L44-L75)
- **Root Cause Analysis:**
  1. **`/api/admin/architecture-explorer`:** Removed from `apps/web/src/app/api/admin/` (zero references remain in `apps/` or `packages/`; previously static metadata).
  2. **`/api/admin/health-slo` and `/api/health/alerts`:** Both routes pass `getDb()` ([`apps/web/src/app/api/admin/health-slo/route.ts:42`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/app/api/admin/health-slo/route.ts#L42), [`apps/web/src/app/api/health/alerts/route.ts:41`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/app/api/health/alerts/route.ts#L41)) into `computeHealthSloService(db, { hours })`.
  3. Inside `computeHealthSloService` ([`apps/web/src/lib/services/admin-health.ts:239-255`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/lib/services/admin-health.ts#L239-L255)), after `SELECT 1`, **7 concurrent queries** are fired via `Promise.allSettled` against a pool whose default `max` in web is **`5`** ([`packages/db/src/client.ts:45`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L45)):
     - `queryTickAggregate` (`live_ticks`)
     - `queryCronAggregate` (`cron_runs`)
     - `queryToolAggregate` (`chat_tool_telemetry` — **RLS-enabled & forced!**)
     - `queryChatAggregate` (`chat_telemetry` — **RLS-enabled & forced!**)
     - `queryAnalysisAggregate` (`mastra_workflow_snapshot` — unqualified schema name!)
     - `queryOperationalAggregate` (10 scalar subqueries across `mastra_workflow_snapshot`, `chat_telemetry`, `persistence_outbox`, `ai_budget_reservations`, and `diagnostic_traces` — **3 of which have `FORCE ROW LEVEL SECURITY`!**)
     - `queryDailySpendRows` (`daily_ai_spend` — **RLS-enabled & forced!**)
  4. Because `/api/admin/health-slo` uses `withAdminAuth` (not `withAuth`) and calls `getDb()`, if `DATABASE_URL` is connected as the non-bypass `kestrel_app` role (per migration `0094`) without `app.current_tenant` set, **every query against `chat_telemetry`, `chat_tool_telemetry`, `persistence_outbox`, `ai_budget_reservations`, and `daily_ai_spend` returns `0` rows** due to `FORCE ROW LEVEL SECURITY` (`tenant_id = current_setting('app.current_tenant', true)` evaluates to `NULL`)! The admin dashboard will falsely report `0` chat turns, `0` AI tool calls, `0` outbox records, and `$0` daily spend across the entire platform unless it queries via `getAdminDb()`!
  5. Additionally, `queryAnalysisAggregate` ([`apps/web/src/lib/services/admin-health.ts:792`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/lib/services/admin-health.ts#L792)) and `queryOperationalAggregate` ([`apps/web/src/lib/services/admin-health.ts:708-710`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/lib/services/admin-health.ts#L708-L710)) query `FROM mastra_workflow_snapshot` (unqualified, `public` schema), whereas `createMastraStorage` ([`packages/ai/src/mastra-v2/storage.ts:85-95`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/storage.ts#L85-L95)) places Mastra tables in schema **`mastra`** (`DEFAULT_MASTRA_SCHEMA = 'mastra'`)! Unless `search_path` includes `mastra`, `SELECT ... FROM mastra_workflow_snapshot` throws `42P01 (relation "mastra_workflow_snapshot" does not exist)`, which `queryOperationalAggregate` catches and turns into a permanent anomaly: `"Recovery telemetry is unavailable — outbox, budget, trace, and Full-mode health cannot be verified"` ([`apps/web/src/lib/services/admin-health.ts:346-348`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/lib/services/admin-health.ts#L346-L348))!

### 1.3 Pillar 1 Remediation Snippets

```ts
// 1. packages/db/src/client.ts — Store pools on globalThis for HMR safety & fix SET LOCAL ROLE
const globalForDb = globalThis as unknown as {
  __kestrelSql?: ReturnType<typeof postgres> | null;
  __kestrelDb?: DbClient | null;
  __kestrelReplicaSql?: ReturnType<typeof postgres> | null;
  __kestrelReplicaDb?: DbClient | null;
  __kestrelAdminSql?: ReturnType<typeof postgres> | null;
  __kestrelAdminDb?: DbClient | null;
};

// Inside withTenantDbFresh (packages/db/src/client.ts:357-368) and withTenantDbRO (lines 403-411):
// Do NOT switch to `authenticated` (which had all privileges revoked in 0070).
// Rely on the non-bypass connection role (`kestrel_app`):
export async function withTenantDbFresh<T>(
  tenantId: string,
  work: (db: DbClient) => Promise<T>,
): Promise<T> {
  if (!tenantId) {
    throw new Error('[kestrel/db] withTenantDb requires a non-empty tenantId.');
  }
  return getPrimaryDb().transaction(async (tx) => {
    const scopedDb = tx as unknown as DbClient;
    await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);
    return tenantDbStorage.run({ db: scopedDb, tenantId }, () => work(scopedDb));
  });
}
```

```ts
// 2. packages/ai/src/mastra-v2/memory.ts:140-145 — Bound PgVector pool & use pooled URL at runtime
return new PgVector({
  id: 'kestrel-mastra-vector',
  connectionString, // Prefer pooled DATABASE_URL for runtime vector queries
  schemaName,
  max: Number(env.MASTRA_VECTOR_POOL_MAX ?? 3),
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 10_000,
  ...(ssl !== undefined ? { ssl } : {}),
});
```

```ts
// 3. apps/web/src/app/api/admin/health-slo/route.ts:42 & apps/web/src/app/api/health/alerts/route.ts:41
// Use getAdminDb() so cross-tenant SLO aggregates can read RLS-forced tables, and query full_analysis_queue instead of unqualified mastra_workflow_snapshot:
const db = getAdminDb();
const response = await computeHealthSloService(db, { hours });
```

## Pillar 2: Drizzle Schema vs. Migration Drift

### 2.1 Complete Audit of All 38 Schema Files vs. 97 SQL Migrations (`0000`–`0097`)

All **63 active Drizzle tables** across `packages/db/src/schema/*.ts` were cross-checked column-by-column, constraint-by-constraint, and index-by-index against `packages/db/drizzle/0000_*.sql` through `0097_provider_circuit_state.sql` and `packages/db/drizzle/meta/_journal.json`.

| Drift ID | Severity | Schema File (`file:line`) | Migration File (`file:line`) | Drift Category | Exact Discrepancy & Impact |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **D2-01** | **HIGH** | [`memory-backfill.ts:31-34`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/memory-backfill.ts#L31-L34) & [`memory-projection.ts:32-36`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/memory-projection.ts#L32-L36) | [`0087_memory_backfill_state.sql:12`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0087_memory_backfill_state.sql#L12) & [`0088_memory_projection_state.sql:11`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0088_memory_projection_state.sql#L11) | **Primary Key vs. Unique Constraint** | SQL defines `CONSTRAINT "memory_backfill_state_pk" PRIMARY KEY ("user_id", "thread_id")` and `CONSTRAINT "memory_projection_state_pk" PRIMARY KEY ("user_id", "thread_id")`. Drizzle omits `primaryKey()` on both tables and instead declares `unique('memory_backfill_state_user_thread_uk')` and `unique('memory_projection_state_user_thread_uk')`. Next `drizzle-kit generate` will attempt to drop the PKs and add redundant unique constraints. |
| **D2-02** | **HIGH** | [`alerts.ts:42-69`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/alerts.ts#L42-L69), [`briefings.ts:38-58`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/briefings.ts#L38-L58), [`journal.ts:22-73`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/journal.ts#L22-L73), [`portfolio.ts:43-114`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/portfolio.ts#L43-L114) | [`0028_phase2_data_integrity.sql:17-89`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0028_phase2_data_integrity.sql#L17-L89) | **6 Missing `CHECK` Constraints in Drizzle** | Migration `0028` added 6 active `CHECK` constraints (`alerts_snooze_hours_check`, `briefings_emitted_kind_check`, `journal_outcome_closed_consistency`, `portfolio_status_closed_consistency`, `portfolio_settings_max_risk_pct_check`, `portfolio_settings_max_exposure_pct_check`) that are absent from the TypeScript schema files. Furthermore, `/api/journal/import` ([`apps/web/src/app/api/journal/import/route.ts:83-107`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/app/api/journal/import/route.ts#L83-L107)) computes `outcome = 'win' | 'loss' | 'breakeven'` when `exit !== null && stop !== null` even if `closedAt === null`, which **violates `journal_outcome_closed_consistency`** at runtime (`SQLSTATE 23514`)! |
| **D2-03** | **HIGH** | [`journal.ts:66-73`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/journal.ts#L66-L73) & [`portfolio.ts:81-86`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/portfolio.ts#L81-L86) | [`0032_phase8_soft_delete_enums_fts.sql:17-20`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0032_phase8_soft_delete_enums_fts.sql#L17-L20) | **2 Missing Soft-Delete Indexes in Drizzle** | Migration `0032` created `journal_entries_deleted_at_idx` on `journal_entries("deleted_at")` and `portfolio_positions_deleted_at_idx` on `portfolio_positions("deleted_at")`. Neither index is declared in `journal.ts` or `portfolio.ts`. (Additionally, neither `journal.ts` queries nor `portfolio.ts` queries filter `WHERE deleted_at IS NULL`!) |
| **D2-04** | **HIGH** | [`billing.ts:153-175`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/billing.ts#L153-L175) | [`0040_phase8_billing_nowpayments.sql:80-81`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0040_phase8_billing_nowpayments.sql#L80-L81) & [`0063_billing_safety_gate.sql:306-315`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0063_billing_safety_gate.sql#L306-L315) | **Unique Constraint vs. Unique Index Drift on `payments`** | In `billing.ts:153-155`, `nowpaymentsPaymentId` and `nowpaymentsInvoiceId` use `.unique()` (which maps to SQL `UNIQUE` constraints `payments_nowpayments_payment_id_unique` / `payments_nowpayments_invoice_id_unique`), whereas migration `0063` created `CREATE UNIQUE INDEX "payments_nowpayments_payment_id_idx"` and `CREATE UNIQUE INDEX "payments_nowpayments_invoice_id_idx"`. |
| **D2-05** | **HIGH** | [`diagnostic-traces.ts:21-43`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/diagnostic-traces.ts#L21-L43) | [`0042_feature_flags_and_diagnostic_traces.sql:13-42`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0042_feature_flags_and_diagnostic_traces.sql#L13-L42) & [`0090_rls_late_tenant_tables.sql:9-11`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0090_rls_late_tenant_tables.sql#L9-L11) | **User-Scoped Table Missing `tenant_id` & RLS** | `diagnostic_traces` stores `user_id` (`REFERENCES "user"("id") ON DELETE CASCADE`), `thread_id`, and full AI execution trace payloads, and is queried by user-facing routes ([`packages/db/src/queries/diagnostic-traces.ts:115-153`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/diagnostic-traces.ts#L115-L153)) and GDPR export ([`apps/web/src/app/(app)/settings/_actions-data.ts:354`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/app/(app)/settings/_actions-data.ts#L354)), yet has **no `tenant_id` column and no RLS policy**. Under `withTenantDbFresh`, any query omitting `eq(diagnosticTraces.userId, userId)` can read across tenants. |
| **D2-06** | **MEDIUM** | [`enums.ts:33-45`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/enums.ts#L33-L45) vs. [`auth.ts:43`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/auth.ts#L43), [`journal.ts:47`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/journal.ts#L47), [`portfolio.ts:68`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/portfolio.ts#L68), [`briefings.ts:50`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/briefings.ts#L50), [`bot-links.ts:42`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/bot-links.ts#L42) | [`0032_phase8_soft_delete_enums_fts.sql:26-88`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0032_phase8_soft_delete_enums_fts.sql#L26-L88) & [`0047_sturdy_longshot.sql:1-16`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0047_sturdy_longshot.sql#L1-L16) | **5 Orphaned `pgEnum` Types Never Bound to Columns** | `enums.ts` defines `userRoleEnum`, `journalOutcomeEnum`, `portfolioStatusEnum`, `briefingKindEnum`, and `botPlatformEnum` and states *"The schema files reference these enums"*, but all 5 target columns in `auth.ts`, `journal.ts`, `portfolio.ts`, `briefings.ts`, and `bot-links.ts` are typed as plain `text(...)` in both Drizzle and Postgres. |
| **D2-07** | **MEDIUM** | [`billing.ts:207-260`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/billing.ts#L207-L260) | [`0063_billing_safety_gate.sql:88-102`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0063_billing_safety_gate.sql#L88-L102) & [`0063_billing_safety_gate.sql:214-224`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0063_billing_safety_gate.sql#L214-L224) | **Column `DEFAULT` Drift on Billing Tables** | Migration `0063` set `DEFAULT 'unknown'` on `billing_webhook_dlq.event_type`, `event_id`, `error`, `DEFAULT '{}'::jsonb` on `billing_webhook_dlq.payload`, and `DEFAULT 'legacy'` on `billing_checkout_attempts.idempotency_key`. None of these defaults exist in `billing.ts:207-260`. |
| **D2-08** | **MEDIUM** | [`full-analysis-queue.ts:30`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/full-analysis-queue.ts#L30), [`mutation-executions.ts:29`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/mutation-executions.ts#L29), [`memory-backfill.ts:18`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/memory-backfill.ts#L18), [`memory-projection.ts:20`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/memory-projection.ts#L20), [`ai-quality-results.ts:27`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/ai-quality-results.ts#L27), [`diagnostic-traces.ts:25`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/diagnostic-traces.ts#L25), [`telemetry.ts:102-107`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/telemetry.ts#L102-L107), [`tool-telemetry.ts:47-53`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/tool-telemetry.ts#L47-L53) | [`0085_mutation_executions.sql:9`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0085_mutation_executions.sql#L9), [`0086_full_analysis_queue.sql:9`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0086_full_analysis_queue.sql#L9), [`0087_memory_backfill_state.sql:4`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0087_memory_backfill_state.sql#L4), [`0088_memory_projection_state.sql:4`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0088_memory_projection_state.sql#L4) | **Type Mismatch (`text` vs `uuid`) & Missing FKs on `thread_id`** | `chat_threads.id` is `uuid` ([`packages/db/src/schema/chat.ts:37`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/chat.ts#L37)). While `chat_messages.thread_id`, `agent_opinions.thread_id`, `ai_message_feedback.thread_id`, `ai_regression_cases.thread_id`, and `ai_shadow_comparisons.thread_id` are `uuid` with `REFERENCES chat_threads(id) ON DELETE CASCADE`, 6 newer tables (`full_analysis_queue`, `mutation_executions`, `memory_backfill_state`, `memory_projection_state`, `ai_quality_results`, `diagnostic_traces`) store `thread_id` as unvalidated `text` with **no foreign key**, requiring manual cleanup in `deleteThreadMemoryState` ([`packages/ai/src/persistence/thread-persistence.ts:248-284`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/persistence/thread-persistence.ts#L248-L284)) and leaving orphaned rows in `full_analysis_queue`, `mutation_executions`, and `ai_quality_results` when a thread is deleted. |
| **D2-09** | **LOW** | [`packages/db/drizzle/meta/_journal.json:410-423`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/meta/_journal.json#L410-L423) | `packages/db/drizzle/0058_*.sql` → `0060_*.sql` | **Migration Sequence Gap (`0059` Missing)** | `_journal.json` jumps from `idx: 58` (`0058_drop_linked_signal_id`) to `idx: 59` (`0060_provider_health`), skipping prefix `0059`. While all 97 journal entries match the 97 `.sql` files on disk, custom tooling that assumes `idx === prefix_number` after `0058` will off-by-one. |

### 2.2 Pillar 2 Remediation Snippets

```ts
// 1. packages/db/src/schema/memory-backfill.ts:31-34 — Align PK with 0087_memory_backfill_state.sql
  (table) => [
    primaryKey({ name: 'memory_backfill_state_pk', columns: [table.userId, table.threadId] }),
    index('memory_backfill_state_tenant_idx').on(table.tenantId, table.updatedAt),
  ],

// 2. packages/db/src/schema/memory-projection.ts:32-36 — Align PK with 0088_memory_projection_state.sql
  (table) => [
    primaryKey({ name: 'memory_projection_state_pk', columns: [table.userId, table.threadId] }),
    index('memory_projection_state_status_idx').on(table.status, table.updatedAt),
    index('memory_projection_state_tenant_idx').on(table.tenantId, table.updatedAt),
  ],
```

```ts
// 3. packages/db/src/schema/journal.ts:66-73 — Add missing CHECK constraint (0028) & soft-delete index (0032)
import { check, index, pgTable, ... } from 'drizzle-orm/pg-core';
  (t) => [
    index('journal_entries_user_id_idx').on(t.userId),
    index('journal_entries_tenant_opened_idx').on(t.tenantId, t.openedAt),
    index('journal_symbol_idx').on(t.symbol),
    index('journal_opened_idx').on(t.openedAt),
    index('journal_entries_deleted_at_idx').on(t.deletedAt),
    check(
      'journal_outcome_closed_consistency',
      sql`(${t.outcome} = 'open' AND ${t.closedAt} IS NULL) OR (${t.outcome} IN ('win', 'loss', 'breakeven') AND ${t.closedAt} IS NOT NULL)`,
    ),
  ],
```

```ts
// 4. packages/db/src/schema/portfolio.ts:81-114 — Add missing CHECK constraints (0028) & soft-delete index (0032)
  // On portfolioPositions:
  (t) => [
    index('portfolio_positions_user_status_idx').on(t.userId, t.status),
    index('portfolio_positions_symbol_idx').on(t.symbol, t.status),
    index('portfolio_positions_deleted_at_idx').on(t.deletedAt),
    check(
      'portfolio_status_closed_consistency',
      sql`(${t.status} = 'open' AND ${t.closedAt} IS NULL) OR (${t.status} = 'closed' AND ${t.closedAt} IS NOT NULL)`,
    ),
  ],
  // On portfolioSettings:
  (t) => [
    uniqueIndex('portfolio_settings_user_idx').on(t.userId),
    check('portfolio_settings_max_risk_pct_check', sql`${t.maxRiskPerTradePct} >= 0 AND ${t.maxRiskPerTradePct} <= 100`),
    check('portfolio_settings_max_exposure_pct_check', sql`${t.maxTotalExposurePct} >= 0 AND ${t.maxTotalExposurePct} <= 100`),
  ],
```

## Pillar 3: `pgvector` Indexing & Similarity Query Performance

### 3.1 Inventory of Vector Columns, Indexes, and Similarity Queries

Kestrel maintains **3 vector stores** across PostgreSQL:

| Vector Store | Schema / Table (`file:line`) | Column & Dimension | Index Type & Operator Class | Distance Operator Used | Query Call Site (`file:line`) | HNSW Session Tuning |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. News RAG Embeddings** | [`packages/db/src/schema/news.ts:68-80`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/news.ts#L68-L80) (`public.news_embeddings`) | `embedding vector(1536)` | `USING hnsw (embedding vector_cosine_ops)` ([`news.ts:79`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/news.ts#L79), [`0016_add_hnsw_indexes.sql:15-17`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0016_add_hnsw_indexes.sql#L15-L17)) | `<=>` (Cosine distance) | [`packages/ai/src/rag.ts:116-135`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/rag.ts#L116-L135) (`runDenseNewsQuery`) | **NONE** (No `ef_search`, no `iterative_scan`!) |
| **2. User Memory Index** | [`packages/db/src/schema/memory.ts:49-89`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/memory.ts#L49-L89) (`public.memory_embeddings`) | `embedding vector(1536)` | `USING hnsw (embedding vector_cosine_ops)` ([`memory.ts:84`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/memory.ts#L84), [`0016_add_hnsw_indexes.sql:20-22`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0016_add_hnsw_indexes.sql#L20-L22)) | `<=>` (Cosine distance) | [`packages/ai/src/memory/memory-index.ts:352-383`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/memory/memory-index.ts#L352-L383) (`searchMemory`) | `ef_search = 100`, `iterative_scan = 'relaxed_order'`, `max_scan_tuples = 20000` |
| **3. Mastra Observational Memory** | [`packages/ai/src/mastra-v2/memory.ts:140-158`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/memory.ts#L140-L158) (`mastra` schema via `@mastra/pg` `PgVector`) | Managed by `@mastra/pg` (`1536` default) | `@mastra/pg` default index | `@mastra/pg` internal | [`packages/ai/src/mastra-v2/memory.ts:218-245`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/memory.ts#L218-L245) | Managed by `@mastra/pg` |

### 3.2 Detailed Findings — Pillar 3

#### Finding P3-01 (CRITICAL / P0): `runDenseNewsQuery` Executes a Cross-Table Join (`news_embeddings` ⋈ `news_articles`) Without `hnsw.iterative_scan` or Metadata Pre-Filtering
- **Locations:**
  - [`packages/ai/src/rag.ts:109-139`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/rag.ts#L109-L139) (`runDenseNewsQuery`)
  - [`packages/db/src/schema/news.ts:24-80`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/news.ts#L24-L80) (`newsArticles` & `newsEmbeddings`)
- **Root Cause Analysis:**
  1. Look at the SQL executed by `runDenseNewsQuery` ([`packages/ai/src/rag.ts:116-135`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/rag.ts#L116-L135)):
     ```sql
     SELECT
       na.id, na.title, na.summary, na.url, na.source, na.publisher,
       na.published_at, na.symbols, na.sentiment,
       (1 - (ne.embedding <=> ${vec}::vector)) AS similarity
     FROM news_embeddings ne
     JOIN news_articles na ON na.id = ne.article_id
     WHERE na.published_at >= ${ cutoff.toISOString() }
       AND (${args.symbol ?? null}::text IS NULL OR na.symbols && ARRAY[${args.symbol ?? ''}]::text[])
     ORDER BY ne.embedding <=> ${vec}::vector
     LIMIT ${CANDIDATE_POOL}
     ```
  2. Unlike `searchMemory` ([`packages/ai/src/memory/memory-index.ts:352-355`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/memory/memory-index.ts#L352-L355)), `runDenseNewsQuery` runs directly on `getDb().execute(...)` **outside a transaction** and **never sets `hnsw.iterative_scan = 'relaxed_order'` or `hnsw.ef_search`**.
  3. In `pgvector` (when `hnsw.iterative_scan` is `off`, the default), an HNSW index scan explores at most `hnsw.ef_search` candidates (default **`40`**)—even though `LIMIT ${CANDIDATE_POOL}` asks for **`200`** (`CANDIDATE_POOL = 200` at [`packages/ai/src/rag.ts:58`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/rag.ts#L58))!
  4. Worse, the `WHERE` predicates (`na.published_at >= ...` and `na.symbols && ARRAY[...]`) live on **`news_articles`**, not `news_embeddings`. As `news_embeddings` scales past 10,000+ historical articles across 18 symbols, PostgreSQL's planner must choose between two broken plans:
     - **Plan A (HNSW Index Scan → Nested Loop Join Filter):** HNSW returns the 40 globally closest vectors across *all* history and *all* symbols, then joins `news_articles` and filters by `published_at >= now - 72h` and `symbols && ARRAY['XAUUSD']`. When historical articles outnumber recent `XAUUSD` articles by >40:1, **zero rows survive the post-filter**, silently starving dense RAG!
     - **Plan B (Index Scan on `news_articles` → Exact Distance Sort):** PostgreSQL scans all matching `news_articles`, joins `news_embeddings`, and computes exact `<=>` cosine distance on every row without using the HNSW index at all!

#### Finding P3-02 (HIGH / P1): Neither `runDenseNewsQuery` Nor `searchMemory` Filters by `model`, Mixing Incompatible Vector Spaces and Risking Dimension Crashes
- **Locations:**
  - [`packages/db/src/schema/news.ts:71-76`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/news.ts#L71-L76) (`news_embeddings.model`, `vector(1536)`)
  - [`packages/db/src/schema/memory.ts:69-73`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/memory.ts#L69-L73) (`memory_embeddings.model`, `vector(1536)`)
  - [`packages/ai/src/rag.ts:116-135`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/rag.ts#L116-L135) (`runDenseNewsQuery`)
  - [`packages/ai/src/memory/memory-index.ts:357-382`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/memory/memory-index.ts#L357-L382) (`searchMemory`)
  - [`packages/ai/src/embeddings.ts:68-101`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/embeddings.ts#L68-L101) (`embedTexts`)
- **Root Cause Analysis:**
  1. Both `news_embeddings` and `memory_embeddings` store the embedding `model` string on every row (`model text NOT NULL`), and `embedTexts` ([`packages/ai/src/embeddings.ts:68-101`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/embeddings.ts#L68-L101)) resolves the model dynamically from `userSettings.embeddingModel` or `env.AI_EMBEDDING_MODEL`.
  2. However:
     - Neither `runDenseNewsQuery` ([`packages/ai/src/rag.ts:129-132`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/rag.ts#L129-L132)) nor `searchMemory` ([`packages/ai/src/memory/memory-index.ts:368-378`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/memory/memory-index.ts#L368-L378)) includes `AND model = ${embedRes.model}` in its `WHERE` clause! If a user or operator changes `embeddingModel` (even between two 1536-d models like `openai/text-embedding-3-small` and `openai/text-embedding-ada-002`), `<=>` computes cosine distance between vectors from **different embedding spaces**, producing meaningless similarity scores.
     - If a user configures a non-1536-dimension embedding model in `/settings/models` (e.g., `google/text-embedding-004` at 768 dims or `openai/text-embedding-3-large` at 3072 dims), `embedTexts` does not pass `dimensions: 1536` to the provider, so `upsertMemory` and `runDenseNewsQuery` fail at runtime with PostgreSQL error `expected 1536 dimensions, not 768/3072 (SQLSTATE 22000)`.

#### Finding P3-03 (MEDIUM / P2): HNSW Index Build Parameters (`m`, `ef_construction`) and Covering Index Strategy on `memory_embeddings`
- **Locations:**
  - [`packages/db/src/schema/memory.ts:79-88`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/memory.ts#L79-L88)
  - [`packages/db/src/schema/news.ts:78-80`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/news.ts#L78-L80)
  - [`packages/db/drizzle/0016_add_hnsw_indexes.sql:15-22`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0016_add_hnsw_indexes.sql#L15-L22)
- **Root Cause Analysis:**
  - Both HNSW indexes (`news_embeddings_hnsw_idx` and `memory_embeddings_hnsw_idx`) use default `m = 16, ef_construction = 64`.
  - In `searchMemory` ([`packages/ai/src/memory/memory-index.ts:353-355`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/memory/memory-index.ts#L353-L355)), `SET LOCAL hnsw.ef_search = 100` and `SET LOCAL hnsw.iterative_scan = 'relaxed_order'` are properly set inside `withTenantDb(tenantId, ...)`. However, because `memory_embeddings` has a single global HNSW index across all tenants/users, for a specific user whose rows represent <0.5% of total `memory_embeddings` tuples, the iterative HNSW scan must walk up to `hnsw.max_scan_tuples = 20000` graph nodes and perform heap fetches to check `user_id` and `tenant_id`.
  - Adding a composite B-tree index on `memory_embeddings (tenant_id, user_id, kind, occurred_at DESC)` allows PostgreSQL to fast-path small per-user memory sets (< 500 rows per user) via an index scan on `(tenant_id, user_id)` rather than walking 20,000 global HNSW nodes.

### 3.3 Pillar 3 Remediation Snippets

```ts
// 1. packages/ai/src/rag.ts:109-139 — Wrap runDenseNewsQuery in a transaction with HNSW iterative_scan & model filter
async function runDenseNewsQuery(args: {
  queryVector: number[];
  model: string;
  cutoff: Date;
  symbol?: Symbol;
}): Promise<DenseCandidate[]> {
  const vec = vectorLiteral(args.queryVector);

  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL hnsw.ef_search = 200`);
    await tx.execute(sql`SET LOCAL hnsw.iterative_scan = 'relaxed_order'`);
    await tx.execute(sql`SET LOCAL hnsw.max_scan_tuples = 20000`);

    const rows = await tx.execute<DenseRow>(sql`
      SELECT
        na.id,
        na.title,
        na.summary,
        na.url,
        na.source,
        na.publisher,
        na.published_at,
        na.symbols,
        na.sentiment,
        (1 - (ne.embedding <=> ${vec}::vector)) AS similarity
      FROM news_embeddings ne
      JOIN news_articles na ON na.id = ne.article_id
      WHERE ne.model = ${args.model}
        AND na.published_at >= ${args.cutoff.toISOString()}
        AND (${args.symbol ?? null}::text IS NULL OR na.symbols && ARRAY[${args.symbol ?? ''}]::text[])
      ORDER BY ne.embedding <=> ${vec}::vector
      LIMIT ${CANDIDATE_POOL}
    `);

    return (rows as unknown as DenseRow[]).map(rowToDenseCandidate);
  });
}
```

```ts
// 2. packages/ai/src/memory/memory-index.ts:368-378 — Filter searchMemory by model
WHERE user_id = ${args.userId}
  AND tenant_id = ${tenantId}
  AND model = ${embedRes.model}
  AND (${kindsParam}::text[] IS NULL OR kind = ANY(${kindsParam}::text[]))
```

## Pillar 4: Transaction Boundaries & Query Performance

### 4.1 Missing `db.transaction()` Boundaries on Multi-Step Writes

| # | Severity | Location (`file:line`) | Multi-Step Operations Executed Without a Transaction | Failure / Race Mode |
| :-: | :---: | :--- | :--- | :--- |
| **T4-01** | **CRITICAL** | [`packages/db/src/queries/billing-extras.ts:67-103`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/billing-extras.ts#L67-L103) (`upsertSubscription`) | Step 1: `SELECT id FROM subscriptions WHERE tenant_id = ? AND status IN ('active', 'trialing') LIMIT 1` ([`billing-extras.ts:78-84`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/billing-extras.ts#L78-L84)). Step 2: `UPDATE subscriptions` ([`billing-extras.ts:87-91`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/billing-extras.ts#L87-L91)) OR `INSERT INTO subscriptions` ([`billing-extras.ts:95-101`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/billing-extras.ts#L95-L101)). | Two concurrent checkout or webhook calls both see `existing = []` and both execute `INSERT`, violating `subscriptions_tenant_active_idx` (`SQLSTATE 23505`). Use `INSERT ... ON CONFLICT (tenant_id) WHERE status IN ('active', 'trialing') DO UPDATE` or wrap in `db.transaction()` with `FOR UPDATE`. |
| **T4-02** | **CRITICAL** | [`packages/db/src/queries/full-analysis-queue.ts:96-139`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/full-analysis-queue.ts#L96-L139) (`claimNextFullAnalysisQueue`) & [`full-analysis-queue.ts:280-331`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/full-analysis-queue.ts#L280-L331) (`recoverStaleFullAnalysisQueue`) | `claimNextFullAnalysisQueue` runs `SELECT ... WHERE status = 'pending' LIMIT 100` ([`full-analysis-queue.ts:102-110`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/full-analysis-queue.ts#L102-L110)) and then loops in JS issuing sequential `UPDATE` statements ([`full-analysis-queue.ts:112-135`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/full-analysis-queue.ts#L112-L135)). `recoverStaleFullAnalysisQueue` runs an unbounded `SELECT` ([`full-analysis-queue.ts:285-296`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/full-analysis-queue.ts#L285-L296)) and loops issuing 1 `UPDATE` per stale row ([`full-analysis-queue.ts:300-329`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/full-analysis-queue.ts#L300-L329)). | Under multi-worker contention, workers thrash on the same candidate rows. Replace `claimNextFullAnalysisQueue` with a single atomic CTE using `FOR UPDATE SKIP LOCKED LIMIT 1`, and replace `recoverStaleFullAnalysisQueue` with a single set-based `UPDATE ... WHERE status = 'running' AND ... RETURNING run_id, status`. |
| **T4-03** | **HIGH** | [`apps/web/src/app/api/billing/checkout/route.ts:145-180`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/app/api/billing/checkout/route.ts#L145-L180) (`POST /api/billing/checkout`) | Sequentially executes 4 separate DB writes after invoice creation: `saveCheckoutInvoice` (line 146) → `upsertSubscription` (line 154) → `createPayment` (line 159) → `completeCheckoutAttempt` (line 166), and calls `failCheckoutAttempt` in `catch` (line 175) before rethrowing. | Because `withAuth` wraps the entire route in a single `withTenantDbFresh` transaction ([`apps/web/src/lib/api.ts:149`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/lib/api.ts#L149)), if `createPayment` throws a DB error, PostgreSQL marks the transaction aborted (`25P02`), so `failCheckoutAttempt` fails, and `throw err` rolls back **both** `claimCheckoutAttempt` and `saveCheckoutInvoice`—losing the created NOWPayments `invoice.id` and `checkoutUrl`! |
| **T4-04** | **HIGH** | [`apps/web/src/app/api/billing/webhook/route.ts:104-130`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/app/api/billing/webhook/route.ts#L104-L130) (`processVerifiedIpnPayload`) | Sequentially executes `updatePaymentStatus` (line 112) → `updateSubscriptionFromPayment` (line 123) → `markIpnProcessed` (line 129) on unscoped `getDb()` without a transaction. | If `updateSubscriptionFromPayment` or `markIpnProcessed` fails mid-flight, `payments.status` is already committed as `'finished'`, so when the DLQ or NOWPayments retries, `isStaleBillingStatusTransition` in `updatePaymentStatus` ([`packages/db/src/queries/billing.ts:199-214`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/billing.ts#L199-L214)) sees `current.status === 'finished'` and returns `false` (`paymentUpdated = false`), **permanently skipping `updateSubscriptionFromPayment`** ([`apps/web/src/app/api/billing/webhook/route.ts:122`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/app/api/billing/webhook/route.ts#L122))! |
| **T4-05** | **HIGH** | [`apps/web/src/app/api/journal/import/route.ts:70-110`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/app/api/journal/import/route.ts#L70-L110) (`POST /api/journal/import`) | Loops over up to 200 imported trades and calls `await createJournalEntry(...)` on each iteration without a batch `INSERT` (and each call invokes `requireTenantIdForUser`). | 200 trades = 400 sequential SQL statements inside the request. Worse, if `exit !== null && stop !== null` but `closedAt === null`, line 83 sets `outcome = 'win' | 'loss' | 'breakeven'` with `closedAt: null`, crashing against `journal_outcome_closed_consistency` ([`0028_phase2_data_integrity.sql:65`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/drizzle/0028_phase2_data_integrity.sql#L65)). |
| **T4-06** | **MEDIUM** | [`apps/web/src/lib/services/settings.ts:266-276`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/lib/services/settings.ts#L266-L276) (`bulkTestKeysService`) & [`_actions-security.ts:99-108`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/app/(app)/settings/_actions-security.ts#L99-L108), [`_actions-security.ts:223-233`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/app/(app)/settings/_actions-security.ts#L223-L233), [`_actions-security.ts:307-309`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/app/(app)/settings/_actions-security.ts#L307-L309) | `bulkTestKeysService` runs `DELETE FROM provider_tests` then `INSERT INTO provider_tests` outside a transaction inside a streaming `ReadableStream` callback. `setupTwoFactorAction`, `disableTwoFactorAction`, and `signOutEverywhereAction` run 2–3 sequential `UPDATE`/`DELETE` queries without `db.transaction()`. | Because `bulkTestKeysService` executes `DELETE` + `INSERT` inside `ReadableStream.start()` *after* the route handler returned the `Response`, the `withTenantDbFresh` transaction in `withAuth` has **already committed and closed**! Those queries execute on a closed/unscoped transaction handle. |
| **T4-07** | **MEDIUM** | [`apps/web/src/lib/auth/provision-user.ts:117-159`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/lib/auth/provision-user.ts#L117-L159) (`provisionUserOnSignIn`) | Wraps `users` + `userSettings` insert in `db.transaction()` (lines 117-134), but executes `db.insert(schema.accounts)` **outside** the transaction (lines 144-158). | If the `accounts` insert fails, an orphaned `user` + `user_settings` row is committed without the linked Google OAuth `account` row. |

### 4.2 Unbounded `SELECT` Queries & Full-Table In-Memory Aggregations

| # | Severity | Location (`file:line`) | Table Queried | Defect Description | Recommended SQL Fix |
| :-: | :---: | :--- | :--- | :--- | :--- |
| **Q4-01** | **HIGH** | [`packages/db/src/queries/billing.ts:138-145`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/billing.ts#L138-L145) (`countActiveAlerts`) & [`billing.ts:151-168`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/billing.ts#L151-L168) (`countJournalEntriesThisMonth`) | `alerts`, `journal_entries` | Selects all matching `id` rows into a JS array (`SELECT id FROM ...`) and returns `result.length`. Called on plan-limit checks. | Use `SELECT count(*)::int FROM ...` (`sql<number>\`count(*)::int\``). |
| **Q4-02** | **HIGH** | [`packages/db/src/queries/cot.ts:56-60`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/cot.ts#L56-L60) (`countCotReports`) | `cot_reports` | `db.select({ count: schema.cotReports.id }).from(schema.cotReports)` pulls **every row ID in the table** into Node.js memory and returns `rows.length`! | Use `db.select({ count: sql<number>\`count(*)::int\` }).from(schema.cotReports)`. |
| **Q4-03** | **HIGH** | [`packages/db/src/queries/telemetry.ts:56-86`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/telemetry.ts#L56-L86) (`getDailySpend`) & [`packages/ai/src/cost.ts:562-604`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/cost.ts#L562-L604) (`getProviderMonthlySpend`) | `chat_telemetry` | Fetches every `chat_telemetry` row for the user across the day or 30-day window into Node.js memory and sums `estCostUsd` / tokens with `.reduce()`. | Push `SUM(est_cost_usd)`, `SUM(input_tokens)`, `SUM(output_tokens)`, `COUNT(*)` into SQL (`SELECT coalesce(sum(est_cost_usd), 0) ...`). |
| **Q4-04** | **HIGH** | [`packages/db/src/queries/full-analysis-queue.ts:389-398`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/full-analysis-queue.ts#L389-L398) (`listFullAnalysisQueueRows`) & [`packages/ai/src/mastra-v2/workflows/full-analysis.ts:677-700`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/mastra-v2/workflows/full-analysis.ts#L677-L700) (`getFullAnalysisQueueHealth`) | `full_analysis_queue` | `getFullAnalysisQueueHealth` (called on **every `/api/health` request** at [`apps/web/src/app/api/health/route.ts:121`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/app/api/health/route.ts#L121)) calls `listFullAnalysisQueueRows('pending')` and `listFullAnalysisQueueRows('running')`, which executes `SELECT *` (including multi-KB `payload`, `progress`, and `result` JSONB blobs!) with **no `.limit()`** and filters timestamps in JS! | Replace with a single SQL `SELECT count(*) FILTER (...)` aggregate query over `status`, `created_at`, `lease_expires_at`, and `updated_at`. |
| **Q4-05** | **MEDIUM** | [`packages/db/src/queries/agent-opinions.ts:35-72`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/agent-opinions.ts#L35-L72) (`listMtdAgentOpinions`), [`packages/ai/src/multi-agent/persistence.ts:118-188`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/multi-agent/persistence.ts#L118-L188) (`listAgentOpinions` / `listMessageOpinions`) | `agent_opinions` ⋈ `chat_threads` ⋈ `chat_messages` | Unbounded 3-table join with no `.limit()`, fetching full `reasoning` and `raw_data` JSONB columns. | Add `.limit(500)` or push aggregation to SQL. |
| **Q4-06** | **MEDIUM** | [`packages/ai/src/journal/persistence.ts:583-604`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/journal/persistence.ts#L583-L604) (`computeStats`) | `journal_entries` | `listJournalEntriesService` ([`apps/web/src/lib/services/journal.ts:140`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/lib/services/journal.ts#L140)) runs `computeStats(userId)` on every `GET /api/journal`, which executes an unbounded `SELECT * FROM journal_entries` across the user's entire trading history (including `notes` and `attachments`). | Project only the numeric/date columns needed by `summarize()` and cap or pre-aggregate historical rows. |
| **Q4-07** | **MEDIUM** | [`apps/web/src/app/(app)/settings/_actions-data.ts:109-375`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/app/(app)/settings/_actions-data.ts#L109-L375) (`exportDataAction`) | 31 tables in parallel | Fires **21 concurrent unbounded `SELECT *` queries** in a single `Promise.all` (lines 225-375) after 10 sequential unbounded `SELECT *` queries (lines 109-202) against a pool of `max: 5`, queueing 21 queries on a single user export and buffering all historical `chat_telemetry`, `chat_tool_telemetry`, `diagnostic_traces`, and `memory_embeddings` (including 1536-float vectors!) in Node.js heap. | Omit raw `embedding` vectors from `memoryEmbeddings` export, add reasonable per-table row caps (e.g., `.limit(10_000)`), and batch concurrency to `<= 4`. |
| **Q4-08** | **MEDIUM** | [`user-settings.ts:150-153`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/user-settings.ts#L150-L153) (`listAllUserSettings`), [`alerts.ts:166-179`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/alerts.ts#L166-L179) (`listActiveAlerts`), [`user-sessions.ts:36-50`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/user-sessions.ts#L36-L50) (`listUserSessions`), [`news-articles.ts:65-67`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/news-articles.ts#L65-L67) (`getAllNewsArticles`), [`news-persistence.ts:83-87`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/news-persistence.ts#L83-L87) (`listAllArticles`) | `user_settings`, `alerts`, `user_sessions`, `news_articles` | All 5 helpers execute `SELECT` without `.limit()`. Notably, `getAllNewsArticles` and `listAllArticles` run `db.select().from(schema.newsArticles)` with no `WHERE` and no `LIMIT`. | Add explicit `.limit()` bounds to all 5 helpers and remove or deprecate unpaginated full-table readers. |

### 4.3 N+1 Query Loops & Redundant Tenant Lookups

1. **Redundant `requireTenantIdForUser` Queries Inside Already-Scoped Requests ([`packages/db/src/tenant.ts:20-52`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/tenant.ts#L20-L52))**:
   - `requireTenantIdForUser(userId, db)` executes `SELECT org_id FROM organization_member INNER JOIN organization ... WHERE user_id = ?` on **every single call** ([`packages/db/src/tenant.ts:23-35`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/tenant.ts#L23-L35)).
   - Even when `withAuth` ([`apps/web/src/lib/api.ts:148-149`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/lib/api.ts#L148-L149)) has **already** resolved `tenantId` and entered `withTenantDbFresh(tenantId, ...)`, `getTenantDbScope()` ([`packages/db/src/client.ts:306-308`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L306-L308)) holds `{ db, tenantId }` in `AsyncLocalStorage`—yet `resolveTenantIdForUser` ignores `getTenantDbScope()` and hits PostgreSQL again!
   - A single chat turn or dashboard load calls 5–12 query helpers, each calling `requireTenantIdForUser(userId, db)`, generating **5–12 redundant `organization_member ⋈ organization` queries per request**!
2. **`checkAllUsageAlerts` N+1 Per-User Loop ([`apps/web/src/lib/usage-alerts.ts:33-142`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/lib/usage-alerts.ts#L33-L142))**:
   - Calls `listAllUserSettings()` (`SELECT * FROM user_settings`), then for each user calls `getUserWithSettings(settings.userId)` (which executes **4 queries**: `requireTenantIdForUser`, `SELECT * FROM user_settings`, `SELECT ... FROM user LEFT JOIN organization_member LEFT JOIN organization`, and `getPlatformAdminSettings`!), followed by `getMonthlySpend(settings.userId)` and `getProviderMonthlySpend(settings.userId, providerId)` (which pulls all 30-day `chat_telemetry` rows into JS!). For 100 users with 3 provider thresholds, this single cron job executes **800+ sequential SQL queries**.
3. **Worker & Cron Sequential Upsert Loops ([`apps/worker/src/jobs/cot.ts:51-69`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/worker/src/jobs/cot.ts#L51-L69), [`apps/web/src/app/api/cron/cot/route.ts:59-76`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/web/src/app/api/cron/cot/route.ts#L59-L76), [`packages/ai/src/tools/run-system-action.ts:197-225`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/tools/run-system-action.ts#L197-L225))**:
   - `cot.ts` loops over each symbol × 4 weeks and issues individual `await upsertCoTReport(...)` calls instead of a multi-row `INSERT ... VALUES (...), (...) ON CONFLICT DO UPDATE`.
   - `run-system-action.ts` (`resonance-sync`, [`packages/ai/src/tools/run-system-action.ts:197-225`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/tools/run-system-action.ts#L197-L225)) and [`apps/worker/src/jobs/resonance-sync.ts:163-191`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/apps/worker/src/jobs/resonance-sync.ts#L163-L191) loop over up to 45 aligned business days issuing 45 sequential `INSERT INTO intermarket_resonance ... ON CONFLICT DO UPDATE` queries instead of a single batch upsert.

### 4.4 Missing Composite Indexes on High-Frequency Predicates (`userId`, `status`, `createdAt`)

| Table (`file:line`) | High-Frequency Query Predicate & Sort | Current Indexes on Table | Missing Composite Index Needed |
| :--- | :--- | :--- | :--- |
| `chat_threads` ([`packages/db/src/schema/chat.ts:35-65`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/chat.ts#L35-L65)) | `listThreads` ([`packages/ai/src/persistence/thread-persistence.ts:96-121`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/persistence/thread-persistence.ts#L96-L121)): `WHERE user_id = ? AND tenant_id = ? ORDER BY date_trunc('milliseconds', updated_at) DESC, id DESC LIMIT 51` | Separate single-column indexes: `chat_threads_updated_at_idx(updated_at)`, `chat_threads_user_id_idx(user_id)`, `chat_threads_tenant_id_idx(tenant_id)` | `CREATE INDEX "chat_threads_user_updated_id_idx" ON "chat_threads" ("user_id", "updated_at" DESC, "id" DESC)` |
| `alerts` ([`packages/db/src/schema/alerts.ts:42-69`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/alerts.ts#L42-L69)) | `listAlerts` ([`packages/ai/src/alerts/persistence.ts:55-63`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/alerts/persistence.ts#L55-L63)): `WHERE user_id = ? AND tenant_id = ? [AND active = true] ORDER BY created_at DESC LIMIT 100`; `listEvaluable` ([`persistence.ts:97-101`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/alerts/persistence.ts#L97-L101)): `WHERE active = true AND fired_at IS NULL ORDER BY created_at ASC` | 6 single-column indexes (`tenant_id`, `user_id`, `active`, `fired_at`, `last_fired_at`, `delivery_claimed_at`) | `CREATE INDEX "alerts_user_active_created_idx" ON "alerts" ("user_id", "active", "created_at" DESC)` and partial index `CREATE INDEX "alerts_evaluable_idx" ON "alerts" ("created_at" ASC) WHERE "active" = true AND "fired_at" IS NULL` |
| `journal_entries` ([`packages/db/src/schema/journal.ts:22-73`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/journal.ts#L22-L73)) | `listEntries` ([`packages/ai/src/journal/persistence.ts:72-83`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/journal/persistence.ts#L72-L83)): `WHERE user_id = ? AND tenant_id = ? [AND symbol = ?] ORDER BY opened_at DESC LIMIT 100` | `journal_entries_user_id_idx(user_id)`, `journal_entries_tenant_opened_idx(tenant_id, opened_at)` | `CREATE INDEX "journal_entries_user_opened_idx" ON "journal_entries" ("user_id", "opened_at" DESC)` |
| `portfolio_positions` ([`packages/db/src/schema/portfolio.ts:43-86`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/portfolio.ts#L43-L86)) | `listOpenPositions` & `listAllPositions` ([`packages/ai/src/portfolio/position-service.ts:68-96`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/ai/src/portfolio/position-service.ts#L68-L96)): `WHERE user_id = ? AND tenant_id = ? [AND status = 'open'] ORDER BY opened_at DESC` | `portfolio_positions_user_status_idx(user_id, status)` (missing `opened_at DESC`!) | `CREATE INDEX "portfolio_positions_user_status_opened_idx" ON "portfolio_positions" ("user_id", "status", "opened_at" DESC)` |
| `diagnostic_traces` ([`packages/db/src/schema/diagnostic-traces.ts:21-43`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/diagnostic-traces.ts#L21-L43)) | `listDiagnosticTraces` ([`packages/db/src/queries/diagnostic-traces.ts:124-152`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/diagnostic-traces.ts#L124-L152)): `WHERE user_id = ? [AND thread_id = ?] ORDER BY started_at DESC LIMIT ?` | Single-column indexes on `user_id`, `thread_id`, `started_at`, `created_at` | `CREATE INDEX "diagnostic_traces_user_started_idx" ON "diagnostic_traces" ("user_id", "started_at" DESC)` |
| `chat_tool_telemetry` ([`packages/db/src/schema/tool-telemetry.ts:39-105`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/schema/tool-telemetry.ts#L39-L105)) | `listToolTelemetry` ([`packages/db/src/queries/telemetry.ts:94-121`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/queries/telemetry.ts#L94-L121)): `WHERE user_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 100` | `chat_tool_telemetry_user_id_idx(user_id)` and `tool_telemetry_created_idx(created_at)` (separate!) | `CREATE INDEX "tool_telemetry_user_created_idx" ON "chat_tool_telemetry" ("user_id", "created_at" DESC)` (matching `telemetry_user_created_idx` on `chat_telemetry`) |

### 4.5 Pillar 4 Remediation Snippets

```ts
// 1. packages/db/src/queries/full-analysis-queue.ts:96-139 — Atomic FOR UPDATE SKIP LOCKED claim
export async function claimNextFullAnalysisQueue(
  options: ClaimFullAnalysisQueueOptions,
): Promise<FullAnalysisQueueRow | null> {
  const db = options.db ?? getDb();
  const now = options.now ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + options.leaseMs);

  const rows = await db.execute<FullAnalysisQueueRow>(sql`
    WITH next_job AS (
      SELECT run_id
      FROM full_analysis_queue
      WHERE status = 'pending'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE full_analysis_queue AS q
    SET
      status = 'running',
      worker_run_id = ${options.workerRunId},
      lease_expires_at = ${leaseExpiresAt.toISOString()},
      attempt_count = q.attempt_count + 1,
      updated_at = ${now.toISOString()}
    FROM next_job
    WHERE q.run_id = next_job.run_id
    RETURNING q.*
  `);
  return (rows as unknown as FullAnalysisQueueRow[])[0] ?? null;
}
```

```ts
// 2. packages/db/src/queries/billing-extras.ts:67-103 — Atomic upsertSubscription via ON CONFLICT
export async function upsertSubscription(
  userId: string,
  opts: {
    planId: string;
    nowpaymentsInvoiceId?: string;
    nowpaymentsRecurringId?: string;
    status?: SubscriptionStatus;
    currentPeriodEnd?: Date;
  },
): Promise<string> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const status = opts.status ?? 'active';

  const [row] = await db
    .insert(schema.subscriptions)
    .values({
      tenantId,
      planId: opts.planId,
      status,
      nowpaymentsInvoiceId: opts.nowpaymentsInvoiceId ?? null,
      nowpaymentsRecurringId: opts.nowpaymentsRecurringId ?? null,
      currentPeriodEnd: opts.currentPeriodEnd ?? null,
    })
    .onConflictDoUpdate({
      target: [schema.subscriptions.tenantId],
      targetWhere: sql`${schema.subscriptions.status} IN ('active', 'trialing')`,
      set: {
        planId: opts.planId,
        status,
        ...(opts.nowpaymentsInvoiceId !== undefined
          ? { nowpaymentsInvoiceId: opts.nowpaymentsInvoiceId }
          : {}),
        ...(opts.nowpaymentsRecurringId !== undefined
          ? { nowpaymentsRecurringId: opts.nowpaymentsRecurringId }
          : {}),
        ...(opts.currentPeriodEnd !== undefined
          ? { currentPeriodEnd: opts.currentPeriodEnd }
          : {}),
        updatedAt: new Date(),
      },
    })
    .returning({ id: schema.subscriptions.id });

  return row!.id;
}
```

```ts
// 3. packages/db/src/queries/billing.ts:138-168 — SQL COUNT(*) instead of full-table array length
export async function countActiveAlerts(userId: string): Promise<number> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.alerts)
    .where(and(eq(schema.alerts.tenantId, tenantId), eq(schema.alerts.active, true)));
  return row?.count ?? 0;
}

export async function countJournalEntriesThisMonth(userId: string): Promise<number> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.journalEntries)
    .where(
      and(
        eq(schema.journalEntries.tenantId, tenantId),
        gte(schema.journalEntries.createdAt, monthStart),
      ),
    );
  return row?.count ?? 0;
}
```

## Migration Safety & Rollout Plan (`0098_phase2_db_audit_remediation.sql`)

To remediate all schema, index, role-grant, and RLS findings without downtime or table locks in production, execute the rollout in **three strictly ordered phases**:

### Step 1: Pre-Flight Verification Queries (Read-Only)
Run against `DIRECT_URL` / `MIGRATION_DATABASE_URL` before applying any DDL:
```sql
-- 1. Verify role memberships and grants for kestrel_app and authenticated
SELECT rolname, rolsuper, rolinherit, rolbypassrls
FROM pg_roles
WHERE rolname IN ('kestrel_app', 'hamafx_admin', 'authenticated', 'anon', 'service_role');

-- 2. Verify no orphaned rows violate the upcoming CHECK or FK constraints
SELECT count(*) AS invalid_journal_rows
FROM public.journal_entries
WHERE NOT ((outcome = 'open' AND closed_at IS NULL) OR (outcome IN ('win', 'loss', 'breakeven') AND closed_at IS NOT NULL));

-- 3. Check index definitions on memory_backfill_state, memory_projection_state, and payments
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('memory_backfill_state', 'memory_projection_state', 'payments', 'chat_threads', 'alerts', 'journal_entries', 'portfolio_positions', 'diagnostic_traces');
```

### Step 2: Additive, Idempotent SQL Migration (`0098_phase2_db_audit_remediation.sql`)
- **Lock Safety:** All new B-tree and partial indexes use `CREATE INDEX IF NOT EXISTS` (or `CREATE INDEX CONCURRENTLY IF NOT EXISTS` when run outside a transaction block via `packages/db/scripts/migrate-apply.mjs`).
- **Role Alignment:** Keep `kestrel_app` as the `NOBYPASSRLS` runtime role (from migration `0094`) and remove `SET LOCAL ROLE authenticated` from [`packages/db/src/client.ts:363, 406`](https://github.com/HamaFx/Kestrel/blob/c82f247033fc332aa5b7534e4e74aee38019a8f7/packages/db/src/client.ts#L363) (or `GRANT authenticated TO kestrel_app` + restore table grants on RLS-forced tables if PostgREST compatibility is desired).
- **Zero-Downtime Drizzle Schema Sync:** Adding the missing `check(...)`, `index(...)`, `primaryKey(...)`, and `.default(...)` declarations to `packages/db/src/schema/*.ts` brings TypeScript in 100% parity with existing database objects from migrations `0028`, `0032`, `0063`, `0087`, and `0088` so `pnpm --filter @kestrel/db db:generate` produces a clean zero-diff snapshot.

```sql
-- packages/db/drizzle/0098_phase2_db_audit_remediation.sql
-- Composite indexes for high-frequency tenant/user queries (Pillar 4)
CREATE INDEX IF NOT EXISTS "chat_threads_user_updated_id_idx"
  ON "chat_threads" ("user_id", "updated_at" DESC, "id" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "alerts_user_active_created_idx"
  ON "alerts" ("user_id", "active", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "alerts_evaluable_idx"
  ON "alerts" ("created_at" ASC)
  WHERE "active" = true AND "fired_at" IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "journal_entries_user_opened_idx"
  ON "journal_entries" ("user_id", "opened_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "portfolio_positions_user_status_opened_idx"
  ON "portfolio_positions" ("user_id", "status", "opened_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "diagnostic_traces_user_started_idx"
  ON "diagnostic_traces" ("user_id", "started_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tool_telemetry_user_created_idx"
  ON "chat_tool_telemetry" ("user_id", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "memory_embeddings_user_kind_occurred_idx"
  ON "memory_embeddings" ("tenant_id", "user_id", "kind", "occurred_at" DESC);
```

### Step 3: Post-Migration Verification Gate
1. Run `pnpm --filter @kestrel/db test` and `RUN_POSTGRES_RLS_TESTS=1 pnpm --filter @kestrel/db test` with an updated test that exercises `withTenantDbFresh` and `withTenantDbRO` against the full migration chain.
2. Run `EXPLAIN (ANALYZE, BUFFERS)` on `runDenseNewsQuery`, `searchMemory`, `listThreads`, `listEvaluable`, and `claimNextFullAnalysisQueue` to confirm index scans and `hnsw.iterative_scan` activation.
