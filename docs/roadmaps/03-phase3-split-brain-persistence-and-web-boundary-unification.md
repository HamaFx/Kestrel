# Phase 3: Split-Brain Persistence Unification, Worker RLS Parity & Web Service Boundary Cleanup Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the split-brain persistence duplication between `@kestrel/db/src/queries/*` and `@kestrel/ai/src/**/persistence*`, fix the missing RLS tenant scopes in `apps/worker` cron jobs, deduplicate Web Cron routes vs Worker jobs, flatten the 22-file Settings `_actions-*.ts` pyramid, and replace the 266-line `api-boundary.ts` bypass barrel with domain services.

**Architecture:** Establish a single ownership rule: `@kestrel/db` owns schema and low-level SQL queries, while `@kestrel/ai` (or domain services) adds AI side-effects (such as RAG embedding on journal writes or Mastra memory cleanup on thread deletes) by delegating to `@kestrel/db` rather than re-implementing SQL. Extract shared cron job runners so `/api/cron/*` and `apps/worker/src/jobs/*` invoke the exact same tenant-scoped implementation.

**Tech Stack:** Drizzle ORM, PostgreSQL 16 (RLS with `withUserTenant` / `withAdminDb`), Next.js 16 App Router, TypeScript 7 (`tsrs`), Vitest 5.

**Spec:** `docs/roadmaps/00-kestrel-maintainability-audit-and-master-roadmap.md` (§3.2, §3.4, §4)

**Status: COMPLETE (2026-11-02).** Commits: `5d874ecb` (split-brain persistence unification), `4bb8090e` (worker briefings/weekly-review RLS scopes + cron prefetch parity), `c79c7777` (settings mutation unification + `_actions` flatten), `138d1060` (api-boundary barrel replaced with domain service imports).

Verification on the completed tree: full `pnpm test` (15/15 packages, incl. 1896 AI tests, 1516 web tests, 240 worker tests), `pnpm typecheck` (27 tasks), `pnpm lint` (15/15 workspaces, 0 errors/0 warnings), `pnpm format:check`, `pnpm check:maintainability` (`0 baselined legacy files`), `pnpm check:route-security` (103 routes reviewed), `pnpm check:env-contract`, `pnpm check:knip-config` all green. `pnpm knip` is now 8 unused files / 338 unused exports / 184 exported types (was 359/185 at Phase 2 close); the remaining clusters are Phase 4 targets.

Deviations and findings worth carrying forward:

- **Task 1 — `createEntry` gained optional close fields.** `@kestrel/ai`'s `createEntry` hard-coded `outcome: 'open'` and dropped `closedAt`/`exit`/`rMultiple`, so routing paper-trading's already-closed trades through it would have silently regressed the journal. The input contract now accepts optional `closedAt`, `exit`, `outcome`, `rMultiple` (validated with `TradeOutcomeSchema`), and `plugins/paper-trading` declares the `@kestrel/ai` workspace dependency. `computeStats` also gained `isNull(deletedAt)` (soft-deleted rows must not count in coach stats).
- **Task 1 — RLS proof moved tables.** `packages/db/test/postgres-app-role.test.ts` used `threads.listThreads` to prove `withUserTenant`; with threads persistence owned by `@kestrel/ai`, the proof now seeds and reads `user_symbols` instead. `packages/db/test/queries-postgres.test.ts` dropped the journal and `listMessages` cases (canonical behavior is covered in `packages/ai`).
- **Task 2 — scope of the cron dedup.** The plan's explicit steps (worker `withAdminDb`/`withUserTenant`, `listEmittedEventIds` prefetch parity on `/api/cron/briefings`, plus a worker RLS regression test) are complete. The broader extraction of shared runners for `cot`, `fred-actuals`, and `snapshots` is still outstanding: those route/job pairs remain near-copies (and drifted: the web `fred-actuals` route lacks the BiQuote refresh, the web `snapshots` route lacks the candles prune). Carry into Phase 4 or a follow-up.
- **Task 3 — settings service folder.** Extracting `validateAndSaveChatModel` pushed `lib/services/settings.ts` past the 350-LOC gate, so the service became `settings/index.ts` + `settings/chat-model.ts` (+ `settings/domain.ts` for route-facing re-exports). `resetOnboardingAction`'s non-soft mode now delegates to the canonical `'full'` reset, which purges BYOK keys and watchlist symbols as the "Full Factory Reset" UI copy promises (the previous inline SQL did not).
- **Task 4 — more domain modules than the plan named.** Replacing the 87-file barrel required seven modules beyond `{chat,market,settings,admin,alerts,calendar,journal}`: `chat-ai` (routing/plans/queue/mutation), `providers` (BYOK + usage), `notifications`, `news`, `auth`, `db` (deliberate raw access for gated diagnostics), and `rate-limit`. Route handlers may now import `@kestrel/shared` (and its subpaths) directly, matching the plan's exception for pure schemas/types/errors. 14 test files had their module mocks repointed; `apps/web/test/settings-chat-model-service.test.ts` pins the new shared validation.

