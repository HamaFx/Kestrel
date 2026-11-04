# Kestrel — Complete End-to-End Architecture & Product Audit (2026-11-04)

**Date:** 2026-11-04
**Repository:** `/data/home/Kestrel` (`main` @ `6378e2c2`)
**Scope:** Full 13-package monorepo (`apps/web`, `apps/worker`, `packages/ai`, `packages/db`, `packages/data`, `packages/indicators`, `packages/plugin-sdk`, `packages/shared`, `packages/config`, `packages/test-utils`, `plugins/backtesting`, `plugins/paper-trading`, `plugins/telegram-bot`, plus `scripts/*`, `docker/*`, `loadtest/*`, and `docs/*`).
**Companion Action Roadmaps:**
- [`docs/roadmaps/phase5-security-and-functional-bug-fixes.md`](../roadmaps/phase5-security-and-functional-bug-fixes.md)
- [`docs/roadmaps/phase6-ai-worker-and-data-unification.md`](../roadmaps/phase6-ai-worker-and-data-unification.md)
- [`docs/roadmaps/phase7-web-state-tooling-and-debloat.md`](../roadmaps/phase7-web-state-tooling-and-debloat.md)

---

## 1. Executive Summary & Overall Scorecard

Kestrel has evolved through ~1,200+ commits and seven major build-and-prune cycles into an **8.3 / 10** self-hosted, multi-user Bring-Your-Own-Key (BYOK) AI trading research and forward-testing platform for Gold (`XAUUSD`), 11 Forex pairs, and 6 Crypto pairs.

Following the completion of Phases 1–4 (`bc289984`) and the 80% low-value test purge (`a3ee77f4` → `6378e2c2`), the worst historical bloat—multi-gateway billing (Stripe/Verifone/NOWPayments), JEV SystemOne, 8-call Critique/Debate committee loops, Brier score 1m-candle grading, heuristic Smart Money Concepts (SMC) detectors, `@kestrel/plugin-custom-agents`, `full_analysis_queue`, and `persistence_outbox`—has already been excised.

However, a ground-up code audit across all 13 workspace packages reveals **three categories of remaining technical debt and concrete bugs**:
1. **Concrete Security & Functional Bugs (P0/P1):**
   - A critical authorization hole in `plugins/telegram-bot/src/bot/runner.ts:189-248` where `handleTelegramUpdate` never verifies `String(chatId) === String(install.settings.linkedChatId)` for non-`/start` commands.
   - Foreign-key crashes in Telegram `/ask` and `/analyze` (`plugins/telegram-bot/src/bot/ai-commands/{ask,analyze}.ts`) because `appendUserMessage` is called with a deterministic `threadId` before creating the `chat_threads` row.
   - Broken BYOK memory embeddings in `packages/ai/src/memory/memory-index/upsert.ts:62-75` when `rememberJournalEntry` or `rememberBriefing` omits `userSettings`.
   - A 100,000x cash PnL inflation bug on open crypto trades in `apps/web/src/app/(app)/journal/_components/entry-row/use-entry-metrics.ts:30`, a nested double-modal in `import-trades.tsx`, a missing Web Push checkbox in `alert-delivery-fields.tsx`, and an unsupported `indicatorCross` preview in `apps/web/src/lib/services/alerts.ts:199`.
   - An IPv4-mapped IPv6 SSRF bypass (`[::ffff:127.0.0.1]`) in `packages/shared/src/runtime/safe-url.ts:62-70` and an overly broad `h|m|d` proximity exemption in `packages/ai/src/committee/grounding.ts:17-18`.
2. **Split Architectures & Unfinished Unifications:**
   - **Two competing chat confirmation systems:** A ~1,100-LOC stateful Mastra suspend/resume workflow (`packages/ai/src/mastra-v2/workflows/mutation.ts`) for core mutations (`set_alert`, `log_journal`, `share_snapshot`, `run_system_action`) vs. stateless inline `_ui` confirmation cards (`packages/ai/src/plugins/mastra-tools.ts`) for plugin write tools.
   - **Two competing UI mutation mechanisms:** Overlapping Next.js Server Actions (`actions.ts`) and REST API routes (`/api/alerts/*`, `/api/journal/*`) for the same resources.
   - **Split state between `localStorage` and PostgreSQL:** Dashboard `WatchlistWidget` ignores the database `user_symbols` table, and `PreSessionChecklistDrawer` (`use-session-gameplan.ts`) traps the trader's daily `maxDailyR` and session rule in `localStorage` where the AI Risk Governor and AI Coach cannot read them.
   - **Worker vs. Web Cron Divergence:** `apps/web/src/app/api/cron/*` exposes 14 routes while `apps/worker` schedules 7 core jobs, leaving `news` refresh and `verificationToken` cleanup (`cleanup-tokens`) unscheduled in Docker Compose deployments.
