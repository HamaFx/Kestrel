# Phase 4: AI Engine Consolidation — Single Mastra Tool System, Unified Symbol Routing & Stream Service Deduplication Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the 3 parallel AI tool systems in `packages/ai` into 1 native Mastra tool suite, retire the legacy PoC `xauusd-*` (`version: 'poc-5'`) special-case execution routes in favor of the unified 18-symbol `symbol-research` and `canonical-chat` pipelines, unify the 3 copy-pasted SSE chat streaming generators in `apps/web`, and clean up overlapping `packages/ai/src/models/*` modules.

**Architecture:**

1. Complete the native Mastra tool migration so every read-only tool in `packages/ai/src/tools/*` is a native `createTool` registration using `createReadOnlyToolExecute`, retiring `adaptLegacyReadOnlyTool` and the 19 duplicate `get-xauusd-*` tool wrappers.
2. Route `XAUUSD` through the same `symbol-research` (committee/research packet) and `canonical-chat` routes as the other 17 symbols (`EURUSD`, `BTCUSDT`, etc.), preserving report follow-up context on `symbol-research`.
3. Extract a single `runMastraSseStreamTurn` runner in `apps/web/src/lib/services/mastra/stream/` shared by canonical chat and custom-agent streams.

**Tech Stack:** `@mastra/core`, Vercel AI SDK v5 (`ai`), Zod, TypeScript 7 (`tsrs`), Vitest 5.

**Spec:** `docs/roadmaps/00-kestrel-maintainability-audit-and-master-roadmap.md` (§3.3, §4)

**Status: COMPLETE (2026-11-02).** Commits: `8df591d1` (Task 1: merged split embedding/fallback modules, moved opinion persistence into `committee/`), `024b8a67` (Task 2: completed the native Mastra tool migration, retired `adaptLegacyReadOnlyTool`), `8baf213f` (Task 3: unified the Mastra SSE streaming lifecycle), `6cef361e` (Task 4: retired the XAUUSD PoC route split, deleted the `xauusd-*` agent/report stack), `b8c31dd1` (prettier), plus the post-roadmap cleanup `97858eaf` (shared cron runners, plan-field removal, audit hardening, knip guard in CI), `e920c14d` (repo-wide dead export/file prune to **zero knip findings**), and `c410c370` (shared briefings/weekly-review fan-out runners).

Verification on the completed tree: full `pnpm test` (15/15 packages — 209 AI test files / 1800 tests, 167 web files / 1513 tests, 41 worker files / 234 tests, plus shared, db, data, indicators, plugin-sdk, and all plugin suites), `pnpm typecheck` (27 tasks), `pnpm lint` (15/15 workspaces, 0 errors / 0 warnings), `pnpm format:check`, `pnpm check:maintainability` (PASS, 0 baselined legacy files), `pnpm check:route-security` (103 routes), `pnpm check:env-contract`, `pnpm check:knip-config`, and **`pnpm knip` exits 0 with 0 unused files / 0 unused exports / 0 unused exported types** (only the non-blocking configuration hints remain). The knip guard (`pnpm check:knip-config`) is wired into `.github/workflows/ci-fast.yml` ahead of the blocking knip step.

Deviations and findings worth carrying forward:

