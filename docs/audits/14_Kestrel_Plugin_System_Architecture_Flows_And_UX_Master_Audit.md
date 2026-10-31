# Kestrel Plugin System — Deep Architecture, End-to-End Flows & UX Master Audit

**Date:** 2026-10-31
**Scope:** End-to-end source-level audit of `@kestrel/plugin-sdk`, `plugins/*` (`telegram-bot`, `paper-trading`, `backtesting`, `custom-agents`), `@kestrel/db` plugin persistence & RLS, `@kestrel/ai` runtime/tool/agent/routing integration, `apps/worker` plugin jobs & tick bus, and `apps/web` API/UI surfaces.
**Verification Basis:** 100% verified against current TypeScript, TSX, and SQL source files (`docs/*` ignored per instructions).

---

## 1. Executive Scorecard & Rating

| Dimension | Rating | Verdict |
| :--- | :--- | :--- |
| **Overall Plugin System** | **7.4 / 10** | Well-structured, clean TypeScript/Zod SDK boundaries and rich bundled plugins, but undermined by critical end-to-end integration bugs across Postgres RLS scopes, chat routing/mutation gates, and canonical evidence filtering. |
| **SDK Design & Type Safety (`@kestrel/plugin-sdk`)** | **8.6 / 10** | Explicit manifest declarations, deterministic registration validation (`packages/plugin-sdk/src/host/validation.ts`), clean server/UI split (`@kestrel/plugin-sdk` vs `@kestrel/plugin-sdk/ui`), and secret encryption (`aes-256-gcm`). Minor dead surface area (`agents`, `resolveJobsForUser`, `setupWizardComponent`) and duplicated boilerplate across plugins. |
| **Database Schema & Multi-Tenant Isolation (`@kestrel/db`)** | **6.5 / 10** | Migrations `0107`–`0116` enforce `ENABLE/FORCE ROW LEVEL SECURITY` with `current_setting('app.current_tenant', true)` on `user_installed_plugins`, `plugin_storage`, and all `plg_*` tables. However, `pluginStorage*` queries, public webhook routes, streaming chat tool executions, and `paperStrategyRunnerJob` run outside `withTenantDb`, causing runtime RLS failures or missing tenant context. |
| **AI & Chat Integration (`@kestrel/ai`, `/api/chat`)** | **5.8 / 10** | Four severe integration disconnects prevent users from using installed plugins naturally in chat: (1) `/api/chat` hard-rejects execution/scheduling prompts with HTTP 422 before plugin tools are reached; (2) symbol-bearing prompts (`XAUUSD`, `EURUSD`) route to `xauusd-*` / `symbol-research` flows that either omit plugin tools or bury them in committee desks; (3) `checkCanonicalEvidence` blocks numerical answers produced by `backtest_*` and `paper_*` tools; and (4) Mastra `requireApproval` is never handled in the stream/UI. |
| **Worker & Background Execution (`apps/worker`)** | **8.0 / 10** | Clean `PluginJobScheduler` with per-plugin circuit breakers, `TickBus` with 30s subscriber cache and non-reentrant user locking, and isolated `BacktestQueue` worker loop. Needs `withTenantDb` in `paperStrategyRunnerJob`. |
| **Web UI & User Experience (`apps/web`)** | **7.6 / 10** | High-craft plugin store (`/settings/plugins`), settings dialog, dashboard widgets, sidebar navigation, and rich custom chat tool cards (`backtesting`, `paper-trading`, `custom-agents`). Held back by dead plugin slash commands, duplicate Telegram checkboxes in the Alert form, missing plugin tools in `/settings/agent`, and an unconditional 404 fetch in `useCustomAgents`. |
| **Maintainability & Code Hygiene** | **8.4 / 10** | Modules respect the repo's strict file-size and hook-count gates (`scripts/check-maintainability.mjs`). Consolidating duplicated API/UI helpers across all 4 plugins will cut ~320 lines of repeated boilerplate. |

---

## 2. End-to-End Architecture & Flow Map

### 2.1 Discovery & Registration
1. **Server Startup**:
   - **Web (`apps/web/src/instrumentation.ts:27`)**: `register()` dynamically imports `ensureWebPluginsRegistered()` (`apps/web/src/lib/plugins/bootstrap.ts:22`), which calls `registerBundledPlugins(pluginHost)` from `@kestrel/plugins/registry` (`plugins/registry.ts:25`) and validates every plugin's `skillDir` (`SKILL.md`).
   - **Worker (`apps/worker/src/bootstrap/plugins.ts:20`)**: `bootstrapWorkerPlugins()` calls `registerBundledPlugins(pluginHost)` before starting `PluginJobScheduler`, `TickBus`, and `BacktestQueue`.
2. **Client UI Registration**:
   - **Browser (`apps/web/src/lib/plugins/register-ui.ts:19`)**: Imported by `PluginSlot`, `PluginPageClient`, and `ChatToolPart`. Calls `registerBundledPluginUi(pluginUiRegistry)` from `@kestrel/plugins/ui-registry` (`plugins/ui-registry.ts:20`) and binds custom tool-part renderers into `apps/web/src/components/chat/parts/registry/definitions.tsx`.

### 2.2 Installation, Settings, Secrets & Lifecycle
1. **Install (`POST /api/plugins/manage`, `action: 'install'`)**:
   - Handled by `handlePluginInstall` (`apps/web/src/lib/services/plugin-manage/actions.ts:29`).
   - Validates `pluginHost.get(pluginId)` and parses initial settings via `parseAndSplitSettings` (`packages/plugin-sdk/src/settings.ts:127`).
   - Splits fields marked `secret: true` in `settingsSchema` from non-secret values, encrypts the secret map via `encryptPluginSecrets` (`AES-256-GCM` with `ENCRYPTION_KEY`), and upserts `user_installed_plugins` (`packages/db/src/queries/plugins/installed.ts:144`).
   - Runs `plugin.onInstall(ctx)` via `buildPluginHookContext` (`packages/ai/src/plugins/runtime.ts:221`); if `onInstall` throws, rolls back by calling `uninstallPluginForUser` and returns `400 PLUGIN_INSTALL_HOOK_FAILED`.
