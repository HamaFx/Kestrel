# Phase 2: Zombie Subsystems & Dead Code Purge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Purge ~2,500+ lines of dead code, zombie subsystems, and phantom tools left behind by earlier AI migrations (`VercelLlmClient`, legacy mutation tools, `withTelemetry` + `toolTelemetryBuffer`, `ToolRegistry` and its circular dependency with `mastra-v2/instance.ts`, phantom `summarize_thread`, `MastraComponentRegistry`, `db/src/queries/index.ts`, and 19 unused `@kestrel/ai` subpath exports), then lock `knip.json` and `scripts/check-knip-config.mjs` so dead code can never hide again.

**Architecture:**

1. Mastra (`packages/ai/src/mastra-v2/`) is the **only** AI execution engine:
   - Read-only chat tools are registered and resolved exclusively via `nativeCanonicalTools()` (`packages/ai/src/mastra-v2/tools/canonical/index.ts`) and executed through `createReadOnlyToolExecute` -> `executeMastraTool`.
   - Mutations (`set_alert`, `log_journal_entry`, `share_analysis`, `run_system_action`) are drafted via `runMastraMutationTurn` (`packages/ai/src/mastra-v2/workflows/mutation.ts`) and executed only upon user confirmation in `apps/web/src/app/api/chat/mutations/confirm/_lib/executors.ts`.
   - Observational memory (`packages/ai/src/mastra-v2/memory/adapter.ts`) handles thread memory automatically; manual `summarize_thread` is retired end-to-end.
2. `knip.json` only lists true package entrypoints (`package.json` `exports` that have external callers, Next.js route/page conventions, worker `src/index.ts`, and scripts)—never internal `src/tools/*` or `src/queries/*` modules.

**Tech Stack:** TypeScript, Mastra, Drizzle ORM, Vitest, Knip.

---

### Task 1: Delete Dead `VercelLlmClient`, `LLM_CLIENT` Token, and `ScriptedLlmClient`

**Why:** `packages/ai/src/routing/llm-client.ts` (160 LOC, containing 2 `@typescript-eslint/no-explicit-any` casts) was the LLM wrapper for the deleted legacy `agent.ts`. Today `ensureAiBootstrapped()` registers `new VercelLlmClient()` on `container` under `LLM_CLIENT`, and **nothing in the entire repository ever calls `container.resolve(LLM_CLIENT)`**.

**Files:**

- Delete: `packages/ai/src/routing/llm-client.ts`
- Delete: `packages/ai/test/helpers/scripted-llm.ts`
- Delete: `packages/ai/test/helpers/scripted-llm.test.ts`
- Modify: `packages/ai/src/runtime/tokens.ts`
- Modify: `packages/ai/src/runtime/services.ts`
- Modify: `packages/ai/src/barrels/runtime.ts`
- Modify: `packages/ai/test/helpers/index.ts`

- [ ] **Step 1: Verify zero production callers of `LLM_CLIENT` and `VercelLlmClient`**

Run: `pnpm --filter @kestrel/ai exec rg "LLM_CLIENT|VercelLlmClient|LlmClient|ScriptedLlmClient" src test`
Expected: Only matches in `routing/llm-client.ts`, `runtime/tokens.ts`, `runtime/services.ts`, `barrels/runtime.ts`, `test/helpers/scripted-llm.ts`, `test/helpers/scripted-llm.test.ts`, and `test/helpers/index.ts`.

- [ ] **Step 2: Delete `llm-client.ts`, `scripted-llm.ts`, and `scripted-llm.test.ts` and clean up `tokens.ts`, `services.ts`, `barrels/runtime.ts`, and `test/helpers/index.ts`**

1. Delete `packages/ai/src/routing/llm-client.ts`, `packages/ai/test/helpers/scripted-llm.ts`, and `packages/ai/test/helpers/scripted-llm.test.ts`.
2. In `packages/ai/src/runtime/tokens.ts`:
   - Remove `import type { LlmClient } from '../routing/llm-client';` and `export const LLM_CLIENT = createToken<LlmClient>('kestrel.ai.llmClient');`.