3. **AI-Guardrail & Tooling Over-Engineering:**
   - `scripts/check-maintainability.mjs` (`<= 250 LOC .tsx`, `<= 4 useState`, `<= 2 useEffect`) forced 158 cohesive components to be mechanically shattered into 6–11 micro-files (+15% to +50% LOC inflation from prop/import boilerplate).
   - ~40% of `apps/web/src/lib/services/**` (`chat-ai.ts`, `settings/domain.ts`, `journal/coach.ts`) are 1-line pass-through re-exports created solely because Oxlint bans `app/api/**` from importing `@kestrel/db` or `@kestrel/ai`.
   - Global `"customConditions": ["source"]` in `packages/config/typescript/base.json` requires monkey-patching `eventsource-parser` (`patches/eventsource-parser@3.1.1.patch`), and dead ESLint v10 packages remain installed in `packages/config/package.json`.

### Component Scorecard

| Domain / Package | Rating | Primary Strengths | Primary Weaknesses & Action Items |
| :--- | :---: | :--- | :--- |
| **Authentication & Security (`apps/web/src/auth*`, `proxy.ts`)** | **9.2 / 10** | Split Edge/Node NextAuth v5 config, `first_user` atomic admin lock, AES-256-GCM 2FA + bcrypt backup codes, 60s in-memory session validation throttle, HMAC-signed `x-user-id-sig`. | `safe-url.ts` misses `::ffff:` IPv4-mapped IPv6 literals; `src/lib/auth/session.ts` is a misplaced market-hours helper. |
| **Market Data & Indicators (`packages/data`, `packages/indicators`)** | **9.0 / 10** | Zero-key BiQuote + Binance adapters, multi-symbol batching (`GET /api/latest`), health-scored failover, `priceAgeSeconds` staleness envelopes, pure O(N) indicator math. | BiQuote lacks `1w` candles (fails without Finnhub key); `computeIndicator` blocks plugin indicators via closed `IndicatorKindSchema`; session hours split across 3 packages; 3-symbol hardcoding in `marketaux/map.ts`. |
| **Plugin System (`packages/plugin-sdk`, `plugins/*`)** | **8.9 / 10** | Clean server/UI bundle split (`PluginHost` vs. `PluginUiRegistry`), per-user prompt hygiene, QuickJS WASM backtester (`9.3/10`), live `TickBus` paper broker (`9.1/10`). | Critical missing `linkedChatId` auth check in `telegram-bot/src/bot/runner.ts:198`; FK crash in `/ask` and `/analyze`; `paper-trading` slices users before checking `isWatched()`; hardcoded plugin regexes in `packages/ai/src/plugins/intent.ts`. |
| **AI Engine (`packages/ai`)** | **8.8 / 10** | True parallel 4-desk committee, post-generation numeric/freshness grounding (`evidence.ts`, `verifier.ts`), integer-cent budget reservations, hybrid HNSW + FTS + RRF RAG. | Unbilled/redundant `routeTurn` LLM call on non-chat routes; `upsertMemory` omits BYOK `userSettings`; `convene_committee` runs nested 5-LLM workflow inside chat; sub-half-cent turns round to `0` cents; dual confirmation systems. |
| **Web Application & Flows (`apps/web`)** | **8.7 / 10** | Unified `KestrelChatTransport` SSE adapter, virtualized journal list, MFE/MAE `SetupReplayModal` with 55-bar warmup, `AutoZodSettingsForm`, 13-tab Admin cockpit. | Crypto `contractSize = 100000` bug in Journal; double modal in `import-trades.tsx`; missing Web Push checkbox + indicator preview in Alerts; Dashboard watchlist/gameplan stuck in `localStorage`; 40% pass-through service shims. |
| **Database & RLS (`packages/db`)** | **8.5 / 10** | 55 tables, `kestrel_app` (`NOBYPASSRLS`) + `hamafx_admin` (`BYPASSRLS`), `AsyncLocalStorage` tenant scoping (`withUserTenant`), `migration-plan.ts` preflight verifier. | Extra DB round-trip in `requireTenantIdForUser` for 1:1 personal orgs; 5 dead columns (`monthly_budget_limit`, `provider_spending_thresholds`, `spend_alerts_*`, `n_data_symbol`); unused `createPluginTable` and `listAllUserSettings`. |
| **Background Worker (`apps/worker`)** | **8.4 / 10** | Consolidated to 7 core jobs + 3 plugin jobs + 3 `pg-boss` queues, durable 1m candle flush rig, busy-vs-wedged `:8081/health/*` endpoints, `TenantRouter` partitioning. | Worker omits `news` ingestion and `verificationToken` cleanup (`cleanup-tokens`); web `/api/cron/cleanup-telemetry` omits budget recovery and Mastra pruning; `WORKER_ENABLE_TICK_STREAM=0` leaves ~1,800 LOC dormant by default. |
| **Tooling, Scripts & Infra (`scripts/*`, `docker*`, `docs/*`)** | **6.5 / 10** | Fast `oxlint` + `oxfmt` + `lefthook` + `check-all-guards.mjs`; SHA256-pinned multi-stage Dockerfiles; verified `pg_restore --list` backup sidecar. | `check-maintainability.mjs` caused severe component fragmentation; missing `# syntax=docker/dockerfile:1.7` breaks Cloud Build; bugs in `verify-production.mjs`, `merge-coverage-summary.mjs`, `dev.ts`, `create-plugin.mjs`; doc drift in `README.md` & `DEPLOY.md`. |

