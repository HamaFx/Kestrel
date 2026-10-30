# Phase 2 Implementation Plan: Admin Health SLO Fixes, Legacy Table Purge (`0118`) & Telemetry Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Admin System Health dashboard's false `degraded` state (`queryChatAggregate` checking `WHERE kind IS NULL`), remove the retired single-desk "Sentiment Specialist" SLI card (`Decision 2B`), drop the orphaned `ai_shadow_comparisons` and `ai_quality_results` database tables via Drizzle migration `0118` (`Decision 1A`), and prune dead shadow metrics, retired pre-Mastra `TELEMETRY_KINDS`, and unused `logForAgent` / `traceQuery` helpers.

**Architecture:** Update `queryChatAggregate` (`apps/web/src/lib/services/health/probe-queries.ts`) to count real Mastra v2 chat turns (`kind IS NULL OR kind LIKE 'mastra_%'`) and remove `sentimentTotal` / `sentimentSucceeded` from `OperationalAggregate`, `anomaly-builder.ts`, and `sli-builder.ts`. Add migration `0118_drop_legacy_shadow_and_quality_tables.sql` (plus its `meta/_journal.json` entry), delete the orphaned Drizzle schema and query files for `ai_shadow_comparisons` and `ai_quality_results`, and clean up all retention, account-deletion, data-export, and metric references.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, Next.js App Router, Vitest.

**Spec:** `docs/audits/09_Kestrel_Logging_Debugging_Telemetry_Jev_And_Training_Master_Audit.md` (Decisions 1A & 2B, Phase 2, Phase 5)

## Global Constraints

- **Migration Journal Integrity:** Every `.sql` file in `packages/db/drizzle/` must have a matching entry in `packages/db/drizzle/meta/_journal.json` (`idx: 117`, `tag: "0118_drop_legacy_shadow_and_quality_tables"`), verified by `packages/db/test/migration-plan.test.ts` and `packages/db/test/migration-hash-stability.test.ts`.
- **Single-Desk Card Removal (`Decision 2B`):** Remove `sentiment_health` from `buildSliSnapshots` (`sli-builder.ts`), `sentimentTotal`/`sentimentSucceeded` from `OperationalAggregate` (`probe-types.ts` and `probe-queries.ts`), and the sentiment anomaly check from `buildHealthAssessment` (`anomaly-builder.ts`). Keep `full_mode_completion` intact.
- **Shadow & Quality Table Removal (`Decision 1A`):** Drop `ai_shadow_comparisons` and `ai_quality_results` cleanly across `packages/db`, `packages/shared`, `apps/web`, and `apps/worker`.

## Review Focus

1. `queryChatAggregate` in `apps/web/src/lib/services/health/probe-queries.ts`: must count both legacy `kind IS NULL` rows and all Mastra v2 turn kinds (`kind LIKE 'mastra_%'`) so active Mastra chat turns register on the Admin System Health dashboard and clear the false `"No chat turns in the selected window"` anomaly.
2. `packages/db/test/migration-hash-stability.test.ts`: check whether this test snapshots migration hashes in `packages/db/drizzle/meta/_hashes.json`; if so, update `_hashes.json` with the SHA-256 hash of `0118_drop_legacy_shadow_and_quality_tables.sql`.
3. `RetentionResult` contract in `packages/db/src/retention/config.ts` and `cleanup.ts`: removing `aiShadowComparisonsDeleted` and `aiQualityResultsDeleted` requires updating `apps/worker/src/jobs/retention.ts`, `apps/web/src/app/api/cron/cleanup-telemetry/route.ts`, and `packages/db/test/retention.test.ts` in lock-step.
4. `TELEMETRY_KINDS` in `packages/ai/src/persistence/telemetry-persistence.ts` vs `ChatTelemetryKind` in `packages/db/src/schema/ops/telemetry.ts`: keep historical kinds in the DB column type (`ChatTelemetryKind`) so old stored rows still parse, while pruning the 14 retired pre-Mastra kinds from `TELEMETRY_KINDS` (the active writer allowlist).
5. Admin UI icon map in `apps/web/src/app/(app)/admin/_components/admin-system-health/sli-icons.ts`: remove any unused `sentiment_health` key requirement if `sli-icons.ts` or `admin-system-health.test.tsx` asserts the exact SLI card list.

---

