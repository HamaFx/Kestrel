# Kestrel Plugin System Implementation Roadmap

> **Focus of this Roadmap (Decision D-05):** The #1 priority is building a **clean, rock-solid, effortless Plugin Architecture (`@kestrel/plugin-sdk` + `PluginHost` + 1-Click Plugin Store UI)** so that Kestrel's core never needs to be torn apart again. Once the Core Plugin System (Phases 0–2) is in place, each individual plugin (`telegram-bot`, `backtesting`, `paper-trading`, `custom-agents`) can be built independently in its own `plugins/<name>` folder by wrapping existing Mastra `@mastra/core@^1.78.0` primitives and mature open-source TypeScript libraries (`backtest-kit`, `trading-signals`, `quickjs-emscripten`, `grammY`).

> **Implementation status (2026-10-25):**
>
> - ✅ **Phase 0 — Complete.** `@kestrel/plugin-sdk`, `PluginHost`, per-user install/storage tables + RLS (`0107_plugin_system_tables`), query layer, and `pnpm create:plugin` are implemented and verified.
> - ✅ **Phase 1 — Complete.** Open tool union, automatic plugin chat cards, per-request Mastra tool/skill injection, dynamic mutation/alert/indicator extension points, worker `TickBus`, plugin cron jobs, and `/api/plugins/[pluginId]/[[...path]]` are implemented and verified.
> - ✅ **Phase 2 — Complete.** `/settings/plugins`, the manage API, generated Zod settings forms, the guided setup drawer, dynamic sidebar/⌘K/dashboard slots, plugin page shell, and public plugin transport routes are implemented and verified.
> - ✅ **Phase 3 — Complete (Telegram).** `@kestrel/plugin-telegram-bot` ships the per-user BotFather wizard, grammY transport, one-tap single-use linking, daily briefings, agent tools, and a personal alert channel.
> - ✅ **Phase 4 — Complete (Backtesting Lab).** `@kestrel/plugin-backtesting` ships a QuickJS-WASM `getSignal(ctx)` sandbox, point-in-time SMC/TA feature matrix, deterministic bar-by-bar engine, scorecard, 3 built-in skills + 10 references, run/strategy/knowledge persistence, uPlot equity charts, and an optional `pg-boss` async run queue.
> - ✅ **Phase 5 — Complete (Paper Trading).** `@kestrel/plugin-paper-trading` ships the dual Personal/Autonomous Sandbox accounts, risk/margin sizing, market/limit/stop orders, SL/TP/trailing/breakeven, sub-second TickBus fills, a minute mark-to-market fallback, Journal sync, agent tools, API, and desk UI.
> - ✅ **Phase 6 — Complete (Custom Agents).** `@kestrel/plugin-custom-agents` ships the Agent Studio, four starter agents, SKILL.md/`.agent.md` import, tool allowlists, optional model pins, per-user run counters, `@handle` routing in chat and Telegram, Mastra subagent delegation, and a hardened `@mastra/mcp` bridge.
> - ✅ **Optional follow-ups — Complete (except the high-fidelity engine).** Backtest → Paper deployment, parameter sweeps, packet enrichers, plugin-first Telegram alerts, agent run history, PDF knowledge and a QuickJS calculation sandbox are live.
>
> See the [Implementation Progress Log](#implementation-progress-log) at the end for delivered files, deviations, and verification evidence.

**Goal:** Build Kestrel's 1-click installable, subscription-free Plugin Architecture in the monorepo, extract legacy domain bloat out of `packages/ai`, and provide the exact integration blueprints for the 4 flagship plugins using off-the-shelf open-source engines.

**Locked Architectural Constraints (Decisions D-01 to D-05):**

1. **No Subscriptions / No Plan Gates:** Remove subscription/plan gates from the plugin layer. Every user can install or uninstall any plugin in 1 click from `/settings/plugins`.
2. **In-Monorepo Workspace Packages (`plugins/*`):** All plugins live in `plugins/*` inside the pnpm + Turborepo monorepo for instant TypeScript safety and zero Docker rebuild headaches.
3. **Skills + Knowledge Backtesting (`SKILL.md` + `backtest-kit`):** Agents synthesize and backtest custom strategies dynamically using Mastra `Skills` (`SKILL.md` + `references/`) and `backtest-kit` rather than hardcoded rules.
4. **Dual-Mode Paper Trading:** Supports both a Personal Paper Account (1-click confirmation) and an Autonomous Agent Sandbox Account (zero-confirmation 24/7 execution).
5. **Standalone Custom Agents Only:** Custom agents run as standalone Mastra `Agent` / `Subagent` instances without modifying the core 4-Desk Committee workflow.

## High-Level Roadmap Overview

| Phase                                                    | Priority                 | Scope                                                                                                                                                                                               | What We Reuse (Zero Reinvention)                                                                                                                 |
| :------------------------------------------------------- | :----------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 0: `@kestrel/plugin-sdk` & Per-User Registry**   | **✅ DONE (2026-10-24)** | Create `packages/plugin-sdk`, `plugins/` workspace, `user_installed_plugins` & `plugin_storage` DB tables, and `pnpm create:plugin` CLI scaffolder                                                  | Kestrel's existing `Container`, Drizzle RLS helpers, and `@mastra/core/skills` (`createSkill`, `validateSkillContent`)                           |
| **Phase 1: Unsealing Core Host Extension Points**        | **✅ DONE (2026-10-24)** | Open `ToolName` & `partRegistry` (`AutoPluginToolCard` fallback), per-request Mastra `RequestContext` tool/skill injection, Worker `TickBus`, and `/api/plugins/[...path]`                          | Mastra `RequestContext`, Mastra `toModelOutput`, Kestrel's `CompactTelemetryRow` & `withAuth`                                                    |
| **Phase 2: The 1-Click Plugin Store & Guided Setup UX**  | **✅ DONE (2026-10-25)** | Build `/settings/plugins` Store UI, 1-click Install/Uninstall actions, auto-generated Zod settings forms, step-by-step Setup Wizard drawer, dynamic shell slots, and public plugin transport routes | Kestrel's Hoplite UI components (`Card`, `Drawer`, `Switch`, `Badge`) + Zod schema introspection + `publicApiRoutes`                             |
| **Phase 3: Blueprint — `@kestrel/plugin-telegram`**      | **✅ DONE (2026-10-25)** | Per-user Telegram Copilot: BotFather wizard, grammY transport, one-tap single-use linking, daily briefings, agent tools, and a personal alert channel                                               | **[`grammY`](https://grammy.dev/)**, grammY `InlineKeyboard`, and Kestrel's Phase 1 plugin job/API/tool runtime                                  |
| **Phase 4: Blueprint — `@kestrel/plugin-backtesting`**   | **✅ DONE (2026-10-25)** | Give agents `SKILL.md` trading playbooks + sandboxed `getSignal(ctx)` strategy authoring & bar-by-bar simulation                                                                                    | **`trading-signals`**, **`quickjs-emscripten`**, Kestrel SMC, Mastra `Skills`, **`uplot`**, **`pg-boss`** (see deviation note on `backtest-kit`) |
| **Phase 5: Blueprint — `@kestrel/plugin-paper-trading`** | **✅ DONE (2026-10-25)** | Virtual broker with Personal (confirm) + Agent Sandbox (autonomous) accounts, live tick fills, and auto-journal sync                                                                                | Kestrel Worker `TickBus` + Mastra `requireApproval` + Kestrel Trade Journal (see deviation note on `backtest-kit Live`)                          |
| **Phase 6: Blueprint — `@kestrel/plugin-custom-agents`** | **✅ DONE (2026-10-25)** | Standalone Custom Agent Studio, `.agent.md` & `SKILL.md` knowledge uploader, `@mention` chat routing, and MCP bridge                                                                                | **Mastra `Agent`**, **Mastra `Subagents`**, **Mastra `Skills`**, and **`@mastra/mcp`**                                                           |

## Part I: Core Plugin System Architecture (Do This First)

### Phase 0: Foundation — `@kestrel/plugin-sdk` & Per-User Installation State — ✅ Complete (2026-10-24)

#### Task 0.1: Create `packages/plugin-sdk` with Dual Entrypoints (`.` and `./ui`) ✅

**Files:**

- Modify: `pnpm-workspace.yaml` (add `'plugins'` and `'plugins/*'`)
- Modify: `package.json` (add `--filter=@kestrel/plugin-sdk` and `--filter=@kestrel/plugins` to `build:packages`)
- Create: `packages/plugin-sdk/package.json`
- Create: `packages/plugin-sdk/tsconfig.json`
- Create: `packages/plugin-sdk/tsconfig.build.json`
- Create: `packages/plugin-sdk/vitest.config.ts`
- Create: `packages/plugin-sdk/eslint.config.js`
- Create: `packages/plugin-sdk/src/types.ts`
- Create: `packages/plugin-sdk/src/host.ts`
- Create: `packages/plugin-sdk/src/index.ts`
- Create: `packages/plugin-sdk/src/ui.tsx`
- Create: `packages/plugin-sdk/src/settings.ts` (server-only encrypted settings helpers)
- Test: `packages/plugin-sdk/test/host.test.ts`
- Test: `packages/plugin-sdk/test/settings.test.ts`

**Architecture & Implementation Steps:**

- [x] **Step 1: Define the `KestrelPlugin` & `definePlugin()` contract in `packages/plugin-sdk/src/types.ts`**
      Include declarative fields for `manifest` (`id`, `name`, `tagline`, `description`, `category`, `iconName`, `installMode`: `'instant' | 'wizard'`, `settingsSchema`, `setupSteps`), `skills` (accepting Mastra `Skill` objects or paths to `SKILL.md` directories), `tools`, `agents` (standalone only), `jobs`, `tickSubscribers`, `alertChannels`, `indicators`, `packetEnrichers`, `apiRoutes`, `onUserInstall`, and `onUserUninstall`.
- [x] **Step 2: Build `PluginHost` in `packages/plugin-sdk/src/host.ts`**
      Implement `register(plugin)`, `listAvailablePlugins()`, `getPlugin(id)`, `resolveToolsForUser(installedPluginIds, disabledTools)`, `resolveSkillsForUser(installedPluginIds)`, and `resolveAgentsForUser(installedPluginIds)`.
- [x] **Step 3: Separate `./ui` entrypoint in `packages/plugin-sdk/src/ui.tsx`**
      Define `definePluginUi({ chatToolParts, dashboardWidgets, navItems, pages, slashCommands, setupWizardComponent })` so `apps/worker` never imports React components and `apps/web` can lazy-load plugin UI chunks via `next/dynamic`.
- [x] **Step 4: Run unit tests for `PluginHost`**
      Verify duplicate plugin/tool ID rejection and per-user filtering (`resolveToolsForUser(['backtesting'])` only returns backtesting tools).

#### Task 0.2: Add `user_installed_plugins` & `plugin_storage` Tables in `@kestrel/db` ✅

**Files:**

- Create: `packages/db/src/schema/plugins.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/queries/plugins.ts`
- Modify: `packages/db/src/queries/index.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/drizzle/0107_plugin_system_tables.sql`
- Modify: `packages/db/drizzle/meta/_journal.json` and `_hashes.json`
- Test: `packages/db/test/plugins-queries.test.ts`

**Architecture & Implementation Steps:**

- [x] **Step 1: Create `user_installed_plugins` table (RLS-protected)**
      Tracks which plugins each user has installed:
  - `userId` (`text`, FK to `user.id`), `tenantId` (`text`, default `current_setting('app.current_tenant', true)`), `pluginId` (`text`), `enabled` (`boolean`, default `true`), `settings` (`jsonb` — secret keys defined with `.meta({ secret: true })` in `settingsSchema` are encrypted by `encryptPluginSettings()` at the install/settings write boundary), `onboardingCompleted` (`boolean`), `installedAt`, `updatedAt`.
  - Primary key: `(userId, pluginId)`.
- [x] **Step 2: Create `plugin_storage` table for Zero-Migration Plugin Persistence**
      Lets any plugin store JSON documents (`ctx.storage.get(collection, key)`, `ctx.storage.set(collection, key, value)`, `ctx.storage.list(collection)`) with automatic `tenant_id` and `user_id` isolation—no SQL migration needed for simple plugins!
- [x] **Step 3: Create `createPluginTable(pluginId, tableName, columns)` helper**
      For high-volume relational plugins (like Backtesting runs or Paper Trading orders), automatically prefixes table names (`plg_<pluginId>_<tableName>`) and injects `tenantId` with standard RLS policies.

#### Task 0.3: Build the 1-Command Vibe-Coder Scaffolder (`pnpm create:plugin`) ✅

**Files:**

- Create: `scripts/create-plugin.mjs`
- Create: `plugins/package.json`
- Create: `plugins/registry.ts`
- Modify: `package.json` (add `"create:plugin": "node scripts/create-plugin.mjs"`)
- Modify: `Dockerfile` and `Dockerfile.worker` (plugin package.json COPY markers)

**Architecture & Implementation Steps:**

- [x] **Step 1: Implement `pnpm create:plugin <plugin-id>`**
      Generates `plugins/<plugin-id>/` with `package.json`, `tsconfig.json`, `src/index.ts` (pre-wired `definePlugin`), `src/ui/index.tsx` (pre-wired `definePluginUi`), `skills/default-skill/SKILL.md` (template Mastra Skill), and `test/plugin.test.ts`.
- [x] **Step 2: Auto-register in `plugins/registry.ts`**
      Updates the central workspace barrel `plugins/registry.ts` so `apps/web` and `apps/worker` discover the new plugin automatically without manual wiring.

### Phase 1: Unsealing Kestrel Core Extension Points (Touch Core Once) — ✅ Complete (2026-10-24)

#### Task 1.1: Open `ToolName` Union & Add `AutoPluginToolCard` in `apps/web` ✅

**Files:**

- Modify: `packages/shared/src/ai/tool-names.ts`
- Modify: `packages/shared/src/ai/tool-io.ts`
- Modify: `apps/web/src/components/chat/parts/registry.tsx`
- Create: `apps/web/src/components/chat/parts/auto-plugin-tool-card.tsx`
- Modify: `apps/web/package.json` and `apps/web/next.config.mjs` (workspace deps + transpilation for the SDK/registry)

**Architecture & Implementation Steps:**

- [x] **Step 1: Widen `ToolName` in `packages/shared/src/ai/tool-names.ts`**
      Keep `CORE_TOOL_NAMES` as the strict tuple for built-in tools, and export:
  ```typescript
  export type CoreToolName = (typeof CORE_TOOL_NAMES)[number];
  export type ToolName = CoreToolName | (string & {});
  ```
- [x] **Step 2: Update `ChatToolPart` in `apps/web/src/components/chat/parts/registry.tsx`**
  1. If `isCoreToolName(name)` → render from `corePartRegistry[name]`.
  2. Else if `pluginUiRegistry.hasToolPart(name)` → validate payload against the plugin tool's `outputSchema` and render the plugin's custom React card.
  3. Else → render `AutoPluginToolCard` (a sleek Hoplite card that automatically formats numbers, percentages, arrays/tables, and status badges using Geist Mono tabular numerals so **new plugin tools look great in chat with zero React code**).

#### Task 1.2: Per-User Dynamic Tool & Skill Injection in `@kestrel/ai` ✅

**Files:**

- Create: `packages/ai/src/plugins/index.ts`
- Create: `packages/ai/src/plugins/runtime.ts`
- Create: `packages/ai/src/plugins/mastra-tools.ts`
- Create: `packages/ai/src/plugins/indicators.ts`
- Create: `packages/ai/src/alerts/channel-registry.ts`
- Modify: `packages/ai/src/mastra-v2/agents/canonical/index.ts`
- Modify: `packages/ai/src/mastra-v2/planning/mode-runner.ts`
- Modify: `packages/ai/src/committee/specialists.ts`
- Modify: `packages/ai/src/committee/specialist-runner.ts`
- Modify: `packages/ai/src/committee/types.ts`
- Modify: `packages/ai/src/mastra-v2/mutation/mutation-policy.ts`
- Modify: `packages/ai/src/alerts/delivery.ts`
- Modify: `packages/ai/src/alerts/evaluator.ts`
- Modify: `packages/shared/src/schemas/alerts.ts`
- Note: `packages/ai/src/tools/registry.ts` and `capabilities/index.ts` keep their core manifests unchanged; plugin capabilities are merged at the agent boundary instead of mutating core allowlists.

**Architecture & Implementation Steps:**

- [x] **Step 1: Inject `installedPlugins` into Mastra `RequestContext`**
      Resolve the user's enabled installs through the cached `getInstalledPluginRuntime(userId)` helper and store the ids on `requestContext` in `setupCanonicalChat`, the background mode runner, and specialist contexts (`contextWithPacket` preserves the field).
- [x] **Step 2: Dynamic `tools` and `skills` on `canonicalChat` and Specialist Desks**
      Build per-request Mastra tools/skills arrays from `PluginHost` (resolved with the user's installed ids) and merge them into `canonicalChat` and `resolveSpecialistDeskTools()`. Inline plugin skills are converted through Mastra `createSkill()`.
  - Support Mastra's `toModelOutput` on plugin tools so large backtest/chart arrays stay in the UI stream while the LLM receives a concise summary.
- [x] **Step 3: Dynamic Mutation Confirmation Policy (`mutation-policy.ts`)**
      Keep the strict core mutation enum and add a fail-closed plugin path: a mutation id is accepted only if `pluginHost` registers it as a write tool and the user has the owning plugin installed. `requiresConfirmation` may be a function `(input, ctx) => boolean` so Paper Trading can require confirmation on a Personal account while running autonomously on an Agent Sandbox account.
- [x] **Step 4: Replace Hardcoded Alert Switch & Indicator Regex**
  - In `packages/ai/src/alerts/delivery.ts`, replace `switch (ch)` with the `alertChannelRegistry` plus plugin-channel resolution; all channels share one `markFired` point.
  - In `packages/ai/src/alerts/evaluator.ts`, build the indicator parser dynamically from `indicatorRegistry.listKinds()` and bridge plugin indicators in at boot via `syncPluginIndicators()`.

#### Task 1.3: Worker `TickBus` & Per-User Plugin Job Filtering in `apps/worker` ✅

**Files:**

- Create: `apps/worker/src/tick-bus.ts`
- Create: `apps/worker/src/plugin-jobs.ts`
- Modify: `apps/worker/src/scheduler.ts`
- Modify: `apps/worker/src/index.ts` (tick fan-out + boot-time plugin registration)
- Modify: `apps/worker/package.json`
- Test: `apps/worker/test/tick-bus.test.ts`

**Architecture & Implementation Steps:**

- [x] **Step 1: Create `TickBus` in `apps/worker/src/tick-bus.ts`**
      When `SignalR` or `Binance` consumers receive a validated tick, emit it asynchronously to registered `pluginHost.getTickSubscribers()`. Each subscriber has an error boundary, bounded in-flight queue, symbol filter, and cached installed-user/storage context so a plugin bug never interrupts core tick/candle persistence.
- [x] **Step 2: Register Plugin Cron Jobs in `apps/worker/src/scheduler.ts`**
      Schedule all `pluginHost.getJobs()` alongside core `JOBS`, passing `ctx.getInstalledUsers()` so a plugin job only processes users who have actually installed and enabled that plugin. Runs are timeout-bounded and support an optional daily cron lock.

### Phase 2: The 1-Click Plugin Store & Guided Setup UX (`apps/web`) — ✅ Complete (2026-10-25)

#### Task 2.1: Build `/settings/plugins` Store, Auto-Settings Form, and Dynamic Shell Slots

**Files:**

- Create: `apps/web/src/app/(app)/settings/plugins/page.tsx`
- Create: `apps/web/src/app/(app)/settings/plugins/_components/plugin-store-grid.tsx`
- Create: `apps/web/src/app/(app)/settings/plugins/_components/plugin-setup-drawer.tsx`
- Create: `apps/web/src/app/(app)/settings/plugins/_components/auto-zod-settings-form.tsx`
- Create: `apps/web/src/app/api/plugins/manage/route.ts`
- ✅ Already implemented in Phase 1: `apps/web/src/app/api/plugins/[pluginId]/[[...path]]/route.ts` (+ `apps/web/src/lib/services/plugin-api.ts`)
- Create: `apps/web/src/app/(app)/plugins/[pluginId]/[[...slug]]/page.tsx`
- Modify: `apps/web/src/components/layout/desktop-sidebar.tsx`

**Architecture & Implementation Steps:**

- [x] **Step 1: Build the 1-Click Install / Uninstall API (`/api/plugins/manage`)**
  - `POST /api/plugins/manage` (`{ action: 'install' | 'uninstall' | 'update-settings', pluginId, settings }`):
    - On `'install'`: Inserts row into `user_installed_plugins`, calls `plugin.onUserInstall(ctx)` (which pre-seeds defaults like Paper Trading accounts automatically!), and returns the onboarding status.
- [x] **Step 2: Build the Visual Plugin Store (`/settings/plugins`)**
  - Displays **"Installed Plugins"** (with quick Settings Drawer & 1-click Disable/Uninstall) and **"Available Plugins to Install"** categorized by capability (`Quant Research`, `Trading & Execution`, `Channels & Automation`, `Agents & Skills`).
  - Includes `AutoZodSettingsForm`: inspects any plugin's `manifest.settingsSchema` (Zod) and automatically renders Hoplite inputs, toggles, selects, and encrypted API key fields—zero custom form code required!
- [x] **Step 3: Filter Sidebar Nav, Dashboard Widgets, and `⌘K` Commands by Installed Plugins**
  - The user's session/layout fetches their `installedPluginIds` and dynamically mounts only the sidebar links (`/plugins/backtesting`, `/plugins/paper-trading`, `/plugins/custom-agents`), dashboard widgets, and slash commands for the plugins they have installed.

## Part II: Plug-and-Play Blueprints for Your 4 Flagship Plugins (Build Later, One by One)

> **Numbering note (2026-10-25):** the high-level roadmap is authoritative for phase numbers. The Part II headings below were written before the Phase 2/3 split, so Phase 3 (Telegram) is delivered and the remaining Blueprint 1/2/4 work maps to Phases 4, 5 and 6.

Once Part I (Phases 0–2) is complete, building any of the 4 plugins below requires **zero edits to Kestrel's core packages**. Moreover, each plugin wraps existing open-source engines and native Mastra v1.78 features.

### Phase 3 heading (legacy numbering) → delivered as Phase 4: `@kestrel/plugin-backtesting` (Skills + Knowledge + local engine)

> **Status:** ✅ Delivered. The audit named `backtest-kit`; the implementation uses a local deterministic engine plus `trading-signals` and QuickJS because `backtest-kit`'s process-global registries are not tenant-safe. See the Phase 4 progress entry for the full rationale.

**Open-Source Packages & Mastra Primitives Used:**

- **[`backtest-kit`](https://github.com/tripolskypetr/backtest-kit)**: Handles the bar-by-bar execution loop (`Backtest.run()`), multi-strategy comparison (`Walker.run()`), temporal look-ahead protection (`AsyncLocalStorage`), SL/TP/trailing-stop simulation, slippage/fees, and Sharpe/MaxDD/Expectancy calculation.
- **[`trading-signals`](https://github.com/bennycode/trading-signals)** + **`@kestrel/indicators`**: Supplies 35+ streaming technical indicators + Kestrel's SMC detectors (`FVG`, `Order Blocks`, `Liquidity Sweeps`, `BOS/CHoCH`, `Asian Range`, `PDH/PDL`).
- **[`quickjs-emscripten`](https://github.com/justjake/quickjs-emscripten)** (or Mastra `LocalSandbox` with `allowNetwork: false`): Runs agent-authored `getSignal(ctx)` strategy functions in a fast, memory-capped, zero-network sandbox.
- **Mastra Native `Skills` (`@mastra/core/skills`)**: Provides `skill`, `skill_read`, and `skill_search` over `plugins/backtesting/skills/*/SKILL.md`.

**How the User & Agent Experience Works:**

1. **1-Click Install**: User clicks **Install** on **Backtesting Lab** in `/settings/plugins` (`installMode: 'instant'`).
2. **Skills & Knowledge Equipped**: Kestrel's agents immediately gain access to:
   - `skills/strategy-architect/SKILL.md`: Complete guide on how to design, code, and validate `getSignal(ctx)` strategies using SMC + TA indicators and `backtest-kit` risk rules.
   - `skills/smc-ict-playbooks/SKILL.md` + `references/` (`silver-bullet.md`, `judas-swing.md`, `fvg-ob-confluence.md`, `turtle-soup.md`).
   - `skills/quant-stat-arb/SKILL.md` + `references/` (`bollinger-keltner-squeeze.md`, `atr-volatility-breakout.md`, `rsi-regime-pullback.md`).
   - **Custom Knowledge Upload**: Users can also paste or upload their own `.md` strategy notes into the Backtesting Knowledge Base!
3. **Flexible Agent Strategy Creation & Backtesting (`create_and_backtest_strategy` tool)**:
   - When the user says: _"Read my ICT Silver Bullet skill and test a 15m XAUUSD setup where price sweeps the London high/low and enters on the first Fair Value Gap with a 2R target"_, the agent:
     1. Calls `skill_read` to read the playbook.
     2. Writes a custom `getSignal(ctx)` function combining `ctx.smc.liquiditySweeps`, `ctx.smc.fvg`, and `ctx.session.isLondonKillzone`.
     3. Executes `Backtest.run(symbol, strategyConfig)` via `backtest-kit` over historical candles from `@kestrel/data`.
     4. Uses `toModelOutput` to stream the full interactive equity curve, drawdown chart, and trade table to the React `BacktestResultPart` card while returning the statistical scorecard to the LLM so the agent can refine parameters if needed!

### Phase 4 heading (legacy numbering) → delivered as Phase 5: `@kestrel/plugin-paper-trading` (Dual Accounts)

> **Status:** ✅ Delivered. The broker uses Kestrel's TickBus and its own domain accounting rather than `backtest-kit Live`, which is built around process-global exchange/strategy registries. See the Phase 5 progress entry.

**Open-Source Packages & Mastra Primitives Used:**

- **[`backtest-kit` (`Live` & `Position`)](https://backtest-kit.github.io/)**: Reuses the exact same position sizing, SL/TP/trailing-stop state machine, and P&L math as the Backtesting plugin!
- **Kestrel Worker `TickBus`**: Subscribes to live BiQuote SignalR and Binance WebSocket ticks.

**How the User & Agent Experience Works:**

1. **1-Click Install (`installMode: 'instant'`)**:
   - `onUserInstall` automatically creates two virtual accounts in `plg_paper_accounts`:
     - **Personal Demo Account (`$100,000`, `mode: 'confirm'`)**: Requires 1-click user confirmation (`Approve / Deny` card) before any agent order executes.
     - **AI Agent Sandbox Account (`$50,000`, `mode: 'autonomous_sandbox'`)**: Allows agents and deployed strategies to place, trail, and close virtual trades autonomously 24/7.
2. **1-Click "Deploy Backtest to Paper"**:
   - Every `BacktestResultPart` card in chat has a **[ 🚀 Run Live in Paper Sandbox ]** button that takes the exact strategy the agent just backtested and starts it in `backtest-kit` `Live` mode against real-time ticks!
3. **Live Context Enrichment (`PluginPacketEnricher`)**:
   - Whenever the user asks about a symbol in chat, the Paper Trading enricher attaches their open paper positions and unrealized P&L for that symbol to `SymbolResearchPacket`, so agents can advise on whether to hold, trail stop to breakeven, or take partials.

### Phase 5 heading (legacy numbering) → delivered as Phase 3: `@kestrel/plugin-telegram` (`grammY` + Mastra `Schedules`)

> **Status:** ✅ Delivered as Phase 3. See the Phase 3 progress entry.

**Open-Source Packages & Mastra Primitives Used:**

- **[`grammY`](https://grammy.dev/)** + `@grammyjs/menu`: Clean, modular TypeScript Telegram bot framework with interactive inline button menus.
- **Mastra Native `mastra.schedules` (`@mastra/core@^1.78.0`)**: Built-in durable cron scheduling (`mastra.schedules.create`, `pause`, `resume`, `run`, `delete`) with IANA timezones.

**How the User & Agent Experience Works:**

1. **Guided 30-Second Setup Wizard (`installMode: 'wizard'`)**:
   - User clicks **Install** on **Telegram Copilot**, pastes their `@BotFather` token (or uses the shared server bot if self-hosted for a team), clicks **Auto-Set Webhook**, and clicks **1-Tap Link Account** (`t.me/<bot>?start=<token>`).
2. **Effortless Scheduled Briefings & Cron Alerts**:
   - Users can schedule recurring tasks in plain English from Chat or Telegram: _"Every day at 08:00 London time, check XAUUSD and my paper positions and message me on Telegram."_
   - Uses Mastra's built-in `mastra.schedules.create()` and delivers the output via `grammY` with interactive action buttons (`[📈 View Chart]`, `[🧪 Backtest Setup]`, `[⏸️ Pause Schedule]`).

### Phase 6 (Plugin Blueprint 4): `@kestrel/plugin-custom-agents` (Standalone Mastra Agents + Skills + MCP) — ✅ Delivered

> **Status:** ✅ Delivered. The Agent Studio, starter agents, knowledge upload,
> `@handle` routing, subagent delegation and MCP bridge are live. See the
> Phase 6 progress entry for the generic catalog contract and deviations.

**Open-Source Packages & Mastra Primitives Used:**

- **Mastra `Agent` & `Subagents` (`@mastra/core/agent`)**: Standalone agent instantiation and optional parent-to-subagent delegation (`onDelegationStart` / `onDelegationComplete`).
- **Mastra `Skills` (`@mastra/core/skills`)**: `createSkill()` and `validateSkillContent()` so users can attach custom `SKILL.md` playbooks and reference docs to each custom agent.
- **Mastra `MCPClient` (`@mastra/mcp`)**: Connects any external Model Context Protocol server to a custom agent.

**How the User & Agent Experience Works:**

1. **1-Click Install (`installMode: 'instant'`)**:
   - Adds the **Agent Studio (`/plugins/custom-agents`)** to the sidebar and comes pre-loaded with 4 optional starter templates (_ICT Silver Bullet Mentor_, _Quant Strategy Coder_, _Macro Central Bank Analyst_, _Prop-Firm Risk Coach_).
2. **Create a Standalone Agent in 3 Steps (No Coding Required)**:
   - **Step 1**: Give it a Name, `@handle` (e.g. `@ict-mentor`), and System Instructions (or import a `.agent.md` file).
   - **Step 2**: Attach **Skills & Knowledge** (upload Markdown strategy guides, PDFs/notes, or select installed plugin skills) + check the boxes for which **Tools** it can use.
   - **Step 3**: Pick its AI model (or leave on default) and click **Save**.
3. **Use Anywhere**:
   - Type `@ict-mentor` in the Research Chat composer, switch to the agent in the top bar, or invoke it from Telegram (`/ask @ict-mentor ...`). It runs as a completely independent standalone Mastra `Agent` without touching or slowing down Kestrel's 4-Desk Committee!

---

## Implementation Progress Log

### 2026-10-24 — Phase 0: Foundation ✅

**Delivered**

- `packages/plugin-sdk/` — dual entrypoints (`.`, `./ui`) plus a server-only `./settings` entry:
  - `src/types.ts`: manifest, tools, skills, standalone agents, jobs, tick subscribers, alert channels, indicators, packet enrichers, API routes, and user lifecycle hooks.
  - `src/host.ts`: `PluginHost` + process-wide `pluginHost` (anchored on `globalThis`), duplicate/reserved-ID rejection, per-user resolution, write-tool detection, and fail-safe confirmation defaults.
  - `src/ui.tsx`: `definePluginUi` + `PluginUiRegistry` (no React runtime import).
  - `src/settings.ts`: `enc:v1:`-prefixed AES-256-GCM encryption, decryption, and masking from Zod `.meta({ secret: true })`.
- `packages/db/`:
  - `src/schema/plugins.ts`: `user_installed_plugins`, `plugin_storage`, and `createPluginTable()`.
  - `src/queries/plugins.ts`: install/re-enable, enable/disable, settings updates, uninstall (optional data wipe), cross-tenant enabled-user lookup, and the storage API.
  - `drizzle/0107_plugin_system_tables.sql`: tables, constraints, indexes, forced RLS, and `kestrel_app` grants.
- `plugins/`:
  - Workspace package `@kestrel/plugins` exposing `plugins/registry.ts` with marker regions for generated plugins and per-plugin failure isolation.
  - `scripts/create-plugin.mjs` scaffolds a plugin package, absolute-path `SKILL.md`, sample tool, UI entry, test, workspace dependency, registry entry, and Dockerfile COPY lines.
- Root wiring: `pnpm-workspace.yaml`, `build:packages`, `vitest.config.ts`, `knip.json`, `scripts/check-test-files.mjs`, `Dockerfile`, and `Dockerfile.worker`.

**Deviations / decisions**

- Migration number is `0107_plugin_system_tables` because `0106_gammal_billing.sql` already occupies the next slot in the working tree.
- `plugins/` itself is a private workspace package so `plugins/registry.ts` is resolvable from both apps without relative-import escape hatches.
- Plugin settings ciphertext is prefixed `enc:v1:` so repeated saves cannot double-encrypt and undecryptable values are dropped rather than leaked.
- `createPluginTable()` validates the physical name against PostgreSQL's 63-character identifier limit.
- Tests were intentionally limited to high-value invariants: host registration/filtering/confirmation, settings encryption, schema/RLS shape, mutation policy, and TickBus fault isolation.

**Verification**

- `pnpm typecheck` — 19/19 tasks passed.
- `pnpm lint` — all workspaces passed (pre-existing warnings only).
- `pnpm test` — all suites passed, including the full AI suite (174 files / 1,552 tests) and worker/db/shared/indicators/plugin-sdk suites.
- Migration chain applied successfully to a throwaway PostgreSQL 16 database.
- RLS verified as the non-bypass `kestrel_app` role: tenant A saw 1 install/1 storage row; tenant B saw 0 for both.

### 2026-10-24 — Phase 1: Core extension points ✅

**Delivered**

- Shared contract:
  - `CoreToolName` / `CORE_TOOL_NAMES` remain the strict core tuple; `ToolName` is open for plugin tools.
  - `CoreAlertChannel` remains the core set; alert channel ids are structurally validated kebab-case strings.
  - Indicator specs are structurally validated in shared and resolved against the live registry in the evaluator.
- Web:
  - `partRegistry`/`partSchemas` are total over core tools only.
  - `AutoPluginToolCard` renders scalar grids, object arrays, chips, and raw JSON with accessible loading/error states.
  - Plugin UI cards validate against the plugin tool's real `outputSchema` (or an explicit UI override).
- `@kestrel/ai`:
  - `packages/ai/src/plugins/`: 60-second per-user install cache, decrypted settings, `plugin_storage` adapter, Mastra tool adapter (`toModelOutput`, dynamic `requireApproval`, tool-part streaming/telemetry, per-tool fail-open), Mastra `createSkill()` conversion, and plugin-indicator bridge.
  - Canonical chat, specialists, and the background mode runner inject `installedPlugins` into `RequestContext` and merge only that user's plugin tools/skills.
  - Mutation policy validates plugin write tools against `pluginHost` and the installed-plugin set.
  - Alert delivery uses a channel registry (`email`, `telegram`, `web-push` + plugin channels) with a single `markFired` point.
  - Evaluator indicator parsing is built from `indicatorRegistry.listKinds()`.
- Worker:
  - `apps/worker/src/tick-bus.ts`: async plugin fan-out with per-subscriber error boundaries, bounded in-flight queues, symbol filters, and cached installed-user/storage contexts.
  - `apps/worker/src/plugin-jobs.ts`: plugin cron scheduling with timeout, optional daily lock, and per-user install filtering.
  - Worker boot registers bundled plugins and syncs plugin indicators.
- Web extension point:
  - `apps/web/src/app/api/plugins/[pluginId]/[[...path]]/route.ts` + `apps/web/src/lib/services/plugin-api.ts`: authenticated, tenant-scoped dispatch with static/dynamic/wildcard route matching, decrypted settings, and isolated storage.
  - Web instrumentation registers bundled plugins and syncs plugin indicators at boot.

**Deviations / decisions**

- The generic plugin HTTP route was implemented in Phase 1 (it is named in the Phase 1 overview row even though the detailed Phase 2 task list also references it).
- Installed-plugin lookup fails open with a cached empty result: a plugin-table outage degrades to core-only capabilities instead of failing chat.
- Plugin tool execution reuses the existing Mastra lifecycle wrapper so plugin tool parts stream to the UI and write the same tool telemetry rows as core tools.

**Verification**

- `pnpm typecheck` — 19/19 tasks passed after all changes.
- `pnpm lint` — all workspaces passed.
- `pnpm test` — all suites passed.
- `pnpm build:packages`, `pnpm --filter @kestrel/worker build`, and the Next.js production build all succeeded.
- Added focused tests for TickBus failure isolation and plugin mutation install gating.

### 2026-10-25 — Phase 2: Store, manage API & dynamic shell ✅

**Delivered**

- SDK:
  - `src/settings-schema.ts`: `describePluginSettingsSchema()` turns a plugin Zod schema into serialisable field descriptors (string/number/integer/boolean/enum/json, defaults, min/max, placeholders, secret and hidden metadata).
  - `src/settings.ts`: `preparePluginSettings()` merges partial form submissions, preserves masked secrets, applies Zod defaults/validation, and encrypts secret fields.
  - `src/constants.ts`: browser-safe `PLUGIN_SECRET_MASK` / `PLUGIN_SECRET_PREFIX`.
  - `publicApiRoutes` + `PluginPublicApiRouteContext`: unauthenticated provider transports (Telegram webhooks) with a fail-closed `getInstall()` resolver.
- Database/service:
  - `apps/web/src/lib/services/plugin-manage.ts`: install (with lifecycle hook + compensation on fresh-install failure), uninstall (keep/wipe data, settings snapshot/restore), update-settings, enable/disable, cache invalidation, rate limiting, tenant-scoped reads for server components.
- Web:
  - `POST/GET /api/plugins/manage` + `lib/plugins/manage-schema.ts`.
  - `/settings/plugins` store grid: installed/available sections, search, capability filters, install/enable/disable/uninstall, keep-data toggle, and setup-needed state.
  - `AutoZodSettingsForm`: generated Hoplite inputs, switches, selects, secret fields with reveal, JSON fallback.
  - `PluginSetupDrawer`: declarative multi-step wizard, per-step credential saving, plugin setup actions, single-use link rendering, completion tracking.
  - Dynamic shell: sidebar/nav drawer plugin sections, ⌘K plugin group, dashboard plugin widgets with unavailable fallbacks, plugin nav/widget/slash-command counts in the store.
  - Plugin page shell `/plugins/[pluginId]/[[...slug]]`, plugin UI bootstrap (`@kestrel/plugins/ui` + `register-ui.ts`), settings nav/quick-link/command entries.
  - Alert form/cards/list surface the plugin `telegram-bot` channel when installed.
  - `publicApiRoutes` dispatcher at `/api/plugins/public/[pluginId]/[[...path]]` with per-user install resolution.
- Scaffolder/wiring: `create:plugin` now registers UI slots too; fixed its `rewrite-dist-imports` and `SKILL.md` path generation; added `@kestrel/plugin-telegram-bot` to Next transpilation and Docker package COPY markers.

**Deviations / decisions**

- Uninstall without “delete data” snapshots encrypted settings in `plugin_storage` so reinstall restores them; wipe removes the whole plugin storage scope.
- Dashboard widgets receive **masked** settings only; a widget that needs secrets must fetch through its authenticated plugin API.
- `publicApiRoutes` is a new contract rather than putting provider webhooks behind `withAuth`; each handler must validate its own HMAC/secret.

### 2026-10-25 — Phase 3: `@kestrel/plugin-telegram-bot` ✅

**Delivered**

- `plugins/telegram-bot/` workspace package (`@kestrel/plugin-telegram-bot`) using grammY:
  - Wizard manifest: BotFather instructions → encrypted token validation (`getMe`) → automatic `setWebhook` + command menu → single-use 15-minute link → tap-to-link.
  - Public webhook at `/api/plugins/public/telegram-bot/webhook/<signed-user-token>` with HMAC path token **and** `X-Telegram-Bot-Api-Secret-Token`, plus a per-install `plugin_storage` update ledger for idempotency.
  - Commands: `/start`, `/help`, `/link`, `/price`, `/news`, `/calendar`, `/status`, `/positions`, `/me`, `/settings`, `/alert`, `/briefing`, `/mute`, `/unmute`, `/unlink`, `/analyze`, `/ask`, `/committee`, plus inline menus and analyse-mode callbacks.
  - Daily briefing job (`*/5 * * * *`) that checks each user’s local time, sends once per local day, and prunes the update ledger.
  - Four agent tools: `telegram_status`, `telegram_create_link`, `telegram_send_briefing`, `telegram_set_briefing`.
  - `telegram-bot` alert channel so alerts created from Telegram are delivered by the user’s own bot.
  - Plugin page `/plugins/telegram-bot` (status, link/unlink, test message, command reference) + “Telegram Copilot” dashboard widget + `SKILL.md` playbook.
  - `onUserInstall` generates the webhook secret; `onUserUninstall` deletes the Telegram webhook and unlinks the chat.

**Deviations / decisions**

- Phase 3 follows the **high-level roadmap** (Telegram), as confirmed with the user. The detailed Part II heading that labels backtesting “Phase 3” is legacy numbering.
- The shared `packages/ai/src/bot` + `telegram` modules remain for deployments that deliver core alerts through `TELEGRAM_BOT_TOKEN`; the interactive per-user bot is now in the plugin. Fully deleting the shared bot would break the core `telegram` alert channel and is deferred until that channel is migrated.
- `@grammyjs/menu` was not needed: grammY’s `InlineKeyboard` covers the menu/callback surface with one fewer dependency.
- Daily briefings use Kestrel’s Phase 1 plugin job runtime (local-time window) instead of `mastra.schedules`, avoiding a new global scheduler worker and keeping per-user work isolated.
- Multi-role deployments need `ADMIN_DATABASE_URL` for the public webhook install lookup; the dispatcher falls back to a tenant-scoped primary read for single-role/local deployments.
- Web-created alerts can select the plugin channel; alerts created from Telegram automatically use it.

**Verification**

- `pnpm typecheck` — 21/21 tasks passed.
- `pnpm lint` — 12/12 tasks passed (pre-existing warnings only).
- `pnpm test` — 12/12 tasks passed; web 127 files / 1,164 tests, AI 174 files / 1,552 tests, plus plugin-sdk and telegram-bot suites.
- `pnpm --filter @kestrel/web build` and `pnpm --filter @kestrel/worker build` succeeded.
- `node scripts/check-route-security.mjs` passed (public plugin route allowlisted; manage route uses `withAuth` + `parseJsonBody`).

### 2026-10-25 — Phase 4: `@kestrel/plugin-backtesting` ✅

**Delivered**

- `plugins/backtesting/` workspace package (`@kestrel/plugin-backtesting`) with `.`, `./server`, `./engine`, and `./ui` entrypoints.
- Engine (`src/engine/`):
  - `features.ts` — causal point-in-time matrix: `trading-signals` TA series (EMA/SMA/RSI/ATR/ADX/MACD/Bollinger/Stochastic/SuperTrend/VWAP/OBV/CCI/Williams %R/PSAR/Keltner/Donchian/MFI/ROC) plus Kestrel SMC zones, sweeps, structure, swings, PDH/PDL and Asian range.
  - `sandbox.ts` — QuickJS-WASM strategy sandbox: no host globals, 96MB memory cap, stack cap, interrupt deadline, point-in-time `series()/price()` accessors, per-bar `getSignal(ctx)` loop inside WASM.
  - `simulator.ts` — next-bar market fills, limit fills/expiry, stop-first intrabar tie-breaks, gap fills, spread/slippage/commission, risk sizing + leverage cap, trailing/breakeven, time stops, mark-to-market equity/drawdown.
  - `metrics.ts` — PF, expectancy/R, win/loss streaks, MFE/MAE, exposure, Trade Sharpe/Sortino.
  - `run.ts` — orchestration, warnings, downsampling.
- Persistence: `plg_backtesting_runs` and `plg_backtesting_strategies` (`0108_backtesting_plugin_tables.sql`), RLS forced, grants, indexes.
- Tools (11): `backtest_run_strategy`, `backtest_list_runs`, `backtest_get_run`, `backtest_save_strategy`, `backtest_list_strategies`, `backtest_read_strategy`, `backtest_delete_strategy`, `backtest_knowledge_list/read/save/delete`.
- API: runs CRUD, manual runs, strategies, knowledge base, widget summary, async `/runs/async` + `/jobs/:jobId` via `pg-boss`.
- UI: run page with uPlot equity chart, trade table, diagnostics, exact source; strategy library; knowledge base; New Run form with background execution; dashboard widget; chat cards.
- Skills: `strategy-architect`, `smc-ict-playbooks`, `quant-playbooks` + 11 reference documents.
- Wiring: plugin/UI registries, Next transpilation, Docker COPY markers, vitest project, knip, test-file guard, `quickjs-emscripten@0.32`, `uplot@1.6`, `pg-boss@12` queue module.

**Deviations / decisions**

- `backtest-kit` is **not** used. It registers strategies/exchanges in process-global maps with no per-run teardown, its `getSignal` signature does not carry per-bar SMC/TA context, it peers on TypeScript 5 while this repo is on TS 7, and it has no tenant/RLS or dual-account approval model. The local engine keeps the same no-look-ahead contract while remaining safe for per-user server runs. `trading-signals` and Kestrel SMC still provide the "don't reinvent indicator math" reuse.
- `@mastra/core@1.78.0` has no `./workspace` or `./sandbox` export, so the audit's `LocalSandbox` option was unavailable. QuickJS-WASM is the isolation boundary.
- `uplot` replaced the initial SVG equity chart for zoom/crosshair and large-curve performance.
- `pg-boss` is optional: async runs require a worker and DATABASE_URL (or ADMIN_DATABASE_URL); the synchronous chat/UI path works without it.
- Large artifacts are capped per run (1,000 trades, 1,500 equity points persisted; 200/500 returned to chat).

**Verification**

- `pnpm typecheck` — 25/25 tasks.
- `pnpm lint` — 14/14 tasks (pre-existing warnings only).
- `pnpm test` — 14/14 tasks; AI 174 files / 1,552 tests; backtesting 3 files / 21 tests.
- `pnpm --filter @kestrel/web build` and `pnpm --filter @kestrel/worker build` succeeded; Next standalone includes QuickJS wasm; worker deploy includes pg-boss/pg/QuickJS wasm.
- Migrations `0108`/`0109` applied to a throwaway PostgreSQL 16 database; RLS verified as `kestrel_app` (tenant A 1/1, tenant B 0/0).
- Queue smoke (local Postgres): enqueue → work → completed with `{ runId }` output.
- Next standalone and worker deploy artifact checks for QuickJS `.wasm`, `pg-boss`, `pg`, `uplot`.

### 2026-10-25 — Phase 5: `@kestrel/plugin-paper-trading` ✅

**Delivered**

- `plugins/paper-trading/` workspace package (`@kestrel/plugin-paper-trading`) with `.` and `./ui`.
- Domain (`src/domain.ts`): quote normalization (synthetic spread for mid-only feeds), market/limit/stop matching, risk + margin sizing, P&L, R-multiple, trailing/breakeven, stop-first evaluation, bracket validation, account snapshot.
- Persistence: `plg_paper_trading_accounts`, `_positions`, `_orders`, `_fills` (`0109_paper_trading_plugin_tables.sql`), RLS forced, grants, indexes, unique (user, mode).
- Services: account seeding/resolution/update/reset, order placement, pending-order fills, partial/full close, protection modification, mark-to-market, Journal sync, summary.
- Worker: `paper-fills` TickBus subscriber (per-user watched-symbol cache, 250ms throttle, single-flight, tenant transaction per user) + `paper-market-watch` minute fallback job.
- Tools (10): `paper_get_accounts`, `paper_place_order`, `paper_list_positions`, `paper_list_orders`, `paper_get_position`, `paper_cancel_order`, `paper_close_position`, `paper_modify_position`, `paper_update_account`, `paper_reset_account`.
- API: summary, accounts, positions, orders, fills, close/modify/cancel/reset.
- UI: account cards, place-order form, positions/orders tables, recent closes/fills, dashboard widget, chat cards for place/list/close/accounts.
- Skill: `paper-trading-desk` + order/risk and desk-routine references.
- Lifecycle: install seeds Personal Demo ($100k, `confirm`) and AI Agent Sandbox ($50k, `autonomous_sandbox`); uninstall with wipe removes all plugin ledger rows.

**Deviations / decisions**

- The broker is implemented in-plugin rather than on `backtest-kit Live` (same global-registry/tenant problem as Phase 4). This also makes the D-02 confirmation policy and RLS account model first-class.
- The core does not yet consume `PluginPacketEnricher`; instead the skill + `paper_list_positions` tool give agents the same position context on demand. Wiring enrichers safely requires a user-aware packet cache key and is deferred.
- Journal entries use tags (`paper`, `paper-<mode>`) because `journal_entries` has no `source` column; `position.journalEntryId` prevents duplicates.
- Stopped strategies/1-click "deploy backtest to paper" are deferred; the broker supports manual and agent orders today.
- `paper_place_order` is a write tool with a dynamic approval function: `confirm` accounts require the Mastra card; `autonomous_sandbox` does not. Close/cancel are risk-reducing and never wait for approval.

**Verification**

- `pnpm typecheck` — 25/25 tasks.
- `pnpm lint` — 14/14 tasks.
- `pnpm test` — 14/14 tasks; paper-trading 3 files / 22 tests.
- Migration `0109` applied to a throwaway PostgreSQL 16 DB; RLS verified as `kestrel_app`.
- Paper service integration on the migrated DB: seeded $100k/$50k, account views, risk update to 2.5%, sandbox reset to $50k.
- `pnpm --filter @kestrel/web build` and `pnpm --filter @kestrel/worker build` succeeded.

### 2026-10-25 — Phase 6: `@kestrel/plugin-custom-agents` ✅

**Delivered**

- `packages/plugin-sdk/`:
  - `PluginUserAgentCatalog`, `PluginUserAgentDefinition`, `PluginUserAgentMcpServer`,
    `PluginUserAgentCatalogContext` and `PluginCoreToolInfo`.
  - `PluginHost.agentCatalogs` registration/validation, per-user catalog
    resolution, and the reviewed core-tool catalog (`setCoreTools`/`getCoreTools`).
- `@kestrel/ai`:
  - `plugins/agents.ts`: per-user agent discovery, Mastra `Agent` construction,
    core-tool allowlist resolution, plugin tools, inline/path skills, optional
    model pins, MCP resolution, streaming/text runners, subagent builder, run
    ledger hook, and `@handle` parsing.
  - Canonical chat attaches delegatable custom agents through Mastra's `agents`
    property; delegated runs are read-only, MCP-free and skip the duplicate
    guardrail build.
  - `plugins/core-tools.ts` publishes the reviewed core read-only catalog to the
    plugin host at web/worker boot.
  - New `mastra_custom_agent` telemetry kind.
- `plugins/custom-agents/` (`@kestrel/plugin-custom-agents`):
  - DB: `plg_custom_agents` (`0110_custom_agents_plugin_tables.sql`) with forced
    RLS, per-user `@handle` uniqueness, run counter and last-used timestamp.
  - Agent Studio at `/plugins/custom-agents`: searchable cards, four starter
    blueprints, three-step editor, `.agent.md` import, SKILL.md validation and
    upload, installed-plugin playbook picker, grouped tool allowlist, model
    picker, delegation toggle, MCP editor, delete.
  - API: agents CRUD, `/catalog`, `/skills/validate`, `/import-agent-md`,
    `/templates/:templateId`.
  - Six tools: `custom_agent_list/get/templates/create/update/delete`; all
    mutations are write tools with approval cards.
  - Four starter agents seeded on install: `@ict-mentor`, `@pine-coder`,
    `@macro-fed-watcher`, `@prop-risk-coach`.
  - `custom-agent-studio` SKILL.md + three references (agent design, SKILL.md,
    MCP).
  - Settings: agent cap, delegation cap, default model, write-tool opt-in,
    MCP enable/cap, starter seeding.
  - Dashboard widget, sidebar nav, slash command, and chat cards.
- Chat web app:
  - `/api/chat` accepts `agentSlug` and a leading `@handle`; custom turns are
    intercepted before the router, keep injection/credit admission, and stream
    through `mastra-custom-agent-stream.ts` with persistence, title generation,
    tool parts, memory-degraded metadata and run counters.
  - Composer agent selector + `@` mention autocomplete; top-bar active-agent
    badge; custom-agent footer badge; `/chat?agent=<handle>` deep link.
- Telegram:
  - `/ask @handle …` routes to the standalone agent (read-only tools, verified
    snapshot prefix), and `/agents` lists the user's handles.

**Deviations / decisions**

- The core does not import the custom-agents package. A generic
  `PluginUserAgentCatalog` contract inverts the dependency: the plugin owns
  persistence/skills/MCP, and `@kestrel/ai` asks installed catalogs for agents.
- `@mastra/mcp@^1.18.0` is the compatible client for `@mastra/core@1.78.0`
  (`@mastra/mcp@2.x` peers on core ≥1.79). MCP URLs are SSRF-checked (HTTPS
  required except loopback; private/link-local denied unless
  `MCP_ALLOW_PRIVATE_HOSTS=1`). Authorization headers are `enc:v1:` encrypted
  and never returned to the browser.
- Delegated subagents are deliberately read-only and do not resolve MCP
  connections on the hot chat path. Direct `@handle` runs may use write tools,
  but every plugin write tool keeps its approval policy.
- The Studio stores custom skills inline in `plg_custom_agents.skills` and
  plugin playbook selections as `{pluginId, skill}` refs. Missing plugins/refs
  are ignored at runtime rather than failing the agent.
- Run history is a counter + `last_used_at` on the agent row; full per-run
  ledgers remain in `chat_telemetry` (`mastra_custom_agent`).
- `@kestrel/ai` now publishes the core tool catalog lazily (dynamic tool-registry
  import) to avoid an ESM initialisation cycle with the capability manifest.

**Verification**

- `pnpm typecheck` — all workspaces (including plugins) passed.
- `pnpm lint` — all changed workspaces passed (pre-existing warnings only).
- `pnpm test` — plugin-sdk 30 tests, custom-agents 20 tests, AI 1540+ tests
  (3 pre-existing DB-mock/order tests in `mastra-v2-context` still fail without
  a configured Postgres; all other AI suites pass).
- Migration chain applied to a throwaway PostgreSQL 16 database; `plg_custom_agents`
  has forced RLS, tenant isolation, and `kestrel_app` grants verified
  (tenant A 1 row / tenant B 0).
- Custom Agents service smoke on the migrated DB: seeded 4 starter agents,
  created a 5th with tools/skills, updated it, and read it back.
- `pnpm build:packages` succeeded; Next.js production build succeeded on retry
  (first run hit a latent tool-registry TDZ that is cache/order-sensitive; the
  clean rebuild passed); worker esbuild build succeeded.
- `node scripts/check-route-security.mjs` and `node scripts/check-test-files.mjs`
  passed.

### 2026-10-25 — Optional follow-ups: sweeps, deploy-to-paper, enrichers, alert bridge ✅

**Delivered**

- **Backtest → Paper Sandbox deployment**:
  - `plg_paper_trading_strategy_runs` (`0113_paper_strategy_runs.sql`) with
    forced RLS, source/params snapshot, bar cursor, last signal, linked position
    and order/signal counters.
  - `plugins/paper-trading/src/strategy-runner.ts` evaluates the latest closed
    bar with the exact Backtesting Lab QuickJS engine, sizes virtual market
    orders from the signal stop, links the sandbox position and flips exposure on
    an opposite signal.
  - Minute `strategy-runner` plugin job isolates users and individual runs;
    `paper_deploy_strategy` / `paper_list_strategy_runs` agent tools and
    `/strategy-runs` API/UI (pause/resume/stop/delete).
  - `Deploy to Paper` button on every completed Backtest result card.
- **Parameter sweep / optimizer**:
  - `plg_backtesting_sweeps` (`0112_backtesting_sweeps.sql`) with forced RLS,
    objective, grid, progress, best params/metrics and ranked results.
  - Cartesian grid expansion (max 6 params / 10 values each / 200 combos),
    durable `backtest-sweep` pg-boss queue, worker handler, `/sweeps` API and
    Studio Sweeps tab with live progress and leaderboard.
  - `backtest_sweep_strategy` agent tool (in-chat cap 30 combinations).
- **`PluginPacketEnricher` wiring**:
  - `enrichPacketForUser()` applies installed plugins' enrichers after the
    shared base-packet cache read (never cached, never cross-user).
  - Wired into the committee collect step, `convene_committee` and the XAUUSD
    research-packet tool.
  - Paper Trading registers `open-paper-positions`, returning per-symbol open
    exposure, P&L and stops.
- **Core Telegram alert migration**:
  - Web-created alerts that store the core `telegram` channel now deliver
    through the user's personal Telegram bot when the plugin is installed and
    linked; the shared server bot remains a fallback for non-plugin deployments.
- **Custom Agent polish**:
  - `plg_custom_agents_runs` (`0111_custom_agent_runs.sql`) run history with
    bounded pruning, `/agents/:id/runs` API and a Studio Runs dialog.
  - PDF knowledge upload via server-side `unpdf` text extraction (10 MB cap,
    text-based PDFs), wrapped into a validated SKILL.md.
  - `custom_agent_run_script` QuickJS calculation sandbox (32 MB, timeout,
    no network/filesystem/host globals), completing the script-testing gap.

**Verification**

- `pnpm build:packages` — 13/13 tasks.
- `pnpm typecheck` / `pnpm lint` — all workspaces.
- `pnpm test` — all 15 projects passed: AI 175 files / 1,554 tests, web 127 files
  / 1,164 tests, worker 28 files / 149 tests, db 52 tests, plugin suites
  (backtesting 25, paper-trading 27, custom-agents 25, plugin-sdk 30).
- Migrations `0111`–`0113` applied to a throwaway PostgreSQL 16 DB; forced RLS,
  tenant isolation and `kestrel_app` grants verified (tenant A 1/1/1, tenant B
  0/1/0).
- DB smoke: created a custom agent + run history, deployed/paused/deleted a
  paper strategy run, and created/read a 2-combination sweep.
- Paper runner sandbox test generated a latest-bar signal; enricher, sweep
  expansion and schema tests pass.

### Next — only remaining optional item

1. High-fidelity engine adapter (NautilusTrader/LEAN sidecar) behind the existing
   engine interface, only if L2/L3 realism is required.