2. **Configure (`POST /api/plugins/manage`, `action: 'configure'`)**:
   - Merges incoming settings with existing settings (`preserveSecretValues` keeps existing secrets when the UI sends `""` or `"••••••••"`), runs `plugin.onSettingsChange(ctx, nextSettings, prevSettings)`, and persists only if the hook succeeds.
3. **Toggle (`POST /api/plugins/manage`, `action: 'toggle'`)**:
   - Calls `setPluginEnabledForUser` and triggers `plugin.onEnable(ctx)` or `plugin.onDisable(ctx)`.
4. **Uninstall (`POST /api/plugins/manage`, `action: 'uninstall'`)**:
   - Runs `plugin.onUninstall(ctx)` (`wipeData: Boolean(input.wipeData)`), calls `pluginStorageClear({ userId, pluginId })` when `wipeData` is true, and deletes the `user_installed_plugins` row.

### 2.3 Authenticated & Public Plugin HTTP Routes
1. **Authenticated (`/api/plugins/[pluginId]/[[...path]]`)**:
   - Wrapped in `withAuth({ csrf: true, rateLimit: { limit: 60, windowSeconds: 60 } })` (`apps/web/src/app/api/plugins/[pluginId]/[[...path]]/route.ts:57`).
   - `dispatchPluginApiRequest` (`apps/web/src/lib/services/plugin-api.ts:123`) verifies the user has installed and enabled `pluginId`, matches the route via `matchRoute` (`:param` and `*` segments), decrypts settings via `loadInstalledPluginContext`, and invokes `route.handler(ctx)`.
2. **Public (`/api/plugins/public/[pluginId]/[[...path]]`)**:
   - Unauthenticated entrypoint with IP rate limiting (`120 req / 60s`).
   - `dispatchPluginPublicApiRequest` (`apps/web/src/lib/services/plugin-api.ts:210`) provides `getInstall(userId)` and `findInstallBySetting(key, value)` (used by `telegram-bot` webhook to match `:token` via HMAC-SHA256 `webhookSecretHash` in `user_installed_plugins.settings`).

### 2.4 AI Runtime, Enrichers, Indicators, Subagents & Custom Agents
1. **Tools & Skills**:
   - `resolvePluginToolsForAgent` (`packages/ai/src/plugins/runtime.ts:310`) loads the user's enabled plugins, filters tools by `agentId` (`main-chat` vs `specialist:*`) and `disabledTools`, and attaches each plugin's `SKILL.md` content.
   - `buildPluginMastraTools` (`packages/ai/src/plugins/mastra-tools.ts:38`) wraps each `PluginRegisteredTool` into a Mastra tool (`createTool`) and strips internal `_ui` payloads from the model's `toModelOutput` view while preserving `_ui` in the raw result for `ChatToolPart` cards.
2. **Packet Enrichers**:
   - `enrichPacketForUser` (`packages/ai/src/plugins/enrichers.ts:55`) runs all installed plugin enrichers with `Promise.allSettled` and a 1,500ms timeout before specialist desks run (`packages/ai/src/committee/specialist-runner/runner.ts:95`), injecting `paperTrading` and `backtesting` context into `packet.pluginContext`.
3. **Custom Indicators**:
   - `computePluginIndicatorForAlert` (`packages/ai/src/plugins/indicators.ts:44`) lets the alert evaluator (`packages/ai/src/alerts/evaluator/indicator-spec.ts:165`) evaluate plugin-registered indicators alongside built-in indicators.
4. **Custom Agents (`custom-agents` plugin)**:
   - Registers an `agentCatalog` (`plugins/custom-agents/src/catalog.ts`).
   - `buildMainChatSubagentTools` (`packages/ai/src/plugins/subagent-delegator.ts:104`) exposes `delegate_to_agent_<slug>` tools on the main chat agent for agents with `invocationMode: 'subagent' | 'both'`.
   - When the user picks a standalone agent in the chat header (`AgentPicker`), `/api/chat` routes to `createMastraCustomAgentStreamResponse` (`apps/web/src/lib/services/mastra/chat/custom-agent-stream.ts:39`), which runs `streamUserCustomAgent` (`packages/ai/src/plugins/agent-runtime.ts:48`) with composed core + plugin + MCP HTTP tools and logs telemetry via `recordCustomAgentRun`.

---

## 3. Prioritized Findings Catalog (Bugs, Flaws, UX & Cleanups)

### 3.1 Critical Bugs & Flow Breakages (P0)

#### P0-1: Public Plugin Routes & `pluginStorage*` Violate Postgres RLS -> Infinite Telegram Webhook Retry & AI Spend Loop
- **Where**:
  - `packages/db/src/queries/plugins/storage.ts:54,90,141,173,200` (`pluginStorageGet`, `pluginStorageSet`, `pluginStorageList`, `pluginStorageDelete`, `pluginStorageClear`)
  - `apps/web/src/lib/services/plugin-api.ts:210-291` (`dispatchPluginPublicApiRequest`)
  - `plugins/telegram-bot/src/webhook.ts:75-145` (`handleTelegramWebhook`)