3. In `packages/ai/src/runtime/services.ts`:
   - Remove `import { VercelLlmClient } from '../routing/llm-client';`, `LLM_CLIENT`, and `if (!container.has(LLM_CLIENT)) { container.register(LLM_CLIENT, () => new VercelLlmClient()); }`.
4. In `packages/ai/src/barrels/runtime.ts`:
   - Remove `export { VercelLlmClient, type LlmClient, ... } from '../routing/llm-client';` and `LLM_CLIENT` from `./tokens` re-exports.
5. In `packages/ai/test/helpers/index.ts`:
   - Remove `export * from './scripted-llm';`.

- [ ] **Step 3: Run `@kestrel/ai` typecheck and tests**

Run: `pnpm --filter @kestrel/ai typecheck && pnpm --filter @kestrel/ai test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A packages/ai
git commit -m "refactor(ai): remove dead VercelLlmClient, LLM_CLIENT token, and ScriptedLlmClient"
```

---

### Task 2: Extract Shared `syncIntermarketResonance`, Wire Real `run_system_action` Confirmation, and Delete the 5 Dead Legacy Mutation Tools

**Why:**

1. Mastra chat agents only ever expose `READ_ONLY_TOOL_NAMES`. All mutations go through `packages/ai/src/mastra-v2/workflows/mutation.ts` (drafting) and `apps/web/src/app/api/chat/mutations/confirm/_lib/executors.ts` (confirmation).
2. Therefore, `packages/ai/src/tools/{log-journal,set-alert,share-snapshot,run-system-action,mutation-guard}.ts` (~650 LOC) and their 4 test files (`mutation-tools.test.ts`, `mutation-level-bounds.test.ts`, `set-alert-level-bounds.test.ts`, `run-system-action.test.ts`) have **zero production callers**.
3. Meanwhile, confirming `run_system_action` in `apps/web/src/app/api/chat/mutations/confirm/_lib/executors.ts:88-90,183-185` is currently a **stub no-op** (`return { id: 'system:resonance_sync', summary: ... }`), while the actual resonance sync logic is duplicated between the dead `packages/ai/src/tools/run-system-action.ts` and `apps/worker/src/jobs/resonance-sync.ts`!

**Files:**

- Create: `packages/ai/src/services/resonance-sync.ts`
- Modify: `packages/ai/src/index.ts`
- Modify: `apps/web/src/app/api/chat/mutations/confirm/_lib/executors.ts`
- Modify: `apps/worker/src/jobs/resonance-sync.ts`
- Delete: `packages/ai/src/tools/log-journal.ts`
- Delete: `packages/ai/src/tools/set-alert.ts`
- Delete: `packages/ai/src/tools/share-snapshot.ts`
- Delete: `packages/ai/src/tools/run-system-action.ts`
- Delete: `packages/ai/src/tools/mutation-guard.ts`
- Delete: `packages/ai/test/mutation-tools.test.ts`
- Delete: `packages/ai/test/mutation-level-bounds.test.ts`
- Delete: `packages/ai/test/set-alert-level-bounds.test.ts`
- Delete: `packages/ai/test/run-system-action.test.ts`

- [ ] **Step 1: Create `packages/ai/src/services/resonance-sync.ts` with `syncIntermarketResonance()`**

Extract the clean `syncIntermarketResonance(options?: { timeframe?: Timeframe; count?: number })` service into `packages/ai/src/services/resonance-sync.ts` (using `withAdminDb` / `getDb()` to compute the Pearson correlation matrix across `SYMBOLS` and upsert `intermarketResonance`), and export `syncIntermarketResonance` from `packages/ai/src/index.ts`.

- [ ] **Step 2: Wire `syncIntermarketResonance()` into `apps/web/src/app/api/chat/mutations/confirm/_lib/executors.ts` and `apps/worker/src/jobs/resonance-sync.ts`**

1. In `apps/web/src/app/api/chat/mutations/confirm/_lib/executors.ts`:
   - In both `executorFor` (`run_system_action`) and `atomicExecutorFor` (`run_system_action`), call `await syncIntermarketResonance()` when `payload.action === 'resonance_sync'` and return the real pair count in `summary`.
2. In `apps/worker/src/jobs/resonance-sync.ts`:
   - Delegate the correlation matrix calculation + upsert to `syncIntermarketResonance()` from `@kestrel/ai`.