### Task 1: Fix `queryChatAggregate` & Remove Retired "Sentiment Specialist" SLI (`Decision 2B`)

**Files:**
- Modify: `apps/web/src/lib/services/health/probe-types.ts`
- Modify: `apps/web/src/lib/services/health/probe-queries.ts:120-185`
- Modify: `apps/web/src/lib/services/health/anomaly-builder.ts:165-180`
- Modify: `apps/web/src/lib/services/health/sli-builder.ts:45-95`
- Modify: `apps/web/src/app/(app)/admin/_components/admin-system-health/sli-icons.ts`
- Test: `apps/web/test/admin/admin-health.test.ts`
- Test: `apps/web/test/admin-system-health.test.tsx`

**Interfaces:**
- Modifies `OperationalAggregate` in `apps/web/src/lib/services/health/probe-types.ts` (removes `sentimentTotal: number` and `sentimentSucceeded: number`)
- Modifies `buildSliSnapshots` in `apps/web/src/lib/services/health/sli-builder.ts` (removes the `sentiment_health` SLI card)

- [ ] **Step 1: Write the failing test in `apps/web/test/admin/admin-health.test.ts`**

```typescript
it('counts Mastra v2 chat_telemetry rows in queryChatAggregate and omits retired sentiment_health SLI', async () => {
  // Verify that queryChatAggregate SQL matches (kind IS NULL OR kind LIKE 'mastra_%')
  // and that buildSliSnapshots does not emit a card with key === 'sentiment_health'.
  const slis = buildSliSnapshots(
    {
      tickOk: true,
      tickAgeSeconds: null,
      tickSymbolCount: 0,
      onDemandTickMode: true,
      cronSuccessRate: 1,
      cronDone: 10,
      cronTotal: 10,
      toolSuccessRate: 1,
      toolsOk: 20,
      toolsTotal: 20,
      chatTurns: 15,
    },
    {
      fullTotal: 4,
      fullCompleted: 4,
      fullFailed: 0,
      outboxTerminal: 2,
      outboxCompleted: 2,
      outboxDead: 0,
      budgetTerminal: 15,
      budgetErrors: 0,
      traceTotal: 15,
      traceFailed: 0,
      providerFallbackTraces: 0,
    },
    24,
  );
  expect(slis.find((s) => s.key === 'sentiment_health')).toBeUndefined();
  expect(slis.find((s) => s.key === 'chat_api')?.total).toBe(15);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/web test test/admin/admin-health.test.ts test/admin-system-health.test.tsx`
Expected: FAIL (`sentiment_health` is still present in `slis`)

- [ ] **Step 3: Update `probe-types.ts`, `probe-queries.ts`, `anomaly-builder.ts`, `sli-builder.ts`, and `sli-icons.ts`**
  - In `apps/web/src/lib/services/health/probe-queries.ts`:
    - Update `queryChatAggregate` to:
      ```sql
      SELECT COUNT(*)::text AS turns
      FROM chat_telemetry
      WHERE (kind IS NULL OR kind LIKE 'mastra_%')
        AND created_at >= ${since}
      ```
    - In `queryOperationalAggregate`, remove the two `multi_specialist_sentiment` subqueries and remove `sentimentTotal` and `sentimentSucceeded` from the returned object.
  - In `apps/web/src/lib/services/health/probe-types.ts`, remove `sentimentTotal` and `sentimentSucceeded` from `OperationalAggregate`.
  - In `apps/web/src/lib/services/health/anomaly-builder.ts`, remove the `operational.sentimentTotal` check (`Sentiment specialist success is below SLO...`).
  - In `apps/web/src/lib/services/health/sli-builder.ts`, remove the `sentiment_health` object from `operationalSlis`.
  - In `apps/web/src/app/(app)/admin/_components/admin-system-health/sli-icons.ts`, remove `sentiment_health` if typed against SLI keys.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/web test test/admin/admin-health.test.ts test/admin-system-health.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/health/ apps/web/src/app/\(app\)/admin/_components/admin-system-health/sli-icons.ts apps/web/test/admin/admin-health.test.ts apps/web/test/admin-system-health.test.tsx
