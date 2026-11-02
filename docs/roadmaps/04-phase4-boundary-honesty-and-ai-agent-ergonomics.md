# Phase 4: Boundary Honesty, Canonical Tool Wiring & AI Agent Ergonomics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate pass-through "service theater" in `apps/web/src/lib/services/` and `apps/worker/src/`, stop re-exporting `getDb` from `@kestrel/ai`, promote ESLint `no-restricted-imports` to `'error'` across all `src/app/api/**/*.ts` files, fix `setupCanonicalChat` tool filtering so all built tools (`analyze_chart_image`, `annotate_chart`, `get_journal_stats`, `compute_position_health`, `replay_setup`) actually reach the agent when their capability is active, and upgrade `.claude/settings.json` + `AGENTS.md` for future AI coding sessions.

**Architecture:**

1. `apps/web/src/app/api/**` routes call domain service functions in `apps/web/src/lib/services/*`—never raw `schema.*` Drizzle tables via a `lib/services/db.ts` loophole.
2. `@kestrel/db` is the **only** package that exports `getDb`, `getAdminDb`, `withAdminDb`, `withUserTenant`, and `withUserTenantRead` to `apps/web` and `apps/worker`. `@kestrel/ai`'s internal RLS-checked `getDb` stays private inside `packages/ai/src/runtime/db.ts`.
3. Every tool registered in `nativeCanonicalTools()` is mapped to a capability in `MASTRA_CAPABILITIES` and included in `READ_ONLY_TOOL_NAMES` so capability routing and agent tool binding are 100% consistent.

**Tech Stack:** TypeScript, Next.js 16, Mastra, Drizzle ORM, ESLint, Claude Code Hooks.

---

### Task 1: Replace the 18 `@kestrel/ai` `getDb` Imports in `apps/web` and `apps/worker` with `@kestrel/db`, and Stop Exporting `getDb` from `@kestrel/ai`

**Why:** Because `packages/ai/src/barrels/runtime.ts:32` exports `getDb` from `@kestrel/ai`, 18 files in `apps/web` and `apps/worker` (including NextAuth login/callback files `apps/web/src/lib/auth/{callbacks,provision-user,admin-auth,credentials-authorize,providers}.ts`) import `getDb` from `@kestrel/ai` instead of `@kestrel/db`, coupling the authentication and worker bootstrap layers to the entire AI package!

**Files:**

- Modify: `packages/ai/src/barrels/runtime.ts`
- Modify: `apps/web/src/lib/auth/callbacks.ts`
- Modify: `apps/web/src/lib/auth/provision-user.ts`
- Modify: `apps/web/src/lib/auth/admin-auth.ts`
- Modify: `apps/web/src/lib/auth/credentials-authorize.ts`
- Modify: `apps/web/src/lib/auth/providers.ts`
- Modify: `apps/web/src/lib/http/auth-middleware.ts`
- Modify: `apps/web/src/lib/services/settings/index.ts`
- Modify: `apps/web/src/lib/services/settings/account.ts`
- Modify: `apps/web/src/lib/services/watchlist.ts`
- Modify: `apps/web/src/app/(app)/onboarding/actions.ts`
- Modify: `apps/web/src/app/(app)/settings/_actions/account-prefs.ts`
- Modify: `apps/web/src/app/(app)/settings/_actions/api-keys-save.ts`
- Modify: `apps/web/src/app/(app)/settings/_actions/api-keys-transfer.ts`
- Modify: `apps/web/src/app/(app)/settings/_actions/data-clear.ts`
- Modify: `apps/web/src/app/(app)/settings/_actions/data-export.ts`
- Modify: `apps/web/src/app/(app)/settings/_actions/security-account.ts`
- Modify: `apps/web/src/app/(app)/settings/_actions/security-password.ts`
- Modify: `apps/web/src/app/(app)/settings/_actions/security-two-factor.ts`
- Modify: `apps/worker/src/jobs/outcomes.ts`
- Modify: `apps/worker/src/jobs/weekly-review.ts`

- [ ] **Step 1: Update all 18 files in `apps/web` and `apps/worker` to import `getDb` from `@kestrel/db` instead of `@kestrel/ai`**