- **Mechanism**:
  - Migrations `0107_plugin_system_tables.sql` and `0116_add_tenant_id_columns.sql` enable and force Row-Level Security (`ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`) on `plugin_storage` and `user_installed_plugins` using `tenant_id = current_setting('app.current_tenant', true)`.
  - `pluginStorage*` calls `getDb()` directly without wrapping in `withTenantDb(tenantId, ..., { userId })`.
  - When Telegram POSTs to `/api/plugins/public/telegram-bot/webhook/:token`, the request hits the public route (no `withAuth` wrapper, so `app.current_tenant` is unset).
  - Inside `handleTelegramWebhook`:
    1. `install.storage.get('processed_updates', idempotencyKey)` runs with `app.current_tenant = ''` -> RLS hides existing rows and returns `null`, **completely bypassing update deduplication**.
    2. `handleTelegramUpdate` runs the AI copilot or bot command and **sends the Telegram message to the user's chat**.
    3. `install.storage.set('processed_updates', idempotencyKey, ...)` executes `INSERT INTO plugin_storage (tenant_id, ...)` with `tenant_id = install.tenantId`, which fails Postgres RLS check (`new row violates row-level security policy for table "plugin_storage"`, SQLSTATE `42501`).
    4. `webhook.ts:141` catches the DB error and returns HTTP `500` (`{ ok: false }`).
    5. Telegram's webhook delivery server retries non-2xx responses repeatedly with exponential backoff, causing the bot to re-run the AI prompt and spam duplicate replies until Telegram gives up!
- **Fix**:
  - Wrap `pluginStorageGet`, `pluginStorageSet`, `pluginStorageList`, `pluginStorageDelete`, and `pluginStorageClear` in `packages/db/src/queries/plugins/storage.ts` inside `withTenantDb(tenantId, (scopedDb) => ..., { userId: scope.userId })` whenever `opts.db` is not explicitly provided.
  - In `apps/web/src/lib/services/plugin-api.ts` (`loadPublicInstall`), wrap the returned `storage` and public handler execution context in `withTenantDb(loaded.row.tenantId, ..., { userId: loaded.row.userId })`, and in `plugins/telegram-bot/src/webhook.ts`, wrap `handleTelegramUpdate(install, update)` inside `withTenantDb(install.tenantId, ..., { userId: install.userId })`.

#### P0-2: `paperStrategyRunnerJob` Runs Outside `withTenantDb` in Worker
- **Where**: `plugins/paper-trading/src/jobs/strategy-runner.ts:39-57`
- **Mechanism**:
  - Unlike `paperMarketWatchJob` (`plugins/paper-trading/src/jobs/market-watch.ts:49`) and `paperTickHandler` (`plugins/paper-trading/src/tick.ts:111`), which both wrap per-user work in `withTenantDb(user.tenantId, () => ..., { userId: user.userId })`, `paperStrategyRunnerJob` calls `await runStrategyRunsForUser(user.userId, settings, ctx.signal)` directly without `withTenantDb`.
  - When a strategy flip closes a position and triggers `syncJournal` (`createJournalEntry` on `trade_journal`) or writes to tenant-scoped tables (`plg_paper_trading_*` has `FORCE ROW LEVEL SECURITY` in `0116_add_tenant_id_columns.sql:109-121`), `app.current_tenant` is unset, causing RLS failures in the worker every minute.
- **Fix**: Wrap `runStrategyRunsForUser(user.userId, settings, ctx.signal)` inside `withTenantDb(user.tenantId, () => runStrategyRunsForUser(user.userId, settings, ctx.signal), { userId: user.userId })` in `plugins/paper-trading/src/jobs/strategy-runner.ts`.

#### P0-3: `/api/chat` Hard-Rejects Paper Trading & Telegram Scheduling Prompts with HTTP 422 `READ_ONLY_REQUEST_REQUIRED`
- **Where**:
  - `apps/web/src/app/api/chat/route.ts:183-216`
  - `packages/ai/src/routing/keywords.ts:99-197` (`isHighConfidenceMutationIntent`, `EXECUTION_VERBS`, `ALWAYS_UNSAFE`)
- **Mechanism**:
  - In `POST /api/chat`, before `dispatchMastraRun` is ever called:
    - `detectMutationDraftRequest(prompt)` checks if the prompt is one of the 4 core mutations (`set_alert`, `log_journal`, `share_snapshot`, `run_system_action`).
    - If not (`mutationIntent === null`), `isHighConfidenceMutationIntent(prompt)` runs. It returns `true` for any prompt containing `EXECUTION_VERBS` (`buy`, `sell`, `execute`, `place`, `order`, `long`, `short`, `enter`, `exit`, `open`, `close`) + `EXECUTION_TARGETS` (`position`, `trade`, `order`, `market`, `lot`, `stop`, `target`, `symbol`) OR `ALWAYS_UNSAFE` (`automate`, `schedule`).
    - When `highConfidenceMutationIntent` is `true`, `/api/chat` immediately returns HTTP `422 READ_ONLY_REQUEST_REQUIRED` (`"I can analyze a trade idea, but I cannot execute trades from chat"`).
  - As a result, a user who has installed **Paper Trading**, **Backtesting**, or **Telegram Copilot** cannot run prompts that those plugins explicitly advertise in their `SKILL.md` and slash commands:
    - *"Buy 1 lot XAUUSD in my paper account with stop at 3300"* -> **422 Blocked**
    - *"Place a limit order on EURUSD at 1.0850"* -> **422 Blocked**
    - *"Close my open XAUUSD paper position"* -> **422 Blocked**
    - *"Automate this strategy in paper trading"* -> **422 Blocked**
    - *"Schedule my daily briefing on Telegram"* -> **422 Blocked**
- **Fix**:
  - Introduce a fast, deterministic helper `isInstalledPluginIntent(prompt: string, installedPluginIds: readonly string[]): boolean` in `@kestrel/ai` (used in `/api/chat/route.ts` and `decideMastraExecution`).
  - When the user has `paper-trading` installed and the prompt references paper/sandbox trading (`/\b(paper|sandbox|virtual|demo|simulated)\b/i`) or paper account/position/order actions, or when the user asks to backtest/sweep (`backtesting`), manage custom agents (`custom-agents`), or configure Telegram (`telegram-bot`), bypass the read-only 422 rejection so the prompt reaches the agent and its plugin tools.

#### P0-4: Unified Router Hijacks Symbol-Bearing Plugin Prompts Away From Plugin Tools
- **Where**:
  - `packages/ai/src/mastra-v2/planning/execution-decision.ts:198-296` (`decideMastraExecution`)
  - `packages/ai/src/mastra-v2/agents/xauusd/agent.ts:75-124` (`createXauusdMastraAgent`)
  - `packages/ai/src/mastra-v2/agents/xauusd/conversation-stream.ts:81-116` (`streamXauusdConversation`)