## Global Constraints

- Never export two functions with the same name (`createAlert`, `deleteThread`, `listMessages`, `listRecentArticles`, `listPushSubscriptions`, `recordTelemetry`) from `@kestrel/db` and `@kestrel/ai` that behave differently.
- Every cross-tenant fan-out job (`briefings`, `weekly-review`) MUST discover active users on the admin connection (`withAdminDb(() => getActiveUserIds())`) and execute per-user work inside `withUserTenant(userId, ...)`.
- All files must pass `pnpm check:maintainability` (`<= 350` LOC for `.ts`).

## Review Focus

- `plugins/telegram-bot/src/bot/commands/alerts.ts` currently imports `createAlert` from `@kestrel/db`, which skips `AlertRuleSchema.parse()` and `snoozeHours` clamping. Once unified, `createAlert` must validate `AlertRuleSchema.parse()` at the repository boundary so neither Telegram nor web callers can insert malformed alert rules.
- `plugins/paper-trading/src/services/journal-sync.ts` currently imports `createJournalEntry` from `@kestrel/db`, which skips `rememberJournalEntry` (RAG memory indexing) and outputs raw `JournalRow`. Ensure journal creation either goes through `@kestrel/ai`'s `createEntry` or triggers the memory hook consistently.
- `packages/db/src/queries/journal.ts` uses soft-delete (`SET deleted_at = now()`), whereas `packages/ai/src/journal/persistence/crud.ts` uses hard `DELETE` and does not filter `isNull(deletedAt)`. Standardize on hard `DELETE` (or filter `isNull(deletedAt)` everywhere) so deleted journal entries never reappear in AI coach stats!
- `apps/worker/src/jobs/briefings.ts` and `apps/worker/src/jobs/weekly-review.ts` currently call `getActiveUserIds()` and `emitPreEvent`/`emitPostEvent`/`emitWeeklyReview` without `withAdminDb` or `withUserTenant`, which breaks under `kestrel_app` RLS.

---

### Task 1: Eliminate Dead & Split-Brain Query Modules Between `@kestrel/db` and `@kestrel/ai`

**Files:**

- Delete: `packages/db/src/queries/cot.ts`
- Delete: `packages/db/src/queries/push.ts`
- Delete: `packages/db/src/queries/telemetry.ts`
- Modify: `packages/db/src/queries/news-articles.ts`
- Modify: `packages/db/src/queries/alerts.ts`
- Modify: `packages/db/src/queries/journal.ts`
- Modify: `packages/db/src/queries/threads.ts`
- Modify: `packages/db/src/queries/index.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/test/queries-postgres.test.ts`
- Modify: `plugins/telegram-bot/src/bot/commands/alerts.ts`
- Modify: `plugins/telegram-bot/src/bot/commands/briefings.ts`
- Modify: `plugins/telegram-bot/src/bot/commands/market-data.ts`
- Modify: `plugins/paper-trading/src/services/journal-sync.ts`

**Interfaces:**

- Consumes: `@kestrel/db` schema and `@kestrel/ai` domain persistence modules.
- Produces: Zero duplicated query functions between `@kestrel/db` and `@kestrel/ai`.

- [x] **Step 1: Write a regression test verifying `plugins/telegram-bot` alert creation validates `AlertRuleSchema` and `packages/ai/src/journal/persistence/crud.ts` filters `isNull(schema.journalEntries.deletedAt)`**

In `packages/ai/test/journal-crud-soft-delete.test.ts`, assert that `listEntries` and `getEntry` include `isNull(schema.journalEntries.deletedAt)` in their `WHERE` clauses.