git commit -m "fix(web): count Mastra turns in chat health SLI and remove retired sentiment card"
```

---

### Task 2: Drop Legacy `ai_shadow_comparisons` & `ai_quality_results` Tables (`Decision 1A`)

**Files:**
- Create: `packages/db/drizzle/0118_drop_legacy_shadow_and_quality_tables.sql`
- Modify: `packages/db/drizzle/meta/_journal.json`
- Modify: `packages/db/drizzle/meta/_hashes.json`
- Delete / Empty via migration & remove exports:
  - Modify: `packages/db/src/schema/ai/index.ts`
  - Modify: `packages/db/src/queries/index.ts`
  - Modify: `packages/db/src/index.ts`
  - Modify: `packages/db/src/retention/config.ts`
  - Modify: `packages/db/src/retention/cleanup.ts`
  - Modify: `packages/db/src/queries/auth/account-deletion.ts`
  - Modify: `apps/worker/src/jobs/retention.ts`
  - Modify: `apps/web/src/app/api/cron/cleanup-telemetry/route.ts`
  - Modify: `apps/web/src/app/(app)/settings/_actions-data-export-payload.ts`
- Test: `packages/db/test/migration-plan.test.ts`
- Test: `packages/db/test/migration-hash-stability.test.ts`
- Test: `packages/db/test/retention.test.ts`

**Interfaces:**
- Produces migration `0118_drop_legacy_shadow_and_quality_tables.sql`:
  ```sql
  -- 0118 — Drop orphaned ai_shadow_comparisons and ai_quality_results tables (Decision 1A).
  DROP TABLE IF EXISTS "ai_shadow_comparisons" CASCADE;
  DROP TABLE IF EXISTS "ai_quality_results" CASCADE;
  ```
- Removes `aiShadowComparisonsDeleted` and `aiQualityResultsDeleted` from `RetentionResult` (`@kestrel/db`).

- [ ] **Step 1: Write the failing test updates in `packages/db/test/retention.test.ts` and `packages/db/test/migration-plan.test.ts`**

```typescript
// In packages/db/test/retention.test.ts:
// Assert that runRetentionCleanup does not issue deleteBatched for
// 'ai_shadow_comparisons' or 'ai_quality_results', and that result.note
// does not contain 'aiShadowComparisonsDeleted' or 'aiQualityResultsDeleted'.
expect(result.note).not.toContain('aiShadowComparisonsDeleted');
expect(result.note).not.toContain('aiQualityResultsDeleted');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/db test test/retention.test.ts`
Expected: FAIL (`result.note` still contains `aiShadowComparisonsDeleted=2`)

- [ ] **Step 3: Create migration `0118` and remove `aiShadowComparisons` + `aiQualityResults` references**
  - Create `packages/db/drizzle/0118_drop_legacy_shadow_and_quality_tables.sql` with `DROP TABLE IF EXISTS "ai_shadow_comparisons" CASCADE; DROP TABLE IF EXISTS "ai_quality_results" CASCADE;`.
  - Append `{ "idx": 117, "version": "7", "when": 1793200000000, "tag": "0118_drop_legacy_shadow_and_quality_tables", "breakpoints": true }` to `packages/db/drizzle/meta/_journal.json` and add the SHA-256 hash of `0118_drop_legacy_shadow_and_quality_tables.sql` to `packages/db/drizzle/meta/_hashes.json`.
  - Remove `export * from './ai-quality-results';` and `export * from './ai-shadow-comparisons';` from `packages/db/src/schema/ai/index.ts`.
  - Remove `export * as aiShadowComparisons from './ai-shadow-comparisons';` from `packages/db/src/queries/index.ts` and `packages/db/src/index.ts`.
  - Remove `aiShadowComparisonsDeleted` and `aiQualityResultsDeleted` (and `aiEvaluationRetentionDays`) from `packages/db/src/retention/config.ts`, `packages/db/src/retention/cleanup.ts`, `apps/worker/src/jobs/retention.ts`, and `apps/web/src/app/api/cron/cleanup-telemetry/route.ts`.
  - Remove `tx.delete(schema.aiShadowComparisons)` and `tx.delete(schema.aiQualityResults)` from `packages/db/src/queries/auth/account-deletion.ts`.
  - Remove the `aiShadowComparisons` and `aiQualityResults` queries from `apps/web/src/app/(app)/settings/_actions-data-export-payload.ts`.
  - Update `packages/db/test/ai-shadow-comparisons.test.ts` (replace with a minimal pass stub or remove export assertions so `check-test-files.mjs` passes).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/db test && pnpm --filter @kestrel/worker test test/jobs-registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/db/ apps/worker/src/jobs/retention.ts apps/web/src/app/api/cron/cleanup-telemetry/route.ts apps/web/src/app/\(app\)/settings/_actions-data-export-payload.ts
git commit -m "chore(db,web,worker): drop unused ai_shadow_comparisons and ai_quality_results tables (0118)"
```