- **Mechanism**:
  - In `decideMastraExecution`, any single-mode prompt that mentions `XAUUSD` (e.g., *"Backtest an RSI crossover strategy on XAUUSD 1h"*, *"Show my XAUUSD paper positions"*, or *"Buy 0.5 lots of XAUUSD in my paper account"*) matches `normalizedTargetSymbol === 'XAUUSD'` and routes to `xauusd-research` or `xauusd-conversation`. Any prompt mentioning `EURUSD` or `BTCUSD` routes to `symbol-research`.
  - **Problem 1 (`xauusd-*`)**: `createXauusdMastraAgent` only registers `createXauusdReadOnlyTools()` (6 market tools) and **never calls `resolvePluginToolsForAgent` or `buildPluginMastraTools`**. Thus XAUUSD prompts have **zero access to any plugin tools**!
  - **Problem 2 (`symbol-research`)**: Routing *"Backtest RSI on EURUSD"* or *"Close my EURUSD paper trade"* to `symbol-research` launches the multi-desk Research Committee workflow (`runMastraCommitteeStream`), which returns a committee synthesis memo instead of invoking `backtest_run_strategy` or `paper_close_position` in chat and rendering the interactive `<BacktestRunCard />` / `<PaperOrderFillCard />`!
- **Fix**:
  - In `decideMastraExecution` (`packages/ai/src/mastra-v2/planning/execution-decision.ts`), accept `installedPluginIds?: readonly string[]` in `MastraExecutionDecisionInput` (passed from `dispatch.ts` / `route.ts`). When the prompt is an explicit plugin tool request (`backtest`, `sweep`, `paper`, `sandbox`, `custom agent`, `subagent`, `telegram`, or explicit paper order/position management) for an installed plugin, route directly to `canonical-chat` (where all `main-chat` plugin tools and custom UI cards live) instead of `xauusd-research`, `xauusd-conversation`, or `symbol-research`.

#### P0-5: Canonical Evidence Gate (`checkCanonicalEvidence`) Blocks Valid Numerical Outputs from Plugin Tools
- **Where**:
  - `packages/ai/src/mastra-v2/agents/canonical/evidence.ts:26-103` (`MARKET_TOOL_PATTERN`, `checkCanonicalEvidence`)
  - `packages/ai/src/mastra-v2/agents/canonical/stream.ts:229-243`
  - `packages/ai/src/mastra-v2/agents/canonical/chat.ts:183-196`
- **Mechanism**:
  - After `canonical-chat` finishes generating a reply, `checkCanonicalEvidence` checks whether the assistant text contains any number `>= 1000` (e.g. `$100,000` paper account equity, `$3,320.50` fill price, `$10,845.20` final backtest equity) or any percentage (`58.4%` win rate, `-4.2%` max drawdown).
  - If it does, `checkCanonicalEvidence` requires at least one called tool name to match `MARKET_TOOL_PATTERN`:
    `/(snapshot|quote|price|ohlc|candle|bar|indicator|technical|regime|macro|calendar|event|yield|cot|flow|sentiment|news|headline|correlat|session|level|zone|desk|research|packet|symbol|xau|gold|market|memory|recall|journal|alert|history|watchlist|portfolio|position)/i`
  - None of the following plugin tools match `MARKET_TOOL_PATTERN`:
    - `backtest_run_strategy`
    - `backtest_get_run`
    - `backtest_list_runs`
    - `backtest_save_strategy`
    - `backtest_list_strategies`
    - `backtest_run_sweep`
    - `paper_get_accounts`
    - `paper_list_orders`
    - `paper_place_order`
    - `paper_cancel_order`
    - `paper_update_account`
    - `paper_reset_account`
    - `paper_deploy_strategy`
    - `paper_list_strategy_runs`
    - `paper_stop_strategy_run`
    - `custom_agent_run_script`
    - `delegate_to_agent_<slug>`
  - When a user asks *"What is my paper account balance?"* (calls `paper_get_accounts` -> `$100,000.00`) or *"Backtest SMA crossover on EURUSD"* (calls `backtest_run_strategy` -> `Net P&L +$1,240.00, Win rate 54.2%`), `marketTools` is empty (`[]`), and `checkCanonicalEvidence` throws `CanonicalEvidenceBlockedError`! The stream discards the assistant's text and replaces it with `"I could not verify the numbers in that answer against market data, so I did not return it."`
- **Fix**:
  - Expand `MARKET_TOOL_PATTERN` in `packages/ai/src/mastra-v2/agents/canonical/evidence.ts` to include plugin tool namespaces (`backtest|sweep|strategy|paper|account|order|agent|delegate|script|telegram`) OR check `pluginHost.getTool(tool.toolName) !== undefined` so any registered plugin tool that actually executed and returned structured data counts as valid tool evidence for the numbers in its output.

#### P0-6: Plugin Tools with `requiresConfirmation` Hang Silently in Chat (Two Disconnected Approval Systems)
- **Where**:
  - `packages/ai/src/plugins/mastra-tools.ts:53-55` (`requireApproval: shouldRequireApproval(tool, ctx)`)
  - `packages/ai/src/mastra-v2/mutation/gates.ts:132-136` (`pluginWriteTool`)
  - `apps/web/src/lib/services/mastra/chat/canonical-stream.ts` & `apps/web/src/components/chat/message-parts-renderer.tsx`