- [x] **Step 2: Delete zero-caller query files in `packages/db/src/queries/` (`cot.ts`, `push.ts`, `telemetry.ts`)**

1. Delete `packages/db/src/queries/cot.ts`, `packages/db/src/queries/push.ts`, and `packages/db/src/queries/telemetry.ts` (all have 0 production callers; canonical implementations live in `packages/ai/src/{cot,push,persistence}/`).
2. Remove their re-exports from `packages/db/src/queries/index.ts` and `packages/db/src/index.ts`.

- [x] **Step 3: Prune duplicate functions from `packages/db/src/queries/{threads,alerts,journal,news-articles}.ts`**

1. In `packages/db/src/queries/threads.ts`: Keep `batchDeleteThreads` (used by bulk-delete route) and delete the unused duplicates `getThread`, `listThreads`, `createThread`, `updateThreadTitle`, `updateThreadPinnedSymbol`, `deleteThread`, `listMessages`, `appendUserMessage`, `appendAssistantMessage`, `countThreadMessages` (whose canonical implementations with Mastra memory cleanup and idempotency keys live in `@kestrel/ai/persistence`). Update `apps/web/src/lib/services/mastra/chat/mastra-chat-stream.ts` and `xauusd/mastra-xauusd.ts` to import `getThread` from `@kestrel/ai/persistence` (matching `apps/web/src/app/api/chat/route.ts`).
2. In `packages/db/src/queries/alerts.ts`: Keep `countActiveAlerts` (used by `plugins/telegram-bot/src/bot/commands/account.ts`) and delete the unused duplicates `listAlerts`, `getAlert`, `createAlert`, `updateAlert`, `deleteAlert`, `listActiveAlerts`, `markAlertFired`. Update `plugins/telegram-bot/src/bot/commands/alerts.ts` to import `createAlert` from `@kestrel/ai` so Telegram alerts get full `AlertRuleSchema` validation!
3. In `packages/db/src/queries/journal.ts`: Update `packages/ai/src/journal/persistence/crud.ts` (`createEntry`, `listEntries`, `getEntry`) to include `isNull(schema.journalEntries.deletedAt)`, update `plugins/paper-trading/src/services/journal-sync.ts` to use `createEntry` from `@kestrel/ai` (so paper-trading journal syncs also index into RAG memory!), and delete `packages/db/src/queries/journal.ts`.
4. In `packages/db/src/queries/news-articles.ts`: Delete the 4 zero-caller functions (`getLatestArticleTimestamp`, `insertArticle`, `listHighImpactEventsInWindow`, `listHighMediumEventsInWindow`) and `listFredEventsMissingActual` (canonical in `@kestrel/ai`), and update `plugins/telegram-bot/src/bot/commands/{briefings,market-data}.ts` to import `listRecentArticles` and `listUpcomingEvents` from `@kestrel/ai`, then delete `packages/db/src/queries/news-articles.ts`.
5. Rename `packages/db/src/queries/chat-telemetry.ts` to `listToolTelemetry` inside `packages/db/src/queries/tool-telemetry.ts` (since `chat-telemetry.ts` actually queries `schema.chatToolTelemetry`, not `chatTelemetry`!).

- [x] **Step 4: Run `pnpm typecheck` and all workspace tests**

Run:

```bash
pnpm typecheck
pnpm --filter @kestrel/db test
pnpm --filter @kestrel/ai test
pnpm --filter @kestrel/plugin-telegram-bot test
pnpm --filter @kestrel/plugin-paper-trading test
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add -A packages/db packages/ai plugins/ apps/web
git commit -m "refactor(db,ai,plugins): eliminate split-brain persistence duplicates between @kestrel/db and @kestrel/ai"
```

---

### Task 2: Fix Worker RLS Tenant-Scoping Bugs & Deduplicate Web Cron Routes vs. Worker Jobs

**Files:**

- Modify: `apps/worker/src/jobs/briefings.ts`
- Modify: `apps/worker/src/jobs/weekly-review.ts`
- Modify: `apps/web/src/app/api/cron/briefings/route.ts`
- Modify: `apps/web/src/app/api/cron/weekly-review/route.ts`
- Modify: `apps/web/src/app/api/cron/cot/route.ts`
- Modify: `apps/web/src/app/api/cron/fred-actuals/route.ts`
- Modify: `apps/web/src/app/api/cron/snapshots/route.ts`
- Create: `apps/worker/test/briefings-weekly-review-rls-scope.test.ts`

