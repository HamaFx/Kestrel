# 16 — Database & Supabase Remediation Plan

> **Status:** In progress — Phase 2 query hardening underway
>
> **Scope:** PostgreSQL/Drizzle schema, Supabase production configuration, tenant isolation, migrations, query access, market-data scale, billing integrity, backups, observability, data lifecycle, and database testing.
>
> **Primary objective:** Make the database safe, observable, recoverable, and scalable without breaking the current single-user OSS deployment or prematurely enabling unsupported multi-tenant runtime behavior.
>
> **Implementation status (2026-08-26):** Phase 0 inventory is substantially complete and the repository remediation batches are verified. Live Supabase now has PostgreSQL 17.6, `pgvector 0.8.2`, all 93 Drizzle migrations applied, 62 public tables, 22 original RLS/policy tables plus the 13 late tenant tables covered by migration `0090`, 7 users, 7 organizations, 7 valid memberships, approximately 119k one-minute candles, 202 diagnostic traces, 307 chat telemetry rows, no expired sessions/tokens, no pending billing DLQ rows, and 2 nonterminal outbox rows. Production migration, schema reconciliation, retention indexes, and a temporary non-bypass RLS acceptance probe completed successfully; runtime shared-mode flags remain unchanged.
>
> **Completed repository work:** explicit ownership predicates for threads/messages, AI feedback/regression cases, diagnostic traces and explorer events, billing payment/subscription transitions, webhook tenant propagation, a canonical user-to-organization resolver, migration URL rejection for transaction poolers, a repeatable redacted Supabase inventory command, and PGlite two-user billing/diagnostic regression coverage. Current verification evidence is recorded in the status log near the end of this document.

---

## 1. Executive summary

The database is already substantially engineered: it has typed Drizzle schemas, 88 migrations, PGlite migration tests, connection pooling, retries, tenant columns, idempotency ledgers, durable queues, encrypted secrets, retention cleanup, and operational telemetry.

The main remediation problem is architectural ambiguity rather than a single broken table:

1. The schema contains multi-tenant/RLS infrastructure, but runtime RLS is intentionally disabled.
2. User isolation therefore depends on every application query being scoped correctly.
3. PGlite tests do not exercise Supabase-specific roles, grants, RLS, pgvector, pooler behavior, or production extensions.
4. The migration history shows several emergency repair migrations, so production schema drift must be measured rather than assumed away.
5. High-write market and AI telemetry tables need an explicit growth, retention, and partitioning strategy.
6. Billing requires stronger reconstruction and accounting guarantees.
7. Backup and restore must be operationally verified, not merely configured.

This plan deliberately uses a **two-stage safety model**:

- **Stage A:** harden and verify the current supported single-user runtime.
- **Stage B:** separately enable and prove shared multi-tenant/RLS runtime in staging before production activation.

Do not turn on `MULTI_USER_ENABLED=1` or `KESTREL_ENABLE_RLS=1` until Stage B acceptance criteria are complete.

---

## 2. Non-negotiable operating rules

These rules apply throughout the plan.

### Migration safety

- Never use `drizzle-kit push` against production.
- Never edit an applied migration.
- Always create a new migration for schema changes.
- Use `DIRECT_URL` or `POSTGRES_URL_NON_POOLING` for DDL.
- Keep new migrations idempotent.
- Review lock duration and table size before applying changes.
- For large indexes, consider `CREATE INDEX CONCURRENTLY` and an appropriate non-transactional migration procedure.
- Back up before structural changes.
- Verify schema and application health after changes.

### Data safety

- Never log credentials, tokens, raw payment secrets, or unredacted prompts.
- Never expose `service_role`, `ADMIN_DATABASE_URL`, or direct database URLs to browser code.
- Never assume a valid UUID/id implies ownership.
- Every user-owned read, update, and delete must carry explicit ownership scope until RLS is proven active.
- Every privileged cross-tenant operation must use an explicitly named admin path.

### Supabase safety

- Treat Supabase as managed PostgreSQL unless a feature is explicitly adopted.
- Verify actual roles, grants, RLS state, extensions, and migrations in the live project.
- Do not assume PGlite behavior represents Supabase behavior.
- Do not run destructive production SQL during discovery.

---

## 3. Target architecture

### 3.1 Supported current mode: single-user OSS

Until shared runtime is formally enabled:

```text
MULTI_USER_ENABLED=false
KESTREL_ENABLE_RLS=false
AUTH_MODE!=legacy in production
```

Requirements:

- All user-data queries explicitly scope by `user_id` or an equivalent ownership predicate.
- Admin behavior is explicit and audited.
- Public database roles do not receive broad table access unless a documented feature requires it.
- Supabase is used server-side through Drizzle.
- Direct browser-to-PostgREST access is not assumed.

### 3.2 Future shared mode: database-enforced tenant isolation

When enabled:

```text
MULTI_USER_ENABLED=true
KESTREL_ENABLE_RLS=true
```

Requirements:

- Every request establishes tenant context inside a transaction.
- Every tenant-owned table has RLS enabled and forced where appropriate.
- Every policy has correct `USING` and `WITH CHECK` behavior.
- Worker/cron/admin jobs use a dedicated least-privilege privileged connection.
- Cross-tenant integration tests pass against real PostgreSQL.
- No regular runtime fallback silently bypasses tenant context.
- Parent and child records have consistent tenant ownership.

### 3.3 Workload boundaries

Keep the logical database initially, but treat these as separate workload classes:

1. Identity and security
2. User application data
3. Billing and accounting
4. Chat/AI persistence
5. High-write market data
6. Operational queues and telemetry
7. Analytical/reporting queries

Each class needs its own:

- retention policy
- access policy
- indexes
- monitoring
- load expectations
- recovery priority

Move to separate databases only when measured workload contention or growth justifies the operational complexity.

---

## 4. Phased execution plan

## Phase 0 — Freeze, inventory, and production baseline

**Goal:** Establish facts before changing schema or Supabase settings.

### Tasks

- [ ] Create a dedicated database remediation issue/epic and track every item in this document.
- [ ] Freeze unrelated schema changes during the baseline window.
- [ ] Confirm the production Supabase project reference and environment mapping.
- [ ] Confirm which environment variables are used by Vercel, the worker, migrations, staging, and local development.
- [ ] Run `pnpm --filter @kestrel/db migrate:status` from a trusted operator environment.
- [ ] Run `pnpm --filter @kestrel/db migrate:reconcile` and save the redacted output as an audit artifact.
- [ ] Record PostgreSQL version and Supabase plan.
- [ ] Record current database size, table sizes, index sizes, and daily growth.
- [ ] Record peak and average connection counts.
- [ ] Record query latency and timeout rates.
- [ ] Record deadlocks, lock waits, failed connections, and autovacuum activity.
- [ ] Record active extensions, especially `vector`.
- [ ] Record RLS status and policy inventory.
- [ ] Record grants for `anon`, `authenticated`, `service_role`, `postgres`, and `hamafx_admin` if present.
- [ ] Record migration tracking rows and hashes.
- [ ] Record row counts for every table.
- [ ] Check for null tenant IDs in tenant-owned tables.
- [ ] Check for user/tenant membership mismatches.
- [ ] Check for orphaned child rows.
- [ ] Check for duplicate logical records.
- [ ] Check for expired sessions, tokens, queue rows, and stale leases.

### Required read-only SQL inventory

Run through a restricted operator connection. Save results without secrets or user content.

