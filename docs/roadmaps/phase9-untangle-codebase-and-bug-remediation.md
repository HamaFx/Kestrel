# Phase 9: First-Principles Codebase Untangle & Bug Remediation Roadmap

> **For AI Coding Agents (Claude Code, OpenCode, Codex, Cursor):**
> REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `untangle-codebase` to execute this plan phase-by-phase and task-by-task.
> Steps use checkbox (`- [x]`) syntax for tracking.
>
> **Core Principle (`untangle-codebase`):** Ask of every change: _"Should these pieces change together?"_ Pieces that change together end up together, pieces that don't aren't tied, and everything depends on what changes less.

**Baseline Commit:** `ba97614f` (`main`)  
**Scope:** All 13 workspace packages (`apps/web`, `apps/worker`, `packages/ai`, `packages/db`, `packages/data`, `packages/indicators`, `packages/plugin-sdk`, `packages/shared`, `packages/config`, `packages/test-utils`, `plugins/backtesting`, `plugins/paper-trading`, `plugins/telegram-bot`)  
**Goal:** Eliminate the 12 structural tangles (Hidden Links, Needless Links, Surplus, Special Cases) and 7 concrete production bugs uncovered in the 2026-11-06 `untangle-codebase` deep-dive audit.

---

## 0. Global Verification Gates & Guardrails

Run the verification gate trio after **every single task** before committing:

```bash
pnpm check:guards && pnpm knip && pnpm check:fast
```

1. **Never weaken or game a guard:** Do not modify `scripts/check-*.mjs`, `scripts/maintainability-baseline.json`, or `knip.json` to silence a failure—only update a guard when the architectural contract itself intentionally changes (as explicitly specified in Phase 9D).
2. **File size caps (`AGENTS.md`):** Backend `.ts` <= 500 LOC (`RULE-F01`), React `.tsx` <= 450 LOC (`RULE-F02`), static catalogs <= 500 LOC (`RULE-F04`), package `src/` roots <= 10 loose files (`RULE-F05`).
3. **No pass-through shims:** When deleting a re-export barrel or moving a function, update callers directly and delete the old file in the same commit.
4. **Multi-tenant RLS safety:** Every user-scoped database read/write in RSCs, Server Actions, API routes, or Worker jobs must run inside `withUserTenant(userId, ...)` or `withUserTenantRO(userId, ...)`. Cross-tenant system jobs must use `withAdminDb(...)`.

---

## Phase Overview

| Sub-Phase    | Focus Area                                                              |       Tasks       | Primary Packages                                                                    |
| :----------- | :---------------------------------------------------------------------- | :---------------: | :---------------------------------------------------------------------------------- |
| **Phase 9A** | **P0/P1 Production Bug Fixes & Special-Case Removal**                   | Tasks 9A.1 – 9A.5 | `packages/ai`, `packages/data`, `apps/web`                                          |
| **Phase 9B** | **AI Engine & Committee Workflow Untangling**                           | Tasks 9B.1 – 9B.4 | `packages/ai`, `apps/web`                                                           |
| **Phase 9C** | **Worker, Cron, Plugin Kernel & Database Deduplication**                | Tasks 9C.1 – 9C.4 | `apps/worker`, `plugins/*`, `packages/db`, `packages/shared`, `packages/indicators` |
| **Phase 9D** | **Web Mutation Unification, Pass-Through Facade Removal & Co-location** | Tasks 9D.1 – 9D.3 | `apps/web`, `packages/ai`, `plugins/*`                                              |
| **Phase 9E** | **Comments & Behavioral Test Hygiene Pass**                             | Tasks 9E.1 – 9E.2 | All packages (`test/*`, `src/*`)                                                    |

---

## Phase 9A: P0/P1 Production Bug Fixes & Special-Case Removal

### Task 9A.1: Unify `xauusdExtension` and `genericMacro` into One `packet.macro` Schema (`R1`)

**Why (`untangle-codebase`):** `SymbolResearchPacket` currently splits macro data into `packet.xauusdExtension` (only for `XAUUSD`) and `packet.genericMacro` (for the other 17 symbols). Because downstream consumers only check `packet.xauusdExtension`, non-`XAUUSD` symbols suffer 3 silent bugs in numeric grounding, committee scorecards, and regime memory, and `MastraReportPart` in the web UI rejects non-`XAUUSD` symbols.

**Problems Solved:**

- `packages/ai/src/mastra-v2/packets/research-packet-macro/xauusd-assemble.ts:46-152`, `generic-assemble.ts:49-156`, and `fetch.ts:59-127` duplicate macro fetching and assembly.
- `packages/ai/src/mastra-v2/packets/symbol-research/schemas.ts:70-96, 108-109` and `collect.ts:55-98, 125-135, 226-267` branch on `args.symbol === 'XAUUSD'`.
- **[Bug]** `packages/ai/src/committee/grounding.ts:74-88` (`packetEvidenceValues`) extracts numbers from `packet.xauusdExtension` (`dollarIndex`, `realYields`, `breakevenInflation`, `events`, `newsHeadlines`) but never extracts numbers from `packet.genericMacro` (`events`, `news`, `cot`).
- **[Bug]** `packages/ai/src/tools/convene-committee/verdicts.ts:87` computes `const macroEventsCount = packet.xauusdExtension?.events?.length ?? 0;`, ignoring `packet.genericMacro?.events`.
- **[Bug]** `packages/ai/src/memory/memory-index/remember-regime.ts:126` reads `const macro = packet.xauusdExtension;`, ignoring `packet.genericMacro`.
- **[Bug]** `apps/web/src/components/chat/parts/mastra-report-schema.ts:29` and `mastra-report.tsx:98` lock `MastraReportPart` to `symbol: z.literal('XAUUSD')` and `regionLabel="Verified XAUUSD report"`.
- `packages/ai/src/mastra-v2/mutation/level-sanity.ts:116` hardcodes `const pipFloor = symbol === 'XAUUSD' ? 5.0 : pipSize(symbol) * 10;`.

**Files to Modify / Delete:**

- Modify: `packages/ai/src/mastra-v2/packets/research-packet-macro/{schemas.ts,fetch.ts,index.ts}`
- Delete or merge: `packages/ai/src/mastra-v2/packets/research-packet-macro/{xauusd-assemble.ts,generic-assemble.ts}` into `assemble.ts`
- Modify: `packages/ai/src/mastra-v2/packets/symbol-research/{schemas.ts,collect.ts,prompt.ts,serialize.ts}`
- Modify: `packages/ai/src/committee/grounding.ts`
- Modify: `packages/ai/src/tools/convene-committee/verdicts.ts`
- Modify: `packages/ai/src/memory/memory-index/remember-regime.ts`
- Modify: `packages/ai/src/mastra-v2/mutation/level-sanity.ts`
- Modify: `apps/web/src/components/chat/parts/{mastra-report-schema.ts,mastra-report.tsx}`
- Test: `packages/ai/test/{committee-stale-grounding.test.ts,opinion-verifier.test.ts}`

**Implementation Steps:**

- [x] **Step 1:** In `packages/ai/src/mastra-v2/packets/research-packet-macro/schemas.ts` and `symbol-research/schemas.ts`, define a unified `MacroEvidenceSchema` (`macro`) containing `events`, `news` / `newsHeadlines`, `cot`, and optional `fredSeries` (`dollarIndex`, `realYields`, `breakevenInflation`, populated when the symbol quotes against USD or is gold).
- [x] **Step 2:** Merge `xauusd-assemble.ts` and `generic-assemble.ts` so `collectSymbolResearchPacket` (`collect.ts`) always populates `packet.macro` (you may keep `xauusdExtension` / `genericMacro` as deprecated aliases only if external eval JSON fixtures require them, or update the JSON fixtures in `packages/ai/src/eval/*.json`).
- [x] **Step 3:** Update `packetEvidenceValues` in `packages/ai/src/committee/grounding.ts:74-88` to extract all numeric values from `packet.macro` (including `events`, `news`, `cot`, and `fredSeries` for all 18 symbols).
- [x] **Step 4:** Update `packages/ai/src/tools/convene-committee/verdicts.ts:87` and `packages/ai/src/memory/memory-index/remember-regime.ts:126` to read from `packet.macro`.
- [x] **Step 5:** In `apps/web/src/components/chat/parts/mastra-report-schema.ts:29`, change `symbol: z.literal('XAUUSD')` to `symbol: SymbolSchema`, and in `mastra-report.tsx:98`, render `regionLabel={\`Verified \${report.symbol} report\`}`.
- [x] **Step 6:** Add a non-`XAUUSD` packet grounding test (e.g., `EURUSD` with `macro.events` and `macro.cot` numbers) in `packages/ai/test/opinion-verifier.test.ts`.
- [x] **Step 7:** Run `pnpm check:guards && pnpm knip && pnpm check:fast` and commit.