---

## 2. Complete Monorepo Package & Architecture Map

```text
/data/home/Kestrel/
├── apps/
│   ├── web/                        # Next.js 16.4.2 App Router, Auth.js v5, SSE Chat, Studio, Journal, Admin
│   └── worker/                     # Node.js daemon: node-cron scheduler, pg-boss workers, SignalR/Binance WS
├── packages/
│   ├── shared/                     # Leaf package: 18-symbol catalog, Zod schemas, AES-256-GCM, safe-url, Pino
│   ├── db/                         # Drizzle ORM (47 core tables), 124 migrations, Postgres RLS, pg-boss queue
│   ├── indicators/                 # Pure O(N) TA math (SMA, EMA, RSI, ATR, MACD, BB, Pivots) + Swings/Sessions
│   ├── data/                       # Market data adapters (BiQuote, Binance, Finnhub, FRED, CFTC, Marketaux)
│   ├── plugin-sdk/                 # Server PluginHost + client PluginUiRegistry + Zod secret encryption
│   ├── ai/                         # Mastra v2 engine, 4-desk committee, tools, hybrid RAG, integer-cent budget
│   ├── config/                     # Shared TypeScript base configs (plus legacy ESLint config to prune)
│   └── test-utils/                 # Candle factories, mock tool context, Postgres TEMPLATE DB cloner
├── plugins/                        # @kestrel/plugins discovery barrel (registry.ts + ui-registry.ts)
│   ├── backtesting/                # QuickJS WASM bar-by-bar simulator, 33 TA features, parameter sweeps
│   ├── paper-trading/              # Dual-account virtual broker, live TickBus fill engine, live strategy runner
│   └── telegram-bot/               # Per-user BotFather wizard, signed webhook, commands, daily briefings
├── docker/                         # Postgres init-admin-role.sh, backup/restore sidecar scripts
├── scripts/                        # 24 static guardrails, migration preflight, setup wizard, deploy helpers
└── loadtest/                       # k6 load-testing suite (smoke-all.ts + scenario modules)
```

---

## 3. Subsystem-by-Subsystem Evaluation (The 8 Critical Questions)

### 3.1 AI Engine (`packages/ai`)

#### A. Mastra Orchestration & Unified Planning (`src/mastra-v2/instance.ts`, `src/mastra-v2/planning/*`, `src/routing/*`)
1. **What is it & how does it work?**
   - `createKestrelMastra()` (`src/mastra-v2/instance.ts:90-130`) initializes the process-wide Mastra instance (`workers: false` on web).
   - `routeUnified()` (`src/mastra-v2/planning/router.ts:88-145`) runs deterministic regex checks (`detectInstalledPluginIntent`, `isInjectionAttempt`, `classifyMutationRequest`), calls `decideMastraExecution()` (`execution-decision.ts:86-184`), and emits an immutable `ExecutionPlan` (`execution-plan.ts:36-89`) selecting `'canonical-chat'`, `'symbol-research'`, `'multi-symbol-research'`, or `'mutation-draft'`.
2. **Why was it built?** Eliminates routing drift between `/api/chat`, the planner, and the agent setup.
3. **Is it implemented correctly?**
   - **Defect 1 (Unbilled & Redundant LLM Call):** `decideMastraExecution()` (`execution-decision.ts:89-94`) calls `routeTurn()` (which invokes `classifyTurnLLM` when `AI_SEMANTIC_ROUTING_ENABLED !== 'false'`) *before* checking if the route is `symbol-research`, `multi-symbol-research`, or `mutation-draft` (where the semantic domain is ignored), and omits the `accounting` callback—so semantic routing LLM calls inside `routeUnified` are never recorded in `generationLedger`.
   - **Defect 2 (Comparison Mode Drops `full` Mode):** `runResearchWorkflow()` (`apps/web/src/lib/services/mastra/chat/mastra-execution.ts:108`) hardcodes `mode: 'single'` for multi-symbol comparisons, and `createComparisonCommitteeWorkflow` (`packages/ai/src/committee/comparison-workflow/workflow.ts:55-59`) only runs `['technical']` (plus `'risk'` if `ENABLE_COMPARISON_RISK_DESK=1`).