```sql
SELECT version();

SELECT extname, extversion
FROM pg_extension
ORDER BY extname;

SELECT schemaname, relname, n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

SELECT schemaname, relname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;

SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee IN ('anon', 'authenticated', 'service_role', 'hamafx_admin')
ORDER BY grantee, table_name, privilege_type;

SELECT schemaname, tablename, rowsecurity, forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Exit criteria

- [ ] A redacted production baseline is stored outside the repository or in an approved internal artifact location.
- [ ] Every table is classified as global, user-owned, tenant-owned, child-owned, billing, operational, or high-write market data.
- [ ] Actual production state is compared against the Drizzle schema and migration journal.
- [ ] No production write was performed during discovery.

---

## Phase 1 — Fix documentation and configuration ambiguity

**Goal:** Make unsafe configuration states obvious and prevent accidental mode mixing.

### Tasks

- [ ] Document every database environment variable in one authoritative table.
- [ ] Define whether `DATABASE_URL` is pooler or direct in every environment.
- [ ] Define whether `POSTGRES_URL` is an alias or an independent connection.
- [ ] Define when `ADMIN_DATABASE_URL` is required.
- [ ] Define whether `DATABASE_URL_REPLICA` may be used for each read path.
- [ ] Remove stale or misleading Supabase terminology from deployment docs.
- [ ] State clearly that Supabase Auth, Storage, Realtime, and Edge Functions are not currently used unless that changes.
- [ ] Add boot validation that rejects production configurations with ambiguous URL combinations.
- [ ] Add boot validation that rejects `MULTI_USER_ENABLED=true` unless the full RLS runtime is supported.
- [ ] Add boot validation that rejects an admin URL pointing to the regular user role when shared mode is active.
- [ ] Add a safe environment report command that prints names, modes, hosts, and ports but never passwords or keys.
- [ ] Add a deployment preflight that verifies the migration URL is direct/session-capable.

### Configuration contract

| Variable | Purpose | Pooling | DDL allowed | Browser-safe |
|---|---|---:|---:|---:|
| `DATABASE_URL` | Normal web/worker database access | Usually transaction pooler | No | No |
| `POSTGRES_URL` | Compatibility alias | Usually transaction pooler | No | No |
| `DIRECT_URL` | Migrations and maintenance | Direct/session | Yes | No |
| `POSTGRES_URL_NON_POOLING` | Direct/session compatibility alias | Direct/session | Yes | No |
| `ADMIN_DATABASE_URL` | Explicit cross-tenant worker/admin access | Direct/session preferred | Only when required | No |
| `DATABASE_URL_REPLICA` | Read-only replica access | Provider-dependent | No | No |
| `SUPABASE_URL` | Optional Supabase API URL | N/A | N/A | Only if explicitly public |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase privileged API key | N/A | N/A | Never |

### Exit criteria

- [ ] A new operator can identify the correct URL for runtime reads versus migrations without guessing.
- [ ] Production fails closed on unsupported multi-user/RLS combinations.
- [ ] Configuration checks do not print secret values.

---

## Implementation status

### Completed in repository

- [x] Preserved the legacy thread query API while adding ownership-safe behavior to the AI persistence path.
- [x] Added ownership-scoped source-message reads to thread forking.
- [x] Added user/tenant predicates to AI feedback and regression-case paths.
- [x] Added tenant-scoped billing subscription/payment update and recovery checks.
- [x] Added explicit user scoping to diagnostic trace query helpers.
- [x] Added admin-only diagnostic service-boundary wrappers in the web app.
- [x] Tightened diagnostic trace route access through the service boundary.
- [x] Added regression-case integration coverage; all existing database tests pass.
- [x] Verified `@kestrel/db`, `@kestrel/ai`, and `@kestrel/web` typechecks after the current batch.
- [x] Propagated the payment tenant into webhook payment and subscription updates.
- [x] Rebuilt `@kestrel/db` so workspace consumers use the updated billing signatures.
- [x] Added PGlite two-tenant ownership regression coverage for diagnostics and billing.

### Verification evidence

- Latest batch: required tenant scoping added to payment status and subscription transition writes; provider payment lookup supports tenant filtering.
- Latest batch typechecks: `@kestrel/db`, `@kestrel/ai`, and `@kestrel/web` passed after rebuilding the database package.
- Latest focused test: `test/ai-regression-cases.test.ts` — 2 tests passed.
- Ownership isolation focus: `test/ownership-isolation.test.ts` — 2 tests passed.
- Full database suite: 25 test files, 175 tests passed.

- `@kestrel/db`: 24 test files, 173 tests passed.
- AI regression-case focus: 2 tests passed.
- `@kestrel/db` typecheck: passed.
- `@kestrel/ai` typecheck: passed.
- `@kestrel/web` typecheck: passed.
- No migrations generated or applied.
- No live Supabase changes performed.
- RLS remains disabled.

### Remaining immediate work

- [x] Add dedicated cross-user tests for diagnostic traces and trace explorer events.
  - Covers direct ID lookup, owner-filtered listing, and trace explorer filtering.
- [x] Add dedicated cross-user tests for billing recovery and payment status updates.
  - Covers mismatched-tenant provider lookup, payment update, and subscription update.
  - Confirms the correct tenant can read and update its billing records.
- [x] Complete the remaining repository lookup inventory for the currently reviewed ownership clusters.
  - User-facing diagnostics, AI feedback/regression, threads/messages, billing/IPN, settings, symbols, sessions, push, portfolio, journal, alerts, telemetry, memory, budget, onboarding, export, and market-preference paths are reviewed. Admin, worker, global catalog, authentication, and operational paths are explicitly classified in the execution log; a final static sweep remains before Phase 2 can close.
- [x] Add shared test utilities for two-user ownership scenarios.
  - `packages/db/test/fixtures/two-tenant.ts` provides the canonical personal-organization seed used by the ownership suite.
- [x] Update this status section after every implementation batch.
  - Status is updated in this execution log after each verified batch.

---

## Phase 2 — Complete the current single-user isolation audit

**Goal:** Reduce IDOR and accidental cross-user access risk before any RLS activation.

### Tasks

- [~] Build an inventory of every query helper and direct database call in `apps/web`, `apps/worker`, `packages/ai`, and `packages/data`.
  - Initial high-risk audit completed for threads, diagnostics, feedback, regression cases, billing, and IPN/payment paths.
- [ ] Classify every query as user-scoped, tenant-scoped, global, admin-only, or worker-only.
- [ ] Search for lookups by only `id`, external provider ID, endpoint, token, or payment identifier.
- [x] Require ownership predicates for every reviewed user-facing read.
  - Hardened thread, diagnostic, feedback, regression-case, billing, settings, symbols, sessions, push, portfolio, journal, alerts, provider-health, telemetry, memory, onboarding, export, and market-preference reads. Remaining work is a final repository-wide static sweep, not an identified unscoped user-facing path.
- [x] Require ownership predicates for every reviewed user-facing update.
  - Hardened feedback, regression-case, payment/subscription, settings, thread/message, alert, journal, portfolio, push, onboarding, provider-health, and session-related updates; remaining work is a final repository-wide static sweep.
- [x] Require ownership predicates for every reviewed user-facing delete.
  - Reviewed and hardened thread, alert, journal, portfolio, push, session, feedback, symbol, and onboarding-related deletes; remaining work is a final repository-wide static sweep.
- [x] Verify parent ownership before retrieving child records in reviewed domains.
  - Covered thread/message, feedback/thread, export message/thread, and diagnostic explorer relationships; remaining child relationships require the final static sweep.
- [x] Verify user ownership before accepting reviewed external identifiers.
  - Billing provider IDs, push endpoints, thread/message IDs, queue run IDs, and diagnostic trace IDs are scoped; remaining external-ID paths require the final static sweep.
- [~] Ensure every update includes ownership in its `WHERE` clause.
  - Current reviewed user-facing CRUD paths include user and canonical tenant predicates.
- [~] Ensure every delete includes ownership in its `WHERE` clause.
  - Current reviewed user-facing delete paths include user and canonical tenant predicates.
- [ ] Replace advisory-only scoping with repository APIs requiring a context object.
- [ ] Add a lint or static check preventing direct access to user-owned tables from unapproved modules.
- [~] Add tests for every high-risk query helper.
  - `test/ownership-isolation.test.ts` covers diagnostics, billing, tenant-derived writes, settings, symbols, provider health, sessions, telemetry, and queue writes; direct web-action tests and AI persistence/queue suites also pass. Additional domain-specific negative tests remain useful for the final sweep.
- [~] Add negative tests that attempt access using another user’s ID.
  - Covered by diagnostic, billing, settings, symbols, sessions, AI persistence, telemetry, and queue cases; remaining domains are pending final sweep coverage.
- [~] Add negative tests that attempt access using another tenant’s record ID.
  - Covered by billing, settings, symbols, sessions, AI persistence, telemetry, and tenant-derived write cases; real PostgreSQL/RLS role tests remain pending.
- [ ] Review admin routes separately; admin access must never be granted merely because a record exists.

### Preferred repository context

Use a type similar to:

```ts
type DataAccessContext = {
  userId: string;
  tenantId?: string;
  actor: 'user' | 'admin' | 'worker';
};
```

Repository methods should require the context where ownership matters:

```ts
getThread(ctx, threadId)
updateAlert(ctx, alertId, patch)
deleteJournalEntry(ctx, entryId)
```

Do not accept a bare record ID for a user-owned operation unless the method is explicitly admin-only.

### Exit criteria

- [~] Every user-facing query has a reviewed ownership boundary.
  - The reviewed repository and direct web/worker user-data cluster now derives and checks canonical tenant membership. Admin, worker, global catalog, authentication, and operational paths are explicitly classified; a final static sweep remains.
- [~] Two-user negative tests pass for threads, messages, alerts, journal, portfolio, settings, symbols, push subscriptions, diagnostics, feedback, billing views, and shared snapshots.
  - Current executable coverage passes for diagnostics, billing, tenant-derived writes, settings, symbols, provider health, and sessions; remaining domains are pending.
- [~] No reviewed user-facing repository method performs an unscoped lookup.
  - Reviewed user-facing CRUD helpers and direct server actions now include user and canonical tenant boundaries; a final direct-call inventory remains.

---

## Phase 3 — Tenant model and relational integrity hardening

**Goal:** Make tenant ownership internally consistent before enabling RLS.

### Tasks

- [ ] Decide whether a user may belong to multiple organizations.
- [ ] Document organization membership semantics and roles.
- [ ] Define whether each user has exactly one personal organization or may have several.
- [ ] Add constraints/checks for valid organization plans and membership roles.
- [ ] Add or verify composite ownership relationships where child rows contain `tenant_id`.
- [ ] Add a composite unique key to parent tables where needed for composite foreign keys.
- [ ] Add composite foreign keys for child rows such as messages and decision-signal outcomes.
- [ ] Ensure a row’s `user_id` belongs to its `tenant_id` organization.
- [ ] Decide whether this is enforced by composite membership tables, triggers, or a controlled write service.
- [ ] Make trigger behavior deterministic and idempotent.
- [ ] Verify all tenant-owned tables have a non-null tenant ID after backfill.
- [ ] Verify tenant defaults do not silently produce an invalid or system tenant.
- [ ] Remove legacy `__system__` defaults from user-owned data where no longer needed.
- [ ] Preserve explicit system/worker ownership only in tables designed for system records.
- [ ] Add a scheduled tenant-integrity audit query.

### Integrity checks

Create read-only checks for:

```sql
-- User does not belong to the row tenant
SELECT t.*
FROM <tenant_table> t
LEFT JOIN organization_member m
  ON m.user_id = t.user_id
 AND m.org_id = t.tenant_id
WHERE m.user_id IS NULL;