- [ ] **Step 3: Move level-bounds validation into `packages/ai/src/mastra-v2/mutation/mutation-extract.ts` and delete the 5 dead legacy mutation tool files**

1. Ensure `assertValidTradeLevels` and `assertValidAlertLevel` (from `packages/shared`) are enforced when extracting/validating mutation drafts in `packages/ai/src/mastra-v2/mutation/mutation-extract.ts` and tested in `packages/ai/test/mastra-v2-mutation-workflow.test.ts`.
2. Delete:
   - `packages/ai/src/tools/log-journal.ts`
   - `packages/ai/src/tools/set-alert.ts`
   - `packages/ai/src/tools/share-snapshot.ts`
   - `packages/ai/src/tools/run-system-action.ts`
   - `packages/ai/src/tools/mutation-guard.ts`
   - `packages/ai/test/mutation-tools.test.ts`
   - `packages/ai/test/mutation-level-bounds.test.ts`
   - `packages/ai/test/set-alert-level-bounds.test.ts`
   - `packages/ai/test/run-system-action.test.ts`
3. Remove their exports from `packages/ai/src/tools/{journal,system,index}.ts` and `packages/ai/src/barrels/tools.ts`.

- [ ] **Step 4: Run tests and typecheck across `@kestrel/ai`, `@kestrel/web`, and `@kestrel/worker`**

Run: `pnpm --filter @kestrel/ai test && pnpm --filter @kestrel/web test && pnpm --filter @kestrel/worker test && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A packages/ai apps/web apps/worker
git commit -m "refactor(ai): delete dead legacy mutation tools and wire resonance_sync confirmation to shared service"
```

---

### Task 3: Delete Dead `with-telemetry.ts`, `toolTelemetryBuffer`, and `ToolRegistry`, Breaking the `mastra-v2/instance ↔ tools` Circular Dependency

**Why:**

1. Every Mastra tool is resolved from `nativeCanonicalTools()` (`packages/ai/src/mastra-v2/tools/canonical/index.ts`) and wrapped by `createReadOnlyToolExecute` -> `executeMastraTool` (`packages/ai/src/mastra-v2/shared/tool-telemetry.ts`).
2. `packages/ai/src/tools/with-telemetry.ts` (194 LOC) only wraps tools inside `toolRegistry.register()`, and `toolRegistry.resolve()` has **zero production callers**.
3. `toolTelemetryBuffer` on `ToolContext` (`packages/ai/src/runtime/tool-context.ts`, initialized in `setup.ts:276`, `agent-builder.ts:273`, `run-context.ts:97`) is only ever pushed to by `with-telemetry.ts` and **never read or flushed anywhere**.
4. `registerAllTools()` in `packages/ai/src/mastra-v2/instance.ts:51` is the sole cause of the `mastra-v2/instance.ts ↔ tools` circular dependency documented across 6 files, and `toolRegistry.list()` is only used by `packages/ai/src/catalogue.ts` and `packages/ai/src/plugins/core-tools.ts` to read tool names and descriptions (which `nativeCanonicalTools()` already provides!).

**Files:**

- Delete: `packages/ai/src/tools/with-telemetry.ts`
- Delete: `packages/ai/src/tools/registry.ts`
- Delete: `packages/ai/src/tools/market.ts`
- Delete: `packages/ai/src/tools/analysis.ts`
- Delete: `packages/ai/src/tools/journal.ts`
- Delete: `packages/ai/src/tools/system.ts`
- Delete: `packages/ai/src/tools/web.ts`
- Modify: `packages/ai/src/tools/index.ts`
- Modify: `packages/ai/src/runtime/tool-context.ts`
- Modify: `packages/ai/src/mastra-v2/agents/canonical/setup.ts`
- Modify: `packages/ai/src/mastra-v2/shared/run-context.ts`
- Modify: `packages/ai/src/plugins/agent-builder.ts`
- Modify: `packages/ai/src/plugins/core-tools.ts`
- Modify: `packages/ai/src/catalogue.ts`
- Modify: `packages/ai/src/mastra-v2/instance.ts`
- Modify: `packages/ai/src/barrels/tools.ts`