4. **Is it the right approach?** Yes, once `classifyTurnLLM` is restricted to `canonical-chat` turns and wired to `generationLedger`.
5. **Does it provide enough value?** Yes.
6. **Is it over-engineered?** Slightly: `router.ts` → `execution-decision.ts` → `execution-routes.ts` → `execution-plan.ts` is 4 files for a single routing decision.
7. **Verdict:** **Keep & Simplify** (see Phase 6, Task 6.1).
8. **Dependencies:** `apps/web/src/app/api/chat/route.ts` and `mastra-execution.ts`.

#### B. 4-Desk Committee, Specialist Runner, Opinion History & Fusion (`src/committee/*`, `src/tools/convene-committee/*`)
1. **What is it & how does it work?**
   - `createSingleCommitteeWorkflow` (`src/committee/single-workflow/workflow.ts:51-99`) runs 4 steps: `collect-packet` (30s cached `SymbolResearchPacket` + user paper-position enrichment) → `parallel(specialistSteps)` (`technical`, `fundamental`, `risk`, `sentiment` with `readOnlyMemoryOptions` and structured `OpinionSchema`) → `verify` (strict 4-of-4 hard gate throwing `MastraModeStrictFailureError` if any desk fails) → `fusion` (`FusionAnswerSchema` with 1 repair retry).
   - `saveAgentOpinionsBestEffort` (`src/committee/opinion-history.ts:62-139`) persists per-desk opinions to `agent_opinions`.
2. **Why was it built?** Prevents single-LLM sycophancy by isolating specialist desks before conflict-aware synthesis.
3. **Is it implemented correctly?**
   - **Defect 1 (No Multi-Provider Failover on Specialist Desks):** `runSpecialistGeneration` (`src/committee/specialist-runner/runner.ts:144-146`) retries twice on the *same* model (`withRetry`), but never calls `runWithModelFallback`. Because Full mode is strict 4-of-4, a single provider `429` aborts the entire committee turn even when the user has fallback providers configured.
   - **Defect 2 (`agent_opinions` Multi-Symbol Collision):** `opinion-history.ts:126-128` uses `ON CONFLICT (message_id, agent_name) DO NOTHING`. In a 2-symbol comparison (`XAUUSD` vs `EURUSD`), the second symbol's `technical` opinion collides on `(message_id, 'technical')` and is silently dropped.
   - **Defect 3 (Nested Committee Inside `convene_committee` Tool):** `runLlmCommittee` (`src/tools/convene-committee/committee-run.ts:69-117`) spawns an entire 4-specialist + 1-fusion `runMastraMode({ mode: 'full' })` run inside a single tool call of `canonical-chat`, and if it times out, `catch` (`line 107`) silently swallows the error and returns a heuristic fallback while still billing the failed LLM calls.
4. **Is it the right approach?** The 4-step committee workflow is excellent; `convene_committee` inside normal chat should not spawn a nested 5-LLM workflow.
5. **Does it provide enough value?** Core product differentiator.
6. **Is it over-engineered?** No (after Phase 2 removed Critique/Debate and JEV).
7. **Verdict:** **Keep & Fix** (see Phase 6, Task 6.1).
8. **Dependencies:** `mastra-mode.ts`, Telegram `/analyze`, and `convene_committee`.

#### C. Citation, Freshness & Numeric Grounding (`src/mastra-v2/agents/canonical/evidence.ts`, `freshness.ts`, `src/committee/verifier.ts`, `grounding.ts`)
1. **What is it & how does it work?**
   - `freshness.ts` walks tool outputs up to depth 6, partitioning numbers into `fresh` (`ageSeconds <= 60` for prices) and `stale`.
   - `checkCanonicalEvidence()` (`evidence.ts:144-191`) and `verifyMastraOpinion()` / `verifyFusionAnswer()` (`verifier.ts`, `fusion-verifier.ts`) verify that every market number in the LLM's output matches a `fresh` tool/packet value within `±0.5` and enforces stale/degraded data disclosure (rejecting negated phrases like `"not stale"` via `NEGATED_DISCLOSURE_PATTERN`).
2. **Why was it built?** Stops hallucinated prices and undisclosed stale quotes.
3. **Is it implemented correctly?**
   - **Defect (`SCENARIO_PROJECTION_TERMS` Loophole):** In `packages/ai/src/committee/grounding.ts:17-18`, the regex `/\b(?:target|...|h|m|d|min|hour|day|ratio|rr)\b/i` includes bare single letters `h`, `m`, `d`. `hasScenarioProjectionContext()` (`grounding.ts:124-136`) exempts any number within 24 characters of a match—so `"On the 1h chart price is 3912.45"` exempts `3912.45` from grounding verification!
