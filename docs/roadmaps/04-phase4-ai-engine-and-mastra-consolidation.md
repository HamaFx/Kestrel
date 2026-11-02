# Phase 4: AI Engine Consolidation — Single Mastra Tool System, Unified Symbol Routing & Stream Service Deduplication Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the 3 parallel AI tool systems in `packages/ai` into 1 native Mastra tool suite, retire the legacy PoC `xauusd-*` (`version: 'poc-5'`) special-case execution routes in favor of the unified 18-symbol `symbol-research` and `canonical-chat` pipelines, unify the 3 copy-pasted SSE chat streaming generators in `apps/web`, and clean up overlapping `packages/ai/src/models/*` modules.

**Architecture:**

1. Complete the native Mastra tool migration so every read-only tool in `packages/ai/src/tools/*` is a native `createTool` registration using `createReadOnlyToolExecute`, retiring `adaptLegacyReadOnlyTool` and the 19 duplicate `get-xauusd-*` tool wrappers.
2. Route `XAUUSD` through the same `symbol-research` (committee/research packet) and `canonical-chat` routes as the other 17 symbols (`EURUSD`, `BTCUSDT`, etc.), preserving report follow-up context on `symbol-research`.
3. Extract a single `runMastraSseStreamTurn` runner in `apps/web/src/lib/services/mastra/stream/` shared by canonical chat and custom-agent streams.

**Tech Stack:** `@mastra/core`, Vercel AI SDK v5 (`ai`), Zod, TypeScript 7 (`tsrs`), Vitest 5.

**Spec:** `docs/roadmaps/00-kestrel-maintainability-audit-and-master-roadmap.md` (§3.3, §4)

## Global Constraints

- Preserve all tool names in `TOOL_NAMES` (`@kestrel/shared`) and UI part shapes (`tool-<name>`, `data-multi-agent-meta`, `data-agent-progress`, `data-fallback`) so the frontend chat renderer (`apps/web/src/components/chat/parts/*`) requires zero breaking protocol changes.
- Every read-only tool must pipe `context.abortSignal` and enforce the 25s per-tool timeout via `executeMastraTool`.
- Every market-data tool must preserve freshness and staleness warnings (`R8` invariant).

## Review Focus

- `packages/ai/src/models/embedding.ts` (`resolveEmbeddingModel`, `resolveEmbeddingModelDetails`) and `packages/ai/src/models/embeddings.ts` (`embedTexts`, `vectorLiteral`) have a circular dependency (`embeddings.ts` imports `resolveEmbeddingModelDetails` from `./embedding` AND `resolveEmbeddingModel` from `./model`, while `model.ts` re-exports from `./embedding`). Merging `embedding.ts` and `embeddings.ts` breaks this cycle cleanly.
- `packages/ai/src/multi-agent/persistence.ts` is the only file in `packages/ai/src/multi-agent/`; moving it to `packages/ai/src/committee/opinion-persistence.ts` eliminates an entire orphan top-level directory in `packages/ai/src/`.
- When retiring `adaptLegacyReadOnlyTool`, ensure `toolRegistry.resolve()` returns the native Mastra tools (or that `nativeCanonicalTools()` covers all 21 read-only tools in `CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES` and `SENSITIVE_USER_READ_TOOL_NAMES`).

---

### Task 1: Merge Overlapping Model Modules (`embedding.ts` + `embeddings.ts`, `fallback.ts` + `model-fallback.ts`) and Move `multi-agent/persistence.ts` into `committee/`

**Files:**

- Modify: `packages/ai/src/models/embeddings.ts`
- Delete: `packages/ai/src/models/embedding.ts`
- Modify: `packages/ai/src/models/model-fallback.ts`
- Delete: `packages/ai/src/models/fallback.ts`
- Modify: `packages/ai/src/models/model.ts`
- Move: `packages/ai/src/multi-agent/persistence.ts` → `packages/ai/src/committee/opinion-persistence.ts`
- Modify: `packages/ai/src/barrels/agents.ts`

**Interfaces:**

- Consumes: `packages/ai/src/models/*`, `packages/ai/src/committee/*`.
- Produces: Consolidated `embeddings.ts` (~210 LOC) and `model-fallback.ts` (~270 LOC) with zero circular imports; removal of `packages/ai/src/multi-agent/` orphan directory.

- [ ] **Step 1: Merge `packages/ai/src/models/embedding.ts` into `packages/ai/src/models/embeddings.ts`**

Move `EmbeddingModelResolutionDetails`, `EmbeddingModelResolution`, `resolveEmbeddingModelDetails`, and `resolveEmbeddingModel` into `packages/ai/src/models/embeddings.ts`, update `packages/ai/src/models/model.ts` to re-export from `./embeddings`, and delete `packages/ai/src/models/embedding.ts`.

- [ ] **Step 2: Merge `packages/ai/src/models/fallback.ts` into `packages/ai/src/models/model-fallback.ts`**

Move `classifyStreamError`, `shouldFallback`, `makeFallbackPart`, `FallbackReason`, `FallbackDecision`, and `FallbackPartPayload` into `packages/ai/src/models/model-fallback.ts`, update imports in `packages/ai`, and delete `packages/ai/src/models/fallback.ts`.