- [ ] **Step 1: Update `packages/ai/src/catalogue.ts` and `packages/ai/src/plugins/core-tools.ts` to read tool descriptions from `nativeCanonicalTools()`**

1. In `packages/ai/src/catalogue.ts`:
   - Replace `registerAllTools()` + `toolRegistry.list()` with `nativeCanonicalTools()` from `./mastra-v2/tools/canonical` (reading `.description` from each canonical Mastra tool definition).
2. In `packages/ai/src/plugins/core-tools.ts`:
   - Replace `registerAllTools()` + `toolRegistry.list()` with `nativeCanonicalTools()` so plugin agents get the exact same canonical read-only tools and descriptions without `ToolRegistry`.

- [ ] **Step 2: Remove `registerAllTools()` from `packages/ai/src/mastra-v2/instance.ts` and remove `toolTelemetryBuffer` from `ToolContext`**

1. In `packages/ai/src/mastra-v2/instance.ts`:
   - Remove `import { registerAllTools } from '../tools';` and the `registerAllTools();` call at line 51.
2. In `packages/ai/src/runtime/tool-context.ts`:
   - Delete `ToolTelemetryEntry` and remove `toolTelemetryBuffer?: ToolTelemetryEntry[];` from `ToolContext`.
3. Remove `toolTelemetryBuffer: []` from:
   - `packages/ai/src/mastra-v2/agents/canonical/setup.ts:276`
   - `packages/ai/src/mastra-v2/shared/run-context.ts:97`
   - `packages/ai/src/plugins/agent-builder.ts:273`

- [ ] **Step 3: Delete `with-telemetry.ts`, `registry.ts`, and the domain registration files (`market.ts`, `analysis.ts`, `journal.ts`, `system.ts`, `web.ts`)**

1. Delete `packages/ai/src/tools/with-telemetry.ts`, `packages/ai/src/tools/registry.ts`, `packages/ai/src/tools/market.ts`, `packages/ai/src/tools/analysis.ts`, `packages/ai/src/tools/journal.ts`, `packages/ai/src/tools/system.ts`, and `packages/ai/src/tools/web.ts`.
2. Simplify `packages/ai/src/tools/index.ts` and `packages/ai/src/barrels/tools.ts` to only export the `execute*` functions and `getMarketSnapshot` used by `mastra-v2`, `committee`, `packet`, and `worker`.
3. Update `packages/ai/test/tools.test.ts` and `packages/ai/test/catalogue.test.ts` to test `nativeCanonicalTools()` and `listAgentCatalogue()` directly instead of `toolRegistry`.

- [ ] **Step 4: Run typecheck and tests across the monorepo**

Run: `pnpm typecheck && pnpm --filter @kestrel/ai test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A packages/ai
git commit -m "refactor(ai): remove dead ToolRegistry, withTelemetry, and toolTelemetryBuffer"
```

---

### Task 4: Purge the Phantom `summarize_thread` Tool End-to-End (`@kestrel/shared`, `@kestrel/ai`, `@kestrel/web`)

**Why:** The `summarize_thread` tool implementation was removed when Mastra observational memory replaced manual thread summarization, but its dead schema, tool name, memory helper, UI renderer, and always-404 API route were left behind across 3 packages:

- `packages/shared/src/ai/tool-names.ts:55` (`'summarize_thread'`)
- `packages/shared/src/schemas/tool-outputs/summarize-thread.ts`
- `packages/ai/src/memory/memory-index/remember-thread-synopsis.ts` (`rememberThreadSynopsis` — zero production callers)
- `apps/web/src/components/chat/parts/summarize-thread.tsx` (104 LOC)
- `apps/web/src/app/api/chat/threads/[id]/summary/route.ts` (scans messages for `tool-summarize_thread`, always returns 404, fetched on every thread open in `use-chat-url-sync.ts:41`!)
- `apps/web/src/components/chat/thread-summary-header.tsx` (dead UI header for that 404 route)

**Files:**