4. **Is it the right approach?** Yes—zero-token deterministic verification is far superior to LLM-as-judge on the hot path.
5. **Does it provide enough value?** High value.
6. **Is it over-engineered?** No.
7. **Verdict:** **Keep & Fix Regex** (see Phase 5, Task 5.4).
8. **Dependencies:** All chat and committee synthesis paths.

#### D. Mutation Workflows vs. Inline Confirmation Cards (`src/mastra-v2/workflows/mutation.ts`, `src/mastra-v2/mutation/*`, `src/services/resonance-sync.ts`)
1. **What is it & how does it work?**
   - Core mutations (`set_alert`, `log_journal`, `share_snapshot`, `run_system_action`) run through a separate Mastra suspend/resume workflow (`mutation.ts`) with an LLM JSON extractor (`mutation-extract.ts`), a 10x/50x ATR/price volatility band check (`level-sanity.ts`), and an HMAC confirmation token (`tokens.ts`).
   - Plugin write tools (`paper_place_order`, etc.) run inline inside `canonical-chat` (`src/plugins/mastra-tools.ts:91-139`), returning a `_ui: { kind: 'plugin-tool-confirm' }` envelope confirmed via `/api/plugins/[pluginId]/tools/[toolId]/confirm`.
   - `syncIntermarketResonance` (`src/services/resonance-sync.ts:69-227`) computes a 45-day OLS linear regression between FRED 10Y real yields (`DFII10`) and `XAUUSD` daily closes.
2. **Why was it built?** Human-in-the-loop safety before mutating user state.
3. **Is it implemented correctly?**
   - **Defect:** Confirming `log_journal` in `apps/web/src/lib/services/chat/mutation-executors.ts:95-115` inserts directly into `schema.journalEntries` without calling `rememberJournalEntry()`, so chat-logged journal entries are never indexed into `memory_embeddings`.
   - Dead code: `packages/ai/src/mastra-v2/mutation/mutation-policy/gates.ts:119-128` checks `pluginWriteTool`, which is never reached because plugins bypass `mutation.ts`.
4. **Is it the right approach?** `level-sanity.ts` and `resonance-sync.ts` are great; maintaining two separate confirmation architectures is unnecessary duplication.
5. **Does it provide enough value?** Confirmation cards + level sanity checks do; the 1,100-LOC Mastra suspend/resume wrapper is over-engineered.
6. **Is it over-engineered?** Yes (`workflows/mutation*` + `mutation/*`).
7. **Verdict:** **Keep `level-sanity.ts` and `resonance-sync.ts`; fix `mutation-executors.ts` memory indexing** (Phase 5, Task 5.3).
8. **Dependencies:** `/api/chat/mutations/confirm` and `MutationConfirmationCard`.

#### E. Hybrid Memory, pgvector RAG, Budget Reservations & BYOK Routing (`src/memory/*`, `src/models/rag/*`, `src/budget/*`, `src/models/*`)
1. **What is it & how does it work?**
   - `runRagQuery` (`src/models/rag/search.ts:34-70`) combines `pgvector` HNSW (`ef_search = 200`, `iterative_scan = 'relaxed_order'`) and PostgreSQL FTS (`websearch_to_tsquery`) via Reciprocal Rank Fusion (`RRF_K = 60`), exponential time decay, and prompt-injection snippet screening.
   - `tryReserveBudget` (`src/budget/budget-reservations.ts:52-135`) atomically increments `daily_ai_spend` in integer cents (`WHERE total_usd_cents + est <= cap`) and reconciles actual spend under `SELECT ... FOR UPDATE`.
   - `circuit-breaker.ts` + `model-fallback.ts` manage L1 + Postgres `provider_circuit_state` across 11 BYOK providers.
2. **Why was it built?** Personalized longitudinal recall, strict daily spend caps, and multi-provider resilience.
3. **Is it implemented correctly?**
   - **Defect 1 (Broken BYOK Embeddings in `upsertMemory`):** In `packages/ai/src/memory/memory-index/upsert.ts:62-75`, when `rememberJournalEntry` or `rememberBriefing` calls `upsertMemory()` without passing `userSettings`, `embedTexts()` only checks server environment variables (`envFallbackKeys`), failing with `'embed_failed'` for BYOK users!
   - **Defect 2 (Sub-Half-Cent Turns Reconcile to `0` Cents):** In `packages/ai/src/budget/budget-reservations.ts:174`, `const actualCents = Math.max(0, Math.round(actualUsd * 100))` rounds any turn costing `< $0.005` to `0` cents, releasing the 1-cent reservation back to `0` so cheap flash-model turns never increment `daily_ai_spend`.
   - **Defect 3 (`envFallbackKeys` Ignores `env` Arg):** `packages/ai/src/models/helpers.ts:62-97` reads `process.env` directly for 10 of 11 providers instead of the passed `env` object.