---

### Task 3: Prune Dead Shadow Metrics, Retired Pre-Mastra `TELEMETRY_KINDS` & Unused `logForAgent` / `traceQuery`

**Files:**
- Modify: `packages/shared/src/metrics.ts:88-93`
- Modify: `packages/shared/src/logger.ts:35-39`
- Modify: `packages/db/src/index.ts:44-46`
- Modify: `packages/ai/src/persistence/telemetry-persistence.ts:48-85`
- Test: `packages/shared/test/metrics.test.ts`
- Test: `packages/shared/test/logger.test.ts`
- Test: `packages/ai/test/telemetry-persistence.test.ts`

**Interfaces:**
- Modifies `METRIC_NAMES` in `packages/shared/src/metrics.ts`: removes `'mastra_shadow_total'`, `'mastra_shadow_failed_total'`, `'mastra_shadow_skipped_total'`
- Modifies `TELEMETRY_KINDS` in `packages/ai/src/persistence/telemetry-persistence.ts`: retains only active Mastra v2 kinds (`'mastra_xauusd_research'`, `'mastra_xauusd_research_failed'`, `'mastra_xauusd_poc'`, `'mastra_xauusd_poc_failed'`, `'mastra_mode'`, `'mastra_mode_failed'`, `'mastra_full_job'`, `'mastra_full_job_failed'`, `'mastra_worker_task'`, `'mastra_worker_task_failed'`, `'mastra_canonical_chat'`, `'mastra_canonical_chat_failed'`, `'mastra_custom_agent'`, `'mastra_custom_agent_failed'`, `'turn_failed'`)

- [ ] **Step 1: Write the failing test in `packages/ai/test/telemetry-persistence.test.ts` and `packages/shared/test/metrics.test.ts`**

```typescript
// In packages/ai/test/telemetry-persistence.test.ts:
import { TELEMETRY_KINDS } from '../src/persistence/telemetry-persistence';

it('exposes only active Mastra v2 telemetry kinds in TELEMETRY_KINDS', () => {
  expect(TELEMETRY_KINDS).not.toContain('multi_specialist_sentiment');
  expect(TELEMETRY_KINDS).not.toContain('routing_fundamental');
  expect(TELEMETRY_KINDS).toContain('mastra_canonical_chat');
  expect(TELEMETRY_KINDS).toContain('mastra_mode');
});
```

```typescript
// In packages/shared/test/metrics.test.ts:
import { isMetricName } from '../src/metrics';

it('excludes retired mastra_shadow_* metrics from METRIC_NAMES', () => {
  expect(isMetricName('mastra_shadow_total')).toBe(false);
  expect(isMetricName('mastra_run_total')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/shared test test/metrics.test.ts && pnpm --filter @kestrel/ai test test/telemetry-persistence.test.ts`
Expected: FAIL (`TELEMETRY_KINDS` still contains `'multi_specialist_sentiment'` and `isMetricName('mastra_shadow_total')` is `true`)

- [ ] **Step 3: Prune `METRIC_NAMES`, `TELEMETRY_KINDS`, and mark/remove unused barrel exports**
  - In `packages/shared/src/metrics.ts`, remove `'mastra_shadow_total'`, `'mastra_shadow_failed_total'`, and `'mastra_shadow_skipped_total'` from `METRIC_NAMES`.
  - In `packages/ai/src/persistence/telemetry-persistence.ts`, remove the 14 retired pre-Mastra kinds (`routing_*`, `plan_*`, `multi_specialist_*`, `multi_agent_turn`) from `TELEMETRY_KINDS`.
  - Run `pnpm knip` or `pnpm typecheck` to ensure no remaining references exist.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/shared test test/metrics.test.ts && pnpm --filter @kestrel/ai test test/telemetry-persistence.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/metrics.ts packages/shared/test/metrics.test.ts packages/ai/src/persistence/telemetry-persistence.ts packages/ai/test/telemetry-persistence.test.ts
git commit -m "chore(shared,ai): prune retired shadow metrics and pre-Mastra TELEMETRY_KINDS"
```