- **Task 2 — native suite is 27 tools, not 24.** `nativeCanonicalTools()` now carries all 21 canonical + 3 sensitive allowlisted tools plus the three read-only tools outside the allowlists (`analyze_chart_image`, `annotate_chart`, `get_system_diagnostics`). The legacy `packages/ai/src/tools/*` modules remain the deterministic execute cores; `executeLegacyReadOnlyTool` (typed, context-aware) is the only bridge from a native registration to a legacy core. `by-domain.ts` and `ToolRegistry.resolveForPlan` were deleted (unused once `setup.ts` resolved purely from the native map), and the legacy category registries now build their lists inside the register functions so the native suite's eager imports cannot capture an uninitialised binding inside the `instance ↔ tools` cycle.
- **Task 3 — one extra module for the LOC gate.** `run-mastra-sse-turn.ts` (353 LOC first draft) exceeded the 350 gate, so the shared completion-time tool-part emitter lives in `stream/mastra-sse-tool-parts.ts`. `MastraSseStream` is the only exported type consumers need; the XAUUSD conversation service used the shared runner for one commit before Task 4 retired it.
- **Task 4 — full XAUUSD PoC retirement (user-approved scope).** The plan's Step 3 (delete the 13 `agents/xauusd/tools/*` wrappers + `catalog-xauusd.ts`) cascaded into the whole PoC stack, so the approved end state deletes `agents/xauusd/**` (34 files), `workflows/xauusd-report/**`, the old `packets/research-*.ts` chain, `packets/research-packet-tool.ts`, the admin/report grounding scorer, web `mastra-chat.ts` / `mastra-chat-stream.ts` / `xauusd-handler.ts` / `xauusd/mastra-xauusd.ts` / `meta.ts` / `stream/mastra-chat-response.ts`, the Studio `xauusdConversation`/`xauusdResearch` registrations, 17 PoC-only AI test files, and 3 web test files (net `-12,897 / +2,615` lines across 208 files).
- **Task 4 — survivors moved into shared homes.** `tools/tool-lifecycle.ts` + `tools/tool-stream-parts.ts` (the shared read-only wrapper and stream-part parsing), `shared/text-runner.ts` (used by coach insights, journal review, semantic routing, title, mutation extraction, chart-image analysis), `shared/background-text.ts` (worker briefings), `shared/report-types.ts` (historical report cards / follow-up detection), and `shared/report-grounding.ts` slimmed to the shared narrative-number tokenizer used by the committee fusion verifier and canonical evidence checks. `MASTRA_XAUUSD_AGENT_ID` remains the historical default telemetry agent label so existing metrics labels do not churn.
- **Task 4 — routing and manifest consequences.** `MastraExecutionRoute` is the unified 5-route table; `capabilityFor`/`routeFor`/`purposeFor` no longer branch on symbol, and the `xauusd` model purpose is gone. `xauusdChatKind`/`xauusdCandidate` were removed from the decision, the Jev turn router, and `routeUnified`; `ExecutionPlanSchema` keeps both fields as defaulted values so in-flight durable-queue rows serialized before the retirement still parse. The capability manifest is 4 capabilities (`canonical-chat`, `symbol-research`, `sensitive-user-read`, `mutation-workflows`); `symbol-research` now declares the native tool names (`get_seasonality`, `get_cot`, `get_intermarket_resonance`, `web_search`, `search_knowledge`) plus the direct `collect-symbol-research-packet` adapter id, and `assertCapabilityManifestIntegrity()` asserts against `nativeCanonicalTools()` instead of the deleted XAUUSD registrations. XAUUSD research now runs the same committee `symbol-research` pipeline as the other 17 symbols, so the verified XAUUSD dossier-report product path is retired; historical report parts still render and `extractLatestMastraReport` still detects prior reports for follow-up routing (conversational follow-ups go to `canonical-chat`, named-symbol prompts to `symbol-research`).
- **Post-roadmap cleanup (`97858eaf`, `e920c14d`) — every remaining carry-forward closed.** The `cot`, `fred-actuals`, `snapshots`, `briefings`, and `weekly-review` worker jobs and `/api/cron/*` fallbacks now execute one shared implementation from the new `@kestrel/ai/cron` subpath (`runCotIngestion`, `runFredActualsRefresh`, `runSnapshotRefresh`, `runBriefingsFanout`, `runWeeklyReviewFanout`); the web fallbacks gained the previously missing BiQuote calendar refresh and `candles_1m` 14-day prune, and the runner logic tests moved to `packages/ai/test/` (worker tests pin delegation and the partition filter). `ExecutionPlanSchema` dropped `xauusdChatKind`/`xauusdCandidate`; `parseExecutionPlan`/`serializeExecutionPlan` strip those legacy keys so durable rows serialized before Phase 4 still parse. Audit dimension 2: `coach-insights-schema` parses JSON as `unknown` before coercion, `describeRule` is one canonical function in `alerts/rule-registry.ts` (delivery, evaluator, and `set_alert` import it), and `with-telemetry.ts` contains zero explicit `any` (unknown-typed wrapper with one documented boundary cast). `packages/indicators` and `packages/shared` now run with `isolate: false` (pure modules, verified twice); `packages/ai` intentionally keeps file isolation for its process-global Mastra singletons. The repo-wide knip prune removed dead exports/files across 200+ files and `@kestrel/ai/cron` keeps job infrastructure out of the AI root barrel.

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

- [x] **Step 1: Merge `packages/ai/src/models/embedding.ts` into `packages/ai/src/models/embeddings.ts`**

Move `EmbeddingModelResolutionDetails`, `EmbeddingModelResolution`, `resolveEmbeddingModelDetails`, and `resolveEmbeddingModel` into `packages/ai/src/models/embeddings.ts`, update `packages/ai/src/models/model.ts` to re-export from `./embeddings`, and delete `packages/ai/src/models/embedding.ts`.

- [x] **Step 2: Merge `packages/ai/src/models/fallback.ts` into `packages/ai/src/models/model-fallback.ts`**

Move `classifyStreamError`, `shouldFallback`, `makeFallbackPart`, `FallbackReason`, `FallbackDecision`, and `FallbackPartPayload` into `packages/ai/src/models/model-fallback.ts`, update imports in `packages/ai`, and delete `packages/ai/src/models/fallback.ts`.

- [x] **Step 3: Move `packages/ai/src/multi-agent/persistence.ts` to `packages/ai/src/committee/opinion-persistence.ts`**

Move `saveAgentOpinions`, `saveAgentOpinionsBestEffort`, `listAgentOpinions`, `listMessageOpinions`, and `SaveOpinionsArgs` to `packages/ai/src/committee/opinion-persistence.ts`, update `packages/ai/src/barrels/agents.ts` and test imports, and remove the empty `packages/ai/src/multi-agent/` directory.

- [x] **Step 4: Run `pnpm --filter @kestrel/ai test`, `pnpm typecheck`, and `pnpm check:maintainability`**