4. **Is it the right approach?** Yes.
5. **Does it provide enough value?** Very high value.
6. **Is it over-engineered?** No.
7. **Verdict:** **Keep & Fix the 3 bugs** (Phase 5 Task 5.3 & Phase 6 Task 6.1).
8. **Dependencies:** All AI turns, journal CRUD, and briefing generation.

---

### 3.2 Plugin SDK & Bundled Plugins (`packages/plugin-sdk`, `plugins/*`)

1. **What is it & how does it work?**
   - `@kestrel/plugin-sdk` provides `PluginHost` (`packages/plugin-sdk/src/host/plugin-host.ts`, server/worker capabilities) and `PluginUiRegistry` (`src/ui/registry.ts`, React pages, dashboard widgets, chat tool cards), backed by `user_installed_plugins` (with automatic AES-256-GCM encryption for `.meta({ secret: true })` Zod fields) and `plugin_storage`.
   - **3 Bundled Plugins:**
     - `@kestrel/plugin-backtesting` (`plugins/backtesting`): 3 tables (`plg_backtesting_runs`, `strategies`, `sweeps`), 15 tools, 33 precomputed TA series, QuickJS WASM sandbox (`engine/sandbox/quickjs.ts`) with look-ahead offset guard (`offset > 0` throws), pessimistic bar-by-bar simulator, and `pg-boss` parameter sweeps.
     - `@kestrel/plugin-paper-trading` (`plugins/paper-trading`): 5 tables (`accounts`, `positions`, `orders`, `fills`, `strategy_runs`), 14 tools, dual accounts (`Personal Demo` in `confirm` mode vs. `AI Agent Sandbox` in `autonomous_sandbox` mode), sub-second `TickBus` matching (`tick.ts`), 1m fallback job (`market-watch.ts`), and live QuickJS strategy execution (`strategy-runner.ts`).
     - `@kestrel/plugin-telegram-bot` (`plugins/telegram-bot`): Per-user BotFather wizard, HMAC-signed + secret-header-verified webhook (`server/webhook.ts`), atomic `plugin_storage` update deduplication (`update-ledger.ts`), 14 commands, and timezone-aware daily briefings (`jobs/daily-briefing.ts`).
2. **Why was it built?** Per-user context-window isolation (uninstalled plugins add 0 tools/skills to the AI prompt) and strict worker-vs-browser bundle separation.
3. **Is it implemented correctly?**
   - **[P0 Security Bug] Missing `linkedChatId` Verification in Telegram Bot (`plugins/telegram-bot/src/bot/runner.ts:189-248`):** `handleTelegramUpdate()` sets `ctx.chatId = String(chatId)` (`line 199`) from the incoming Telegram message and never checks if `String(chatId) === String(install.settings['linkedChatId'])`! Any Telegram user who discovers a user's bot `@username` can send `/positions`, `/alert`, `/ask`, or `/analyze XAUUSD full` and the bot will execute against the owner's Kestrel account and reply to the stranger's `chatId`.
   - **[P1 Bug] Telegram `/ask` and `/analyze` Foreign-Key Crash (`plugins/telegram-bot/src/bot/ai-commands/ask.ts:81-87`, `analyze.ts:109-115`):** Both generate a deterministic UUID (`deterministicThreadId`) and call `appendUserMessage()` without creating the `chat_threads` row first. When the FK constraint fails, the `catch` block discards the completed AI response and replies `"Your question could not be processed right now"`.
   - **[P1 Bug] Paper Trading Worker Loops Slice Users Before Filtering by Active Positions (`plugins/paper-trading/src/tick.ts:89`, `jobs/market-watch.ts:36`):** Both slice `users.slice(0, MAX_USERS_PER_TICK)` (`250` / `100`) *before* checking `isWatched()`, starving active traders if earlier installed users have 0 open positions.
   - **[P2 Coupling] Hardcoded Plugin Regexes in Core AI (`packages/ai/src/plugins/intent.ts:28-84`)** and direct table import of `paperPositions` in `plugins/telegram-bot/src/bot/commands/shared.ts:20`.
4. **Is it the right approach?** Yes—keeping the Plugin SDK as an internal modular capability and bundle-splitting boundary is completely justified.
5. **Does it provide enough value?** Backtesting and Paper Trading are two of the highest-value features in Kestrel.
6. **Is it over-engineered?** Only `scripts/create-plugin.mjs` (which scaffolds broken legacy ESLint configs) is unnecessary.
7. **Verdict:** **Keep & Fix Bugs** (Phase 5 Tasks 5.1–5.2 & Phase 6 Task 6.2).
8. **Dependencies:** `apps/web`, `apps/worker`, `packages/ai`.