**Interfaces:**

- Consumes: `withAdminDb`, `withUserTenant`, `getActiveUserIds` from `@kestrel/db`.
- Produces: Tenant-scoped execution in `apps/worker/src/jobs/{briefings,weekly-review}.ts` and shared job execution logic between `apps/worker` and `apps/web/src/app/api/cron/*`.

- [x] **Step 1: Write failing test in `apps/worker/test/briefings-weekly-review-rls-scope.test.ts` asserting `withAdminDb` and `withUserTenant` are called**

```ts
it('scopes getActiveUserIds with withAdminDb and per-user emit calls with withUserTenant', async () => {
  // Assert runBriefings and runWeeklyReview wrap getActiveUserIds in withAdminDb
  // and wrap each user's emitPreEvent / emitPostEvent / emitWeeklyReview in withUserTenant(userId, ...)
});
```

- [x] **Step 2: Run worker test to verify it fails**

Run: `pnpm --filter @kestrel/worker test test/briefings-weekly-review-rls-scope.test.ts`  
Expected: FAIL (`withAdminDb` and `withUserTenant` not called in worker `briefings.ts` / `weekly-review.ts`).

- [x] **Step 3: Add `withAdminDb` and `withUserTenant` scoping to `apps/worker/src/jobs/briefings.ts` and `apps/worker/src/jobs/weekly-review.ts`**

1. In `apps/worker/src/jobs/briefings.ts`:
   - Fetch active users via `const allUserIds = await withAdminDb(() => getActiveUserIds());`.
   - Wrap the `listEmittedEventIds(userId, ...)` prefetch and `emitPreEvent(userId, c.id)` / `emitPostEvent(userId, c.id)` calls inside `await withUserTenant(userId, async () => { ... })`.
2. In `apps/worker/src/jobs/weekly-review.ts`:
   - Fetch active users via `const userIds = await withAdminDb(() => getActiveUserIds());`.
   - Wrap `await emitWeeklyReview(userId)` inside `await withUserTenant(userId, () => emitWeeklyReview(userId))`.
3. Update `apps/web/src/app/api/cron/briefings/route.ts` to also use the `listEmittedEventIds` prefetch optimization from `apps/worker/src/jobs/briefings.ts`.

- [x] **Step 4: Run worker and web cron tests to verify they pass**

Run:

```bash
pnpm --filter @kestrel/worker test
pnpm --filter @kestrel/web test
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/worker/src/jobs/briefings.ts apps/worker/src/jobs/weekly-review.ts apps/worker/test/briefings-weekly-review-rls-scope.test.ts apps/web/src/app/api/cron/briefings/route.ts
git commit -m "fix(worker,cron): enforce withAdminDb and withUserTenant RLS scopes in worker briefings and weekly-review jobs"
```

---

### Task 3: Flatten the 22-File Settings `_actions-*.ts` Pyramid & Unify Duplicate Settings Mutations

**Files:**

- Modify: `apps/web/src/lib/services/settings.ts`
- Modify: `apps/web/src/app/(app)/settings/_actions-models.ts`
- Modify: `apps/web/src/app/(app)/settings/_actions-preferences-symbols.ts`
- Modify: `apps/web/src/app/(app)/settings/profile/page.tsx`
- Move: `apps/web/src/app/(app)/settings/_actions-*.ts` into `apps/web/src/app/(app)/settings/_actions/`
- Delete: intermediate barrel files `_actions-preferences.ts`, `_actions-security.ts`, `_actions-api-keys.ts`, `_actions-data.ts`
- Modify: `apps/web/src/app/(app)/settings/actions.ts`

**Interfaces:**

- Consumes: `isSymbolInCatalog`, `addUserSymbol`, `removeUserSymbol`, `resetOnboarding`, `updateUserSettingsField` from `@kestrel/db`.
- Produces: Clean `settings/_actions/` folder (no 22 loose `_actions-*.ts` files in `settings/`), shared validation between `updateChatModelAction` and `PUT /api/settings/chat-model`, and `withUserTenantRO` scoping on `settings/profile/page.tsx`.

- [x] **Step 1: Unify `updateChatModel` validation in `apps/web/src/lib/services/settings.ts` and call it from both `_actions-models.ts` and `/api/settings/chat-model/route.ts`**

