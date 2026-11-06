# Kestrel — `untangle-codebase` Deep-Dive Audit & Decision Log (2026-11-06)

**Date:** 2026-11-06  
**Repository:** `/data/home/Kestrel` (`main` @ `ba97614f`)  
**Scope:** All 13 workspace packages (`apps/web`, `apps/worker`, `packages/ai`, `packages/db`, `packages/data`, `packages/indicators`, `packages/plugin-sdk`, `packages/shared`, `packages/config`, `packages/test-utils`, `plugins/backtesting`, `plugins/paper-trading`, `plugins/telegram-bot`) + `scripts/*`  
**Companion Implementation Plan:** [`docs/roadmaps/phase9-untangle-codebase-and-bug-remediation.md`](../roadmaps/phase9-untangle-codebase-and-bug-remediation.md)

---

## 1. Executive Summary

Following Phases 1–8 (`bc289984` through `ba97614f`), we audited the entire repository using the `untangle-codebase` methodology by asking one question of every module: **"Should these pieces change together?"**

This audit identified **12 systemic structural tangles** (Hidden Links, Needless Links, Surplus, and Special Cases) and **7 concrete production bugs** caused directly by those hidden links and special cases:

| # | First-Principles Redesign | Category | Primary Packages | Concrete Bugs / Friction Eliminated |
| :--- | :--- | :--- | :--- | :--- |
| **R1** | **Unify `xauusdExtension` & `genericMacro` into one `packet.macro` schema** | Special Cases + Hidden Links | `packages/ai`, `apps/web` | **Fixes 3 bugs** where non-`XAUUSD` macro events/numbers are ignored in grounding (`grounding.ts:74-88`), committee scorecards (`verdicts.ts:87`), and regime memory (`remember-regime.ts:126`), plus `MastraReportPart` locked to `z.literal('XAUUSD')` (`mastra-report-schema.ts:29`). |
| **R2** | **Persist/inject `NoiseState` & unify `noiseConfig`/`routeConfig` + Resend email** | Hidden Links + Surplus | `packages/ai` | **Fixes broken production alert deduplication & cooldowns**: `evaluateAlertNoise` (`alerts/delivery/noise.ts:49`) runs `new InMemoryNoiseState()` on every alert call (masked by a test mock in `alerts-delivery.test.ts:79-85`). |
| **R3** | **Unify chat mutation confirmations into one signed-proposal pipeline** | Hidden Links + Needless Links | `packages/ai`, `apps/web` | Eliminates the split between the 4-step stateful Mastra workflow (`workflows/mutation.ts`) for 4 built-in tools and the stateless `_ui: 'plugin-tool-confirm'` card (`plugins/mastra-tools.ts:53-89`) for plugins, plus raw DB inserts in `mutation-executors.ts:105-137` that bypass `createAlertService` and `createJournalEntryService`. |
| **R4** | **Collapse `single-workflow/` and `comparison-workflow/` into one N-symbol committee pipeline** | Needless Links + Hidden Links | `packages/ai` | Eliminates 14 mirrored micro-files (`single-workflow/*` vs `comparison-workflow/*`) and duplicate synthesis/fusion-verifier pipelines (`synthesizer/synthesis.ts` vs `comparison.ts`, `fusion-verifier.ts:52-138`). |
| **R5** | **Unify canonical chat post-processing & background LLM runners (`reviewTrade`, `getCoachInsights`)** | Hidden Links | `packages/ai` | Eliminates 135 LOC of copy-pasted post-turn orchestration between `agents/canonical/chat.ts:141-274` and `stream.ts:190-326`, and **fixes the `modelId.includes(':')` bug** in `journal/coach-insights.ts:186` and `journal/review.ts:119` (where `resolveChatModel` returns `provider/model` with `/`, causing all non-Google models to log `providerId: 'google'`). |
| **R6** | **Collapse dual web mutation paths (Server Actions vs. REST API) & fix `2fa_disabled` RLS bug** | Hidden Links + Surplus | `apps/web` | Removes dead Server Actions (`toggleAlertAction`, `deleteAlertAction`, `addSymbolAction`, `removeSymbolAction`, `updateChatModelAction`, `clearChatModelAction`), adds missing BYOK key ownership checks (`403`) and OpenRouter `/` model-ID handling to `embedding-model` & `vision-model` routes, and **fixes `security-two-factor.ts:238`** calling `createAuditLog` outside `withUserTenant`. |
| **R7** | **Unify `/api/cron/*`, `apps/worker/src/jobs/*`, and the 3 worker job runners into one job registry** | Hidden Links + Special Cases | `apps/worker`, `apps/web`, `packages/ai` | Eliminates 3 diverging job execution loops (`job-runtime.ts`, `plugin-jobs.ts`, `runner/cli.ts`), replaces `SKIP_DAILY_LOCK` (`skip-daily-lock.ts:28-32`) with declarative `lock: 'daily' \| 'none'`, **fixes `cron-jobs.ts:79` calling `pruneMastraStorage()` with no storage argument (a silent no-op)**, and fixes CLI job timeout handling (`runner/cli.ts:76-81`). |
| **R8** | **Share the backtesting/paper-trading execution kernel & replace `[run:id] [maxBars:N]` note regexes with columns** | Hidden Links + Special Cases | `plugins/backtesting`, `plugins/paper-trading`, `packages/indicators` | Eliminates duplicated order/bracket/trailing/sizing math across `backtesting` and `paper-trading`, replaces regex-parsing of free-text `notes` (`strategy-parity.ts:29-70`) and magic `'__trainRatio'` JSONB key smuggling (`sweep-service.ts:51-71`), and deduplicates QuickJS `driver.ts` vs host `output.ts` signal normalization. |
| **R9** | **Unify `MarketDataProvider` HTTP transport, capability context, and `@kestrel/shared` symbol/price helpers** | Hidden Links + Special Cases | `packages/data`, `packages/shared`, `apps/web` | Collapses 7 copy-pasted HTTP/timeout/429 blocks into one helper (**fixing caller `AbortSignal` misclassification in `marketaux` and `fred`**), passes `apiKeys` into `provider.supports()`, and fixes `XAUUSD ? 2 : 5` / `.toFixed(5)` / `.toFixed(2)` price-decimal bugs in 6 chat/settings components. |
| **R10** | **Clean up `@kestrel/db` TLS duplication, dead `provider_daily_quota` plumbing, and split `user_settings` queries** | Hidden Links + Surplus | `packages/db`, `packages/shared`, `packages/data` | Consolidates 3 copies of Supabase TLS resolution (and 2 copies of the 22-line Root CA PEM), unifies `encryptByok`/`encryptSecret` and `parseStack`, and removes dead `tryReserveDaily` / `checkAndIncrementDailyQuota` / `updateUserApiKeys` / `getNextDisplayOrder` / `listActiveSymbols`. |
| **R11** | **Remove `.oxlintrc.json` `app/api` facade indirection & re-consolidate shattered micro-files** | Needless Links + Surplus | `apps/web`, `packages/ai`, `apps/worker`, `plugins/*` | Deletes zero-logic pass-through service barrels (`chat-ai.ts`, `settings/domain.ts`, `journal/coach.ts`, `packages/ai/src/barrels/*`, 1-line `log.ts` files) and merges single-caller micro-files (`chat-top-bar`, `segmented`, `event-card`, `run-context`, `candle-flush`) back into cohesive modules. |
| **R12** | **Flatten stacked retry loops, remove Vitest mock checks from prod code, and fix silent `catch {}` blocks** | Special Cases + Tests | `packages/ai`, `apps/worker`, `apps/web`, `plugins/*` | Prevents 6–16x compounding LLM retry storms (`retry.ts:119-125` + `attempt.ts` + `specialist-runner` + workflow retries), removes `.mock.calls` inspection from `storage/shared.ts:58-73`, and fixes tests that read source files with `fs.readFileSync` or pin broken timeout behavior (`runner-lock.test.ts:141`). |