Run:

```bash
pnpm --filter @kestrel/ai test
pnpm typecheck
pnpm check:maintainability
```

Expected: PASS (both merged files stay well under the 350 LOC gate).

- [x] **Step 5: Commit**

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

- [x] **Step 1: Write a contract test in `packages/ai/test/native-mastra-tools.test.ts` asserting every tool in `CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES` and `SENSITIVE_USER_READ_TOOL_NAMES` resolves from `nativeCanonicalTools()`**

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

- [x] **Step 2: Run test to verify it fails on the unmigrated tools**

Run: `pnpm --filter @kestrel/ai test test/native-mastra-tools.test.ts`  
Expected: FAIL (only 7 of 25 read-only tools are in `nativeCanonicalTools()`).

- [x] **Step 3: Wrap the remaining 18 read-only tools in `createReadOnlyToolExecute` + `createTool` and register them in `nativeCanonicalTools()`**

For each remaining read-only tool in `packages/ai/src/tools/*`, wrap its `execute` function with `createReadOnlyToolExecute('kestrel-<name>', '<name>', ...)` using `@mastra/core/tools` `createTool`, add it to `nativeCanonicalTools()`, and remove `adaptLegacyReadOnlyTool` and `adaptLegacyReadOnlyTools` from `packages/ai/src/mastra-v2/agents/canonical/setup.ts` and `legacy-tool-adapter/index.ts`.

- [x] **Step 4: Run `pnpm --filter @kestrel/ai test` and `pnpm typecheck`**

Run:

```bash
pnpm --filter @kestrel/ai test
pnpm typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

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

- [x] **Step 1: Write unit test `apps/web/test/run-mastra-sse-turn.test.ts` covering live tool event interleaving, title cost accounting, assistant message persistence, and abort/failure finalization**

Test the shared generator loop (`liveToolEvents` drained before/during/after `stream.text` chunks, `completion` awaited, unemitted `toolParts` pushed to `postTextEvents`, `maybeGenerateThreadTitle` awaited before `ledger.total()`, and `finalizer.complete(observedCost)` called).

- [x] **Step 2: Implement `runMastraSseTurn` in `apps/web/src/lib/services/mastra/stream/run-mastra-sse-turn.ts`**

Extract the shared budget reservation, user message append, `liveToolEvents` + `stream.text` async generator, title generation, and finalizer error handling into `runMastraSseTurn`.

- [x] **Step 3: Refactor `mastra-canonical-chat-stream/service.ts`, `mastra-custom-agent-stream/service.ts`, and `mastra-chat-stream.ts` to delegate to `runMastraSseTurn`**

Each service now supplies only its agent-specific stream factory (`runMastraCanonicalChatStream`, `runCustomAgentStream`, `runXauusdMastraConversationStream`) and metadata builder.

- [x] **Step 4: Run `@kestrel/web` tests, typecheck, and maintainability gate**

Run:

```bash
pnpm --filter @kestrel/web test
pnpm typecheck
pnpm check:maintainability
```

Expected: PASS.

- [x] **Step 5: Commit**

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

- [x] **Step 1: Update routing tests in `packages/ai/test/` to assert `XAUUSD` single-mode research routes to `symbol-research` and conversational follow-ups route to `canonical-chat`**

Update the routing expectation tests so `XAUUSD` is treated as a first-class member of `ALL_SYMBOLS` rather than branching into a separate PoC agent.

- [x] **Step 2: Simplify `execution-routes.ts` and `execution-decision.ts` to route `XAUUSD` through `symbol-research` and `canonical-chat`**

In `packages/ai/src/mastra-v2/planning/execution-routes.ts`:

- Remove the `if (symbol === 'XAUUSD' && mode === 'single')` branch so any single-symbol research prompt (including `XAUUSD`) resolves to `symbol-research`, and conversational follow-ups resolve to `canonical-chat`.

- [x] **Step 3: Delete the 13 duplicate `packages/ai/src/mastra-v2/agents/xauusd/tools/*` wrappers and `catalog-xauusd.ts`**

Remove the hyphenated `get-xauusd-*` duplicate tool files (`price-tool.ts`, `candles-tool.ts`, `indicators-tool.ts`, `market-structure-tool.ts`, `session-levels-tool.ts`, `technical-tool.ts`, `correlation-tool.ts`, `intermarket-tool.ts`, `volatility-tool.ts`, `news-tool.ts`, `calendar-tool.ts`, `social-sentiment-tool.ts`, `fundamental-context-tool.ts`) and `catalog-xauusd.ts`, keeping only the shared `legacy-tool-adapter` (moved to `packages/ai/src/mastra-v2/tools/tool-lifecycle.ts`).

- [x] **Step 4: Run full monorepo verification (`typecheck`, `lint`, `test`, `check:maintainability`, `knip`)**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm check:maintainability
pnpm knip
```

Expected: All checks exit `0`.

- [x] **Step 5: Commit**

```bash
git add -A packages/ai apps/web
git commit -m "refactor(ai,web): retire legacy XAUUSD PoC route split and duplicate get-xauusd-* tool wrappers"
```