- **Mechanism**:
  - Eight plugin tools set `requiresConfirmation`:
    - `paper_place_order` (`(input) => input.accountKind === 'personal'`), `paper_modify_position` (`personal`), `paper_update_account` (`true`), `paper_reset_account` (`true`), `paper_deploy_strategy` (`personal`)
    - `custom_agent_create` (`true`), `custom_agent_update` (`true`), `custom_agent_delete` (`true`)
  - In `packages/ai/src/plugins/mastra-tools.ts:55`, `requireApproval` is passed to Mastra's `createTool({ requireApproval })`.
  - When Mastra's `agent.stream()` invokes a tool with `requireApproval: true`, Mastra **does not execute `tool.execute()`**; instead, it emits a `tool-call-approval` stream chunk and suspends execution waiting for `agent.approveToolCall()`.
  - However, Kestrel's stream forwarders (`canonical-stream.ts` and `custom-agent-stream.ts`) only forward `text-delta`, `tool-call`, and `tool-result` chunks — they silently drop `tool-call-approval`! The tool never executes, no result is returned, and the user sees a spinner or an incomplete response with no confirmation card!
  - Meanwhile, `packages/ai/src/mastra-v2/mutation/gates.ts:134` has half-written code checking `pluginWriteTool(request.mutation)`, which is dead because `MutationKindSchema` (`packages/ai/src/mastra-v2/workflows/mutation-schemas.ts:27`) only allows `['set_alert', 'log_journal', 'share_snapshot', 'run_system_action']`.
- **Fix (Simple, Reliable, No Over-Engineering)**:
  - Do not pass Mastra's internal `requireApproval` flag in `buildPluginMastraTools` (which requires stateful suspended workflow resumption).
  - Instead, handle `shouldRequireApproval(tool, ctx, input)` directly inside the `execute` wrapper in `packages/ai/src/plugins/mastra-tools.ts`:
    - When `shouldRequireApproval(tool, ctx, rawInput)` evaluates to `true` (and the input does not carry `confirmed: true`), return a structured pending-confirmation payload (`{ status: 'confirmation_required', toolId: tool.id, pluginId: tool.pluginId, title: tool.description, input: rawInput, _ui: { kind: 'plugin-tool-confirm', toolId: tool.id, pluginId: tool.pluginId, input: rawInput } }`) instead of mutating immediately.
    - Render a compact, one-click **Confirm / Cancel** card in chat (`PluginToolConfirmCard`) that executes the confirmed tool via a dedicated authenticated endpoint (`POST /api/plugins/tools/confirm`) or allow `confirmed: true` when the user explicitly confirms in the next turn. This gives real confirmation safety for personal paper accounts and destructive agent actions without deadlocks or suspended Mastra run state.

---

### 3.2 High-Priority Bugs & Data/Query Flaws (P1)

#### P1-1: Streaming Chat Tool Calls, Enrichers, & Custom Agent Telemetry Lose `withTenantDbFresh` Scope
- **Where**:
  - `packages/ai/src/plugins/mastra-tools.ts:71` (`tool.execute(input, ctx)`)
  - `packages/ai/src/plugins/enrichers.ts:79` (`entry.enrich({ userId, tenantId, ... })`)
  - `packages/ai/src/plugins/agent-catalog.ts:178` (`listForUser`)
  - `packages/ai/src/plugins/subagent-delegator.ts:87` (`recordCustomAgentRun`)
- **Mechanism**:
  - `withAuth` (`apps/web/src/lib/http/api/auth.ts:152`) wraps route handlers in `withTenantDbFresh(tenantId, () => handler(req, context))`.
  - For streaming routes like `POST /api/chat`, `handler()` returns `new Response(readableStream)` as soon as the stream is constructed. At that moment, `withTenantDbFresh`'s callback resolves and its Postgres transaction commits and releases the connection!
  - All subsequent `ReadableStream` `start(controller)` ticks — including LLM tool calls (`tool.execute`), `recordCustomAgentRun` in `custom-agent-stream.ts:242`, and async subagent delegations — run **after** `withTenantDbFresh` has already exited, so `getScopedDb()` is `undefined` and `getDb()` runs on a raw pool connection without `app.current_tenant` set!
- **Fix**:
  - Wrap `tool.execute(input, ctx)` in `packages/ai/src/plugins/mastra-tools.ts`, `entry.enrich(...)` in `packages/ai/src/plugins/enrichers.ts`, `entry.listForUser(...)` in `packages/ai/src/plugins/agent-catalog.ts`, and `entry.recordRun(...)` in `packages/ai/src/plugins/subagent-delegator.ts` inside `withTenantDb(tenantId, () => ..., { userId })`.

#### P1-2: `deleteAllBacktestData` Orphans `plg_backtesting_sweeps` Rows on Uninstall (`wipeData: true`)
- **Where**: `plugins/backtesting/src/db/queries/runs.ts:154-158`
- **Mechanism**:
  - `deleteAllBacktestData(userId)` deletes from `backtestRuns` and `backtestStrategies`, but omits `backtestSweeps` (`plg_backtesting_sweeps`). When a user uninstalls Backtesting with "Wipe plugin data" checked, parameter sweep rows remain orphaned in `plg_backtesting_sweeps`.
- **Fix**: Import `backtestSweeps` from `../tables` in `plugins/backtesting/src/db/queries/runs.ts` and delete `backtestSweeps` for `userId` alongside `backtestRuns` and `backtestStrategies`.

#### P1-3: `listRunSummaries` Applies SQL `LIMIT` Before Filtering by `symbol` & Selects Heavy JSONB Blobs
- **Where**:
  - `plugins/backtesting/src/services/run-service.ts:307-325` (`listRunSummaries`)
  - `plugins/backtesting/src/db/queries/runs.ts:104-127` (`listBacktestRuns`)