---

### Task 9A.2: Fix Alert Noise State Reset Bug & Consolidate Alert/Notification Duplication (`R2`)

**Why (`untangle-codebase`):** `evaluateAlertNoise` creates a brand-new `new InMemoryNoiseState()` on every single alert invocation, wiping out deduplication and cooldown memory in production. Simultaneously, `simulateAlert` duplicates `specFromRule`, `noise-state.ts` duplicates JSONB preference persistence, and `adapters.ts` / `direct.ts` duplicate the Resend email HTTP call.

**Problems Solved:**

- **[Bug]** `packages/ai/src/alerts/delivery/noise.ts:49` runs `const state = new InMemoryNoiseState();` on every call instead of using a persistent/shared `NoiseState` instance.
- `packages/ai/src/alerts/simulate.ts:76-131` re-implements `priceCross`, `candleClose`, and indicator threshold comparisons instead of calling `specFromRule(rule)` (`packages/ai/src/alerts/spec.ts:135-137`).
- `packages/ai/src/alerts/rule-registry.ts:114-137` registers dead `describe` callbacks on 4 rule plugins that `describeRule` (`line 105`) never calls.
- `packages/ai/src/notifications/noise-state.ts:38-87` and `:89-137` copy-paste JSONB read-modify-upsert logic for `noiseConfig` and `routeConfig`.
- `packages/ai/src/alerts/delivery/adapters.ts:43-102` and `direct.ts:44-69` duplicate the `https://api.resend.com/emails` `fetch` call.
- `packages/ai/src/alerts/evaluator/bars.ts:21-32`, `readings.ts:246-253`, and `mastra-v2/tools/canonical/candles.ts:88-95` implement the closed-bar lookup 3 times.

**Files to Modify:**

- `packages/ai/src/alerts/delivery/{noise.ts,adapters.ts,direct.ts}`
- `packages/ai/src/notifications/{noise-control.ts,noise-state.ts}`
- `packages/ai/src/alerts/{simulate.ts,spec.ts,rule-registry.ts}`
- `packages/ai/src/alerts/evaluator/{bars.ts,readings.ts}`
- `packages/ai/src/mastra-v2/tools/canonical/candles.ts`
- `packages/ai/test/alerts-delivery.test.ts`

**Implementation Steps:**

- [x] **Step 1:** In `packages/ai/src/alerts/delivery/noise.ts`, use a module-scoped (keyed by `userId`) or injected `NoiseState` instance (or DB-backed state via `alerts/persistence/delivery-state.ts`) instead of instantiating `new InMemoryNoiseState()` per call. Remove the fake `vi.mock('../src/notifications/noise-control')` override in `packages/ai/test/alerts-delivery.test.ts:79-85` and test that two consecutive `evaluateAlertNoise` calls in production actually deduplicate/cooldown.
- [x] **Step 2:** Refactor `simulateAlert` (`packages/ai/src/alerts/simulate.ts:76-131`) to evaluate `specFromRule(rule).isSatisfiedBy({ current, previous })`, and delete the dead `describe` callbacks from `packages/ai/src/alerts/rule-registry.ts:114-137` and the unused `decideMatch` wrapper from `packages/ai/src/alerts/spec.ts:131-133` (updating `test/alert-decide.test.ts` to test `LevelSpec` / `specFromRule`).
- [x] **Step 3:** Extract a generic `readNotificationSubKey<T>` / `writeNotificationSubKey<T>` helper in `packages/ai/src/notifications/noise-state.ts` and implement both `getNoiseConfig`/`saveNoiseConfig` and `getRouteConfig`/`saveRouteConfig` with it.
- [x] **Step 4:** Have `sendDirectNotification` (`packages/ai/src/alerts/delivery/direct.ts:44-69`) delegate email sending to `deliverEmail` (`adapters.ts:43-102`).
- [x] **Step 5:** Reuse `lastClosedBar` from `packages/ai/src/alerts/evaluator/bars.ts` inside `readings.ts:246-253` and `mastra-v2/tools/canonical/candles.ts:88-95`.
- [x] **Step 6:** Run `pnpm check:guards && pnpm knip && pnpm check:fast` and commit.

---

### Task 9A.3: Fix Web Settings Security Bugs (`2fa_disabled` RLS Scope & Vision/Embedding Model Validation) (`R6`)

**Why (`untangle-codebase`):** `disableTwoFactorAction` calls `createAuditLog` outside `withUserTenant`, which fails under PostgreSQL RLS and returns an error after 2FA was already disabled. Meanwhile, `PUT /api/settings/embedding-model` and `PUT /api/settings/vision-model` copy-pasted model validation from `chat-model.ts` without the BYOK API key ownership check (`403`) and broke slash-prefixed OpenRouter model IDs.

**Problems Solved:**

- **[Bug]** `apps/web/src/app/(app)/settings/_actions/security-two-factor.ts:238` calls `await createAuditLog(session.user.id, '2fa_disabled')` outside `withUserTenant(session.user.id, ...)` (`:226-235`).
- **[Bug]** `apps/web/src/app/api/settings/embedding-model/route.ts:62-114` and `apps/web/src/app/api/settings/vision-model/route.ts:62-115` omit the BYOK key ownership check (`403`) present in `apps/web/src/lib/services/settings/chat-model.ts:58-63` and strip the first `/` segment (`body.modelId.split('/').slice(1).join('/')`), breaking OpenRouter model IDs.
- **[Bug]** `apps/web/src/app/onboarding/actions.ts:238-243` catches a failed SQL query inside a `tx` transaction block without `SAVEPOINT` or rethrowing, leaving the PostgreSQL transaction in an aborted `25P02` state.
- `apps/web/src/app/(app)/settings/_components/notifications/noise-control-card/use-noise-config.ts:49-62, 88` uses racing 500ms/100ms and 300ms `setTimeout` timers between `PUT /api/notifications/noise-config` and `GET /api/alerts/preview-digest`.

**Files to Modify:**

- `apps/web/src/app/(app)/settings/_actions/security-two-factor.ts`
- `apps/web/src/lib/services/settings/chat-model.ts`
- `apps/web/src/app/api/settings/{chat-model,embedding-model,vision-model}/route.ts`
- `apps/web/src/app/onboarding/actions.ts`
- `apps/web/src/app/(app)/settings/_components/notifications/noise-control-card/use-noise-config.ts`

**Implementation Steps:**

- [x] **Step 1:** Move `await createAuditLog(session.user.id, '2fa_disabled')` inside the `withUserTenant(session.user.id, async () => { ... })` block in `apps/web/src/app/(app)/settings/_actions/security-two-factor.ts:226-238`.
- [x] **Step 2:** Generalize `validateAndSaveChatModel` in `apps/web/src/lib/services/settings/chat-model.ts:50-93` into `validateAndSaveUserModel(userId, role: 'chat' | 'vision' | 'embedding', rawModelId)` (preserving `startsWith(\`${providerId}/\`)`and the BYOK key check for all three roles), and call it from`chat-model/route.ts`, `vision-model/route.ts`, and `embedding-model/route.ts`.
- [x] **Step 3:** In `apps/web/src/app/onboarding/actions.ts:217-243`, validate symbols against the catalog before inserting (or use `onConflictDoNothing()`) instead of catching a failed statement inside the open PostgreSQL transaction.
- [x] **Step 4:** In `apps/web/src/app/(app)/settings/_components/notifications/noise-control-card/use-noise-config.ts`, chain `refreshPreview()` after the `PUT /api/notifications/noise-config` promise resolves instead of running an independent racing `300ms` timer.
- [x] **Step 5:** Run `pnpm check:guards && pnpm knip && pnpm check:fast` and commit.

---

### Task 9A.4: Centralize UI Price Decimal, Countdown & Clipboard/Clock Helpers (`R9`)

**Why (`untangle-codebase`):** Six UI components hardcode `symbol === 'XAUUSD' ? 2 : 5`, `.toFixed(5)`, or `.toFixed(2)`, rendering `BTCUSDT` and `XAUUSD` with 5 decimals or truncating `EURUSD` (`1.0854` -> `1.09`). Multiple components also re-implement `formatCountdown`, `useCopied`, and `TimeProvider`'s 30s clock.

**Problems Solved:**