Extract `validateAndSaveChatModel(userId: string, providerId: ProviderId, modelId: string)` in `apps/web/src/lib/services/settings.ts` (enforcing API key existence, catalog membership, and rejecting `tier === 'embedding'`). Call it from both `PUT /api/settings/chat-model` and `updateChatModelAction`.

- [x] **Step 2: Replace the 70 lines of duplicate raw SQL in `_actions-preferences-symbols.ts` and `_actions-models.ts` with `@kestrel/db` query helpers**

1. In `_actions-preferences-symbols.ts`: Replace raw SQL with `await isSymbolInCatalog(symbol)` and `await withUserTenant(session.user.id, () => addUserSymbol(session.user.id, symbol))` / `removeUserSymbol(session.user.id, symbol)`.
2. In `_actions-models.ts`: Replace raw SQL in `resetOnboardingAction` with `await withUserTenant(session.user.id, () => resetOnboarding(session.user.id, options.soft ? 'soft' : 'hard'))`.
3. In `apps/web/src/app/(app)/settings/profile/page.tsx`: Wrap the `schema.users` and `schema.accounts` reads in `withUserTenantRO(userId, async (db) => ...)`.

- [x] **Step 3: Move the remaining `_actions-*.ts` files into `apps/web/src/app/(app)/settings/_actions/` and delete the 4 intermediate re-export barrels**

Move `_actions-*.ts` into `apps/web/src/app/(app)/settings/_actions/`, delete `_actions-preferences.ts`, `_actions-security.ts`, `_actions-api-keys.ts`, and `_actions-data.ts`, and have `apps/web/src/app/(app)/settings/actions.ts` re-export directly from `./_actions/*`.

- [x] **Step 4: Run web tests, typecheck, and maintainability gate**

Run:

```bash
pnpm --filter @kestrel/web test
pnpm typecheck
pnpm check:maintainability
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add -A apps/web/src/app/\(app\)/settings apps/web/src/app/api/settings apps/web/src/lib/services/settings.ts
git commit -m "refactor(web): unify settings mutations, remove raw SQL duplication, and flatten _actions barrels"
```

---

### Task 4: Break Up the 266-Line `api-boundary.ts` God Barrel into Domain Services

**Files:**

- Modify: `apps/web/src/lib/services/admin.ts`
- Modify: `apps/web/src/lib/services/market.ts`
- Modify: `apps/web/src/lib/services/settings.ts`
- Modify: `apps/web/src/lib/services/chat.ts`
- Delete: `apps/web/src/lib/services/api-boundary.ts`
- Modify: `packages/config/eslint/index.js`

**Interfaces:**

- Consumes: Domain services under `apps/web/src/lib/services/*`.
- Produces: Removal of the fake `api-boundary.ts` pass-through barrel; route handlers import from cohesive domain service modules (`@/lib/services/{chat,market,settings,admin,alerts,calendar,journal}`) while `@kestrel/shared` schema/error/type imports are allowed directly in routes.

- [x] **Step 1: Allow `@kestrel/shared` (pure types, Zod schemas, `AppError`) in `packages/config/eslint/index.js` for API routes**

Update `packages/config/eslint/index.js:76-114` so `src/app/api/**/route.ts` may import pure schemas, types, and errors from `@kestrel/shared` directly, while keeping `@kestrel/db`, `@kestrel/ai`, and `@kestrel/data` restricted to `@/lib/services/*`.

- [x] **Step 2: Move domain exports from `api-boundary.ts` into `@/lib/services/{chat,market,settings,admin,calendar}.ts` and delete `api-boundary.ts`**

Update API routes importing from `@/lib/services/api-boundary` to import from their domain service (`@/lib/services/chat`, `@/lib/services/market`, `@/lib/services/settings`, `@/lib/services/admin`, `@/lib/services/calendar`, and `@kestrel/shared`), then delete `apps/web/src/lib/services/api-boundary.ts`.

- [x] **Step 3: Verify `pnpm lint`, `pnpm typecheck`, `pnpm check:route-security`, and `pnpm --filter @kestrel/web test` pass**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm check:route-security
pnpm --filter @kestrel/web test
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add -A packages/config/eslint/index.js apps/web
git commit -m "refactor(web): replace api-boundary.ts pass-through barrel with domain service imports"
```