---

### 3.3 Database, Market Data, Indicators, Shared Core & Worker (`packages/db`, `data`, `indicators`, `shared`, `apps/worker`)

1. **What is it & how does it work?**
   - `packages/db`: 47 core + 8 plugin tables = 55 tables, 124 SQL migrations (`0000`–`0124`), `kestrel_app` (`NOBYPASSRLS`) + `hamafx_admin` (`BYPASSRLS`), `withUserTenant` / `withUserTenantRO` / `withAdminDb`, `migration-plan.ts`, and `pg-boss` queues.
   - `packages/data`: BiQuote, Binance, Finnhub, FRED, CFTC, Marketaux, `live-ticks`, and `candles-1m` adapters with health-scored failover (`src/failover.ts`), dual-tier cache (`MemoryCache` / `RedisCache`), and staleness metadata (`getPriceWithMeta`, `getCandlesWithMeta`).
   - `packages/indicators`: Pure O(N) indicators (`sma`, `ema`, `rsi`, `atr`, `macd`, `bollinger`, `pivots`) + `findSwings`, `computePdhPdl`, and `computeAsianRange`.
   - `packages/shared`: 18-symbol catalog (`BUILTIN_SYMBOLS`), Zod schemas, AES-256-GCM encryption (`encryption.ts`), SSRF guard (`safe-url.ts`), env schemas, and Pino logger.
   - `apps/worker`: 7 core cron jobs + 3 plugin cron jobs + 3 `pg-boss` queues + `:8081` health server + optional SignalR/Binance WebSocket streaming (`WORKER_ENABLE_TICK_STREAM`).
2. **Why was it built?** Provides multi-tenant RLS storage, zero-key market data, deterministic indicator math, and background job execution.
3. **Is it implemented correctly?**
   - **SSRF IPv4-Mapped IPv6 Gap (`packages/shared/src/runtime/safe-url.ts:62-70`):** `isPrivateHostname` does not block `::ffff:` (e.g., `[::ffff:127.0.0.1]` normalized by Node `URL` to `[::ffff:7f00:1]`) or `64:ff9b:`.
   - **Env Schema Drift (`packages/shared/src/env/schema/runtime.ts:144`, `infra.ts:27`):** `PHASE3_STRUCTURED_FUSION` defaults to `'0'` in `RuntimeEnv` vs `true` in `readFeatureFlag`; `CacheEnv` lists unused `UPSTASH_REDIS_REST_*` while omitting `REDIS_URL`.
   - **Weekly (`1w`) FX/Gold Candle Failure Without Finnhub (`packages/data/src/providers/biquote/map.ts:53`):** BiQuote doesn't serve `1w` bars, so requesting `1w` on `XAUUSD` without `FINNHUB_API_KEY` throws `NO_PROVIDER_AVAILABLE`.
   - **Closed `IndicatorKindSchema` in `computeIndicator` (`packages/indicators/src/registry.ts:238`):** Parses `kind` against the closed 7-item enum instead of `indicatorRegistry.get(kind)`.
   - **Worker vs. Web Cron Gaps:** Worker `retention` omits `lazyPurgeExpiredTokens()`; web `/api/cron/cleanup-telemetry` omits `recoverStaleBudgetReservations()` and `pruneMastraStorage()`; worker never schedules `news` refresh; web `/api/cron/briefings` omits `filterUserIds` for `WORKER_PARTITION`.
4. **Is it the right approach?** Yes.
5. **Does it provide enough value?** Essential backend foundation.
6. **Is it over-engineered?** Minor remnants: 5 dead DB columns (`monthly_budget_limit`, `provider_spending_thresholds`, `spend_alerts_config`, `spend_alerts_state`, `n_data_symbol`), unused `createPluginTable` and `listAllUserSettings`, orphaned `packages/shared/src/metrics-export/*`, and an extra DB query in `requireTenantIdForUser` for 1:1 personal orgs.
7. **Verdict:** **Keep, Harden & Unify** (Phase 5 Task 5.4 & Phase 6 Tasks 6.3–6.5).
8. **Dependencies:** All apps and packages.

---

### 3.4 Frontend Web Application & User Flows (`apps/web`)