- **[Bug]** `apps/web/src/app/(app)/settings/_components/symbols/sortable-symbol-row.tsx:53` and `apps/web/src/components/chat/parts/verify-call.tsx:79` hardcode `symbol === 'XAUUSD' ? 2 : 5`.
- **[Bug]** `apps/web/src/components/chat/parts/get-session-levels.tsx:92` guesses decimals from magnitude (`n > 100 ? 2 : 5`).
- **[Bug]** `apps/web/src/components/chat/parts/replay-setup.tsx:82-83` and `apps/web/src/components/chat/parts/compute-position-health.tsx:74-75` hardcode `.toFixed(5)` regardless of symbol.
- **[Bug]** `apps/web/src/components/chat/parts/analyze-technical.tsx:141, 147, 154, 160` hardcodes `.toFixed(2)` on `pivot`, `atr14`, `pdh`, and `pdl`.
- `apps/web/src/components/chat/parts/get-candles-format.ts:14-22` defines a redundant local `pipSize` wrapper with a dummy `_pipSizeAgrees` variable, and `get-indicators-format.ts:65-73` wraps `priceDecimals` in an unnecessary `try/catch`.
- `apps/web/src/components/calendar/event-card/countdown.tsx:8-15` duplicates `formatCountdown` from `apps/web/src/lib/formatters/datetime.ts:46-59`.
- `apps/web/src/components/chat/parts/share-snapshot.tsx:52`, `syndicate-dossier-header.tsx:117`, `use-export-import-keys.ts:50`, `landing-simulator/index.tsx:70`, `analysis-mode-form.tsx:90`, and `agent-model-override-form.tsx:140` hand-roll `[copied, setCopied]` + `setTimeout` instead of using `useCopied` (`apps/web/src/hooks/use-copied.ts:19-39`).
- `apps/web/src/components/chat/parts/share-snapshot.tsx:37`, `mutation-confirmation.tsx:104`, `market-session-bar.tsx:74`, `sidebar-telemetry.tsx:51`, and `use-thread-switcher.ts:45` run separate `setInterval` timers instead of reading `useTime()` (`apps/web/src/components/providers/time-provider.tsx:40`).

**Files to Modify:**

- `apps/web/src/app/(app)/settings/_components/symbols/sortable-symbol-row.tsx`
- `apps/web/src/components/chat/parts/{verify-call.tsx,get-session-levels.tsx,replay-setup.tsx,compute-position-health.tsx,analyze-technical.tsx,get-candles-format.ts,get-indicators-format.ts,share-snapshot.tsx,mutation-confirmation.tsx}`
- `apps/web/src/components/calendar/event-card/countdown.tsx`
- `apps/web/src/components/layout/{market-session-bar.tsx,desktop-sidebar/sidebar-telemetry.tsx}`
- `apps/web/src/components/chat/_components/thread-switcher/use-thread-switcher.ts`

**Implementation Steps:**

- [x] **Step 1:** Replace all hardcoded `.toFixed(2)`, `.toFixed(5)`, `n > 100 ? 2 : 5`, and `symbol === 'XAUUSD' ? 2 : 5` price formatting in the files above with `price.toFixed(priceDecimals(symbol))` (from `@kestrel/shared`).
- [x] **Step 2:** Delete the local `pipSize` wrapper in `get-candles-format.ts:14-22` and `priceDecimalsForSymbol` in `get-indicators-format.ts:65-73`, importing `pipSize` and `priceDecimals` directly from `@kestrel/shared`.
- [x] **Step 3:** Replace the duplicate `formatCountdown` in `apps/web/src/components/calendar/event-card/countdown.tsx:8-15` with `formatCountdown` from `@/lib/formatters/datetime`, and replace the ad-hoc `setCopied` + `setTimeout` and `setInterval` clocks with `useCopied()` and `useTime()`.
- [x] **Step 4:** Run `pnpm check:guards && pnpm knip && pnpm check:fast` and commit.

---

### Task 9A.5: Extract Shared Provider HTTP Transport & Fix Caller `AbortSignal` Bug (`R9`)

**Why (`untangle-codebase`):** Seven REST provider modules in `packages/data` copy-paste the same 70-line `AbortController` timeout + caller signal linking + `tryAcquire` rate-limit + HTTP 429 `recordRateLimit` block. Because `marketaux` and `fred` missed the `if (params.signal?.aborted) throw err` check, caller cancellation is misreported as a provider timeout penalty.

**Problems Solved:**

- `packages/data/src/providers/biquote/rest/call.ts:58-149`, `finnhub/rest.ts:66-127`, `binance/rest.ts:42-120, 181-251`, `marketaux/rest.ts:89-162`, `fred/rest.ts:59-133, 174-247`, and `cftc/rest.ts:62-135` duplicate HTTP fetch + timeout + throttle + 429 handling.
- **[Bug]** `packages/data/src/providers/marketaux/rest.ts:127-135` and `packages/data/src/providers/fred/rest.ts:95-103, 205-213` wrap caller `signal` cancellation into `ProviderError('PROVIDER_TIMEOUT')`.
- `packages/data/src/providers/provider-adapters.ts:242-244` (`finnhubProvider.supports`) reads `process.env.FINNHUB_API_KEY`, forcing `packages/data/src/adapters/price.ts:157-159` and `candles.ts:141-145` to hardcode `p.name === 'finnhub' ? Boolean(keys.finnhub) : ...`.

**Files to Create / Modify:**

- Create: `packages/data/src/providers/http.ts`
- Modify: `packages/data/src/providers/{biquote/rest/call.ts,finnhub/rest.ts,binance/rest.ts,marketaux/rest.ts,fred/rest.ts,cftc/rest.ts}`
- Modify: `packages/data/src/providers/{provider-registry.ts,provider-adapters.ts}`
- Modify: `packages/data/src/adapters/{price.ts,candles.ts}`

**Implementation Steps:**

- [x] **Step 1:** Create `packages/data/src/providers/http.ts` exporting `providerFetchJson<T>(args)` that handles `tryAcquire` rate limiting, `AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])])`, rethrowing caller abort (`if (signal?.aborted) throw err`) before mapping timeouts to `ProviderError('PROVIDER_TIMEOUT')`, parsing `Retry-After` on HTTP 429 (`recordRateLimit`), and JSON parsing.
- [x] **Step 2:** Refactor `biquote`, `finnhub`, `binance` (both `klinesCall` and `fetchTickerPrice`), `marketaux`, `fred` (both `fredCall` and `fetchObservations`), and `cftc` to call `providerFetchJson`.
- [x] **Step 3:** Pass `{ apiKeys?: Record<string, string | undefined> }` to `MarketDataProvider.supports(symbol, tf, ctx)` in `provider-registry.ts` and `provider-adapters.ts` so `finnhubProvider.supports` checks `Boolean(ctx?.apiKeys?.finnhub || process.env.FINNHUB_API_KEY)`, and delete the `p.name === 'finnhub'` special cases in `price.ts:157-159` and `candles.ts:141-145`.
- [x] **Step 4:** Run `pnpm check:guards && pnpm knip && pnpm check:fast` and commit.

---

## Phase 9B: AI Engine & Committee Workflow Untangling

### Task 9B.1: Collapse `single-workflow/` and `comparison-workflow/` into One N-Symbol Committee Pipeline (`R4`)

**Why (`untangle-codebase`):** Single-symbol committee research is simply the `symbols.length === 1` case of N-symbol committee research. Maintaining 14 parallel files across `single-workflow/` and `comparison-workflow/` plus duplicate synthesis and fusion-verification functions means every committee change has to be made twice.

**Problems Solved:**

- `packages/ai/src/committee/single-workflow/{context,collect-step,specialist-steps,verify-step,fusion-step,workflow,index}.ts` and `packages/ai/src/committee/comparison-workflow/{context,collect-step,specialist-steps,verify-step,fusion-step,workflow,index}.ts` mirror the exact same 4-step workflow.
- `packages/ai/src/committee/synthesizer/synthesis.ts:61-147` and `comparison.ts:39-131` duplicate fusion agent execution, repair retry, cost recording, and strict verification gating.
- `packages/ai/src/committee/fusion-verifier.ts:52-88` and `:96-138` duplicate fusion verification logic.

**Files to Modify / Delete:**

- Modify: `packages/ai/src/committee/workflow-shared.ts` & `packages/ai/src/committee/workflow.ts`
- Merge: `packages/ai/src/committee/single-workflow/*` and `comparison-workflow/*`
- Modify: `packages/ai/src/committee/synthesizer/{synthesis.ts,comparison.ts,index.ts}`
- Modify: `packages/ai/src/committee/fusion-verifier.ts`