- [ ] **Step 3: Move `packages/ai/src/multi-agent/persistence.ts` to `packages/ai/src/committee/opinion-persistence.ts`**

Move `saveAgentOpinions`, `saveAgentOpinionsBestEffort`, `listAgentOpinions`, `listMessageOpinions`, and `SaveOpinionsArgs` to `packages/ai/src/committee/opinion-persistence.ts`, update `packages/ai/src/barrels/agents.ts` and test imports, and remove the empty `packages/ai/src/multi-agent/` directory.

- [ ] **Step 4: Run `pnpm --filter @kestrel/ai test`, `pnpm typecheck`, and `pnpm check:maintainability`**

Run:

```bash
pnpm --filter @kestrel/ai test
pnpm typecheck
pnpm check:maintainability
```

Expected: PASS (both merged files stay well under the 350 LOC gate).

- [ ] **Step 5: Commit**

```bash
git add -A packages/ai
git commit -m "refactor(ai): merge split embedding/fallback modules and move opinion persistence into committee"
```

---

### Task 2: Migrate Remaining Read-Only Tools to Native Mastra `createTool` and Retire `adaptLegacyReadOnlyTool`

**Files:**

- Modify: `packages/ai/src/mastra-v2/tools/canonical/index.ts`
- Modify: `packages/ai/src/tools/{get-calendar,get-correlation,get-intermarket,get-intermarket-resonance,get-seasonality,get-session-levels,get-social-sentiment,analyze-technical,analyze-fundamental,analyze-chart-image,annotate-chart,compute-risk,compute-position-health,forecast-volatility,get-journal-stats,replay-setup,summarize-thread,verify-call,convene-committee,get-system-diagnostics,web-search}.ts`
- Modify: `packages/ai/src/mastra-v2/agents/canonical/setup.ts`
- Modify: `packages/ai/src/mastra-v2/agents/xauusd/legacy-tool-adapter/index.ts`

**Interfaces:**

- Consumes: `createTool` from `@mastra/core/tools`, `createReadOnlyToolExecute` from `legacy-tool-adapter`.
- Produces: Every read-only Kestrel tool registered natively via `createTool` and `createReadOnlyToolExecute`; `adaptLegacyReadOnlyTool` deleted.

- [ ] **Step 1: Write a contract test in `packages/ai/test/native-mastra-tools.test.ts` asserting every tool in `CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES` and `SENSITIVE_USER_READ_TOOL_NAMES` resolves from `nativeCanonicalTools()`**

```ts
it('registers every canonical and sensitive read-only tool natively without legacy adaptation', () => {
  const native = nativeCanonicalTools();
  for (const name of [
    ...CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES,
    ...SENSITIVE_USER_READ_TOOL_NAMES,
  ]) {
    expect(native[name], `Missing native Mastra tool for ${name}`).toBeDefined();
  }
});
```

- [ ] **Step 2: Run test to verify it fails on the unmigrated tools**

Run: `pnpm --filter @kestrel/ai test test/native-mastra-tools.test.ts`  
Expected: FAIL (only 7 of 25 read-only tools are in `nativeCanonicalTools()`).

- [ ] **Step 3: Wrap the remaining 18 read-only tools in `createReadOnlyToolExecute` + `createTool` and register them in `nativeCanonicalTools()`**

For each remaining read-only tool in `packages/ai/src/tools/*`, wrap its `execute` function with `createReadOnlyToolExecute('kestrel-<name>', '<name>', ...)` using `@mastra/core/tools` `createTool`, add it to `nativeCanonicalTools()`, and remove `adaptLegacyReadOnlyTool` and `adaptLegacyReadOnlyTools` from `packages/ai/src/mastra-v2/agents/canonical/setup.ts` and `legacy-tool-adapter/index.ts`.

- [ ] **Step 4: Run `pnpm --filter @kestrel/ai test` and `pnpm typecheck`**

Run:

```bash
pnpm --filter @kestrel/ai test
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/ai
git commit -m "refactor(ai): complete native Mastra tool migration and retire adaptLegacyReadOnlyTool"
```

---

### Task 3: Unify the 3 Copy-Pasted Web Chat SSE Stream Runners in `apps/web/src/lib/services/mastra/`

**Files:**

- Create: `apps/web/src/lib/services/mastra/stream/run-mastra-sse-turn.ts`
- Modify: `apps/web/src/lib/services/mastra/chat/mastra-canonical-chat-stream/service.ts`
- Modify: `apps/web/src/lib/services/mastra/chat/mastra-custom-agent-stream/service.ts`
- Modify: `apps/web/src/lib/services/mastra/chat/mastra-chat-stream.ts`

**Interfaces:**

- Consumes: `reserveTurnBudget`, `createGenerationLedger`, `createMastraStreamFinalizer`, `mastraStreamResponse`, `appendUserMessage`, `appendAssistantMessage`, `maybeGenerateThreadTitle`.
- Produces: Single `runMastraSseTurn` lifecycle helper eliminating ~250 lines of duplicated generator and budget-finalizer boilerplate across the 3 streaming chat services.