- **Mechanism**:
  - `listRunSummaries(userId, { limit, symbol, status })` calls `listBacktestRuns(userId, { limit: opts.limit ?? 10, status: opts.status })` and then runs `.filter((row) => (opts.symbol ? row.symbol === opts.symbol : true))` in JavaScript.
  - Because the SQL query applies `LIMIT 10` **before** `symbol` is filtered, if a user ran 10 `EURUSD` backtests (e.g., from a parameter sweep) and asks for their `XAUUSD` backtests (or when `backtestingEnricher` in `plugins/backtesting/src/enricher.ts:46` calls `listRunSummaries(ctx.userId, { symbol: ctx.symbol, status: 'completed', limit: 3 })`), it returns `[]` even when completed `XAUUSD` runs exist!
  - In addition, `listBacktestRuns` executes `db.select().from(backtestRuns)`, pulling full `trades` (up to 1,000 objects), `equity_curve` (up to 1,500 points), `source`, `logs`, and `rejected_signals` JSONB/text columns over the wire just to extract `id`, `name`, `symbol`, `timeframe`, `status`, `metrics`, and `createdAt`.
- **Fix**:
  - Add `symbol?: string` directly to `ListRunsOptions` and the SQL `WHERE` clause in `listBacktestRuns` (`plugins/backtesting/src/db/queries/runs.ts`), and add `listBacktestRunSummaryRows` that selects only lightweight summary columns (`id`, `userId`, `strategyId`, `name`, `symbol`, `timeframe`, `startTime`, `endTime`, `initialCash`, `feeBps`, `slippageBps`, `status`, `metrics`, `errorMessage`, `durationMs`, `createdAt`, `completedAt`).

#### P1-4: `getBacktestStrategy` Loads All User Strategies Into Memory Instead of Filtering in SQL
- **Where**: `plugins/backtesting/src/db/queries/strategies.ts:57-68`
- **Mechanism**:
  - `getBacktestStrategy(userId, idOrSlug)` executes `SELECT * FROM plg_backtesting_strategies WHERE user_id = $1` (fetching every strategy the user ever saved) and runs `rows.find((row) => row.id === idOrSlug || row.slug === idOrSlug)` in JS.
- **Fix**: Filter in SQL using `and(eq(backtestStrategies.userId, userId), isUuid(idOrSlug) ? eq(backtestStrategies.id, idOrSlug) : eq(backtestStrategies.slug, idOrSlug))` with `.limit(1)`.

#### P1-5: Client-Side `ChatToolPart` (`dispatch.tsx`) Imports Server-Only `pluginHost` (Always Empty in Browser)
- **Where**: `apps/web/src/components/chat/parts/registry/dispatch.tsx:8,76`
- **Mechanism**:
  - `dispatch.tsx` is a `'use client'` component that imports `{ pluginHost } from '@kestrel/plugin-sdk'` and calls `pluginHost.getTool(name)?.outputSchema`.
  - In the browser bundle, `registerBundledPlugins(pluginHost)` is never called (only `registerBundledPluginUi(pluginUiRegistry)` runs on the client), so `pluginHost` is an empty `PluginHost` instance and `pluginHost.getTool(name)` always returns `undefined`. Worse, importing `@kestrel/plugin-sdk` in a client module pulls server SDK code (`node:crypto` references if not tree-shaken) into the client graph.
- **Fix**: Remove the `pluginHost` import from `apps/web/src/components/chat/parts/registry/dispatch.tsx`. Plugin tool UI cards already validate their own `_ui` payload via `extractUiPayload(output)` in `plugins/*/src/ui/tool-cards.tsx`.

---

### 3.3 UX Friction, Polish & Maintainability Cleanups (P2)

#### P2-1: Plugin Slash Commands (`/backtest`, `/paper`, `/telegram`, `/agents`) Are Dead in Chat Composer
- **Where**:
  - `packages/plugin-sdk/src/ui/registry.ts:154-169` (`pluginUiRegistry.listSlashCommands`)
  - `apps/web/src/components/chat/use-composer.ts:41-50`
  - `apps/web/src/hooks/use-slash-commands.ts`
- **Mechanism**:
  - All 4 bundled plugins register `slashCommands` in `src/ui/index.tsx` (`/backtest`, `/paper`, `/telegram`, `/agents`), and `pluginUiRegistry.listSlashCommands({ installedOnly, installedIds })` is implemented.
  - However, `useComposer` (`apps/web/src/components/chat/use-composer.ts:41`) filters only the hardcoded 4-item `SLASH_COMMANDS` array (`/brief`, `/compare`, `/levels`, `/review`) and never merges `pluginUiRegistry.listSlashCommands({ installedOnly: true, installedIds })`! Typing `/backtest` or `/paper` in chat shows no slash command autocomplete.
- **Fix**: Merge installed plugin slash commands from `pluginUiRegistry.listSlashCommands({ installedOnly: true, installedIds })` into the composer's slash command list (inserting the command prompt template into the composer input when selected).

#### P2-2: `/settings/agent` "Disabled Tools" Card Ignores Installed Plugin Tools
- **Where**: `apps/web/src/app/(app)/settings/agent/page.tsx:125`
- **Mechanism**:
  - `resolvePluginToolsForAgent` (`packages/ai/src/plugins/runtime.ts:346`) checks `disabled.has(tool.id)` against `user_settings.disabled_tools`.
  - However, `/settings/agent/page.tsx:125` passes `allTools={TOOL_NAMES}` (only the 12 core tools) to `<DisabledToolsForm />`. Users cannot see or toggle any of the 29 plugin tools in Agent Settings.
- **Fix**: In `apps/web/src/app/(app)/settings/agent/page.tsx`, load the user's installed & enabled plugin IDs (`getInstalledPluginIdsForUser(user.id, { enabledOnly: true })`), collect their tool IDs from `pluginHost.listTools()` where `installedIds.includes(tool.pluginId)`, and pass `[...TOOL_NAMES, ...pluginToolIds]` to `<DisabledToolsForm />`.

#### P2-3: `useCustomAgents` Fires an Unconditional 404 Request on Every Chat Load When Uninstalled
- **Where**: `apps/web/src/hooks/use-custom-agents.ts:39-69` & `apps/web/src/components/chat/chat-view.tsx:86`
- **Mechanism**:
  - Every time a user opens `/chat`, `useCustomAgents({ enabled: true })` calls `GET /api/plugins/custom-agents/agents`.
  - If the user has not installed the `custom-agents` plugin, `dispatchPluginApiRequest` returns `404 PLUGIN_NOT_INSTALLED`, polluting browser DevTools console/network logs with a 404 on every page load.