---

## 2. Complete Decision Log (First-Principles Fixes Above Exact `file:line` Problems)

### R1. Unify `xauusdExtension` and `genericMacro` into One `packet.macro` Schema
- `packages/ai/src/mastra-v2/packets/research-packet-macro/xauusd-assemble.ts:46-152`, `generic-assemble.ts:49-156`, and `fetch.ts:59-127` maintain two parallel macro fetchers and assemblers for `XAUUSD` vs. the other 17 symbols.
- `packages/ai/src/mastra-v2/packets/symbol-research/schemas.ts:70-96, 108-109` and `collect.ts:55-98, 125-135, 226-267` branch on `args.symbol === 'XAUUSD'` to populate either `packet.xauusdExtension` or `packet.genericMacro`.
- **[Bug]** `packages/ai/src/committee/grounding.ts:74-88` (`packetEvidenceValues`) extracts grounding numbers from `packet.xauusdExtension` but never extracts numbers from `packet.genericMacro` (`events`, `news`, `cot`).
- **[Bug]** `packages/ai/src/tools/convene-committee/verdicts.ts:87` computes `const macroEventsCount = packet.xauusdExtension?.events?.length ?? 0;`, ignoring `packet.genericMacro?.events` for all 17 non-`XAUUSD` instruments.
- **[Bug]** `packages/ai/src/memory/memory-index/remember-regime.ts:126` reads `const macro = packet.xauusdExtension;`, ignoring `packet.genericMacro`.
- **[Bug]** `apps/web/src/components/chat/parts/mastra-report-schema.ts:29` and `mastra-report.tsx:98` lock `MastraReportPart` to `symbol: z.literal('XAUUSD')` and `regionLabel="Verified XAUUSD report"`.
- `packages/ai/src/mastra-v2/mutation/level-sanity.ts:116` hardcodes `const pipFloor = symbol === 'XAUUSD' ? 5.0 : pipSize(symbol) * 10;`.