- Delete: `packages/shared/src/schemas/tool-outputs/summarize-thread.ts`
- Delete: `packages/ai/src/memory/memory-index/remember-thread-synopsis.ts`
- Delete: `apps/web/src/components/chat/parts/summarize-thread.tsx`
- Delete: `apps/web/src/app/api/chat/threads/[id]/summary/route.ts`
- Delete: `apps/web/src/components/chat/thread-summary-header.tsx`
- Modify: `packages/shared/src/ai/tool-names.ts`
- Modify: `packages/shared/src/schemas/tool-outputs/index.ts`
- Modify: `packages/ai/src/memory/memory-index/index.ts`
- Modify: `apps/web/src/components/chat/parts/tool-part-router.tsx`
- Modify: `apps/web/src/components/chat/use-chat-url-sync.ts`
- Modify: `apps/web/src/components/chat/chat-view.tsx`

- [ ] **Step 1: Remove `summarize_thread` from `@kestrel/shared` and `@kestrel/ai`**

1. Delete `packages/shared/src/schemas/tool-outputs/summarize-thread.ts` and remove its re-export from `packages/shared/src/schemas/tool-outputs/index.ts`.
2. Remove `'summarize_thread'` from `TOOL_NAMES` in `packages/shared/src/ai/tool-names.ts`.
3. Delete `packages/ai/src/memory/memory-index/remember-thread-synopsis.ts` and remove its re-export from `packages/ai/src/memory/memory-index/index.ts` and `packages/ai/src/barrels/memory.ts`.

- [ ] **Step 2: Remove dead `summarize_thread` UI part, 404 summary API route, and dead `threadSummary` fetch in `@kestrel/web`**

1. Delete `apps/web/src/components/chat/parts/summarize-thread.tsx` and remove the `case 'tool-summarize_thread':` branch from `apps/web/src/components/chat/parts/tool-part-router.tsx`.
2. Delete `apps/web/src/app/api/chat/threads/[id]/summary/route.ts` and `apps/web/src/components/chat/thread-summary-header.tsx`.
3. In `apps/web/src/components/chat/use-chat-url-sync.ts` and `apps/web/src/components/chat/chat-view.tsx`, remove the `threadSummary` state and the `fetch(\`/api/chat/threads/\${activeId}/summary\`)` call that fired a wasted 404 request on every thread switch.

- [ ] **Step 3: Run typecheck and tests across `@kestrel/shared`, `@kestrel/ai`, and `@kestrel/web`**

Run: `pnpm typecheck && pnpm --filter @kestrel/shared test && pnpm --filter @kestrel/ai test && pnpm --filter @kestrel/web test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A packages/shared packages/ai apps/web
git commit -m "refactor(chat): remove phantom summarize_thread tool, dead UI part, and always-404 summary endpoint"
```

---

### Task 5: Delete Dead `MastraComponentRegistry` (`packages/ai/src/mastra-v2/registry.ts`) and Dead `queries.*` Barrel (`packages/db/src/queries/index.ts`)

**Why:**

1. `packages/ai/src/mastra-v2/registry.ts` (150 LOC: `MASTRA_COMPONENT_REGISTRY`, `resolveMastraAgent`, `resolveMastraWorkflow`, `assertMastraRegistryComplete`) has **zero production callers**—and its own doc comment admits that `createKestrelMastra()` does not register components on `instance` in production anyway.
2. `packages/db/src/queries/index.ts` exports 22 namespaces (`export * as users`, etc.) and `packages/db/src/index.ts:261` exports `export * as queries from './queries'`. Zero files in the entire repository ever use `queries.<namespace>`.

**Files:**