-- Child tenant differs from parent tenant
SELECT child.*
FROM chat_messages child
JOIN chat_threads parent ON parent.id = child.thread_id
WHERE child.tenant_id <> parent.tenant_id;
```

Apply the equivalent checks to every denormalized child relationship.

### Exit criteria

- [ ] No tenant/user membership mismatches exist in production.
- [ ] No null tenant IDs exist in tenant-owned tables.
- [ ] Child and parent tenant IDs are consistent.
- [ ] New writes cannot create inconsistent ownership through the supported application paths.

---

## Phase 4 — Stronger schema constraints and controlled values

**Goal:** Move important business invariants from conventions into PostgreSQL.

### Tasks

- [ ] Inventory every free-form status, role, plan, kind, side, outcome, importance, sentiment, and purpose field.
- [ ] Prefer check constraints for values that change occasionally.
- [ ] Prefer Postgres enums only for values that are genuinely stable and centrally governed.
- [ ] Add constraints for valid analysis modes.
- [ ] Add constraints for valid subscription/payment states.
- [ ] Add constraints for valid role and organization-plan values.
- [ ] Add constraints for valid notification and theme values where useful.
- [ ] Add size limits for unbounded text/JSON payloads where operationally necessary.
- [ ] Add JSON schema/version fields to persisted AI and webhook payloads.
- [ ] Validate JSONB at application boundaries with Zod.
- [ ] Add migration tests for each new constraint.
- [ ] Add explicit `schema_version` to evolving persisted AI payloads.
- [ ] Review every `double precision` field used for money or accounting.
- [ ] Convert billing values to `numeric` or intentional integer minor units.
- [ ] Document precision requirements for crypto payments and exchange rates.

### Exit criteria

- [ ] Invalid state values are rejected by either PostgreSQL or a documented application validator.
- [ ] Billing calculations do not rely on binary floating-point representation.
- [ ] JSONB payloads have versioning and boundary validation.

---

## Phase 5 — Supabase roles, grants, and RLS staging implementation

**Goal:** Prove database-enforced tenant isolation in a non-production Supabase-compatible environment.

### Tasks

- [ ] Create or select an isolated staging Supabase project.
- [ ] Enable required extensions, including `vector`.
- [ ] Verify the migration executor role and object ownership.
- [ ] Verify whether creating `hamafx_admin` is supported and appropriate.
- [ ] Prefer the least-privileged role that can perform worker operations.
- [ ] Avoid granting broad privileges to `anon` and `authenticated` if the app does not use direct PostgREST access.
- [ ] Verify final grants after all migrations, not just migration names.
- [ ] Verify default privileges for future tables and sequences.
- [ ] Verify `service_role` is never exposed to the browser.
- [ ] Apply RLS migrations to staging.
- [ ] Enable and force RLS on every tenant-owned table.
- [ ] Exclude only deliberately global tables.
- [ ] Review whether any global table contains tenant-sensitive payloads.
- [ ] Replace deprecated authorization patterns with explicit policy roles and ownership predicates.
- [ ] Ensure update policies have both `USING` and `WITH CHECK`.
- [ ] Ensure views use `security_invoker=true` where applicable.
- [ ] Move privileged functions into a non-exposed schema where possible.
- [ ] Revoke default public execution on privileged functions.
- [ ] Review every `SECURITY DEFINER` function.
- [ ] Set a fixed `search_path` in any unavoidable `SECURITY DEFINER` function.

### RLS test matrix

For two tenants A and B:

- [ ] Tenant A cannot select tenant B rows.
- [ ] Tenant A cannot insert a row for tenant B.
- [ ] Tenant A cannot update a row into tenant B.
- [ ] Tenant A cannot delete tenant B rows.
- [ ] Unset tenant context returns no tenant-owned rows.
- [ ] Switching tenant context inside a transaction behaves correctly.
- [ ] Child rows cannot be inserted under a mismatched parent tenant.
- [ ] Admin worker can perform intended cross-tenant operations.
- [ ] Normal application role cannot bypass RLS.
- [ ] Anonymous and authenticated Supabase API roles cannot access unintended tables.
- [ ] Views do not bypass RLS.
- [ ] Functions do not accidentally bypass RLS.

### Exit criteria

- [ ] All RLS tests pass against real PostgreSQL/Supabase staging.
- [ ] Grants and policies are captured as an expected-state artifact.
- [ ] A failed tenant-isolation test blocks the shared-mode release.

---

## Phase 6 — Runtime RLS integration

**Goal:** Make tenant isolation reliable in the application runtime rather than merely present in SQL.

### Tasks

- [ ] Define the authoritative tenant resolution path from the authenticated session.
- [ ] Resolve and validate organization membership before opening a tenant transaction.
- [ ] Set `app.current_tenant` using a transaction-local setting.
- [ ] Prevent user-controlled tenant IDs from being trusted without membership validation.
- [ ] Ensure tenant context is set before any tenant-owned query.
- [ ] Ensure context cannot leak between pooled connections.
- [ ] Ensure every transaction clears or scopes context correctly.
- [ ] Route cross-tenant worker work through `getAdminDb()` only.
- [ ] Remove unsafe fallback from admin role to regular role when shared mode is active.
- [ ] Make worker/admin jobs declare whether they are cross-tenant.
- [ ] Add runtime assertions that tenant context exists for user-owned operations.
- [ ] Add request-level correlation between user, tenant, trace, and database operations.
- [ ] Update documentation so enabled RLS is the source of truth in shared mode.
- [ ] Run staging E2E with two independent users and organizations.
- [ ] Run failure tests with missing, invalid, and revoked memberships.

### Rollout strategy

1. Deploy code that supports RLS but leaves it disabled.
2. Run shadow integrity checks and log would-be RLS failures.
3. Enable RLS in staging.
4. Run unit, integration, E2E, worker, and queue tests.
5. Enable RLS for a controlled production canary only if supported operationally.
6. Monitor denied queries, empty-result anomalies, queue failures, and latency.
7. Expand only after the canary is stable.

### Exit criteria

- [ ] No user-facing operation depends solely on an unvalidated tenant ID.
- [ ] Staging shared-mode E2E passes.
- [ ] Worker and admin operations pass with explicit privileged access.
- [ ] No tenant context leakage occurs across pooled connections.

---

## Phase 7 — Query and index performance hardening

**Goal:** Ensure correctness improvements do not create unacceptable latency or database load.

### Tasks

- [ ] Capture top queries by total time, mean time, calls, and rows returned.
- [ ] Run `EXPLAIN (ANALYZE, BUFFERS)` on the top user-facing queries in staging.
- [ ] Verify every tenant/time query has a matching composite index.
- [ ] Verify indexes match actual sort and filter order.
- [ ] Identify unused or redundant indexes.
- [ ] Review duplicate indexes introduced by historical migrations.
- [ ] Remove only after confirming no critical low-frequency use.
- [ ] Add partial indexes for active/open/unfinished rows where appropriate.
- [ ] Add indexes for queue claim predicates and lease expiry.
- [ ] Add indexes for billing webhook replay and stale failure queries.
- [ ] Add indexes for account/session cleanup.
- [ ] Add indexes for tenant membership checks.
- [ ] Test vector search with the actual embedding model and dimension.
- [ ] Verify HNSW parameters and query operator consistency.
- [ ] Route analytics/reporting reads to a replica only where stale reads are acceptable.
- [ ] Keep read-after-write paths on the primary.
- [ ] Define a connection budget for Vercel instances, worker, admin, and migrations.
- [ ] Set alerts for connection pool exhaustion and statement timeouts.

### Index review query

```sql
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;
```

### Exit criteria

- [ ] Top queries have reviewed plans.
- [ ] No critical query relies on an accidental sequential scan at expected production volume.
- [ ] Connection usage remains below the agreed safety threshold under load.
- [ ] Read-replica routing has explicit consistency rules.

---

## Phase 8 — High-write market and telemetry scale plan

**Goal:** Prevent live ticks, candles, telemetry, and traces from overwhelming the shared database.

### Tasks

- [ ] Measure daily row growth for `live_ticks`, `candles_1m`, `chat_telemetry`, `chat_tool_telemetry`, and `diagnostic_traces`.
- [ ] Define hot, warm, and archive retention windows.
- [ ] Decide whether every live tick needs durable storage.
- [ ] Keep only the minimum tick history required by product features.
- [ ] Add bounded retention for high-write data.
- [ ] Evaluate monthly time partitioning when table size or vacuum time crosses agreed thresholds.
- [ ] Design partitions before they are urgently needed.
- [ ] Ensure unique/upsert constraints work with the partitioning strategy.
- [ ] Consider a dedicated hot-current-price representation separate from historical ticks.
- [ ] Ensure worker writes are idempotent and do not duplicate ticks.
- [ ] Add worker backpressure when database latency rises.
- [ ] Add queueing or batching for non-critical telemetry.
- [ ] Keep user-facing writes prioritized over low-value diagnostics.
- [ ] Monitor autovacuum and dead tuples by table.
- [ ] Use partition dropping for large time-window deletion where appropriate instead of repeated deletes.

### Suggested initial policy

| Table | Initial policy | Future trigger |
|---|---|---|
| `live_ticks` | Short hot window | Partition or externalize when growth is sustained |
| `candles_1m` | Product-defined historical window | Partition by month/year |
| `chat_telemetry` | 90 days | Partition if query/vacuum cost rises |
| `chat_tool_telemetry` | 90 days | Partition with chat telemetry |
| `diagnostic_traces` | 30 days | Partition or archive if traces grow rapidly |
| `news_articles` | Product/search retention | Archive after semantic usefulness declines |
| `news_embeddings` | Match source article lifecycle | Delete with source article |

### Exit criteria

- [ ] Growth and retention are measured, not guessed.
- [ ] The worker remains healthy at expected symbol and tick volume.
- [ ] High-write tables have a documented partitioning threshold.
- [ ] Retention cleanup does not cause sustained bloat or lock pressure.

---

## Phase 9 — Billing and accounting hardening

**Goal:** Make billing states auditable, reconstructable, and financially safe.

### Tasks

- [ ] Inventory all billing monetary columns and convert floating-point values where necessary.
- [ ] Define currency and precision rules for fiat and crypto.
- [ ] Add immutable billing event history.
- [ ] Store provider event IDs and hashes.
- [ ] Store the received-at timestamp and processing-at timestamp.
- [ ] Store the state transition source.
- [ ] Store a sanitized provider payload or a secure reference to it.
- [ ] Keep webhook deduplication keys unique.
- [ ] Make all webhook transitions idempotent.
- [ ] Define legal/accounting retention for payment records.
- [ ] Separate user deletion from legally required billing retention.
- [ ] Add reconciliation jobs against the payment provider.
- [ ] Add alerts for pending, failed, replayed, and dead-letter webhook states.
- [ ] Add invariant checks for subscription/payment relationships.
- [ ] Add tests for duplicate, reordered, delayed, malformed, and conflicting webhooks.
- [ ] Add an operator report that reconstructs subscription state from events.

### Exit criteria

- [ ] Current billing state can be reconstructed from immutable events.
- [ ] Duplicate and reordered webhooks cannot produce incorrect entitlement state.
- [ ] Monetary calculations use an exact representation.
- [ ] Reconciliation failures are visible and actionable.

---

## Phase 10 — Backup, restore, and disaster recovery

**Goal:** Establish a tested recovery capability with known RPO/RTO.

### Tasks

- [ ] Define target RPO and RTO for user data, billing, market data, and telemetry separately.
- [ ] Configure an independent private backup destination.
- [ ] Use restricted backup credentials.
- [ ] Encrypt backups at rest and in transit.
- [ ] Configure lifecycle retention and old-version cleanup.
- [ ] Back up database data and required schema metadata.
- [ ] Define whether Supabase PITR/backups are sufficient for each plan tier.
- [ ] Keep an off-platform backup for catastrophic provider/account failure.
- [ ] Verify backup completion with a heartbeat, not merely a local exit code.
- [ ] Run weekly restore verification in an isolated environment.
- [ ] Restore the latest backup and apply only the expected migrations.
- [ ] Run row-count and invariant assertions after restore.
- [ ] Verify encrypted data can be decrypted with the active key.
- [ ] Verify billing reconciliation after restore.
- [ ] Verify queue/outbox recovery and idempotent replay.
- [ ] Document operator recovery steps and ownership.
- [ ] Run a quarterly disaster-recovery drill.

### Restore acceptance checks

- [ ] Schema matches expected migration state.
- [ ] Critical table row counts are within expected ranges.
- [ ] No orphaned child rows exist.
- [ ] No null tenant IDs exist where prohibited.
- [ ] User login works.
- [ ] 2FA works.
- [ ] BYOK decryption works.
- [ ] Queue claims work.
- [ ] Billing state is internally consistent.
- [ ] Worker can restart without duplicate processing.

### Exit criteria

- [ ] Backup completion is monitored.
- [ ] Restore is performed automatically or by a documented repeatable job.
- [ ] Restore results are retained as evidence.
- [ ] RPO/RTO targets are measured in a drill.

---

## Phase 11 — Retention, privacy, and deletion governance

**Goal:** Ensure data does not live forever and account deletion is complete.

### Tasks

- [ ] Create a retention matrix for all 62 tables.
- [ ] Classify data as public, internal, personal, credential, financial, or security-sensitive.
- [ ] Define retention for chat messages and journal entries.
- [ ] Define retention for billing records according to legal/accounting requirements.
- [ ] Define retention for webhook payloads and DLQ records.
- [ ] Define retention for sessions and verification tokens.
- [ ] Define retention for traces and AI tool telemetry.
- [ ] Ensure embeddings are deleted when source records are deleted.
- [ ] Ensure soft-deleted records are eventually purged where appropriate.
- [ ] Ensure account deletion removes encrypted credentials.
- [ ] Ensure account deletion revokes sessions and increments token version.
- [ ] Ensure account deletion removes or anonymizes user-owned AI traces.
- [ ] Define audit-log deletion/anonymization rules.
- [ ] Document backup deletion limitations and timelines.
- [ ] Add a deletion verification report.
- [ ] Add tests for deletion cascades and orphan prevention.

### Sensitive-data controls

- [ ] Redact secrets before diagnostic persistence.
- [ ] Redact prompts and outputs unless explicitly approved.
- [ ] Redact payment provider secrets from webhook payloads.
- [ ] Never persist raw API keys in telemetry.
- [ ] Version encrypted payload formats.
- [ ] Test encryption-key rotation on staging data.
- [ ] Test partial rotation failure and safe retry.

### Exit criteria

- [ ] Every table has an owner, classification, retention rule, and deletion behavior.
- [ ] Account deletion has an automated end-to-end test.
- [ ] Sensitive data is redacted before persistence.

---

## Phase 12 — Observability and operational controls

**Goal:** Detect database problems before users discover them.

### Metrics

Add or verify metrics for:

- [ ] database connection utilization
- [ ] connection acquisition latency
- [ ] query latency p50/p95/p99
- [ ] statement timeout count
- [ ] retry count by SQLSTATE
- [ ] deadlocks
- [ ] lock waits
- [ ] failed transactions
- [ ] migration duration/failure
- [ ] table size and daily growth
- [ ] dead tuples and autovacuum lag
- [ ] queue depth
- [ ] oldest pending queue age
- [ ] stale leases
- [ ] outbox dead letters
- [ ] billing webhook failures
- [ ] provider quota anomalies
- [ ] tenant-integrity violations
- [ ] RLS denied-query count
- [ ] read-replica lag
- [ ] backup success/failure
- [ ] restore verification result

### Alerts

Page or notify on:

- [ ] database unavailable
- [ ] connection pool saturation
- [ ] sustained statement timeouts
- [ ] deadlocks or lock waits above threshold
- [ ] disk/storage threshold
- [ ] autovacuum falling behind
- [ ] queue oldest-age threshold
- [ ] dead-letter growth
- [ ] billing reconciliation mismatch
- [ ] backup failure
- [ ] restore verification failure
- [ ] unexpected tenant-integrity violation
- [ ] unexpected grant/RLS drift
- [ ] migration pending after deployment

### Operational reports

Create read-only admin reports for:

- [ ] database health
- [ ] schema/migration health
- [ ] table growth
- [ ] index usage
- [ ] queue health
- [ ] billing reconciliation
- [ ] tenant integrity
- [ ] retention cleanup
- [ ] backup/restore status

### Exit criteria

- [ ] Operators can identify whether an incident is caused by connectivity, locks, query plans, storage, queue backlog, or application errors.
- [ ] Alerts include actionable context without secrets or user content.

---

## 5. Testing strategy

### 5.1 Unit tests

Add or maintain tests for:

- [ ] environment/database URL validation
- [ ] tenant context resolution
- [ ] repository ownership requirements
- [ ] encryption and key rotation
- [ ] retention configuration bounds
- [ ] migration SQL generation rules
- [ ] schema value constraints
- [ ] billing state transitions
- [ ] queue claim/retry behavior
- [ ] redaction behavior

### 5.2 PGlite integration tests

Continue using PGlite for:

- [ ] migration chain correctness
- [ ] migration idempotence
- [ ] basic constraints
- [ ] query helper behavior
- [ ] queue/idempotency behavior
- [ ] retention logic

Do not treat PGlite as proof of:

- RLS correctness
- grants
- role behavior
- Supabase pooler behavior
- pgvector performance
- security-definer behavior

### 5.3 Real PostgreSQL integration tests

Add a CI or staging suite using PostgreSQL with:

- [ ] pgvector
- [ ] RLS
- [ ] multiple roles
- [ ] tenant policies
- [ ] transaction-local tenant context
- [ ] real indexes
- [ ] real migration tracking

### 5.4 Two-tenant test matrix

Every tenant-owned domain must test:

- [ ] tenant A reads own data
- [ ] tenant A cannot read tenant B data
- [ ] tenant A updates own data
- [ ] tenant A cannot update tenant B data
- [ ] tenant A deletes own data
- [ ] tenant A cannot delete tenant B data
- [ ] invalid tenant context returns no data
- [ ] parent/child tenant mismatch is rejected
- [ ] admin worker can perform intended cross-tenant work

### 5.5 Load tests

Add database-focused load scenarios for:

- [ ] concurrent chat turns
- [ ] telemetry writes
- [ ] live tick ingestion
- [ ] candle upserts
- [ ] queue claims by multiple workers
- [ ] concurrent budget reservations
- [ ] webhook retries
- [ ] retention cleanup during normal traffic

Measure:

- p95/p99 latency
- connection utilization
- lock waits
- deadlocks
- throughput
- error rate
- queue age
- storage growth

---

## 6. Migration implementation order

Use the following order to minimize risk:

1. Read-only production inventory.
2. Configuration/documentation corrections.
3. Query ownership audit and negative tests.
4. Tenant integrity checks with no schema changes.
5. Schema constraints and composite ownership relationships.
6. Billing numeric/event-history changes.
7. Observability and backup verification.
8. High-write retention/index improvements.
9. Staging RLS and role/grant implementation.
10. Staging runtime RLS integration.
11. Shared-mode canary only after all acceptance criteria pass.

Do not combine the first production RLS activation with unrelated performance, billing, or market-data migrations.

---

## 7. Rollout and rollback strategy

### Before every production migration

- [ ] Confirm clean git state for the migration work.
- [ ] Review generated SQL manually.
- [ ] Confirm migration is new and idempotent.
- [ ] Confirm direct migration URL.
- [ ] Confirm backup exists and is verifiable.
- [ ] Confirm rollback/recovery procedure.
- [ ] Confirm expected lock duration.
- [ ] Confirm feature flags and application compatibility.
- [ ] Confirm staging tests pass.

### During migration

- [ ] Monitor database connections.
- [ ] Monitor locks.
- [ ] Monitor error rate.
- [ ] Monitor application health.
- [ ] Do not manually edit migration tracking rows unless following the documented reconciliation process.

### After migration

- [ ] Run migration status.
- [ ] Run schema reconciliation.
- [ ] Verify expected tables, columns, indexes, constraints, policies, and grants.
- [ ] Run smoke tests.
- [ ] Run tenant-isolation tests if relevant.
- [ ] Verify worker health.
- [ ] Verify queue and billing health.
- [ ] Record migration duration and results.

### Rollback philosophy

Prefer forward fixes. For irreversible changes:

- stop new writes if necessary
- preserve a backup
- deploy a compatibility fix
- restore only when forward repair is unsafe
- reconcile queues and billing after restore
- never assume a web rollback reverses a database migration

---

## 8. Definition of done

The remediation program is complete when all of the following are true:

### Security and isolation

- [ ] Production mode is explicitly single-user or shared multi-tenant.
- [ ] No ambiguous configuration can silently enable unsafe behavior.
- [ ] Every user-facing query has an ownership boundary.
- [ ] Shared mode has real PostgreSQL RLS tests.
- [ ] Tenant/user membership consistency is enforced.
- [ ] Public grants and privileged roles match the approved expected state.
- [ ] No secrets are exposed in client bundles, logs, traces, or database telemetry.

### Correctness

- [ ] Schema and migration journal match production.
- [ ] Important business states have database/application validation.
- [ ] Billing state is idempotent and reconstructable.
- [ ] Queue and outbox processing is recoverable.
- [ ] Account deletion and retention behavior are verified.

### Performance and scale

- [ ] Top queries have reviewed execution plans.
- [ ] Connection budgets are defined and monitored.
- [ ] High-write tables have retention and partitioning thresholds.
- [ ] Indexes are reviewed using production statistics.
- [ ] Read-replica behavior is explicitly documented.

### Operations

- [ ] Backups are independent, monitored, and restore-tested.
- [ ] Database health and growth are observable.
- [ ] Queue, billing, migration, and tenant-integrity alerts exist.
- [ ] Disaster recovery meets measured RPO/RTO targets.

---

## 9. Suggested issue breakdown

Create implementation issues in this order:

1. `DB-001` Production read-only Supabase inventory
2. `DB-002` Canonical database environment contract
3. `DB-003` Query ownership and IDOR audit
4. `DB-004` Two-user isolation tests for current runtime
5. `DB-005` Tenant membership and parent-child integrity checks
6. `DB-006` Status/role/value constraints
7. `DB-007` Billing numeric precision review
8. `DB-008` Immutable billing event history
9. `DB-009` Database metrics and alerts
10. `DB-010` Independent backups and restore verification
11. `DB-011` Full retention/data-classification matrix
12. `DB-012` High-write market/telemetry growth plan
13. `DB-013` Real PostgreSQL RLS test environment
14. `DB-014` Supabase grants and role hardening
15. `DB-015` Runtime tenant-context integration
16. `DB-016` Shared-mode staging E2E
17. `DB-017` Shared-mode production canary plan
18. `DB-018` Final migration/schema drift gate

Each issue should include:

- affected tables/files
- risk classification
- migration requirement
- test requirement
- rollback/recovery requirement
- operational owner
- acceptance evidence

---

## 10. Immediate next actions

The safest next implementation sequence is:

1. Run the read-only Supabase inventory from Phase 0.
2. Save the result as a redacted audit artifact.
3. Build the complete query ownership matrix.
4. Add two-user negative tests before changing RLS flags.
5. Verify production grants, roles, extensions, and migration state.
6. Decide whether the product’s near-term target is still single-user OSS or shared multi-tenant SaaS.
7. Execute only the matching roadmap branch.

Until that decision and verification are complete, keep:

```env
MULTI_USER_ENABLED=false
KESTREL_ENABLE_RLS=false
```

for the supported OSS production mode.

---

## 11. Execution status log

### 2026-08-26 batch: settings, symbols, sessions, and tenant-scoped CRUD hardening

Completed:

- Added canonical tenant predicates to user settings reads/updates, provider-health reads, encrypted BYOK reads, user symbol reads/writes/counts, watchlist reads/reorders, and user session list/revoke/delete operations.
- Added canonical tenant derivation to session creation and encrypted API-key updates in the auth query layer.
- Corrected `countUserSymbols` to return an aggregate count instead of a boolean-like `0`/`1` result.
- Added tenant predicates to the reviewed user-facing CRUD paths for threads/messages, alerts, journal, portfolio, and push subscriptions; message writes now persist the resolved tenant and journal updates cannot accept a caller-supplied tenant field.
- Added five-case two-user regression coverage for diagnostic/billing isolation, canonical tenant-derived writes, settings/symbol/provider/session boundaries, and cross-tenant billing updates.

Verification passed:

- `pnpm --filter @kestrel/db typecheck`
- `pnpm --filter @kestrel/db test -- --run test/ownership-isolation.test.ts`: 1 file, 5 tests
- `pnpm --filter @kestrel/db build`
- `git diff --check`

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: live inventory and repository guardrails

Completed:

- Linked the Supabase project `cxljcbrygnkobqnyxxeg` using the local Supabase CLI; CLI database commands were blocked by this environment's IPv6-only direct host, so the read-only session-pooler path was used for metadata queries.
- Recorded the live baseline listed at the top of this document. The inventory was metadata-only and did not select raw prompts, payment payloads, credentials, or message content.
- Added `pnpm --filter @kestrel/db inventory:live` with `--json` support at `packages/db/scripts/supabase-inventory.mjs`.
- Added `resolveMigrationDatabaseUrl`, `isTransactionPoolerUrl`, and direct/session URL validation to `@kestrel/shared`; migration apply now refuses transaction-pooler URLs.
- Added canonical `getTenantIdForUser` and `requireTenantIdForUser`; billing subscription, payment, checkout-claim, and payment-creation paths now resolve organization membership instead of copying `userId` into `tenant_id`.
- Hardened legacy DB thread helpers so message reads, message writes, message counts, and pinned-symbol updates require the owning user.
- Fixed trace-explorer agent-opinion filtering so a correlated message/thread ID cannot bypass the requested user scope.
- Added a parent ownership predicate to feedback deletion.
- Added organization membership rows to the two-tenant fixture.
- Extracted the reusable two-tenant seed helper to `packages/db/test/fixtures/two-tenant.ts`.
- Added canonical tenant resolver coverage and corrected the fixture to follow the current personal-organization trigger model.
- Made the inventory command load `.env.local`/`.env.production.local`, prefer the reachable runtime pooler unless `SUPABASE_INVENTORY_DATABASE_URL` is explicit, use bounded PostgreSQL statistics for large tables, enforce a statement timeout, and decode `SUPABASE_CA_CERT` correctly.

Verification passed:

- `@kestrel/shared` typecheck
- `@kestrel/shared` tests: 16 files, 364 tests
- `@kestrel/shared` environment tests: 51 tests
- `@kestrel/db` typecheck and build
- `@kestrel/ai` typecheck
- `@kestrel/web` typecheck
- Focused DB ownership suite: 1 file, 5 tests
- Full DB suite: 25 files, 175 tests
- Direct inventory: verified, 0 query errors
- Package inventory command: verified, 0 query errors

Live inventory evidence from the session pooler:

- PostgreSQL `17.6`; extensions include `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp`, and `vector` `0.8.2`.
- `62` public tables; `22` tables with RLS enabled and forced; `22` policies.
- The inventory role is `postgres` with `rolbypassrls=true`; this confirms the baseline connection is privileged and does not validate application-role RLS behavior.
- `88` applied Drizzle migrations; database size `42,290,323` bytes.
- Estimated rows: `7` users, `7` organizations, `7` memberships, `173` threads, `157` messages, `307` chat telemetry rows, `105` tool telemetry rows, `202` diagnostic traces, `118,983` one-minute candles, `16` full-analysis queue rows, and `2` nonterminal outbox rows.
- Integrity checks: no users without memberships, no orphan memberships, no null tenant IDs in settings/threads/messages, no pending billing DLQ rows.

Known non-blocking warning: Vitest/esbuild reports the repository's existing `ES2024` target warning. Shared encryption tests intentionally emit structured error logs while asserting failure behavior.

### 2026-08-26 batch: telemetry, memory, accounting, and durable queue ownership

Completed:

- Added canonical tenant predicates to usage telemetry reads, daily-spend aggregation, agent-opinion reads/writes, AI shadow-comparison reads/writes, and telemetry persistence for authenticated users.
- Preserved explicit `__system__` behavior for worker/system telemetry while keeping admin/global telemetry paths separate from user-facing usage reads.
- Added tenant-aware memory projection and backfill state transitions, including tenant predicates on claims, completion, failure, and reads.
- Added tenant-aware daily AI spend and durable budget reservation accounting; reservations now persist the resolved tenant through atomic reserve, reconcile, and release paths.
- Resolved the authenticated tenant before Full-analysis queue admission and passed that identity through the database-backed queue path.
- Updated AI test doubles and queue fixtures to model organization membership and current model-resolution contracts.

Verification passed:

- Full `@kestrel/ai` suite: 145 test files, 1,260 tests.
- `@kestrel/shared`, `@kestrel/db`, `@kestrel/ai`, and `@kestrel/web` typechecks.
- `git diff --check`.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: direct web boundaries, onboarding, export, and worker tenant handoff

Completed:

- Added canonical tenant predicates to settings preference, model, API-key, provider-health, symbol, onboarding, and market-preference reads and writes.
- Hardened data export so settings, threads, messages, journal entries, alerts, symbols, push subscriptions, memories, shared snapshots, telemetry, daily spend, briefings, and audit logs are all filtered by the authenticated user and resolved tenant; message export additionally verifies the parent thread tenant.
- Added tenant persistence to onboarding settings/watchlist inserts and tenant predicates to onboarding updates/deletes and the onboarding page read.
- Added tenant scoping to the provider-test API route and API-key settings page; the existing server-only API boundary remains the composition edge.
- Returned the queue row tenant from Full-analysis claims and used it for the worker's user-settings read and fallback budget reservation, preventing same-user cross-tenant drift during asynchronous execution.
- Classified intentional non-user-scoped paths: admin feedback/tool telemetry/Mastra-run views are privileged cross-tenant reads behind `withAdminAuth`; `listAllUserSettings` is a worker-wide usage-alert scan; `cron_runs` and `organization` catalog queries are operational/global; `symbol_catalog` rows under `__system__` are shared reference data; authentication/user/session-token lookups are identity-bound rather than tenant-owned.
- Updated affected web test doubles for the expanded server-boundary contract without weakening production checks.

Verification passed:

- `@kestrel/db`, `@kestrel/ai`, `@kestrel/web`, and `@kestrel/worker` typechecks.
- `@kestrel/ai` build completed and refreshed workspace declarations.
- DB ownership suite: 1 file, 5 tests passed.
- AI persistence/queue focus: 3 files, 21 tests passed.
- Web settings/health focus: 2 files, 44 tests passed.
- Web admin diagnostics/onboarding focus: 3 files, 11 tests passed.
- `git diff --check` passed.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: AI chat, fork, and notification ownership hardening

Completed:

- Added canonical tenant predicates and tenant persistence to the AI portfolio service, bulk thread deletion, notification noise state/config, settings service, and onboarding reset paths.
- Added canonical tenant predicates to the AI thread persistence implementation for listing, lookup, creation, title/pinned/mode updates, deletion, and fork source validation.
- Added tenant predicates and tenant persistence to AI message reads/writes, forked messages, and idempotency recovery lookups.
- Kept catalog (`__system__`), admin onboarding reset, and worker queue claim paths explicitly separate from user-facing ownership checks.

Verification passed:

- `@kestrel/db`, `@kestrel/ai`, and `@kestrel/web` typechecks.
- Focused AI persistence suite: 4 files, 29 tests passed (`idor-persistence`, `fork-thread`, `push-persistence`, and `mastra-v2-full-analysis`).
- Focused DB ownership suite: 1 file, 5 tests passed.
- `git diff --check`.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: mutation, AI domain persistence, briefing, and memory tenant integrity

Completed:

- Extended `executeMutationOnce` so the canonical membership-derived tenant is passed into the atomic business callback; mutation confirmation alert, journal, and shared-snapshot writes now persist that tenant explicitly.
- Added tenant persistence to mutation audit rows and tenant-aware mutation ledger replay/update predicates, including immutable tenant validation during replay.
- Hardened AI alert persistence reads, writes, delivery leases, fired-state transitions, rule updates, and deletes with canonical tenant predicates; the cron-wide evaluable scan remains intentionally operational/global.
- Hardened AI journal list/get/create/update/delete/stats paths with canonical tenant predicates and explicit tenant writes.
- Added explicit tenant persistence to AI shared-snapshot creation while preserving the public token-authorized snapshot read as an intentional non-user-session path.
- Added canonical tenant predicates and tenant persistence to briefing threads, emitted-briefing idempotency records, and latest-briefing message reads; economic-event lookup remains global reference data.
- Removed the memory persistence fallback that copied `userId` into `tenantId`; memory writes/search now require membership-derived tenant identity and reject mismatched tenant hints, while memory count queries include tenant scope.
- Updated AI memory and IDOR test doubles/assertions for the canonical tenant contract.

Verification passed:

- AI focused ownership/persistence tests: 3 files, 13 tests passed.
- DB mutation and ownership tests: 2 files, 10 tests passed.
- `@kestrel/db` and `@kestrel/ai` builds completed; workspace declarations refreshed.
- `@kestrel/ai`, `@kestrel/db`, `@kestrel/web`, and `@kestrel/worker` typechecks passed.
- `git diff --check` passed.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed. Existing Vitest/esbuild `ES2024` target warnings remain non-blocking.

### 2026-08-26 batch: Telegram, chart-image, diagnostics, journal stats, feedback, and regression ownership

Completed:

- Added canonical tenant resolution and tenant predicates to Telegram's deterministic chat-thread lookup and creation path.
- Added parent-thread ownership and canonical tenant checks before chart-image analysis reads a user's latest image message.
- Added tenant filtering to journal statistics and per-symbol/per-tag breakdown queries.
- Changed system diagnostics user-owned counts for journals, briefings, and memories to use the authenticated canonical tenant; global market snapshots and intermarket reference data remain intentionally global.
- Hardened user feedback reads, writes, deletes, and message-parent validation with canonical tenant scope; upserts now refresh the tenant value on conflict.
- Hardened regression-case source joins, prompt lookup, user listing, status updates, and dismissal updates with tenant consistency checks and explicit tenant persistence.
- Updated the diagnostics test double to model the tenant resolver and tenant columns required by the production contract.

Verification passed:

- AI focused diagnostics/journal/Telegram suite: 4 files, 61 tests passed.
- DB feedback/regression/ownership suite: 3 files, 9 tests passed.
- `@kestrel/ai` and `@kestrel/db` typechecks passed.
- `git diff --check` passed.

Test-only note: the AI diagnostics focus emits existing structured persistence warnings because no database URL is configured in the isolated test environment; the assertions pass and no production write occurs. Vitest/esbuild also reports the repository's existing `ES2024` target warning.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: bot links, push subscriptions, audit writers, and governed dataset joins

Completed:

- Added canonical membership-derived tenant persistence to Telegram/bot-link creation and replacement, preventing link records from relying on a database default or carrying a stale tenant.
- Made Telegram chat resolution validate the bot link against an active user-to-organization membership before returning a user identity.
- Added canonical tenant predicates to bot unlink and linked-account reads.
- Added canonical tenant resolution to AI push subscription list, save/upsert, and delete paths; endpoint conflict updates now require both the owning user and tenant.
- Made the shared `createAuditLog` helper resolve and persist the canonical tenant, and routed password-reset and password-change audit events through that helper.
- Hardened governed training-dataset export joins so feedback, assistant messages, parent threads, and preceding prompt messages must agree on thread/user/tenant ownership.
- Updated the push persistence test double and assertions for the tenant-aware conflict predicate.

Verification passed:

- AI push/linking focus: 2 files, 7 tests passed.
- DB training/ownership/regression focus: 3 files, 8 tests passed in the final rerun; the earlier combined run also passed the full 29-test training/phase contract focus.
- `@kestrel/ai`, `@kestrel/db`, and `@kestrel/web` typechecks passed.
- `git diff --check` passed.

Known non-blocking warning: Vitest/esbuild reports the repository's existing `ES2024` target warning.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: usage aggregation, agent-opinion parent integrity, and queue lookup ownership

Completed:

- Added canonical membership-derived tenant filtering to the per-agent and per-mode usage aggregation route.
- Added parent thread/message consistency joins to usage aggregation and database agent-opinion reads, preventing malformed or cross-tenant opinion rows from affecting user-visible totals.
- Added parent ownership validation before AI agent-opinion writes; a message must belong to the requested user's tenant-owned thread and share the canonical tenant.
- Added tenant predicates to user-facing Full-analysis queue run lookup while preserving worker recovery, purge, and queue-claim scans as explicit operational paths.
- Preserved the queue claim's resolved `tenantId` through the Mastra worker boundary and added regression coverage for that returned identity.
- Added real PGlite IDOR coverage for valid opinion persistence, foreign-parent rejection, wrong-tenant opinion filtering, and user-scoped message reads.

Verification passed:

- AI ownership/queue focus: 2 files, 20 tests passed (`idor-persistence`, `mastra-v2-full-analysis`).
- DB ownership/training focus: 2 files, 6 tests passed.
- Web settings/health focus: 2 files, 44 tests passed.
- `@kestrel/ai`, `@kestrel/db`, and `@kestrel/web` typechecks passed.
- `@kestrel/worker` typecheck passed.
- `@kestrel/ai` build completed and refreshed workspace declarations.
- `git diff --check` passed.

Known non-blocking warning: Vitest/esbuild reports the repository's existing `ES2024` target warning.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: implicit admin fallback authorization hardening

Completed:

- Tightened the single-user admin fallback so an implicit admin is granted only when the authenticated account is the sole user and no explicit admin role exists.
- Prevented the earliest regular account from retaining admin access after a second regular account is created.
- Added a regression test covering the multi-user/no-explicit-admin case.
- Classified the global admin-audit table and admin diagnostic views as intentional privileged paths protected by `withAdminAuth`; they are not tenant-user query surfaces.

Verification passed:

- Web admin-auth suite: 1 file, 9 tests passed.
- `@kestrel/web` typecheck passed.
- `git diff --check` passed.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: exact AI budget cent accounting

Completed:

- Changed `daily_ai_spend.total_usd_cents`, `ai_budget_reservations.reserved_usd_cents`, and `ai_budget_reservations.actual_usd_cents` from floating-point storage to Postgres `bigint` integer cents.
- Added idempotent migration `0089_exact_budget_cents`, which rounds legacy fractional values once during conversion and leaves already-converted databases unchanged.
- Updated Drizzle schemas to use `bigint(..., { mode: 'number' })`, matching the runtime's existing integer-cent reserve/reconcile arithmetic.
- Registered the migration in Drizzle's journal/hash metadata and added a fresh-chain assertion for all three column types.

Verification passed:

- Full migration-chain suite: 1 file, 13 tests passed, including migration `0089` and exact bigint type checks.
- AI cost/budget suite: 2 files, 37 tests passed.
- `@kestrel/db`, `@kestrel/ai`, `@kestrel/web`, and `@kestrel/worker` typechecks passed.
- `git diff --check` passed.

Operational note: migration `0089` is new and has not been applied to live Supabase. It must be applied later through the direct/session-capable migration URL after production backup and status checks.

### 2026-08-26 batch: canonical tenant resolver fail-closed behavior

Completed:

- Updated `getTenantIdForUser` to ignore memberships for deleted organizations.
- Changed tenant resolution to fail closed when a user has more than one active organization membership instead of selecting an arbitrary row with `LIMIT 1`.
- Added PGlite coverage for ambiguous membership rejection and deleted-organization filtering.
- Preserved the existing personal-organization behavior for users with exactly one active membership.

Verification passed:

- DB ownership-isolation suite: 1 file, 8 tests passed.
- `@kestrel/db`, `@kestrel/ai`, `@kestrel/web`, and `@kestrel/worker` typechecks passed.
- `git diff --check` passed.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: account deletion secret and session cleanup

Completed:

- Added an atomic `deleteUserAccount` database helper for account deletion.
- Account deletion now keeps an anonymized user tombstone for retained billing/audit references while removing `user_settings` and encrypted BYOK/Telegram credentials.
- Removed OAuth account tokens, database-backed NextAuth sessions, verification tokens, and tracked JWT sessions in the same transaction.
- Reset password, 2FA, lockout, and recovery fields on the tombstone so deleted credentials cannot be reused.
- Routed the web account-deletion action through the transaction instead of issuing partial independent writes.
- Added a PGlite regression proving secrets and auth sessions are removed while the tombstone remains.

Verification passed:

- DB build completed and refreshed workspace declarations.
- DB ownership-isolation suite: 1 file, 7 tests passed.
- `@kestrel/ai` typecheck passed.
- `@kestrel/db` and `@kestrel/web` typechecks passed.
- `git diff --check` passed.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: thread child-tenant integrity

Completed:

- Added `chat_messages.tenant_id = chat_threads.tenant_id` predicates to the legacy DB message-list and message-count helpers.
- Added a PGlite regression that inserts a message under a valid thread with a mismatched child tenant and verifies the row is excluded from both reads and counts.
- Preserved the existing user and parent-thread ownership checks while closing the remaining denormalized child-tenant inconsistency.

Verification passed:

- DB ownership-isolation suite: 1 file, 6 tests passed, including the mismatched child-tenant regression.
- `@kestrel/db`, `@kestrel/ai`, and `@kestrel/web` typechecks passed.
- `git diff --check` passed.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: diagnostics, feedback parent integrity, and session ownership

Completed:

- Changed system-diagnostics journals, briefings, and memory counts to scope by both the authenticated user and canonical tenant, avoiding shared-organization aggregate leakage.
- Added chat-message parent validation to feedback reads and deletes; feedback now requires a matching user-owned thread and message with the canonical tenant.
- Bound session revocation validation to both the token user and session ID, preventing a session row belonging to another user from satisfying JWT validation.
- Replaced the JWT callback's raw `user_sessions` insert with the canonical membership-derived session helper.
- Routed account deletion through the tenant-scoped bulk session deletion helper.
- Tightened implicit admin fallback to require exactly one user and no explicit admin role; a second regular account now removes implicit admin access.
- Added regression coverage for session-owner mismatch and multi-user implicit-admin denial.

Verification passed:

- Web session/admin focus: 2 files, 14 tests passed.
- AI diagnostics/IDOR focus: 2 files, 11 tests passed.
- DB feedback/ownership focus: 2 files, 7 tests passed.
- `@kestrel/web`, `@kestrel/ai`, and `@kestrel/db` typechecks passed.
- `@kestrel/worker` typecheck passed in the preceding queue batch.
- `git diff --check` passed.

Known non-blocking warning: Vitest/esbuild reports the repository's existing `ES2024` target warning; security tests intentionally emit structured failure logs while asserting fail-closed behavior.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: late tenant-table RLS coverage

Completed:

- Added idempotent migration `0090_rls_late_tenant_tables` for tenant-owned relations introduced after the original Phase 3 cutover.
- Enabled and forced RLS with the standard `tenant_isolation` policy on subscriptions, payments, billing checkout attempts, AI budget reservations, persistence outbox, AI feedback, AI shadow comparisons, AI regression cases, mutation executions, Full-analysis queue, memory backfill state, memory projection state, and AI quality results.
- Registered migration `0090` in Drizzle journal/hash metadata.
- Added a full-chain regression that verifies all 13 late tenant tables have forced RLS and a `tenant_isolation` policy.
- Explicitly left global/admin registries and tables without a tenant-context contract outside this migration, including plans, webhook/IPN registries, evaluation datasets, and diagnostic traces.

Verification passed:

- Full migration-chain suite: 1 file, 14 tests passed, including the 13-table RLS coverage assertion.
- Migration hash-stability suite: 1 test passed.
- `@kestrel/db` typecheck passed.
- `git diff --check` passed.

Operational note: migration `0090` is new and has not been applied to live Supabase. Before enabling shared RLS runtime, production must apply it through the direct migration URL and verify request transaction-local tenant context with a non-bypass role.

### 2026-08-26 batch: privileged diagnostic trace boundary

Completed:

- Added explicitly named `getDiagnosticTraceForAdmin` and `listDiagnosticTracesForAdmin` database helpers for cross-user admin investigations.
- Kept ordinary diagnostic trace helpers user-scoped and fail-closed for authenticated application callers.
- Updated admin trace list/detail routes to use the privileged helpers only after `withAdminAuth`; removed the fake `admin` user ID and the accidental admin-self-only scope.
- Added a regression assertion that the admin detail route requests the trace by ID through the privileged helper.

Verification passed:

- Web admin diagnostic-trace suite: 1 file, 4 tests passed.
- DB ownership-isolation suite: 1 file, 8 tests passed.
- `@kestrel/db` build completed to refresh workspace declarations.
- `@kestrel/db`, `@kestrel/ai`, `@kestrel/web`, and `@kestrel/worker` typechecks passed.
- AI trace-persistence suite: 1 file, 7 tests passed.
- `git diff --check` passed.

Known non-blocking warning: Vitest/esbuild reports the repository's existing `ES2024` target warning; trace-persistence tests intentionally emit structured failure logs while asserting the non-throwing sink behavior.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: monotonic billing webhook projections

Completed:

- Added `subscriptions.last_payment_status` as a durable checkpoint for accepted provider status transitions.
- Added idempotent migration `0091_billing_status_checkpoint` and registered its journal/hash metadata.
- Hardened payment projection updates so terminal states cannot be replaced by stale terminal events; an explicit `refunded` event remains the only terminal advance.
- Hardened subscription projection updates with the same ordering and terminal-state rules.
- Changed verified webhook processing to update the subscription projection only when the payment projection accepted the event, preventing stale deliveries from changing subscription access.
- Added PGlite coverage for `waiting -> finished`, stale `finished -> failed` rejection, and the allowed `finished -> refunded` transition across payment and subscription rows.

Verification passed:

- DB ownership/billing suite: 1 file, 9 tests passed.
- Full migration-chain suite: 1 file, 15 tests passed, including migration `0091` column verification.
- Web billing contract suite: 1 file, 7 tests passed.
- `@kestrel/db` typecheck passed; workspace DB build refreshed declarations.
- `@kestrel/ai`, `@kestrel/web`, and `@kestrel/worker` typechecks passed after the declaration refresh.
- Migration hash stability passed.
- `git diff --check` passed.

Known non-blocking warning: Vitest/esbuild reports the repository's existing `ES2024` target warning.

Operational note: migrations `0090` and `0091` are new and have not been applied to live Supabase. Apply them through the direct migration URL after backup/status checks; then validate the policies and billing projection behavior with the non-bypass application role.

### 2026-08-26 batch: complete user-data export coverage and secret redaction

Completed:

- Aligned the export inventory with the account purge boundary, covering chat, trading, notifications, memories, telemetry, AI feedback/evaluation, queues, outbox, mutation executions, budget ledgers, agent opinions, traces, and memory state.
- Added tenant-scoped reads for every exported user-owned collection and parent-thread validation for message export.
- Included the authenticated tenant's subscription and payment projections so users can reconstruct their billing history without exposing other tenants' records.
- Explicitly removed password, TOTP, OAuth, BYOK, and Telegram credential material from the serialized export rather than relying on undefined-field omission.
- Added regression coverage asserting expanded collection presence and that credential-bearing values never appear in the export JSON.

Verification passed:

- Web settings-actions suite: 1 file, 38 tests passed.
- Web settings-security and billing-contract suites: 7 tests passed.
- `@kestrel/web` typecheck passed.
- `git diff --check` passed.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: terminal Full-analysis queue retention

Completed:

- Wired the existing `ANALYSIS_JOB_RETENTION_DAYS` environment contract into the shared retention cleanup implementation.
- Added one bounded-batch delete for terminal `full_analysis_queue` rows (`succeeded`, `failed`, `cancelled`, or `blocked`) with a non-null completion timestamp older than the configured window.
- Preserved pending, running, lease-recoverable, and otherwise incomplete queue rows so retention cannot delete work that may still execute.
- Added the queue deletion count to the DB result contract and worker/cron structured logs.
- Extended retention regression coverage for the ninth cleanup target and updated the operational table documentation.

Verification passed:

- DB retention suite: 1 file, 4 tests passed.
- `@kestrel/db` typecheck passed.
- `@kestrel/web` typecheck passed.
- `@kestrel/worker` typecheck passed.
- `git diff --check` passed.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: replayed billing DLQ retention boundary

Completed:

- Added `BILLING_WEBHOOK_DLQ_RETENTION_DAYS` with a bounded 90-day default to the shared environment contract and retention configuration.
- Added one bounded cleanup batch for `billing_webhook_dlq` rows only when `status = 'replayed'` and `replayed_at` is older than the configured window.
- Preserved pending and replaying failures for operator action, and preserved immutable `ipn_events`, payments, subscriptions, and billing audit history for reconciliation/accounting.
- Added the DLQ deletion count to worker and web cron structured logs and extended retention regression coverage.

Verification passed:

- DB retention suite: 1 file, 4 tests passed.
- Shared environment suite: 1 file, 51 tests passed.
- `@kestrel/db` typecheck/build passed.
- `@kestrel/shared`, `@kestrel/web`, and `@kestrel/worker` typechecks passed.
- `git diff --check` passed.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: retention configuration contract alignment

Completed:

- Added `BILLING_WEBHOOK_DLQ_RETENTION_DAYS=90` to the worker environment schema and deployment operator documentation so the runtime setting is available to both web cron and worker cleanup paths.
- Added regression coverage for invalid DLQ-retention values and the worker/deployment contract, preventing configuration drift from silently disabling the new cleanup policy.
- Confirmed local Docker backup freshness/archive validation and VM disposable-Postgres restore rehearsal remain documented and policy-tested; they are not evidence of a live Supabase restore until B2 is configured and a real rehearsal runs.

Verification passed:

- DB retention suite: 1 file, 4 tests passed.
- Web cron-VM/settings suites: 2 files, 50 tests passed.
- `@kestrel/shared`, `@kestrel/web`, and `@kestrel/worker` typechecks passed.
- `git diff --check` passed.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: migration TLS fail-closed policy

Completed:

- Removed the production Supabase-host exception that allowed `migrate:apply` to use `rejectUnauthorized: false`.
- Applied the same verified-TLS policy to migration status and Drizzle Kit configuration: explicit `SUPABASE_CA_CERT` is accepted, production defaults to certificate verification, and `DB_DISABLE_SSL` is allowed only for non-production or explicitly marked local Docker.
- Added a cross-entrypoint regression covering `migrate-apply`, `migrate-status`, `migration-reconcile`, the web runtime migrator, and `drizzle.config.ts`.
- Preserved local-development ergonomics without allowing a production environment to silently downgrade database transport security.

Verification passed:

- Migration/security suite: 15 tests passed.
- `@kestrel/db` typecheck passed.
- `git diff --check` passed.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: immutable IPN idempotency payloads

Completed:

- Made the first authenticated payload immutable for each `(nowpayments_payment_id, payment_status)` idempotency key.
- Conflicting later deliveries with a different body hash now return an explicit `conflict` claim and the webhook responds HTTP 409 before payment/subscription projection updates or DLQ replacement.
- Same-payload retries continue to behave idempotently, while stale-lease reclamation no longer overwrites the original raw body, hash, or receive timestamp.
- Added PGlite coverage proving the original payload remains stored and route-contract coverage proving conflicting webhook payloads cannot reach billing projections.

Verification passed:

- DB ownership/billing suite: 1 file, 10 tests passed.
- Web billing contract suite: 1 file, 8 tests passed.
- `@kestrel/db` build/typecheck passed and refreshed workspace declarations.
- `@kestrel/web` and `@kestrel/worker` typechecks passed.
- `git diff --check` passed.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: expired notification-state cleanup

Completed:

- Added bounded cleanup for expired `notification_noise_state` rows, covering idle tenants that do not trigger the write-path opportunistic purge.
- Preserved active cooldown/deduplication state by deleting only rows whose indexed `expires_at` is in the past.
- Propagated the deletion counter into worker and web-cron structured logs and the retention result note.

Verification passed:

- DB retention suite: 1 file, 4 tests passed.
- `@kestrel/db` build/typecheck passed and refreshed workspace declarations.
- `@kestrel/web` and `@kestrel/worker` typechecks passed.
- `git diff --check` passed.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: expired deduplication and share-snapshot cleanup

Completed:

- Added bounded cleanup for processed `telegram_updates` rows older than the documented one-hour deduplication window.
- Added bounded cleanup for expired `shared_snapshots`; active, unexpired share links remain untouched.
- Propagated both deletion counters into the worker and web-cron structured logs and retention result note.
- Kept the cleanup centralized and bounded to one batch per table, preventing retention work from becoming an unbounded serverless loop.

Verification passed:

- DB retention suite: 1 file, 4 tests passed.
- `@kestrel/db` build/typecheck passed and refreshed workspace declarations.
- `@kestrel/web` and `@kestrel/worker` typechecks passed.
- `git diff --check` passed.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: retention predicate indexes

Completed:

- Added idempotent migration `0093_retention_predicate_indexes` for cleanup scans on rate-limit windows, provider quota days, cron starts, terminal outbox rows, terminal Full-analysis jobs, replayed billing DLQ rows, and resolved budget reservations.
- Added matching Drizzle schema indexes, using partial predicates for terminal/disposable states to avoid indexing active retryable work unnecessarily.
- Extended full-chain verification to assert all seven retention indexes exist after migration.

Verification passed:

- Full migration-chain, schema-drift, and hash-stability suites: 3 files, 21 tests passed.
- `@kestrel/db` build/typecheck passed and refreshed workspace declarations.
- `@kestrel/web` and `@kestrel/worker` typechecks passed.
- `git diff --check` passed.

Operational note: migration `0093` is new and has not been applied to live Supabase. Apply it through the direct migration URL after backup and migration-status checks.

No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: billing DLQ stalled-replay alerting

Completed:

- Extended stale billing webhook detection to include `replaying` rows whose replay lease is older than the one-hour alert threshold.
- Preserved active replay leases as non-alerting and excluded completed `replayed` rows.
- Added PGlite coverage for stale pending, stale replaying, active replaying, and completed replay states.
- Added a dedicated cron-route contract covering Sentry alert delivery and clean-queue behavior.
- Updated operator-facing alert text so it accurately says `pending or replaying` rather than implying every stale row is pending.

Verification passed:

- DB ownership/billing suite: 1 file, 11 tests passed.
- Web billing/DLQ contract suites: 2 files, 10 tests passed.
- `@kestrel/db` build/typecheck passed and refreshed workspace declarations.
- `@kestrel/web` and `@kestrel/worker` typechecks passed.
- `git diff --check` passed.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: diagnostic trace retention index

Completed:

- Added idempotent migration `0092_diagnostic_trace_created_at_idx` for the `diagnostic_traces.created_at` filter used by retention cleanup and admin health aggregates.
- Added the corresponding Drizzle schema index while retaining the existing `started_at` index for trace ordering.
- Added full-chain verification for the index and kept migration hash/idempotency checks active.

Verification passed:

- Full migration-chain, schema-drift, and hash-stability suites: 3 files, 21 tests passed.
- `@kestrel/db` build/typecheck passed and refreshed workspace declarations.
- `@kestrel/web` and `@kestrel/worker` typechecks passed.
- `git diff --check` passed.

Operational note: migration `0092` is new and has not been applied to live Supabase. Apply it through the direct migration URL after backup and migration-status checks.

No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: disposable AI evaluation retention

Completed:

- Added `AI_EVALUATION_RETENTION_DAYS=90` to shared and worker environment validation and deployment documentation.
- Added bounded cleanup for `ai_shadow_comparisons` and `ai_quality_results`, which are terminal evaluation artifacts and do not need indefinite retention.
- Deliberately retained `ai_message_feedback` and `ai_regression_cases` as governed human-review evidence; account deletion still purges them for the deleted account.
- Added separate cleanup counters to the DB result and worker/web cron logs so evaluation retention is observable independently from telemetry and billing cleanup.
- Added retention/configuration regression coverage while keeping the cleanup batch bounded to one batch per table.

Verification passed:

- DB retention/client suite: 2 files, 18 tests passed.
- Full DB migration-chain suite: 2 files, 19 tests passed in the final migration verification.
- Web cron/settings suite: 2 files, 50 tests passed in the preceding retention verification.
- Shared environment suite: 51 tests passed.
- `@kestrel/db` build/typecheck, `@kestrel/shared`, `@kestrel/web`, and `@kestrel/worker` typechecks passed.
- `git diff --check` passed.

Operational boundary: no local Supabase project configuration or Supabase CLI is available in this checkout. The migration chain proves policy SQL is syntactically applied in PGlite, but it does not prove non-bypass PostgreSQL role behavior; staging RLS acceptance remains required before shared mode.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 batch: atomic account application-data purge

Completed:

- Expanded `deleteUserAccount` into a single transaction that removes user-owned application data before anonymizing the retained user tombstone.
- Purged chat threads/messages and AI child records, including feedback, regression cases, agent opinions, and emitted briefings.
- Purged user memories, quality/shadow records, durable analysis queues, persistence outbox, mutation executions, budget ledgers, telemetry, and diagnostic traces.
- Purged user product data including alerts, journal entries, portfolio state, shared snapshots, push subscriptions, provider tests, notification noise state, bot links, watchlist symbols, and rate-limit buckets.
- Removed organization memberships while retaining the organization record when retained billing or audit rows still reference it.
- Preserved the anonymized user tombstone, subscriptions, payments, general audit history, and admin audit history for financial and operational accountability.
- Added an end-to-end PGlite regression covering the purge categories, chat foreign-key ordering, authentication secrets, and retained billing/audit rows.

Verification passed:

- DB ownership-isolation suite: 1 file, 9 tests passed.
- `@kestrel/db` typecheck passed.
- `git diff --check` passed.

No migrations were generated or applied. No live Supabase writes, RLS changes, grants, or feature flags were performed.

### 2026-08-26 live acceptance batch: migrations, backup rehearsal, RLS, planner, and health

Completed live checks:

- Created a PostgreSQL 17 custom-format production dump before migration (`3,104,882` compressed bytes) and restored it into disposable PostgreSQL 17 + pgvector. Verified `chat_threads=173`, `journal_entries=0`, `drizzle migrations=88`, `vector extension=1`, `HNSW indexes=2`, and zero null journal tenants. Supabase Vault objects were excluded from the disposable target because that managed extension is not present in the generic image.
- Applied migrations `0089` through `0093` successfully using the CA-backed Supabase session endpoint on port `5432`; no transaction-pooler or insecure TLS fallback was used.
- Post-migration status: `93/93` migrations applied, no unknown hashes, no missing migrations, no missing required tables/columns/indexes, and no duplicate briefing groups.
- Verified live exact bigint budget columns, `subscriptions.last_payment_status`, all eight retention indexes, and forced RLS plus one `tenant_isolation` policy on all 13 late tenant tables.
- Ran a temporary `NOLOGIN NOSUPERUSER NOBYPASSRLS` PostgreSQL role probe inside a transaction and rolled it back. No-context reads returned zero rows; populated `chat_threads` tenant A/B reads were isolated; cross-tenant visibility was zero; mismatched-tenant update and insert attempts were rejected. A second all-13-table read-isolation probe also passed and rolled back.
- Captured live planner evidence after migration: `diagnostic_traces.created_at` and terminal budget cleanup both use index-only scans with zero heap fetches. Database baseline at capture: PostgreSQL `17.6`, `42,314,899` bytes, `17` connections, `2` active, and `0` lock waits.
- Production web public health returned HTTP `200`/`ok`.

Residual production/operations gates:

- B2 is still not configured: no B2 credentials or `rclone` are available, so the dump above is a local disposable recovery rehearsal, not an independent offsite backup. Configure the private B2 destination, run the VM backup timer, and complete `verify-restore.sh` against the uploaded object.
- The production alert contract is reachable and correctly returns HTTP `503`/`alert`, but it reports an actual worker/telemetry incident: ticks are stale by approximately 64,000 seconds, and the selected window has no cron runs, AI tool calls, chat turns, or recovery telemetry. Worker health URL/routing and recovery must be restored before this gate is green.
- External paging/routing acceptance remains unverified for health SLOs, billing DLQ stale pending/replaying entries, migration failures, connection/lock pressure, and table growth. The application alert contract itself is verified.
- Runtime `MULTI_USER_ENABLED`/`KESTREL_ENABLE_RLS` remains disabled by design for the supported single-user OSS deployment. The database policies and non-bypass role behavior are proven, but shared-mode runtime E2E, application-role grants, and a production canary must be completed before enabling shared SaaS mode.
- A direct `db.<project>.supabase.co` endpoint is IPv6-only/unreachable from this shell. The configured port-5432 session endpoint was used successfully; future migrations should continue through an approved session-capable operator network and the repository guard.

Repository implementation and local verification for ownership, lifecycle, billing, migration TLS, retention, indexes, alert computation, and RLS policy behavior are complete. Live migration and database acceptance evidence is recorded above; B2 recovery, worker recovery, external paging, and shared-runtime rollout remain operational work.