**Implementation Steps:**

- [x] **Step 1:** Unify the shared fusion verification loop in `packages/ai/src/committee/fusion-verifier.ts` so `verifyFusionAnswer` and `verifyComparisonFusionAnswer` delegate to a single `verifyPacketsGroundedText(text, packets, opinions, opts)` core.
- [x] **Step 2:** Extract the shared fusion execution + 1-shot repair + cost ledger recording helper in `packages/ai/src/committee/synthesizer/synthesis.ts` and call it for both single-symbol and comparison synthesis.
- [x] **Step 3:** Parameterize the 4 workflow steps (`collect`, `specialistSteps`, `verify`, `fusion`) over `symbols: readonly Symbol[]` in `packages/ai/src/committee/workflow-shared.ts` (or a unified workflow builder) so `createSingleCommitteeWorkflow` and `createComparisonCommitteeWorkflow` share the step implementations rather than duplicating 14 files.
- [x] **Step 4:** Run `pnpm check:guards && pnpm knip && pnpm check:fast` and commit.

---

### Task 9B.2: Unify Canonical Chat Post-Processing & Route `reviewTrade` / `getCoachInsights` Through `runMastraBackgroundText` (`R5`)

**Why (`untangle-codebase`):** `agents/canonical/chat.ts` and `stream.ts` copy-paste 135 lines of post-generation evidence checking, self-correction, cost calculation, and telemetry. Similarly, `journal/review.ts` and `journal/coach-insights.ts` manually duplicate `runMastraBackgroundText` and contain a bug where `modelId.includes(':')` fails on `provider/model` IDs.

**Problems Solved:**

- `packages/ai/src/mastra-v2/agents/canonical/chat.ts:88-134` inlines `openCanonicalAttempt` (`attempt.ts:57-95`), and `:141-274` duplicates `:190-326` of `stream.ts`.
- `packages/ai/src/journal/coach-insights.ts:183-344` and `packages/ai/src/journal/review.ts:116-231` duplicate budget reservation, telemetry, and cost reconciliation instead of using `runMastraBackgroundText` (`packages/ai/src/mastra-v2/shared/background-text.ts:41`).
- **[Bug]** `packages/ai/src/journal/coach-insights.ts:186` and `review.ts:119` parse `modelId.includes(':') ? modelId.split(':')[0]! : 'google'` instead of splitting on `'/'` (or calling `splitModelId(modelId)`).

**Files to Modify:**

- `packages/ai/src/mastra-v2/agents/canonical/{attempt.ts,chat.ts,stream.ts}`
- `packages/ai/src/mastra-v2/shared/background-text.ts`
- `packages/ai/src/journal/{review.ts,coach-insights.ts}`

**Implementation Steps:**

- [x] **Step 1:** Extract `finalizeCanonicalTurn(args)` into `packages/ai/src/mastra-v2/agents/canonical/attempt.ts` (or `finalize.ts`) encapsulating `getMastraGenerationStats`, `extractToolPartsFromMessages`, `mergeToolEvidenceWithParts`, `checkCanonicalEvidence`, `attemptCanonicalSelfCorrection`, `estimateCostUsd`, `generationLedger.recordCost`, `canonical_evidence_blocked_total`, and `finishMastraRun`. Call both `openCanonicalAttempt` and `finalizeCanonicalTurn` from `chat.ts` and `stream.ts`.
- [x] **Step 2:** Fix provider ID extraction in `packages/ai/src/journal/coach-insights.ts:186` and `review.ts:119` to split on `'/'` (`modelId.includes('/') ? modelId.split('/')[0]! : ...`), and share a single `withJournalAiTurnBudget` / `runMastraBackgroundText` helper between `review.ts` and `coach-insights.ts`.
- [x] **Step 3:** Run `pnpm check:guards && pnpm knip && pnpm check:fast` and commit.

---

### Task 9B.3: Unify Chat Mutation Execution with Domain Services & Deduplicate Mutation Schemas (`R3`)

**Why (`untangle-codebase`):** When a user confirms `set_alert` or `log_journal` in chat, `mutation-executors.ts` performs raw `db.insert(...)` queries instead of calling `createAlertService` and `createJournalEntryService`. Meanwhile, `mutation-detect.ts` duplicates `keywords.ts`, and `mutation-extract.ts` duplicates `MutationInputSchema`.

**Problems Solved:**

- `apps/web/src/lib/services/chat/mutation-executors.ts:105-137` bypasses `createAlertService` (`apps/web/src/lib/services/alerts.ts:123`) and `createJournalEntryService` (`apps/web/src/lib/services/journal/entries.ts:38`).
- `packages/ai/src/mastra-v2/mutation/mutation-detect.ts:32-41` duplicates `BROAD_MUTATION_TERMS` in `packages/ai/src/routing/keywords.ts:151-152`.
- `packages/ai/src/mastra-v2/mutation/mutation-extract.ts:69-100` duplicates the field definitions of `MutationInputSchema` (`packages/ai/src/mastra-v2/workflows/mutation-schemas.ts:36-78`).
- `packages/ai/src/mastra-v2/workflows/mutation-execute-step.ts:72-77` defines a no-op `notifyStep` (`execute: async ({ inputData }) => inputData`).

**Files to Modify:**

- `apps/web/src/lib/services/chat/mutation-executors.ts`
- `packages/ai/src/mastra-v2/mutation/{mutation-detect.ts,mutation-extract.ts}`
- `packages/ai/src/mastra-v2/workflows/{mutation-schemas.ts,mutation-execute-step.ts,mutation.ts}`

**Implementation Steps:**

- [x] **Step 1:** In `apps/web/src/lib/services/chat/mutation-executors.ts:105-137`, route `case 'set_alert'` through `createAlert` / `createAlertService` and `case 'log_journal'` through `createEntry` / `createJournalEntryService` so chat-confirmed mutations share the exact same validation, DB writes, and memory indexing as the UI.
- [x] **Step 2:** Derive the LLM extraction schemas in `packages/ai/src/mastra-v2/mutation/mutation-extract.ts` from `MutationInputSchema` (`mutation-schemas.ts`), share the mutation intent regex between `mutation-detect.ts` and `routing/keywords.ts`, and remove the no-op `notifyStep` from `mutation.ts` / `mutation-execute-step.ts`.
- [x] **Step 3:** Run `pnpm check:guards && pnpm knip && pnpm check:fast` and commit.

---

### Task 9B.4: Flatten Stacked Retry Loops, Fix `openrouter` Capability Drift, and Remove Test-Mock Checks from Production Code (`R12`)

**Why (`untangle-codebase`):** `isRetryableTransientError` returns `true` for unknown errors, and committee specialist desks nest `withRetry(2)` inside a 2-attempt repair loop inside a Mastra step (`retries: 1`) inside a workflow (`attempts: 2`)—compounding up to 16 attempts on failure. Furthermore, `storage/shared.ts` inspects Vitest `.mock.calls` in production code, and `byok-providers.ts` disagrees with `groq-mistral-openrouter.ts` on whether OpenRouter supports embeddings.

**Problems Solved:**

- `packages/ai/src/models/byok-providers.ts:58-137` duplicates `supports: { vision, embedding }` from `packages/ai/src/_providers/*.ts`, causing `providerCapabilities.openrouter.supportsEmbedding` (`false` at `byok-providers.ts:104`) to contradict `OPENROUTER.supports.embedding` (`true` at `groq-mistral-openrouter.ts:218`).
- `packages/ai/src/_providers/helpers/tool-arguments.ts:51` hardcodes `if (toolName === 'get_indicators' && !Array.isArray(args.indicators))` inside the low-level provider wire helper.
- `packages/ai/src/runtime/retry.ts:119-125` (`isRetryableTransientError`) returns `true` by default for unknown errors, and `single-workflow/specialist-steps.ts:36` + `workflow.ts:99` stack step/workflow retries on top of `runSpecialistGeneration`'s own `withRetry` (`specialist-runner/runner.ts:151`).
- `packages/ai/src/mastra-v2/storage/shared.ts:58-62, 71-73` inspects `mock.calls.length === 0` in production code.

**Files to Modify:**

- `packages/ai/src/models/byok-providers.ts`
- `packages/ai/src/_providers/groq-mistral-openrouter.ts`
- `packages/ai/src/runtime/retry.ts`
- `packages/ai/src/committee/{single-workflow/specialist-steps.ts,single-workflow/workflow.ts,comparison-workflow/specialist-steps.ts,comparison-workflow/workflow.ts}`
- `packages/ai/src/mastra-v2/storage/shared.ts`
- `packages/ai/test/mastra-storage.test.ts`