- Delete: `packages/ai/src/mastra-v2/registry.ts`
- Delete: `packages/ai/test/mastra-v2-registry.test.ts`
- Modify: `packages/ai/src/mastra-v2/index.ts`
- Delete: `packages/db/src/queries/index.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Delete `packages/ai/src/mastra-v2/registry.ts` and `packages/ai/test/mastra-v2-registry.test.ts`**

1. Delete `packages/ai/src/mastra-v2/registry.ts` and `packages/ai/test/mastra-v2-registry.test.ts`.
2. In `packages/ai/src/mastra-v2/index.ts`, remove lines 27–34 (`export { assertMastraRegistryComplete, ... } from './registry';`).

- [ ] **Step 2: Delete `packages/db/src/queries/index.ts` and remove `export * as queries` from `packages/db/src/index.ts`**

1. Delete `packages/db/src/queries/index.ts`.
2. In `packages/db/src/index.ts`, delete line 261 (`export * as queries from './queries';`).

- [ ] **Step 3: Run typecheck and tests**

Run: `pnpm typecheck && pnpm --filter @kestrel/ai test && pnpm --filter @kestrel/db test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A packages/ai packages/db
git commit -m "refactor(ai,db): remove dead MastraComponentRegistry and unused db queries namespace barrel"
```

---

### Task 6: Prune 19 Unused `@kestrel/ai` Subpath Exports and Harden `knip.json` + `scripts/check-knip-config.mjs`

**Why:**

1. `packages/ai/package.json` currently defines **25 subpath exports**, of which **19 have zero imports outside `packages/ai`**:
   - Unused subpaths: `./model`, `./tools`, `./tools/market`, `./tools/analysis`, `./tools/journal`, `./tools/system`, `./tools/web`, `./tools/registry`, `./diagnostics`, `./notifications`, `./catalogue`, `./byok-providers`, `./memory`, `./share`, `./embeddings`, `./rag`, `./usage`, `./instrumentation`, `./eval/training-export`, `./eval/runner` (only CLI scripts inside `packages/ai` use `eval/*`).
   - Actually used subpaths outside `packages/ai`: `.`, `./cost`, `./persistence`, `./cron`, `./mastra-v2`, `./plugins`.
2. `knip.json` lists internal files (`src/tools/{index,market,analysis,journal,system,web,by-domain,registry}.ts`, `src/queries/*.ts`, etc.) as `entry` points to silence Knip, and `scripts/check-knip-config.mjs` only blocks literal `^src/\*\*` globs.

**Files:**

- Modify: `packages/ai/package.json`
- Modify: `knip.json`
- Modify: `scripts/check-knip-config.mjs`

- [ ] **Step 1: Prune `packages/ai/package.json` `exports` to the 6 subpaths actually consumed across the workspace**

In `packages/ai/package.json`, replace `"exports"` with:

```json
  "exports": {
    ".": "./src/index.ts",
    "./cost": "./src/cost/index.ts",
    "./persistence": "./src/persistence/index.ts",
    "./cron": "./src/cron.ts",
    "./mastra-v2": "./src/mastra-v2/index.ts",
    "./plugins": "./src/plugins/index.ts"
  },
```

- [ ] **Step 2: Clean `knip.json` `entry` arrays so only true package entrypoints and CLI scripts are listed**

In `knip.json`:

- Under `"packages/db"`, remove `"src/queries/*.ts"` and `"src/schema/index.ts"` from `entry` (keep only `"src/index.ts"`, `"src/schema/relations.ts"`, and `"scripts/*.mjs"`).
- Under `"packages/ai"`, remove `"src/tools/{index,market,analysis,journal,system,web,by-domain,registry}.ts"`, `"src/{model,diagnostics,notifications,catalogue,byok-providers,memory,share,embeddings,rag,usage,instrumentation}.ts"` from `entry` (keep only the 6 exported entrypoints + `"src/eval/{runner,training-export}.ts"` used by `package.json` scripts).
- Under `"packages/data"`, remove `"src/{providers,cache,calendar,cot,fred,news,sentiment}/index.ts"` from `entry` (keep `"src/index.ts"` and `"src/stream/index.ts"`).

- [ ] **Step 3: Harden `scripts/check-knip-config.mjs` to ban brace-expansion globs and non-exported internal `src/*` entrypoints in `packages/*`**

Update `scripts/check-knip-config.mjs` so that any `entry` inside `packages/*` must either exist in that package's `package.json` `exports` or `scripts`, or be `src/schema/relations.ts` (Drizzle schema loader).

- [ ] **Step 4: Run `pnpm check:knip` and `pnpm typecheck`**

Run: `pnpm check:knip && pnpm typecheck`
Expected: PASS (and delete any remaining unused internal exports surfaced by `knip`).

- [ ] **Step 5: Commit**

```bash
git add packages/ai/package.json knip.json scripts/check-knip-config.mjs
git commit -m "chore(knip): prune 19 unused @kestrel/ai subpath exports and forbid internal entrypoints in knip.json"
```