- **Fix**: Pass `enabled: installedPluginIds.includes('custom-agents')` (or check `useInstalledPlugins()`) so `useCustomAgents` only fetches when `custom-agents` is installed and enabled.

#### P2-4: Duplicate & Confusing Telegram Checkboxes in Alert Creation Form
- **Where**:
  - `apps/web/src/app/(app)/alerts/_components/alert-form/alert-delivery-fields.tsx:41-70`
  - `apps/web/src/app/(app)/alerts/_components/alert-form/use-alert-form.ts:47-66`
  - `packages/ai/src/alerts/delivery/orchestrate.ts:56-68`
- **Mechanism**:
  - `alert-delivery-fields.tsx` always renders a built-in `Telegram` (`telegram`) checkbox, even if the `telegram-bot` plugin is not installed (and `sendTelegramAlert` in `packages/ai/src/alerts/delivery/telegram.ts:17` explicitly requires the `telegram-bot` plugin!).
  - Worse, once the user installs and configures `telegram-bot`, `use-alert-form.ts:53` appends a *second* checkbox labeled `Telegram (personal bot)` (`telegram-bot`) right next to `Telegram`! In `orchestrate.ts:56-68`, both `'telegram'` and `'telegram-bot'` invoke the exact same `deliverViaPluginChannel('telegram-bot', ...)` function.
- **Fix**: Remove the duplicate hardcoded `Telegram` checkbox from `alert-delivery-fields.tsx` so Telegram delivery is surfaced solely through the `telegram-bot` plugin channel (`pluginAlertChannels`), with a subtle hint linking to `/settings/plugins` when no plugin alert channel is connected.

#### P2-5: `DeployToPaperButton` in Backtesting Doesn't Check if Paper Trading Is Installed
- **Where**: `plugins/backtesting/src/ui/deploy-to-paper-button.tsx:24-75`
- **Mechanism**:
  - On any completed backtest run, `<DeployToPaperButton />` renders "Deploy to Paper" and POSTs to `/api/plugins/paper-trading/strategy-runs`. If `paper-trading` is not installed, clicking "Start runner" fails with raw API error `Plugin "paper-trading" is not installed.` inside the modal.
- **Fix**: Check whether `paper-trading` is installed (or handle `404 PLUGIN_NOT_INSTALLED` with a direct link to `/settings/plugins` to install Paper Trading).

#### P2-6: User Data Export (`_actions-data-export-payload.ts`) Omits Plugin Tables
- **Where**: `apps/web/src/app/(app)/settings/_actions-data-export-payload.ts`
- **Mechanism**:
  - The GDPR/account data export fetches 27 core tables (`queries.ts`) but omits `userInstalledPlugins` (with secrets stripped), `pluginStorage`, and the bundled plugin tables.
- **Fix**: Include `userInstalledPlugins` (selecting only `id`, `pluginId`, `enabled`, `version`, `settings`, `installedAt`, `updatedAt` — **never** `encryptedSecrets`) and `pluginStorage` in the user data export payload.

#### P2-7: Duplicated Boilerplate Across All 4 Plugins & Dead SDK Methods
- **Where**:
  - **UI Fetch Boilerplate**: `csrfToken()`, `errorMessage()`, and `pluginFetch<T>()` are copy-pasted across `plugins/backtesting/src/ui/api.ts`, `plugins/paper-trading/src/ui/api.ts`, `plugins/custom-agents/src/ui/api.ts`, and `plugins/telegram-bot/src/ui/telegram-page/use-telegram-page.ts`.
  - **Server Route Helpers**: `ApiError`, `json()`, `byMethod()`, `parseBody()`, and `query()` are copy-pasted across `plugins/backtesting/src/api/routes/shared.ts`, `plugins/paper-trading/src/api/routes/shared.ts`, and `plugins/custom-agents/src/api/routes/shared.ts`.
  - **Skill Directory Resolution**: `resolveSkillDir()` is copy-pasted across `plugins/backtesting/src/index.ts`, `plugins/paper-trading/src/index.ts`, `plugins/custom-agents/src/index.ts`, and `plugins/telegram-bot/src/index.ts`.
  - **Dead SDK Surface**:
    - `KestrelPlugin.agents`, `PluginStandaloneAgentRegistration`, `pluginHost.listAgents()`, `pluginHost.getAgent()`, `pluginHost.resolveAgentsForUser()`, and `packages/ai/src/plugins/agents.ts` are completely unused (superseded by `agentCatalogs`).
    - `pluginHost.resolveJobsForUser()` (`packages/plugin-sdk/src/host/resolution.ts:62`) is never called anywhere.
    - `PluginUiDefinition.setupWizardComponent` and `pluginUiRegistry.getSetupWizard()` are never used anywhere.
  - **Stale Badge**: `plugins/paper-trading/src/index.ts:74` says `'Adds 10 AI tools'` when it actually registers 12 tools (`paperTools` has 12 entries).

---

## 4. Per-Plugin Deep Review Summary

### 4.1 `telegram-bot` (Rating: 7.5 / 10)
- **Strengths**: Clean HMAC-SHA256 webhook token indexing (`webhookSecretHash`), rich bot command set (`/start`, `/help`, `/Status`, `/briefing`, `/positions`, `/alerts`, `/journal`, `/ask`, `/link`, `/unlink`), inline keyboards, proactive alert/morning-brief/eod-recap/trade-fill jobs, and 5-step onboarding wizard.
- **Issues Found**:
  1. **P0-1**: Webhook deduplication and `install.storage.set` fail with Postgres RLS error (`42501`) on `/api/plugins/public/telegram-bot/webhook/:token`, triggering infinite Telegram webhook retries and duplicate AI calls.
  2. **P0-3**: Asking chat to *"Schedule my Telegram briefing"* is rejected with HTTP 422 by `/api/chat`.
  3. **P2-4**: Duplicate `Telegram` and `Telegram (personal bot)` checkboxes in Alert form.
  4. **Tight Coupling**: `plugins/telegram-bot/src/bot/commands/shared.ts:20` directly imports `paperAccounts` and `paperPositions` from `@kestrel/plugin-paper-trading/db/tables` instead of querying gracefully or checking `plugin_id = 'paper-trading'`.