**Implementation Steps:**

- [x] **Step 1:** Derive `providerCapabilities` in `packages/ai/src/models/byok-providers.ts:58-137` directly from `BYOK_PROVIDER_SPECS` (`_providers/registry.ts`) so `supports.vision` and `supports.embedding` have a single source of truth.
- [x] **Step 2:** Remove redundant outer Mastra step/workflow `retries: 1` / `retryConfig: { attempts: 2 }` on committee steps that already run `withRetry` inside `runSpecialistGeneration`, so retries happen at one explicit boundary.
- [x] **Step 3:** Delete `isMockConstructorCleared` from `packages/ai/src/mastra-v2/storage/shared.ts:58-73` and call `resetSharedMastraStorageForTests()` in `beforeEach` of any test that mocks `PostgresStore` / `LibSQLStore`.
- [x] **Step 4:** Run `pnpm check:guards && pnpm knip && pnpm check:fast` and commit.

---

## Phase 9C: Worker, Cron, Plugin Kernel & Database Deduplication

### Task 9C.1: Unify Scheduled Job Runners, Declarative Lock Policy, and Web `/api/cron/*` Parity (`R7`)

**Why (`untangle-codebase`):** `apps/worker` has 3 separate copies of the job execution lifecycle (`job-runtime.ts`, `plugin-jobs.ts`, `runner/cli.ts`), `skip-daily-lock.ts` hardcodes job names in a separate `Set`, `runner/cli.ts` fails to reject when a job times out, and `apps/web/src/lib/services/cron-jobs.ts:79` calls `pruneMastraStorage()` with no arguments (a silent no-op).

**Problems Solved:**

- `apps/worker/src/scheduler/job-runtime.ts:144-273`, `plugin-jobs.ts:94-174`, and `runner/cli.ts:55-145` implement 3 diverging copies of job lock acquisition, timeout racing, and heartbeat reporting.
- **[Bug]** `apps/worker/src/runner/cli.ts:76-81` aborts `ac.signal` on `JOB_TIMEOUT_MS` without racing a timeout rejection promise, so uncooperative jobs exit `0` on timeout (`apps/worker/test/runner-lock.test.ts:141`).
- `apps/worker/src/scheduler/skip-daily-lock.ts:28-32` hardcodes `SKIP_DAILY_LOCK = new Set(['alerts', 'briefings', 'embedding-backfill'])` instead of reading `lock: 'daily' | 'none'` from `JobDefinition` in `apps/worker/src/jobs/index.ts:46-112`.
- **[Bug]** `apps/web/src/lib/services/cron-jobs.ts:79` calls `pruneMastraStorage()` with `undefined` storage (a no-op), whereas `apps/worker/src/jobs/retention.ts:76-78` passes `getKestrelMastra().instance.getStorage() ?? undefined`.
- `apps/worker/src/jobs/{retention,alerts,embedding-backfill}.ts` and `apps/web/src/lib/services/{cron-jobs,alerts,news}.ts` duplicate job orchestration logic.
- `apps/worker/src/streams/tick-bus.ts:127-166` and `apps/worker/src/scheduler/plugin-jobs.ts:182-215` duplicate `loadInstalledUsers`, and `apps/worker/src/log.ts:75-78` (`serviceToCategory`) has an `if` where both branches return `'worker'`.

**Files to Modify / Delete:**

- Modify: `apps/worker/src/jobs/{types.ts,index.ts,retention.ts}`
- Delete: `apps/worker/src/scheduler/skip-daily-lock.ts`
- Modify: `apps/worker/src/scheduler/{job-runtime.ts,plugin-jobs.ts}`
- Modify: `apps/worker/src/runner/cli.ts`
- Modify: `apps/worker/src/streams/tick-bus.ts` & `apps/worker/src/log.ts`
- Modify: `apps/web/src/lib/services/cron-jobs.ts`
- Modify: `apps/worker/test/runner-lock.test.ts`

**Implementation Steps:**

- [x] **Step 1:** Add `lock: 'daily' | 'none'` to `JobDefinition` in `apps/worker/src/jobs/types.ts` and `apps/worker/src/jobs/index.ts`, and delete `apps/worker/src/scheduler/skip-daily-lock.ts`.
- [x] **Step 2:** Fix `apps/worker/src/runner/cli.ts:76-115` to race `job.run(...)` against a timeout rejection promise (sharing the timeout + lock helper with `job-runtime.ts` and `plugin-jobs.ts`), and update `apps/worker/test/runner-lock.test.ts:127-147` to assert non-zero `exitCode` (`1`) when a job times out.
- [x] **Step 3:** In `apps/web/src/lib/services/cron-jobs.ts:79`, pass `getKestrelMastra().instance.getStorage() ?? undefined` to `pruneMastraStorage(...)` and share the retention + stale budget recovery runner with `apps/worker/src/jobs/retention.ts`.
- [x] **Step 4:** Share `loadInstalledPluginUsers` between `apps/worker/src/scheduler/plugin-jobs.ts:182-215` and `apps/worker/src/streams/tick-bus.ts:127-166`, and remove dead `TickBus.invalidate()` / `TickBus.getStats()` and the redundant branch in `apps/worker/src/log.ts:75-78`.
- [x] **Step 5:** Run `pnpm check:guards && pnpm knip && pnpm check:fast` and commit.

---

### Task 9C.2: Share Plugin Helpers in `@kestrel/plugin-sdk` / `@kestrel/db` & Deduplicate Plugin Route/Tool Handlers (`R8`)

**Why (`untangle-codebase`):** `plugins/backtesting`, `plugins/paper-trading`, and `plugins/telegram-bot` copy-paste route wrappers (`errorResponse`/`wrap`), Drizzle table column builders (`tenantColumn`, `tenantIsolation`, `moneyColumn`, `baseColumns`), `normaliseSettings`, UI formatters (`fmtNumber`, `fmtMoney`, etc.), and duplicate input validation across `src/api/routes/*` and `src/tools/*`.

**Problems Solved:**

- `plugins/backtesting/src/api/routes/shared.ts:36-82` and `plugins/paper-trading/src/api/routes/shared.ts:35-76` duplicate `errorResponse` and `wrap`.
- `plugins/backtesting/src/db/tables.ts:41-74` and `plugins/paper-trading/src/db/tables.ts:43-76` duplicate `tenantColumn`, `tenantIsolation`, `moneyColumn`, and `baseColumns`.
- `plugins/backtesting/src/ui/format.ts:19-67` and `plugins/paper-trading/src/ui/format.ts:17-75` duplicate `fmtNumber`, `fmtMoney`, `fmtPct`, `fmtR`, `fmtPrice`, `fmtDate`, and `toneClass`.
- `plugins/backtesting/src/api/routes/{strategies,knowledge,runs,sweeps}.ts` vs `src/tools/{strategies,knowledge,runs,sweeps}.ts` and `plugins/paper-trading/src/api/routes/{accounts,orders,positions,fills,strategy-runs}.ts` vs `src/tools/{accounts,orders,positions,strategy-runs}.ts` duplicate slug derivation, account resolution, equity summation, and close-position outcome formatting.
- `plugins/backtesting/src/engine/sandbox/driver.ts:62-125` (`__kestrelNormalize`) and `output.ts:58-129` (`toSignal`) normalize the same 13 `StrategySignal` fields twice.
- Dead exports: `backtestSettings` (`plugins/backtesting/src/server.ts:63-65`), `listBacktestRuns` (`plugins/backtesting/src/db/queries/runs.ts:128-139`), `listPendingOrdersForSymbol` (`plugins/paper-trading/src/db/queries/orders.ts:111-125`).

**Files to Modify:**

- `packages/plugin-sdk/src/{route-helpers.ts,settings.ts,ui/index.tsx}`
- `packages/db/src/schema/ops/plugins.ts`
- `plugins/backtesting/src/{server.ts,db/tables.ts,db/queries/runs.ts,api/routes/*,tools/*,ui/format.ts,engine/sandbox/*}`
- `plugins/paper-trading/src/{db/tables.ts,db/queries/orders.ts,api/routes/*,tools/*,services/*,ui/format.ts}`

**Implementation Steps:**