- [ ] **Step 1: Write unit test `apps/web/test/run-mastra-sse-turn.test.ts` covering live tool event interleaving, title cost accounting, assistant message persistence, and abort/failure finalization**

Test the shared generator loop (`liveToolEvents` drained before/during/after `stream.text` chunks, `completion` awaited, unemitted `toolParts` pushed to `postTextEvents`, `maybeGenerateThreadTitle` awaited before `ledger.total()`, and `finalizer.complete(observedCost)` called).

- [ ] **Step 2: Implement `runMastraSseTurn` in `apps/web/src/lib/services/mastra/stream/run-mastra-sse-turn.ts`**

Extract the shared budget reservation, user message append, `liveToolEvents` + `stream.text` async generator, title generation, and finalizer error handling into `runMastraSseTurn`.

- [ ] **Step 3: Refactor `mastra-canonical-chat-stream/service.ts`, `mastra-custom-agent-stream/service.ts`, and `mastra-chat-stream.ts` to delegate to `runMastraSseTurn`**

Each service now supplies only its agent-specific stream factory (`runMastraCanonicalChatStream`, `runCustomAgentStream`, `runXauusdMastraConversationStream`) and metadata builder.

- [ ] **Step 4: Run `@kestrel/web` tests, typecheck, and maintainability gate**

Run:

```bash
pnpm --filter @kestrel/web test
pnpm typecheck
pnpm check:maintainability
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src/lib/services/mastra apps/web/test/run-mastra-sse-turn.test.ts
git commit -m "refactor(web): unify Mastra SSE chat streaming lifecycle across canonical, custom-agent, and xauusd streams"
```

---

### Task 4: Retire the Legacy PoC `xauusd-*` (`version: 'poc-5'`) Special-Case Routes into Unified `symbol-research` and `canonical-chat`

**Files:**

- Modify: `packages/ai/src/mastra-v2/planning/execution-routes.ts`
- Modify: `packages/ai/src/mastra-v2/planning/execution-decision.ts`
- Modify: `packages/ai/src/mastra-v2/capabilities/catalog.ts`
- Delete: `packages/ai/src/mastra-v2/capabilities/catalog-xauusd.ts`
- Delete: `packages/ai/src/mastra-v2/agents/xauusd/tools/*` (13 duplicate XAUUSD-only tool wrappers)
- Modify: `apps/web/src/app/api/chat/_lib/run-dispatch.ts`
- Modify: `apps/web/src/lib/services/mastra/chat/mastra-execution.ts`

**Interfaces:**

- Consumes: `symbol-research` (`createCommitteeWorkflow`) and `canonical-chat` (`runMastraCanonicalChatStream`).
- Produces: Unified 5-route Mastra execution table (`mutation`, `full-analysis-queue`, `multi-symbol-research`, `symbol-research`, `canonical-chat`) where `XAUUSD` uses the exact same committee/research packet and canonical-chat pipelines as the other 17 symbols.

- [ ] **Step 1: Update routing tests in `packages/ai/test/` to assert `XAUUSD` single-mode research routes to `symbol-research` and conversational follow-ups route to `canonical-chat`**

Update the routing expectation tests so `XAUUSD` is treated as a first-class member of `ALL_SYMBOLS` rather than branching into a separate PoC agent.

- [ ] **Step 2: Simplify `execution-routes.ts` and `execution-decision.ts` to route `XAUUSD` through `symbol-research` and `canonical-chat`**

In `packages/ai/src/mastra-v2/planning/execution-routes.ts`:

- Remove the `if (symbol === 'XAUUSD' && mode === 'single')` branch so any single-symbol research prompt (including `XAUUSD`) resolves to `symbol-research`, and conversational follow-ups resolve to `canonical-chat`.

- [ ] **Step 3: Delete the 13 duplicate `packages/ai/src/mastra-v2/agents/xauusd/tools/*` wrappers and `catalog-xauusd.ts`**

Remove the hyphenated `get-xauusd-*` duplicate tool files (`price-tool.ts`, `candles-tool.ts`, `indicators-tool.ts`, `market-structure-tool.ts`, `session-levels-tool.ts`, `technical-tool.ts`, `correlation-tool.ts`, `intermarket-tool.ts`, `volatility-tool.ts`, `news-tool.ts`, `calendar-tool.ts`, `social-sentiment-tool.ts`, `fundamental-context-tool.ts`) and `catalog-xauusd.ts`, keeping only the shared `legacy-tool-adapter` (moved to `packages/ai/src/mastra-v2/tools/tool-lifecycle.ts`).

- [ ] **Step 4: Run full monorepo verification (`typecheck`, `lint`, `test`, `check:maintainability`, `knip`)**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm check:maintainability
pnpm knip
```

Expected: All checks exit `0`.

- [ ] **Step 5: Commit**

```bash
git add -A packages/ai apps/web
git commit -m "refactor(ai,web): retire legacy XAUUSD PoC route split and duplicate get-xauusd-* tool wrappers"
```