### 4.2 `paper-trading` (Rating: 7.6 / 10)
- **Strengths**: Dual accounts (`personal` + `agent_sandbox`), realistic execution engine (`packages/backtest-engine` integration with fee/slippage bps, margin checks, bracket SL/TP, trailing stops, and partial closes), real-time `TickBus` evaluation with `market-watch` fallback job, automatic `trade_journal` sync on position close, and 12 AI tools with custom chat cards.
- **Issues Found**:
  1. **P0-2**: `paperStrategyRunnerJob` (`plugins/paper-trading/src/jobs/strategy-runner.ts:43`) omits `withTenantDb`, breaking RLS in the worker.
  2. **P0-3**: Prompts like *"Buy 1 lot XAUUSD in my paper account"* are blocked with HTTP 422 `READ_ONLY_REQUEST_REQUIRED`.
  3. **P0-4**: Prompts mentioning `XAUUSD` or `EURUSD` are hijacked to `xauusd-*` or `symbol-research` instead of `canonical-chat`.
  4. **P0-5**: `paper_get_accounts`, `paper_list_orders`, and `paper_place_order` outputs trigger `CanonicalEvidenceBlockedError` when the model states account balances or fill prices.
  5. **P0-6**: Personal account write tools (`requiresConfirmation`) hang silently in chat.
  6. **P2-7**: Manifest badge says `'Adds 10 AI tools'` instead of `'Adds 12 AI tools'`.

### 4.3 `backtesting` (Rating: 8.1 / 10)
- **Strengths**: Deterministic QuickJS WASM sandbox (`packages/backtest-engine`) with 5 built-in templates, parameter sweep worker queue (`BacktestQueue`), rich equity curve / trade log UI, and "Deploy to Paper" cross-plugin workflow.
- **Issues Found**:
  1. **P0-4**: Asking chat to *"Backtest RSI on XAUUSD 1h"* routes to `xauusd-research` (which has no `backtest_run_strategy` tool) instead of running the backtest in chat.
  2. **P0-5**: `backtest_run_strategy`, `backtest_get_run`, `backtest_list_runs`, and `backtest_run_sweep` are not matched by `MARKET_TOOL_PATTERN`, causing `CanonicalEvidenceBlockedError` whenever the assistant summarizes backtest metrics!
  3. **P1-2**: `deleteAllBacktestData` forgets to delete `plg_backtesting_sweeps` rows on uninstall (`wipeData: true`).
  4. **P1-3**: `listRunSummaries` applies SQL `LIMIT` before filtering by `symbol` in JS and selects heavy JSONB columns (`trades`, `equity_curve`).
  5. **P1-4**: `getBacktestStrategy` loads the entire strategy table into memory instead of filtering in SQL.
  6. **P2-5**: `DeployToPaperButton` does not check if `paper-trading` is installed before POSTing.

### 4.4 `custom-agents` (Rating: 8.2 / 10)
- **Strengths**: Clean Agent Studio UI, 4 starter templates, tool picker (core + installed plugin tools), SSRF-safe HTTP MCP client (`packages/ai/src/plugins/agent-mcp.ts` blocks loopback/RFC1918/link-local/metadata IPs), QuickJS custom tool script runner (`custom_agent_run_script`), main-chat subagent delegation (`delegate_to_agent_<slug>`), and per-run cost/latency telemetry (`plg_custom_agents_runs`).
- **Issues Found**:
  1. **P0-6**: `custom_agent_create`, `custom_agent_update`, and `custom_agent_delete` set `requiresConfirmation: true`, which hangs silently when invoked from chat.
  2. **P1-1**: `recordCustomAgentRun` and streaming tool calls run after `withTenantDbFresh` has already closed on streaming responses.
  3. **P2-3**: `useCustomAgents` fires an unconditional `GET /api/plugins/custom-agents/agents` on every `/chat` mount even when the plugin is not installed, causing a 404 in the browser console.

---

## 5. Phased Implementation Roadmap Overview

To fix all identified issues cleanly without over-engineering or breaking maintainability limits, implementation is divided into three self-contained roadmap files in `docs/audits/`:

1. **`15_Roadmap_Phase1_Plugin_RLS_Tenant_Scopes_And_Query_Reliability.md`**
   - Fixes **P0-1**, **P0-2**, **P1-1**, **P1-2**, **P1-3**, and **P1-4** (Postgres RLS tenant scopes in `pluginStorage*`, public webhook routes, `paperStrategyRunnerJob`, and streaming AI plugin entrypoints, plus backtesting sweep deletion and SQL query fixes).
2. **`16_Roadmap_Phase2_Chat_Boundary_Routing_Evidence_Gate_And_Tool_Approvals.md`**
   - Fixes **P0-3**, **P0-4**, **P0-5**, and **P0-6** (plugin-aware chat mutation gate, plugin-aware router decision so `XAUUSD`/`EURUSD` backtest & paper prompts stay in `canonical-chat`, plugin tool recognition in `checkCanonicalEvidence`, and clean confirmation handling for `requiresConfirmation` plugin tools).
3. **`17_Roadmap_Phase3_Plugin_UX_Polish_SDK_Deduplication_And_Cleanups.md`**
   - Fixes **P1-5**, **P2-1**, **P2-2**, **P2-3**, **P2-4**, **P2-5**, **P2-6**, and **P2-7** (client `dispatch.tsx` cleanup, chat slash commands wiring, `/settings/agent` plugin tool toggles, `useCustomAgents` 404 prevention, Alert form Telegram deduplication, `DeployToPaperButton` install check, data export coverage, and shared SDK helpers).