### R2. Persist or Inject `NoiseState`, Unify Alert Simulation with `specFromRule`, and Consolidate Notification/Email Helpers
- **[Bug]** `packages/ai/src/alerts/delivery/noise.ts:49` executes `const state = new InMemoryNoiseState();` inside `evaluateAlertNoise` on every alert delivery call, making deduplication and cooldowns a no-op in production.
- `packages/ai/src/alerts/simulate.ts:76-131` (`simulateAlert`) re-implements `priceCross`, `candleClose`, and indicator threshold comparisons inline instead of calling `specFromRule(rule)` (`packages/ai/src/alerts/spec.ts:135-137`).
- `packages/ai/src/alerts/rule-registry.ts:114-137` registers dead `describe` callbacks on 4 rule plugins that `describeRule` (`line 105`) never calls.
- `packages/ai/src/notifications/noise-state.ts:38-87` (`getNoiseConfig`/`saveNoiseConfig`) and `:89-137` (`getRouteConfig`/`saveRouteConfig`) copy-paste the same JSONB read-modify-upsert on `schema.userSettings.notificationPreferences`.
- `packages/ai/src/alerts/delivery/adapters.ts:43-102` (`deliverEmail`) and `direct.ts:44-69` (`sendDirectNotification`) duplicate the Resend HTTP `fetch` call.
- `packages/ai/src/alerts/evaluator/bars.ts:21-32`, `readings.ts:246-253`, and `mastra-v2/tools/canonical/candles.ts:88-95` implement the backward closed-bar scan 3 times.

### R3. Unify Chat Mutation Confirmations & Route Confirmations Through Domain Services
- `packages/ai/src/mastra-v2/workflows/mutation.ts:38-55` (stateful Mastra workflow) and `packages/ai/src/plugins/mastra-tools.ts:53-89` (stateless `_ui: 'plugin-tool-confirm'`) maintain two separate confirmation systems.
- `apps/web/src/lib/services/chat/mutation-executors.ts:105-137` bypasses `createAlertService` and `createJournalEntryService` with raw `db.insert(...)` queries.
- `packages/ai/src/mastra-v2/mutation/mutation-detect.ts:32-41` duplicates `BROAD_MUTATION_TERMS` (`routing/keywords.ts:151-152`), and `mutation-extract.ts:69-100` duplicates `MutationInputSchema` (`workflows/mutation-schemas.ts:36-78`).