In each listed file, move `getDb` from the `@kestrel/ai` import specifier to the `@kestrel/db` import specifier (removing the `@kestrel/ai` import altogether in files like `apps/web/src/lib/auth/*` where `getDb` was the only symbol imported from `@kestrel/ai`).

- [ ] **Step 2: Remove `export { getDb } from '../runtime/db';` from `packages/ai/src/barrels/runtime.ts`**

Keep `getDb` internal to `packages/ai/src/` (`packages/ai/src/runtime/db.ts`).

- [ ] **Step 3: Run typecheck and tests across the monorepo**

Run: `pnpm typecheck && pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/barrels/runtime.ts apps/web apps/worker
git commit -m "refactor(db,ai): import getDb from @kestrel/db in web/worker and make @kestrel/ai getDb internal"
```

---

### Task 2: Eliminate the `apps/web/src/lib/services/db.ts` Escape Hatch and Promote ESLint `no-restricted-imports` to `'error'`

**Why:**

1. `packages/config/eslint/index.js` bans `@kestrel/*` imports in `src/app/api/**/route.ts`, but sets severity to `'warn'` and only checks `route.ts` (ignoring `_lib/*.ts`).
2. Worse, `apps/web/src/lib/services/db.ts` is a 1-line re-export of `@kestrel/db` (`export { getAdminDb, getDb, requireTenantIdForUser, schema, withAdminDb } from '@kestrel/db'`), which routes use to write raw `schema.*` Drizzle queries directly inside `app/api/**`!
3. Five pass-through shims in `apps/worker/src/` and `apps/web/src/lib/services/mastra/` violate the `AGENTS.md` "No pass-through shims" rule:
   - `apps/worker/src/jobs/multi-agent-analysis.ts`
   - `apps/worker/src/signalr/consumer.ts`
   - `apps/web/src/lib/services/mastra/mutation-handler.ts`
   - `apps/web/src/lib/services/mastra/stream-adapter.ts`
   - `apps/web/src/lib/services/mastra/chat-orchestrator.ts`

**Files:**

- Delete: `apps/web/src/lib/services/db.ts`
- Delete: `apps/worker/src/jobs/multi-agent-analysis.ts`
- Delete: `apps/worker/src/signalr/consumer.ts`
- Delete: `apps/web/src/lib/services/mastra/mutation-handler.ts`
- Delete: `apps/web/src/lib/services/mastra/stream-adapter.ts`
- Delete: `apps/web/src/lib/services/mastra/chat-orchestrator.ts`
- Modify: `apps/web/src/lib/services/admin.ts`
- Modify: `apps/web/src/lib/services/settings/index.ts`
- Modify: `apps/web/src/app/api/admin/mastra-runs/route.ts`
- Modify: `apps/web/src/app/api/admin/platform-config/_lib/api-key-actions.ts`
- Modify: `apps/web/src/app/api/admin/platform-config/_lib/settings-actions.ts`
- Modify: `apps/web/src/app/api/admin/platform-config/_lib/context.ts`
- Modify: `apps/web/src/app/api/settings/usage-by-agent/route.ts`
- Modify: `apps/web/src/app/api/settings/test-provider/route.ts`
- Modify: `apps/web/src/app/api/journal/import/route.ts`
- Modify: `packages/config/eslint/index.js`

- [ ] **Step 1: Move the remaining raw Drizzle queries out of `app/api/**` into `apps/web/src/lib/services/{admin,settings,journal}` and delete `apps/web/src/lib/services/db.ts`**

1. Move the `mastraWorkflowRuns` query in `apps/web/src/app/api/admin/mastra-runs/route.ts` and the platform-config helpers in `apps/web/src/app/api/admin/platform-config/_lib/*.ts` into `apps/web/src/lib/services/admin.ts`.
2. Move the `usage-by-agent` aggregation query in `apps/web/src/app/api/settings/usage-by-agent/route.ts` into `apps/web/src/lib/services/settings/index.ts` (`getUsageByAgent(userId, period)`).
3. Move the batch journal insert in `apps/web/src/app/api/journal/import/route.ts` into `apps/web/src/lib/services/journal/index.ts` (`importJournalEntriesForUser(userId, trades)`).
4. Delete `apps/web/src/lib/services/db.ts`.

- [ ] **Step 2: Delete the 5 pass-through shim files in `apps/worker/src/` and `apps/web/src/lib/services/mastra/` and update their callers**