- [x] **Step 1:** Export shared plugin table column helpers (`pluginTenantColumn`, `pluginTenantIsolation`, `pluginMoneyColumn`, `pluginBaseColumns`) from `@kestrel/db` and shared UI formatters (`fmtNumber`, `fmtMoney`, `fmtPct`, `fmtR`, `fmtPrice`, `fmtDate`, `toneClass`) from `@kestrel/plugin-sdk/ui`, replacing the duplicate copies in `backtesting` and `paper-trading`.
- [x] **Step 2:** Move the duplicated route/tool business logic (strategy slug defaulting + summary mapping in `backtesting`, and `summarizeAccounts` / `resolveAccountIfProvided` / `formatCloseOutcomeMessage` in `paper-trading`) into `plugins/backtesting/src/services/*` and `plugins/paper-trading/src/services/*` so HTTP routes and Mastra tools are 1-line calls to the service layer.
- [x] **Step 3:** Simplify `__kestrelNormalize` in `plugins/backtesting/src/engine/sandbox/driver.ts:62-125` to only ensure JSON-serializable primitive output from QuickJS, leaving canonical field validation and clamping in `toSignal` (`output.ts:58-129`).
- [x] **Step 4:** Delete the dead exports `backtestSettings`, `listBacktestRuns`, and `listPendingOrdersForSymbol`.
- [x] **Step 5:** Run `pnpm check:guards && pnpm knip && pnpm check:fast` and commit.

---

### Task 9C.3: Unify `@kestrel/shared` Symbol Metadata, Open `IndicatorResultSchema`, and Deduplicate `@kestrel/indicators` (`R9`, `R10`)

**Why (`untangle-codebase`):** `IndicatorResultSchema` uses a closed 7-value enum that rejects plugin-registered indicators at runtime; `validation.ts` in `plugin-sdk` re-hardcodes core alert channels and indicator kinds; `marketaux/map.ts` tags gold as `'XAU'` instead of `'XAUUSD'`; and `@kestrel/indicators` duplicates UTC day-bucketing, session slicing, and EMA loops.

**Problems Solved:**

- `packages/shared/src/schemas/indicator.ts:49` restricts `IndicatorResultSchema.shape.kind` to `IndicatorKindSchema`, rejecting custom plugin indicators.
- `packages/plugin-sdk/src/host/validation.ts:44-55` hardcodes `RESERVED_ALERT_CHANNELS` and `RESERVED_INDICATOR_KINDS` instead of importing `CORE_ALERT_CHANNELS` and `IndicatorKindSchema.options` from `@kestrel/shared`.
- `packages/data/src/providers/marketaux/map.ts:81` tags gold articles as `'XAU'`, forcing `packages/data/src/adapters/news.ts:207-211` to keep a special case `(opts.symbol === 'XAUUSD' && a.symbols.includes('XAU'))`.
- `packages/indicators/src/structure/pdh-pdl.ts:45-53, 78-83`, `asian-range.ts:44-98`, and `pivots.ts:59-65` duplicate `utcDayKey` and `collectDistinctDays`; `computeAsianRange` re-implements `sliceSessionRange` (`sessions.ts:55-96`); `moving-averages.ts:49-68` and `macd.ts:66-79` duplicate EMA smoothing; and `pivots.ts:91-99` has a test-only `if (dates.length <= 1)` branch.

**Files to Modify:**

- `packages/shared/src/schemas/indicator.ts`
- `packages/plugin-sdk/src/host/validation.ts`
- `packages/data/src/providers/marketaux/map.ts` & `packages/data/src/adapters/news.ts`
- `packages/indicators/src/{util.ts,moving-averages.ts,macd.ts,bollinger.ts,pivots.ts,structure/pdh-pdl.ts,structure/asian-range.ts}`
- `packages/indicators/test/{pivots.test.ts,property.test.ts,moving-averages.test.ts}`

**Implementation Steps:**

- [x] **Step 1:** In `packages/shared/src/schemas/indicator.ts:49`, widen `IndicatorResultSchema`'s `kind` field to `IndicatorKindSchema.or(z.string().min(1))` (and remove the `as unknown as IndicatorKind` cast in `packages/indicators/test/moving-averages.test.ts:73`).
- [x] **Step 2:** In `packages/plugin-sdk/src/host/validation.ts:44-55`, initialize `RESERVED_ALERT_CHANNELS = new Set<string>(CORE_ALERT_CHANNELS)` and `RESERVED_INDICATOR_KINDS = new Set<string>(IndicatorKindSchema.options)` imported from `@kestrel/shared`.
- [x] **Step 3:** In `packages/data/src/providers/marketaux/map.ts:81`, emit canonical `'XAUUSD'` instead of `'XAU'` and use `extractSymbolsFromText` from `@kestrel/shared`, then remove the `a.symbols.includes('XAU')` special case in `packages/data/src/adapters/news.ts:207-211`.
- [x] **Step 4:** In `packages/indicators/src/util.ts`, export `utcDayKey(ms)`, `collectDistinctDays(candles)`, and `emaOfNumbers(xs, period)`. Refactor `pdh-pdl.ts`, `asian-range.ts` (delegating to `sliceSessionRange`), `pivots.ts`, `moving-averages.ts`, and `macd.ts` to use them. Update `pivots.test.ts:20` and `property.test.ts:37` to generate multi-day timestamps (`i * 86_400_000`) and remove the test-only fallback branch in `pivots.ts:91-99`.
- [x] **Step 5:** Run `pnpm check:guards && pnpm knip && pnpm check:fast` and commit.

---

### Task 9C.4: Consolidate `@kestrel/db` TLS Resolution, `@kestrel/shared` Crypto/Error Helpers, and Prune Dead DB/Cache Exports (`R10`)

**Why (`untangle-codebase`):** Postgres SSL/TLS resolution is implemented 3 times (with 2 copies of the 22-line Supabase Root CA PEM), `encryptByok` and `encryptSecret` duplicate AES-256-GCM in `encryption.ts`, `parseStack` is duplicated in `bug-report.ts` and `logger/errors.ts`, and several DB/cache functions have zero callers across the monorepo.

**Problems Solved:**

- `packages/db/src/connection/pools.ts:113-165`, `packages/db/src/queue/index.ts:45-71`, and `packages/db/drizzle.config.ts:34-80` duplicate SSL resolution, and `drizzle.config.ts:38-60` embeds a second copy of `SUPABASE_ROOT_CA_2021` (`supabase-ca.ts:26-48`).
- `packages/shared/src/crypto/encryption.ts:81-130` (`encryptByok`/`decryptByok`) and `:207-249` (`encryptSecret`/`decryptSecret`) duplicate AES-256-GCM cipher/decipher logic.
- `packages/shared/src/errors/bug-report.ts:135-150` and `packages/shared/src/logger/errors.ts:26-42` contain identical copies of `parseStack`.
- `packages/shared/src/env/schema/runtime.ts:123-163` and `packages/shared/src/runtime/feature-flags.ts:24-37` define feature-flag defaults twice.
- Dead exports with zero production callers:
  - `packages/db/src/ops/provider-quota.ts` (`checkAndIncrementDailyQuota`) and `packages/data/src/cache/throttle.ts:209-241` (`tryReserveDaily`)
  - `packages/db/src/queries/auth/api-keys.ts` (`updateUserApiKeys`)
  - `packages/db/src/queries/watchlist.ts:94-103` (`getNextDisplayOrder`)
  - `packages/db/src/queries/candles.ts:49-58` (`listActiveSymbols`)
  - `packages/data/src/cache/ttl.ts:56-60` & `keys.ts:31-35` (`NEWS_LIST_TTL`, `NEWS_ARTICLE_TTL`, `CALENDAR_DAY_TTL`, `CALENDAR_WEEK_TTL`, `FRED_SERIES_TTL`)
  - `packages/data/src/providers/biquote/rest/calendar.ts:72-80` (`fetchCalendarUpcoming`)
  - `packages/shared/src/env/index.ts:118-125` (`DEPRECATED_ENV_ALIASES`, `getDeprecatedEnvAliases`)
  - `packages/shared/src/crypto/vault.ts:203-213` (`withVaultSecrets`, `_resetVaultLoader`)

**Files to Modify / Delete:**

- `packages/db/src/connection/{supabase-ca.ts,pools.ts}`, `packages/db/src/queue/index.ts`, `packages/db/drizzle.config.ts`
- `packages/db/src/{index.ts,ops/provider-quota.ts,queries/auth/api-keys.ts,queries/auth/index.ts,queries/watchlist.ts,queries/candles.ts}`
- `packages/data/src/{index.ts,cache/throttle.ts,cache/ttl.ts,cache/keys.ts,cache/index.ts,providers/biquote/rest/calendar.ts,providers/biquote/rest/index.ts,providers/biquote/index.ts}`
- `packages/shared/src/{crypto/encryption.ts,crypto/vault.ts,errors/bug-report.ts,logger/errors.ts,env/index.ts,env/schema/runtime.ts,runtime/feature-flags.ts}`
- `packages/shared/test/env.test.ts` & `packages/data/test/cache-swr-inflight.test.ts`