### R4. Collapse `single-workflow/` and `comparison-workflow/` into One N-Symbol Committee Pipeline
- `packages/ai/src/committee/single-workflow/*` (7 files) and `comparison-workflow/*` (7 files) mirror the exact same 4-step workflow.
- `packages/ai/src/committee/synthesizer/synthesis.ts:61-147` and `comparison.ts:39-131` duplicate fusion synthesis, repair retry, and cost recording.
- `packages/ai/src/committee/fusion-verifier.ts:52-88` and `:96-138` duplicate fusion verification.

### R5. Unify Canonical Chat Post-Processing & Route `reviewTrade` / `getCoachInsights` Through `runMastraBackgroundText`
- `packages/ai/src/mastra-v2/agents/canonical/chat.ts:88-274` and `stream.ts:96-326` duplicate `openCanonicalAttempt` and 135 lines of post-generation evidence checking, self-correction, cost calculation, and telemetry.
- `packages/ai/src/journal/coach-insights.ts:183-344` and `review.ts:116-231` duplicate budget reservation, telemetry, and cost reconciliation.
- **[Bug]** `packages/ai/src/journal/coach-insights.ts:186` and `review.ts:119` parse `modelId.includes(':') ? modelId.split(':')[0]! : 'google'` instead of splitting on `'/'`.

### R6. Collapse Dual Web Mutation Paths, Unify Model Validation, and Fix RLS Scope Bugs
- Dead Server Actions with zero callers: `apps/web/src/app/(app)/alerts/actions.ts:56-101` (`toggleAlertAction`, `deleteAlertAction`), `apps/web/src/app/(app)/settings/_actions/preferences-symbols.ts:48-119` (`addSymbolAction`, `removeSymbolAction`), and `apps/web/src/app/(app)/settings/_actions/models.ts:38-73` (`updateChatModelAction`, `clearChatModelAction`).
- **[Bug]** `apps/web/src/app/(app)/settings/_actions/security-two-factor.ts:238` calls `await createAuditLog(session.user.id, '2fa_disabled')` outside `withUserTenant(session.user.id, ...)`.
- **[Bug]** `apps/web/src/app/api/settings/embedding-model/route.ts:62-114` and `vision-model/route.ts:62-115` omit the BYOK key ownership check (`403`) and strip the first `/` segment from OpenRouter model IDs.
- **[Bug]** `apps/web/src/app/onboarding/actions.ts:238-243` catches a failed SQL statement inside an open PostgreSQL transaction without `SAVEPOINT` or rethrowing.

### R7. Unify `/api/cron/*`, `apps/worker/src/jobs/*`, and the 3 Worker Job Runners
- `apps/worker/src/scheduler/job-runtime.ts:144-273`, `plugin-jobs.ts:94-174`, and `runner/cli.ts:55-145` implement 3 separate copies of job execution lifecycle.
- **[Bug]** `apps/worker/src/runner/cli.ts:76-81` aborts `ac.signal` on timeout without racing a timeout rejection promise.
- `apps/worker/src/scheduler/skip-daily-lock.ts:28-32` hardcodes `SKIP_DAILY_LOCK` in a separate file instead of reading `lock: 'daily' | 'none'` on `JOBS`.
- **[Bug]** `apps/web/src/lib/services/cron-jobs.ts:79` calls `pruneMastraStorage()` with no arguments (a silent no-op).