1. Delete `apps/worker/src/jobs/multi-agent-analysis.ts` and `apps/worker/src/signalr/consumer.ts` (Node/TS resolves `./multi-agent-analysis/index.js` and `./consumer/index.js` directly).
2. Delete `apps/web/src/lib/services/mastra/{mutation-handler,stream-adapter,chat-orchestrator}.ts` and update imports to point to `./mutation/mastra-mutation-draft`, `./stream/mastra-stream-adapter`, and `./orchestrator/mastra-chat-orchestrator` (or `mastra/index.ts`).

- [ ] **Step 3: Promote `no-restricted-imports` in `packages/config/eslint/index.js` to `'error'` and cover `src/app/api/**/*.ts`**

In `packages/config/eslint/index.js`:

- Change `'no-restricted-imports': ['warn', ...]` to `'no-restricted-imports': ['error', ...]`.
- Change `files: ['src/app/api/**/route.ts']` to `files: ['src/app/api/**/*.ts']` (excluding `@kestrel/shared` type/schema imports if desired, or routing through `@/lib/services/*`).

- [ ] **Step 4: Run `pnpm lint`, `pnpm typecheck`, and `pnpm test`**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS with 0 errors and 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add -A packages/config/eslint apps/web apps/worker
git commit -m "refactor(web,worker,eslint): remove services/db loophole and pass-through shims, enforce route boundaries as error"
```

---

### Task 3: Wire Unreachable Canonical Tools (`analyze_chart_image`, `annotate_chart`, `get_journal_stats`, `compute_position_health`, `replay_setup`) and `sensitive-user-read` Capability

**Why:**

1. `nativeCanonicalTools()` (`packages/ai/src/mastra-v2/tools/canonical/index.ts`) builds and registers 32 tools, and `LEGACY_DOMAIN_TOOL_NAMES` in `packages/ai/src/mastra-v2/capabilities/catalog.ts:43,75-79` explicitly lists `analyze_chart_image`, `annotate_chart`, `get_journal_stats`, `compute_position_health`, and `replay_setup`.
2. However, `CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES` (`packages/ai/src/mastra-v2/tools/names.ts:62-91`) omits those 5 tools, and `setupCanonicalChat` (`packages/ai/src/mastra-v2/agents/canonical/setup.ts:138`) filters `nativeCanonicalTools()` by `READ_ONLY_TOOL_NAMES` (`if (!allowedNames.has(name)) continue`). As a result, those 5 read-only tools are **silently stripped from every canonical chat turn**!
3. Similarly, `MASTRA_CAPABILITIES['sensitive-user-read']` (`catalog.ts:196`) is defined with `get_journal_entries`, `get_journal_stats`, `get_alerts`, and `compute_position_health`, but `capabilityFor()` in `packages/ai/src/mastra-v2/planning/execution-routes.ts` never selects `'sensitive-user-read'`.

**Files:**

- Modify: `packages/ai/src/mastra-v2/tools/names.ts`
- Modify: `packages/ai/src/mastra-v2/capabilities/catalog.ts`
- Modify: `packages/ai/src/mastra-v2/planning/execution-routes.ts`
- Test: `packages/ai/test/mastra-v2-capabilities.test.ts`

- [ ] **Step 1: Add the 5 read-only tools to `CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES` and map them in `MASTRA_CAPABILITIES`**

1. In `packages/ai/src/mastra-v2/tools/names.ts`:
   - Add `'analyze_chart_image'`, `'annotate_chart'`, `'get_journal_stats'`, `'compute_position_health'`, and `'replay_setup'` to `CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES`.
2. In `packages/ai/src/mastra-v2/capabilities/catalog.ts`:
   - Include `'analyze_chart_image'`, `'annotate_chart'`, and `'replay_setup'` in `xauusd-ReadOnlyAnalysis` (and vision/chart turns).
3. In `packages/ai/src/mastra-v2/planning/execution-routes.ts`:
   - Route user-journal / alert-status / position-health read queries (or `domains` containing `'summary'` with journal/alert read intent) to include `'sensitive-user-read'` tools when `userId` is authenticated.

- [ ] **Step 2: Add an invariant test in `packages/ai/test/mastra-v2-capabilities.test.ts` asserting every tool in `nativeCanonicalTools()` is reachable via `READ_ONLY_TOOL_NAMES` and `MASTRA_CAPABILITIES`**

```ts
it('ensures every tool in nativeCanonicalTools() is in READ_ONLY_TOOL_NAMES and at least one capability', () => {
  const canonicalNames = Object.keys(nativeCanonicalTools());
  const readOnlySet = new Set<string>(READ_ONLY_TOOL_NAMES);
  const capabilityTools = new Set<string>(
    Object.values(MASTRA_CAPABILITIES).flatMap((cap) => [...cap.allowedTools]),
  );
  for (const name of canonicalNames) {
    expect(readOnlySet.has(name), `${name} missing from READ_ONLY_TOOL_NAMES`).toBe(true);
    expect(capabilityTools.has(name), `${name} missing from MASTRA_CAPABILITIES`).toBe(true);
  }
});
```

- [ ] **Step 3: Run `@kestrel/ai` tests and typecheck**

Run: `pnpm --filter @kestrel/ai test && pnpm --filter @kestrel/ai typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/mastra-v2/ packages/ai/test/mastra-v2-capabilities.test.ts
git commit -m "fix(ai): wire all 32 canonical read-only tools into READ_ONLY_TOOL_NAMES and Mastra capabilities"
```

---

### Task 4: Upgrade AI Coding Agent Ergonomics (`.claude/settings.json` Deterministic Hooks, `AGENTS.md`, and Baseline Tightening)

**Why:**

1. Following 2026 vibecoding best practices (Claude Code Docs & AGENTS.md specification), deterministic checks (formatting edited files, blocking edits that break architecture boundaries, and ratcheting down `scripts/maintainability-baseline.json`) should run automatically via hooks rather than relying on the LLM remembering prose instructions.
2. After Phase 2–4 deletions, `scripts/maintainability-baseline.json` should be ratcheted down to lock in the reduced file count so future AI sessions cannot re-bloat `packages/ai` or `apps/web`.

**Files:**

- Modify: `.claude/settings.json`
- Modify: `AGENTS.md`
- Modify: `packages/ai/AGENTS.md`
- Modify: `apps/web/AGENTS.md`
- Modify: `scripts/maintainability-baseline.json`

- [ ] **Step 1: Add a fast deterministic `PostToolUse` format/lint check hook to `.claude/settings.json` alongside existing hooks**

In `.claude/settings.json`, add a `PostToolUse` matcher for `Edit|Write` that runs `prettier --write` on the modified file so AI agent edits never fail `pnpm format:check` in CI.

- [ ] **Step 2: Update `AGENTS.md`, `packages/ai/AGENTS.md`, and `apps/web/AGENTS.md` to reflect the cleaned architecture**

1. In `packages/ai/AGENTS.md`:
   - Document that `nativeCanonicalTools()` (`src/mastra-v2/tools/canonical/index.ts`) is the **single** tool registry and `runMastraMutationTurn` is the **single** mutation path.
   - Document that `getDb()` from `src/runtime/db.ts` is the **only** allowed DB accessor inside `@kestrel/ai` (never `container.resolve(DB)`).
2. In `apps/web/AGENTS.md`:
   - Document that all Server Components and Server Actions calling `@kestrel/db` or `@kestrel/ai` DB functions must wrap execution in `withUserTenantRead(userId, ...)` or `withUserTenant(userId, ...)`.
   - Document that `src/lib/services/*` must contain real domain orchestration, never 1-line re-exports of `@kestrel/db`.

- [ ] **Step 3: Ratchet down `scripts/maintainability-baseline.json` to match the post-cleanup file counts**

Run `pnpm check:maintainability`, read the new lower `files` and `over300Lines` counts for `apps/web`, `apps/worker`, `packages/ai`, `packages/db`, and `packages/shared`, and lower `maxFiles` and `over300Lines` in `scripts/maintainability-baseline.json` to lock in the gains.

- [ ] **Step 4: Run the full repository verification suite**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm check:maintainability && pnpm check:knip && pnpm test`
Expected: ALL GREEN.

- [ ] **Step 5: Commit**

```bash
git add .claude/settings.json AGENTS.md packages/ai/AGENTS.md apps/web/AGENTS.md scripts/maintainability-baseline.json
git commit -m "chore(agents): add deterministic PostToolUse formatting hook, update AGENTS.md, and ratchet maintainability baseline"
```