**Implementation Steps:**

- [x] **Step 1:** Export `resolvePostgresSslOptions(connectionString, env)` from `packages/db/src/connection/supabase-ca.ts` and call it from `pools.ts`, `queue/index.ts`, and `drizzle.config.ts` (deleting the duplicate PEM literal in `drizzle.config.ts`).
- [x] **Step 2:** In `packages/shared/src/crypto/encryption.ts`, implement `encryptByok` and `decryptByok` on top of the shared AES-256-GCM primitive used by `encryptSecret` / `decryptSecret`; export `parseStack` from `packages/shared/src/logger/errors.ts` and reuse it in `bug-report.ts`; and derive `RuntimeEnv` feature-flag defaults from `FLAG_DEFAULTS` in `feature-flags.ts`.
- [x] **Step 3:** Delete the dead exports listed above (`checkAndIncrementDailyQuota`, `tryReserveDaily`, `updateUserApiKeys`, `getNextDisplayOrder`, `listActiveSymbols`, unused cache TTLs/keys, `fetchCalendarUpcoming`, `getDeprecatedEnvAliases`, `withVaultSecrets`) and remove their barrel re-exports.
- [x] **Step 4:** Run `pnpm check:guards && pnpm knip && pnpm check:fast` and commit.

---

## Phase 9D: Web Mutation Unification, Pass-Through Facade Removal & Co-location

### Task 9D.1: Remove Dead Server Actions & Unify Web Settings/Alert/Journal Mutations (`R6`)

**Why (`untangle-codebase`):** `apps/web` maintains parallel Server Actions and REST API routes for the same tables, leaving 6 Server Actions completely dead (`toggleAlertAction`, `deleteAlertAction`, `addSymbolAction`, `removeSymbolAction`, `updateChatModelAction`, `clearChatModelAction`) and duplicating `user_settings` updates across `settings/_actions/*` and `lib/services/admin-platform-config/*`.

**Problems Solved:**

- Dead Server Actions with zero callers:
  - `apps/web/src/app/(app)/alerts/actions.ts:56-101` (`toggleAlertAction`, `deleteAlertAction`)
  - `apps/web/src/app/(app)/settings/_actions/preferences-symbols.ts:48-119` (`addSymbolAction`, `removeSymbolAction`)
  - `apps/web/src/app/(app)/settings/_actions/models.ts:38-73` (`updateChatModelAction`, `clearChatModelAction`)
- `apps/web/src/lib/services/admin-platform-config/settings-actions.ts:33-131` and `api-key-actions.ts:35-106` duplicate the `db.update(schema.userSettings)` and BYOK key save/delete logic from `apps/web/src/app/(app)/settings/_actions/*`.
- `apps/web/src/app/(app)/journal/_components/entry-form/use-entry-form.ts:14-26, 57-77` duplicates `JournalCreateSchema` (`apps/web/src/lib/services/journal/schemas.ts:28-39`) and `assertValidTradeLevels`.

**Files to Modify / Delete:**

- Modify: `apps/web/src/app/(app)/alerts/actions.ts`
- Delete: `apps/web/src/app/(app)/settings/_actions/{preferences-symbols.ts,models.ts}`
- Modify: `apps/web/src/app/(app)/settings/actions.ts`
- Modify: `apps/web/src/app/(app)/settings/_actions/{preferences-ai.ts,api-keys-market.ts,api-keys-save.ts}`
- Modify: `apps/web/src/lib/services/admin-platform-config/{settings-actions.ts,api-key-actions.ts}`
- Modify: `apps/web/src/app/(app)/journal/_components/entry-form/use-entry-form.ts`

**Implementation Steps:**

- [x] **Step 1:** Delete `toggleAlertAction` and `deleteAlertAction` from `apps/web/src/app/(app)/alerts/actions.ts`, delete `preferences-symbols.ts` and `models.ts` from `apps/web/src/app/(app)/settings/_actions/`, and remove their re-exports in `apps/web/src/app/(app)/settings/actions.ts`.
- [x] **Step 2:** Have `apps/web/src/lib/services/admin-platform-config/{settings-actions.ts,api-key-actions.ts}` and `apps/web/src/app/(app)/settings/_actions/*` delegate to shared domain helpers in `apps/web/src/lib/services/settings/` instead of duplicating `db.update(schema.userSettings)` and `mergeUserByokKeys` + `recordProviderTestResult`.
- [x] **Step 3:** Use `assertValidTradeLevels` (from `@kestrel/shared`) in `apps/web/src/app/(app)/journal/_components/entry-form/use-entry-form.ts:57-77` and `apps/web/src/lib/services/journal/schemas.ts:28-39` so journal trade-level validation is defined once.
- [x] **Step 4:** Run `pnpm check:guards && pnpm knip && pnpm check:fast` and commit.

---

### Task 9D.2: Narrow `.oxlintrc.json` `app/api` Import Rule to Raw Schema Only & Delete Zero-Logic Pass-Through Barrels (`R11`)

> **Owner-Authorized Boundary Update:** Update `.oxlintrc.json:59-100` and `AGENTS.md` in the same commit so `app/api/**` routes are banned from importing raw `@kestrel/db` schema/client internals (enforcing that raw SQL stays in `@kestrel/db` queries or `src/lib/services/*`), while allowing `app/api/**` to import canonical `@kestrel/ai`, `@kestrel/data`, and `@kestrel/db` query functions directly—just as `src/app/(app)/**` already does. Then delete the 1-line pass-through barrels that existed solely to appease the old lint rule.

**Problems Solved:**

- `apps/web/src/lib/services/chat-ai.ts:26-66` (100% pass-through re-export barrel).
- `apps/web/src/lib/services/settings/domain.ts:24-34` (100% pass-through re-export barrel).
- `apps/web/src/lib/services/journal/coach.ts:25-37` (1-line pass-through wrapper).
- `packages/ai/src/barrels/{budget,agents,tools,runtime,data,eval}.ts` and `packages/ai/src/budget/cost.ts:23-25` (multi-hop pass-through barrels).
- Six 1-line `log.ts` files in `packages/ai`: `mastra-v2/agents/canonical/log.ts`, `mastra-v2/context/log.ts`, `mastra-v2/storage/log.ts`, `mastra-v2/packets/packet-cache/log.ts`, `mastra-v2/evals/scorers/log.ts`, and `alerts/persistence/log.ts`.

**Files to Modify / Delete:**

- Modify: `.oxlintrc.json` & `AGENTS.md` & `apps/web/AGENTS.md`
- Delete: `apps/web/src/lib/services/{chat-ai.ts,settings/domain.ts,journal/coach.ts}`
- Delete: `packages/ai/src/barrels/{budget,agents,tools,runtime,data,eval}.ts`
- Delete: the 6 standalone 1-line `log.ts` files in `packages/ai/src/`
- Modify: callers in `apps/web/src/app/api/**` and `packages/ai/src/index.ts`

**Implementation Steps:**

- [x] **Step 1:** Update `.oxlintrc.json:59-100`, `AGENTS.md`, and `apps/web/AGENTS.md` so `apps/web/src/app/api/**/*.ts` is only restricted from importing raw Drizzle schema/table objects, allowing direct imports of `@kestrel/ai`, `@kestrel/data`, and `@kestrel/db` query functions when no web-specific orchestration is needed.
- [x] **Step 2:** Delete `apps/web/src/lib/services/chat-ai.ts`, `apps/web/src/lib/services/settings/domain.ts`, and `apps/web/src/lib/services/journal/coach.ts`, updating their callers to import directly from `@kestrel/ai` and `@kestrel/db`.
- [x] **Step 3:** Inline `packages/ai/src/barrels/{budget,agents,tools,runtime,data,eval}.ts` into `packages/ai/src/index.ts` and inline the 6 1-line `log.ts` files in `packages/ai/src/` into their owning modules.
- [x] **Step 4:** Run `pnpm check:guards && pnpm knip && pnpm check:fast` and commit.

---

### Task 9D.3: Co-locate High-Churn Micro-Files (`chat-top-bar`, `segmented`, `event-card`, `run-context`, `candle-flush`) (`R11`)