### R8. Share Backtesting/Paper-Trading Execution Kernel & Deduplicate Plugin Route/Tool Handlers
- `plugins/paper-trading/src/strategy-parity.ts:24-97` and `strategy-runner.ts:59-340` re-implement signal defaults, trailing distance math, and exit/flip rules from `plugins/backtesting/src/engine/simulator/{loop,entries}.ts`, and encode `[run:${run.id}] [maxBars:${maxBars}]` into free-text `notes`.
- `plugins/backtesting/src/services/sweep-service.ts:51, 61-71` smuggles `trainRatio` into JSONB `baseParams` under `'__trainRatio'`.
- `plugins/backtesting/src/engine/sandbox/driver.ts:62-125` and `output.ts:58-129` normalize the same 13 `StrategySignal` fields twice.
- `plugins/{backtesting,paper-trading}` duplicate `errorResponse`/`wrap`, Drizzle table column builders, `normaliseSettings`, UI formatters, and route/tool handlers.

### R9. Unify `MarketDataProvider` HTTP Transport, Symbol Metadata, and UI Price/Time Formatting
- `packages/data/src/providers/{biquote/rest/call,finnhub/rest,binance/rest,marketaux/rest,fred/rest,cftc/rest}.ts` contain 7 copies of HTTP fetch + timeout + throttle + 429 handling, with `marketaux/rest.ts:127-135` and `fred/rest.ts:95-103, 205-213` misclassifying caller `AbortSignal` cancellation as `'PROVIDER_TIMEOUT'`.
- `apps/web/src/app/(app)/settings/_components/symbols/sortable-symbol-row.tsx:53`, `verify-call.tsx:79`, `get-session-levels.tsx:92`, `replay-setup.tsx:82-83`, `compute-position-health.tsx:74-75`, and `analyze-technical.tsx:141-160` hardcode `.toFixed(2)`, `.toFixed(5)`, or `symbol === 'XAUUSD' ? 2 : 5`.

### R10. Clean Up `@kestrel/db` TLS Duplication, `@kestrel/shared` Helpers, and Dead Exports
- `packages/db/src/connection/pools.ts:113-165`, `queue/index.ts:45-71`, and `drizzle.config.ts:34-80` duplicate SSL resolution (and 2 copies of the 22-line `SUPABASE_ROOT_CA_2021` PEM).
- `packages/shared/src/crypto/encryption.ts:81-130, 207-249` duplicates AES-256-GCM; `bug-report.ts:135-150` and `logger/errors.ts:26-42` duplicate `parseStack`.
- Dead exports: `checkAndIncrementDailyQuota`, `tryReserveDaily`, `updateUserApiKeys`, `getNextDisplayOrder`, `listActiveSymbols`, unused cache TTLs/keys, `fetchCalendarUpcoming`, `getDeprecatedEnvAliases`, `withVaultSecrets`.

### R11. Remove Pass-Through Service Facades & Re-Consolidate Shattered Micro-Files
- Zero-logic pass-through barrels in `apps/web/src/lib/services/{chat-ai.ts,settings/domain.ts,journal/coach.ts}`, `packages/ai/src/barrels/*`, and six 1-line `log.ts` files in `packages/ai`.
- `apps/web/src/components/chat/chat-top-bar/types.ts:22-26` declares 5 dead props (`analysisMode`, `onAnalysisModeChange`, `chatModel`, `onChatModelChange`, `modelSelectionPending`) passed by `chat-screen.tsx:110-114` and never read by `ChatTopBar`, plus duplicate `splitMode`/`viewsOpen` props.

### R12. Flatten Stacked Retry Loops, Remove Test-Mock Checks from Production Code, and Clean Up Tests
- `packages/ai/src/committee/specialist-runner/runner.ts:151, 201` + `single-workflow/specialist-steps.ts:36` + `workflow.ts:99` stack 4 retry layers (up to 16 attempts).
- `packages/ai/src/mastra-v2/storage/shared.ts:58-73` inspects Vitest `.mock.calls` in production code.
- `packages/ai/test/alerts-delivery.test.ts:504-530` uses `readFileSync` to grep source files; `apps/worker/test/runner-lock.test.ts:141` asserts `exitCode === 0` on a timed-out job.