1. **What is it & how does it work?**
   - Next.js 16.4.2 / React 19.3.1 application with `src/proxy.ts` (CSRF + CSP nonce + HMAC `x-user-id-sig`), `withAuth` API controllers (`src/app/api/**`), domain services (`src/lib/services/**`), and 9 user-facing areas: Auth (`/login`, `/register`, 2FA), Chat (`/chat/[threadId]`), Dashboard (`/dashboard`), Chart Studio (`/chart/[symbol]`), Journal (`/journal`), Alerts (`/alerts`), Calendar (`/calendar`), News (`/news`), Settings (`/settings/*` — 10 pages), and Admin (`/admin` — 13 tabs).
2. **Why was it built?** Provides an institutional dark-chrome trading workstation in the browser and PWA.
3. **Is it implemented correctly?**
   - **Journal Crypto `contractSize` Bug (`apps/web/src/app/(app)/journal/_components/entry-row/use-entry-metrics.ts:30`):** Uses `const contractSize = isCommodity ? 100 : 100000;`, inflating open `BTCUSDT` / `ETHUSDT` cash PnL by 100,000x.
   - **Journal `ImportTrades` Double Modal (`journal-view/index.tsx:206` + `import-trades.tsx:135`):** Renders a button that opens a fixed modal inside an already-open `<Drawer>`, and advertises `.xlsx,.html` on a CSV-only parser.
   - **Journal Ephemeral AI Coach/Review State (`ai-coach-card.tsx`, `ai-review-panel.tsx`):** Stores LLM critiques in local `useState` instead of React Query cache, losing output on tab switch, and uses raw `fetchCsrf` instead of `apiMutate`.
   - **Alerts Missing Web Push Option & Indicator Preview (`alert-delivery-fields.tsx:28`, `src/lib/services/alerts.ts:199`):** `AlertDeliveryFields` omits the `push` checkbox, and `previewAlertRuleService` returns `{ count: 0, unsupported: true }` for `indicatorCross`.
   - **Dashboard `localStorage` Desync (`widgets/watchlist-widget.tsx`, `use-session-gameplan.ts`):** `WatchlistWidget` ignores the `user_symbols` DB table, and the Pre-Session Gameplan is stored only in `localStorage`.
4. **Is it the right approach?** Yes, once `WatchlistWidget` and `useSessionGameplan` sync with the backend and mutations standardize on `apiMutate`.
5. **Does it provide enough value?** High user value across Chat, Journal, Dashboard, Settings, and Admin.
6. **Is it over-engineered?** ~40% of `src/lib/services/**` are 1-line pass-through barrels, and 158 components were over-fragmented into 6–11 micro-files by `scripts/check-maintainability.mjs`.
7. **Verdict:** **Keep, Fix Bugs & Consolidate** (Phase 5 Tasks 5.5–5.6 & Phase 7 Task 7.1).
8. **Dependencies:** `@kestrel/ai`, `@kestrel/db`, `@kestrel/data`, `@kestrel/indicators`, `@kestrel/plugin-sdk`.

---

### 3.5 Infrastructure, Docker, Scripts & Dependencies (`scripts/*`, `docker*`, `package.json`)

1. **Concrete Defects Verified in Scripts, Dockerfiles & Docs:**
   - `Dockerfile` and `Dockerfile.worker` are missing `# syntax=docker/dockerfile:1.7` on line 1, breaking Google Cloud Build on `COPY --link`.
   - `scripts/verify-production.mjs:122` probes `/health` on the worker, which only serves `/health/live`, `/health/ready`, and `/health/jobs` (or `/health` with bearer token, whereas `docker-compose.yml:206` uses `/health/live`).
   - `scripts/merge-coverage-summary.mjs:43` only scans `apps` and `packages`, omitting `plugins/*`.
   - `package.json:7` runs `tsx scripts/dev.ts` without `--env-file-if-exists=.env`, failing when `DATABASE_URL` is only in `.env`.
   - `scripts/predeploy-migrate.mjs:82` checks `DIRECT_URL` and `POSTGRES_URL_NON_POOLING` but omits `MIGRATION_DATABASE_URL` (which `DEPLOY.md:74,89` instructs users to set).
   - `README.md:274` tells users to set `DATABASE_URL=postgres://hamafx:...` (superuser, bypassing RLS) instead of `kestrel_app`, and `DEPLOY.md:148` falsely states `ENFORCE_BUDGET` is off by default.
   - `packages/db/package.json:45-46` defines dead `seed:plans` and `seed:billing` scripts pointing to deleted files.
   - `infra/grafana/slos/kestrel-eval-success.yaml` is orphaned after Phase 4 removed `metrics-flush`.
   - `loadtest/docker-compose.loadtest.yml:44,104` connects as superuser `kestrel` instead of `kestrel_app`.
   - `packages/config/typescript/base.json:6` uses global `"customConditions": ["source"]`, requiring `patches/eventsource-parser@3.1.1.patch`.
2. **Verdict:** **Fix in Phase 7 (Tasks 7.2–7.4).**