**Why (`untangle-codebase`):** Now that `RULE-F01` (500 LOC `.ts`) and `RULE-F02` (450 LOC `.tsx`) allow cohesive modules to stay whole, re-consolidate the worst offenders where 1 change currently forces editing 5–8 tiny files, and remove dead props on `ChatTopBar`.

**Problems Solved:**

- `apps/web/src/components/chat/chat-top-bar/{index.tsx,types.ts,mode-labels.ts,thread-context.tsx,overflow-menu.tsx}`: `ChatTopBarProps` (`types.ts:22-26`) declares 5 unused props (`analysisMode`, `onAnalysisModeChange`, `chatModel`, `onChatModelChange`, `modelSelectionPending`) passed by `chat-screen.tsx:110-114`, plus duplicate `splitMode`/`viewsOpen` prop pairs (`chat-screen.tsx:115-118`).
- `apps/web/src/components/ui/segmented/{index.tsx,segmented-list.tsx,segmented-item.tsx,segmented-tokens.ts,segmented-types.ts,ambient-telemetry.tsx}` (6 files totaling ~160 LOC, plus `ambient-telemetry.tsx` misplaced inside `ui/segmented/`).
- `apps/web/src/components/calendar/event-card/{index.tsx,countdown.tsx,event-actions.tsx,event-data-row.tsx,event-importance.ts,event-time.ts,impact-badge.tsx}` (7 files totaling ~180 LOC).
- `packages/ai/src/diagnostics/run-context/{index,lifecycle,snapshot,store,trace,types,with-diagnostics}.ts` (7 micro-files for one `AsyncLocalStorage` store).
- `apps/worker/src/bootstrap/{candle-flush,candle-writer,candle-queue,candle-gaps,candle-timing}.ts` (5 bootstrap micro-files for one candle flush loop).

**Files to Modify / Delete:**

- Modify & consolidate: `apps/web/src/components/chat/chat-top-bar/*` & `apps/web/src/components/chat/chat-screen.tsx`
- Modify & consolidate: `apps/web/src/components/ui/segmented/*`
- Modify & consolidate: `apps/web/src/components/calendar/event-card/*`
- Modify & consolidate: `packages/ai/src/diagnostics/run-context/*`
- Modify & consolidate: `apps/worker/src/bootstrap/candle-*.ts`

**Implementation Steps:**

- [x] **Step 1:** In `apps/web/src/components/chat/chat-top-bar/`, remove the 5 unused props (`analysisMode`, `onAnalysisModeChange`, `chatModel`, `onChatModelChange`, `modelSelectionPending`) and deduplicate `splitMode` / `viewsOpen` in `chat-top-bar` and `chat-screen.tsx:110-118`, merging `types.ts`, `mode-labels.ts`, `thread-context.tsx`, and `overflow-menu.tsx` into `chat-top-bar/index.tsx` (<= 250 LOC total).
- [x] **Step 2:** Consolidate `segmented-list.tsx`, `segmented-item.tsx`, `segmented-tokens.ts`, and `segmented-types.ts` into `apps/web/src/components/ui/segmented/index.tsx` (moving `ambient-telemetry.tsx` to `src/components/layout/` or keeping its clean export).
- [x] **Step 3:** Consolidate the 7 micro-files in `apps/web/src/components/calendar/event-card/` into `event-card/index.tsx` (<= 200 LOC total).
- [x] **Step 4:** Consolidate `packages/ai/src/diagnostics/run-context/{store,trace,snapshot,lifecycle,with-diagnostics,types}.ts` into `packages/ai/src/diagnostics/run-context/index.ts` (<= 350 LOC total), and merge `candle-timing.ts` / `candle-queue.ts` / `candle-writer.ts` into `apps/worker/src/bootstrap/candle-flush.ts` (keeping each file <= 500 LOC).
- [x] **Step 5:** Run `pnpm check:guards && pnpm knip && pnpm check:fast` and commit.

---

## Phase 9E: Comments & Behavioral Test Hygiene Pass

### Task 9E.1: Strip Code-Restating & Stale Audit-History Comments (`Comments` Pass)

**Why (`untangle-codebase`):** Comments that restate the implementation (`// Find candle closest to open time`) or narrate old audit tickets (`// DEC-05 split of run-context.ts`, `// Phase 8 PR-6 — ...`) have no reason of their own to change and frequently drift into falsehoods (e.g., `start-scheduler.ts:23` claiming a 60s timeout when the timeout is 120s, or `chat.ts:32` claiming `Personal-mode: no user_id`).

**Problems Solved:**

- Contradictory/stale comments in `apps/worker/src/scheduler/start-scheduler.ts:23, 83-86`, `cron-lock.ts:130`, `persistence/live-ticks.ts:21-23`, `signalr/consumer/connection.ts:29-30`.
- Stale 3-symbol (`"XAUUSD" | "EURUSD" | "GBPUSD"`) and `Personal-mode: no user_id` comments in `packages/db/src/schema/core/chat.ts:32, 45`, `market/cot.ts:39`, `live-ticks.ts:20, 33`, `candles-1m.ts:25`, and `ops/journal.ts:28`.
- Contradictory budget comments in `packages/ai/src/budget/index.ts:19-30, 134-136`.
- Boilerplate `"This barrel keeps the previous ... import path working"` across 18 barrel files in `plugins/*` and `// PF-22 — <Domain> service layer...` headers across `apps/web/src/lib/services/*`.

**Implementation Steps:**

- [x] **Step 1:** Remove stale PR/audit-ticket banners (`PF-22`, `DEC-05`, `Phase 8 PR-6`, `Audit 2026-10-31`) and code-restating inline comments across `packages/*`, `apps/*`, and `plugins/*`.
- [x] **Step 2:** Fix or remove the inaccurate comments in `start-scheduler.ts`, `packages/db/src/schema/**`, and `packages/ai/src/budget/index.ts`.
- [x] **Step 3:** Run `pnpm check:guards && pnpm knip && pnpm check:fast` and commit.

---

### Task 9E.2: Replace Source-Grepping & Tautological Mock Tests with Behavioral Tests (`Tests` Pass)

**Why (`untangle-codebase` & `AGENTS.md`):** `AGENTS.md` strictly bans `readFileSync` source grepping and mocked-ORM chain tests inside Vitest, yet several surviving tests still read `.ts` files from disk or assert on their own mock implementations.

**Problems Solved:**

- `packages/ai/test/canonical-evidence.test.ts` / `CanonicalEvidenceGate` and `packages/ai/test/alerts-delivery.test.ts:504-530` read `.ts` source files with `readFileSync` to assert substring/regex matches.
- `apps/web/test/chat-transport.test.ts:52-68` asserts `expect(transport).toBeDefined()` and `expect(typeof transport.sendMessages).toBe('function')`.
- `apps/web/test/auth-credentials.test.ts:69-71` contains a dead `vi.mock('@kestrel/ai', () => ({ getDb: () => mockDb }))`.
- `apps/worker/test/tick-buffer.test.ts:17-20` and `apps/worker/test/empty.ts` keep an empty stub file only for Knip.
- `plugins/backtesting/test/market-data-gate.test.ts:33-41, 59-72` asserts exact multi-sentence string equality on warning/error prose instead of testing the structured gate outcome (`status: 'refused' | 'warn' | 'ok'`).
- `packages/db/test/with-user-tenant.test.ts:25-73` mocks both `../src/tenant` and `../src/client`, testing only that a 3-line wrapper passes arguments to mocks (real RLS scope behavior is already tested in `packages/db/test/postgres-app-role.test.ts`).

**Implementation Steps:**

- [x] **Step 1:** Remove the `readFileSync` source-grepping assertions from `packages/ai/test/alerts-delivery.test.ts:504-530` (and any remaining `readFileSync` source-text assertions in `packages/ai/test/`).
- [x] **Step 2:** Delete `apps/worker/test/empty.ts` (and its import in `tick-buffer.test.ts:20`), remove the dead `@kestrel/ai` mock in `apps/web/test/auth-credentials.test.ts:69-71`, and remove the two trivial `typeof` existence assertions in `apps/web/test/chat-transport.test.ts:52-68`.
- [x] **Step 3:** Relax `plugins/backtesting/test/market-data-gate.test.ts` to assert on `result.ok` / `result.reason` / key substrings rather than brittle full-paragraph equality.
- [x] **Step 4:** Run the full verification suite:
  ```bash
  pnpm format:check && pnpm check:guards && pnpm knip && pnpm check:fast && pnpm build:packages
  ```
- [x] **Step 5:** Commit final Phase 9 verification.
