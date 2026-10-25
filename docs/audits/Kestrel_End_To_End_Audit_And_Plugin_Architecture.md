# Kestrel End-to-End Codebase Audit & Plugin System Architecture

> **Executive Summary:** Kestrel (`v0.1.0`) is an institutional-grade, self-hosted multi-user AI trading research platform built on a pnpm + Turborepo monorepo (`apps/web`, `apps/worker`, and 6 packages: `shared`, `db`, `indicators`, `data`, `ai`, `test-utils`). While the codebase already contains 5 localized in-memory registries (`ToolRegistry`, `IndicatorRegistry`, `MarketDataProviderRegistry`, `AlertRuleRegistry`, and `JOBS`), adding a single end-to-end feature currently forces edits across **11 to 14 files spanning 5 workspace packages** because of compile-time union types (`TOOL_NAMES`), total mapped React registries (`partRegistry`), monolithic Drizzle schemas (`packages/db/src/schema/index.ts`), and hardcoded Mastra capabilities (`MASTRA_CAPABILITIES`).
>
> This document defines Kestrel's transition to a **Zero-Subscription, 1-Click Installable Plugin Architecture (`@kestrel/plugin-sdk` + `plugins/*`)** that leverages **native `@mastra/core@^1.78.0` primitives** already installed in your repo (`Agent Skills`, `Workspace & Sandboxes`, `Subagents`, `Schedules`, `Channels`, and `MCP`) plus battle-tested open-source TypeScript trading libraries ([`backtest-kit`](https://github.com/tripolskypetr/backtest-kit), [`trading-signals`](https://github.com/bennycode/trading-signals), [`indicatorts`](https://github.com/cinar/indicatorts), and [`grammY`](https://grammy.dev/)) so you never have to reinvent complex engines from scratch.

> **Implementation status (2026-10-25):** The core plugin foundation and the first three product plugins are live. **Phase 0** (`@kestrel/plugin-sdk`, `PluginHost`, `user_installed_plugins`/`plugin_storage` with RLS, query layer, and `pnpm create:plugin`) and **Phase 1** (open tool union, `AutoPluginToolCard`, per-request Mastra tool/skill injection, dynamic mutation/alert/indicator extension points, worker `TickBus`, plugin cron jobs, and the generic `/api/plugins/[...path]` route) are implemented and verified. **Phase 2** (the visual Plugin Store, manage API, generated settings forms, guided setup drawer, dynamic shell slots, and public plugin transport routes) and **Phase 3** (`@kestrel/plugin-telegram-bot`) are implemented and verified. **Phase 4** (`@kestrel/plugin-backtesting`: QuickJS-sandboxed `getSignal(ctx)`, point-in-time SMC/TA features, deterministic execution engine, 3 skills + 10 references, run/strategy/knowledge persistence, uPlot equity charts and a `pg-boss` async run queue) and **Phase 5** (`@kestrel/plugin-paper-trading`: dual Personal/Sandbox accounts, risk/margin sizing, SL/TP/trailing/breakeven, TickBus fills, minute mark-to-market fallback, Journal sync, tools/API/UI) are implemented and verified. **Phase 6** (`@kestrel/plugin-custom-agents`: Agent Studio, starter agents, SKILL.md/`.agent.md` knowledge, tool allowlists, `@handle` routing, subagent delegation and a hardened MCP bridge) is implemented and verified. The optional follow-ups — backtest→paper deployment, parameter sweeps, packet enrichers, plugin-first Telegram alerts, agent run history, PDF knowledge and a QuickJS calculation sandbox — are also live. Only the optional high-fidelity engine adapter remains. Track detailed delivery notes in the [Plugin Implementation Roadmap](./Kestrel_Plugin_Implementation_Roadmap.md#implementation-progress-log).

## 1. Locked Product & Architectural Decisions

Based on your product direction, the entire architecture is governed by these 5 locked decisions:

| Decision ID                                                                   | Decision                                                                                                                                                                                                                                                                                                                                  | Architectural Outcome                                                                                                                                                                                                                                                                                                                                 |
| :---------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-01: Per-User 1-Click Plugin Store (Monorepo, No Subscriptions)**          | Users browse a visual **Plugin Store (`/settings/plugins`)** and click **"Install"** on only the capabilities they want (e.g., Backtesting, Paper Trading, Telegram Bot, Custom Agents). **Subscriptions and billing gates are removed**—all plugins live in `plugins/*` inside the monorepo and are free to install per user in 1 click. | Replaces Stripe/plan gating (`allowedPlans`, `requiredFeature`) with a per-user `user_installed_plugins` table and a guided 1-click installation wizard. Uninstalled plugins stay completely hidden from the user's sidebar, dashboard, worker, and AI agent context.                                                                                 |
| **D-02: Dual-Mode Paper Trading Accounts**                                    | Paper Trading supports both a **"Personal Paper Account"** (requires 1-click HMAC user confirmation in chat/Telegram before placing an order) and an **"Autonomous Agent Sandbox Account"** (where agents and scheduled bots can open/close virtual trades 24/7 automatically).                                                           | Uses Kestrel's existing HMAC confirmation workflow (`mutation-policy.ts`) when `account.mode === 'confirm'`, and bypasses confirmation safely when `account.mode === 'autonomous_sandbox'`.                                                                                                                                                           |
| **D-03: Skills & Knowledge-Driven Strategy Backtesting (No Hardcoded Rules)** | Agents must be able to **invent, write, and backtest any strategy dynamically** using **Skills (`SKILL.md`) and Knowledge (`references/`)** rather than being limited to 2–3 hardcoded dropdown rules.                                                                                                                                    | Combines **Mastra Native Agent Skills (`@mastra/core/skills` & `@mastra/core/workspace`)** with the open-source **[`backtest-kit`](https://github.com/tripolskypetr/backtest-kit)** TypeScript engine and an isolated strategy runner so agents can read SMC/ICT/Quant playbooks and author custom TypeScript/DSL `getSignal()` functions on the fly. |
| **D-04: Standalone Custom Agents Only**                                       | Custom user-created agents operate strictly as **Standalone Agents** (invocable via `@mention`, the chat agent selector, orMastra Subagent delegation) without mutating or slowing down the core 4-Desk Committee (`technical`, `fundamental`, `risk`, `sentiment`).                                                                      | Keeps `packages/ai/src/committee/workflow.ts` rock-solid and fast while registering user agents as standalone Mastra `Agent` instances with their own `skills`, `tools`, and `memory`.                                                                                                                                                                |
| **D-05: Architecture-First & Reuse Open-Source Ecosystems**                   | Prioritize a rock-solid, effortless plugin architecture and UX first. Do not write backtesting, indicator math, or bot frameworks from scratch when mature open-source packages or built-in Mastra v1.78 primitives already exist.                                                                                                        | Directly integrates Mastra's built-in `Skills`, `Workspace`, `Schedules`, `Subagents`, and `MCP` alongside `backtest-kit`, `trading-signals`, `indicatorts`, and `grammY`.                                                                                                                                                                            |

## 2. End-to-End Monorepo Audit: Current State & Bottlenecks

### 2.1 Workspace Topology & Layering

Kestrel enforces a bottom-up dependency graph across 2 applications and 7 workspace packages:

| Workspace Package / App   | Role in Current Architecture                                                                                                                   | Key Strengths Identified in Audit                                                                                                       | Current Coupling / Bottleneck                                                                                                                                                                      |
| :------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`packages/config`**     | Shared ESLint, Prettier, Tailwind (Hoplite tokens), and TypeScript configs                                                                     | Zero runtime footprint; clean inheritance across Node and Next.js                                                                       | Static; no issues                                                                                                                                                                                  |
| **`packages/shared`**     | Zod domain schemas, `env.ts` contracts, BYOK encryption (`vault.ts`), DI container (`container.ts`), tool names/IO                             | Lightweight `Container` with typed `Token<T>` (`src/container.ts`); strict Zod boundary validation                                      | Hardcodes `TOOL_NAMES` array (`src/ai/tool-names.ts`), `ToolOutputMap` (`src/ai/tool-io.ts`), and `WidgetType`                                                                                     |
| **`packages/db`**         | PostgreSQL 16 + `pgvector` Drizzle ORM schema (55+ tables), migrations, tenant RLS (`withTenantDb`)                                            | Mandatory Row-Level Security (RLS) via `app.current_tenant`; clean tenant resolution (`src/tenant.ts`)                                  | All 55+ tables are exported from one central barrel (`src/schema/index.ts`), mixing core auth/chat tables with feature-specific tables (`bot_links`, `portfolio_positions`, `cot`)                 |
| **`packages/indicators`** | Pure deterministic math for SMA, EMA, RSI, MACD, ATR, Bollinger, Pivots, and SMC (FVG, Order Blocks, BOS/CHoCH)                                | Already uses `IndicatorRegistry` (`src/indicator-registry.ts`) with Zod parameter validation and `fast-check` property tests            | `IndicatorKind` union is still hardcoded in `@kestrel/shared`, and `alerts/evaluator.ts` uses a hardcoded regex `INDICATOR_SPEC_RE`                                                                |
| **`packages/data`**       | Market data adapters (`biquote`, `binance`, `finnhub`, `fred`, `marketaux`, `cftc`), health-aware failover, Redis/LRU cache                    | Already uses `MarketDataProviderRegistry` (`src/providers/provider-registry.ts`) with priority sorting and health scoring               | Providers are statically imported in `packages/data` rather than dynamically loaded from plugins                                                                                                   |
| **`packages/ai`**         | 25,000+ LOC Mastra (`@mastra/core@^1.78.0`) orchestration, 4-desk committee, XAUUSD verified reports, 33 tools, Telegram bot, alerts evaluator | Clean `ToolRegistry` (`src/tools/registry.ts`), `AlertRuleRegistry` (`src/alerts/rule-registry.ts`), and bounded `SymbolResearchPacket` | **God Package:** Contains Telegram webhook/bot (`src/bot/`, `src/telegram/`), portfolio CRUD (`src/portfolio/`), alert email/push/TG delivery (`src/alerts/`), and hardcoded `MASTRA_CAPABILITIES` |
| **`apps/worker`**         | Long-running Node.js process for SignalR/Binance WebSocket tick ingestion, 1m candle aggregation, and `node-cron` jobs                         | `JOBS` command registry (`src/jobs/index.ts`) with `AbortController` timeouts, DB-backed `acquireCronLock`, and tenant routing          | `JobName` is a closed TypeScript union (`src/jobs/types.ts`); plugins cannot register new cron schedules or tick listeners dynamically                                                             |
| **`apps/web`**            | Next.js 16 App Router, React 19 Trading Cockpit, Hoplite Design System, Auth.js v5                                                             | High-craft Hoplite UI, dynamic code-splitting (`next/dynamic`) for heavy tool cards, strict route security checks                       | `partRegistry` (`src/components/chat/parts/registry.tsx`) enforces `{ [K in ToolName]: ComponentType }` at compile time; `PRIMARY_NAV_ITEMS`, `COMMANDS`, and `WIDGET_LABELS` are static arrays    |

### 2.2 The 6 Coupling Bottlenecks That Currently Make Development Hard

Today, adding a single new AI tool (like `replay_setup` in `packages/ai/src/tools/replay-setup.ts`) forces you to edit **11 to 14 files across 5 packages**:

| Bottleneck ID                                                | Location in Repo                                                                               | Technical Root Cause                                                                                                                                                                       | Impact on Development                                                                                                                  |
| :----------------------------------------------------------- | :--------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------- |
| **B-01: Closed Tool Unions & UI Totality**                   | `packages/shared/src/ai/tool-names.ts` & `apps/web/src/components/chat/parts/registry.tsx`     | `ToolName` is a static union, and `partRegistry` requires a bespoke React component in `apps/web` for every `ToolName`                                                                     | Adding a tool in `@kestrel/ai` immediately breaks the Next.js build until you also edit `packages/shared` and `apps/web`               |
| **B-02: `packages/ai` is a "God Package"**                   | `packages/ai/src/{bot,telegram,portfolio,alerts,journal,cot,push}`                             | Domain features (Telegram bot, Portfolio positions, Alerts delivery, Journal insights) were placed inside `packages/ai` instead of feature modules                                         | `packages/ai` has 25,000+ LOC; editing Telegram or Portfolio logic requires rebuilding `@kestrel/ai`                                   |
| **B-03: Hardcoded Mastra Capabilities & Tool Allowlists**    | `packages/ai/src/mastra-v2/capabilities/index.ts` & `packages/ai/src/committee/specialists.ts` | `MASTRA_CAPABILITIES`, `CANONICAL_PUBLIC_READ_ONLY_TOOL_NAMES`, and `SPECIALIST_DEFINITIONS` are closed const objects                                                                      | Plugins cannot dynamically attach tools or skills to `canonicalChat` or specialist desks based on which plugins the user has installed |
| **B-04: Hardcoded Alert Delivery & Indicator Regex**         | `packages/ai/src/alerts/delivery.ts` & `packages/ai/src/alerts/evaluator.ts`                   | `deliverChannel()` uses `switch (ch) { case 'email': case 'telegram': case 'web-push': }` and `INDICATOR_SPEC_RE` is a hardcoded regex `/^(sma\|ema\|rsi\|atr\|macd\|bollinger\|pivots)/i` | Even if a plugin registers a new indicator in `indicatorRegistry` or a new notification channel, alerts ignore it                      |
| **B-05: Static Web UI Slots (Nav, Widgets, `⌘K`, Settings)** | `apps/web/src/components/layout/nav-items.ts`, `widget-types.ts`, `commands.ts`                | Sidebar nav, dashboard widgets (`WidgetType`), `⌘K` palette commands, and Settings tabs are hardcoded arrays/unions                                                                        | Plugins cannot dynamically appear in the sidebar, dashboard widget picker, or `⌘K` palette when a user installs them                   |
| **B-06: Monolithic Database Schema**                         | `packages/db/src/schema/index.ts`                                                              | All 55+ tables live in one directory with no namespace separation between Core Host tables and Plugin tables, plus legacy subscription/billing tables                                      | Plugin tables cannot be isolated, and unused billing/subscription complexity clutters the core                                         |

## 3. Deep Dive: Untapped Mastra (`@mastra/core@^1.78.0`) & Open-Source Capabilities

Your `packages/ai/package.json` **already has `@mastra/core@^1.78.0` installed**, which shipped major capabilities in 2026 that Kestrel is not yet using! By combining Mastra's built-in primitives with top open-source trading libraries, we avoid building infrastructure from scratch.

### 3.1 Built-In `@mastra/core@^1.78.0` Features We Will Use

| Mastra v1.78 Feature                                                                       | Docs Reference                                                                                                        | How It Powers Kestrel's Plugin System                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| :----------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. Agent Skills & Workspace Skills (`createSkill`, `SKILL.md`, `validateSkillContent`)** | [Mastra Agent Skills](https://mastra.ai/docs/skills) & [Workspace Skills](https://mastra.ai/docs/sandbox/skills)      | **Game-Changer for Backtesting & Custom Agents!** Mastra natively supports `SKILL.md` directories (with `references/`, `scripts/`, `assets/`) and `createSkill()` with per-request dynamic resolution (`skills: ({ requestContext }) => ...`). When a plugin or skill is installed, Mastra automatically gives the agent `skill`, `skill_read`, and `skill_search` (BM25/vector indexed) tools so the agent can study trading playbooks (ICT, SMC, Wyckoff, Quant formulas) on demand without bloating the system prompt! |
| **2. Workspace & Isolated Sandboxes (`Workspace`, `LocalSandbox`, `LocalFilesystem`)**     | [Mastra Sandboxes](https://mastra.ai/docs/sandbox/overview) & [Filesystem](https://mastra.ai/docs/sandbox/filesystem) | `@mastra/core/workspace` includes `LocalSandbox` with native OS-level isolation (`bwrap` on Linux / `seatbelt` on macOS with `allowNetwork: false` and `readOnlyPaths`). Agents can write and test custom strategy scripts in an isolated workspace without risking host security!                                                                                                                                                                                                                                        |
| **3. Per-Request Dynamic Tools & Skills via `RequestContext`**                             | [Mastra Tools](https://mastra.ai/docs/agents/tools) & [Subagents](https://mastra.ai/docs/subagents)                   | Mastra agents accept dynamic resolvers reading `requestContext.get('installedPlugins')`. If User A installed `backtesting` and User B installed `paper-trading`, the exact same `canonicalChat` agent dynamically exposes only the tools and skills for the plugins that specific user has installed!                                                                                                                                                                                                                     |
| **4. `toModelOutput` on Tools**                                                            | [Mastra Tools — Shape Output](https://mastra.ai/docs/agents/tools)                                                    | Backtests return huge arrays of 500+ candles and equity curve points for the React UI chart, which would waste LLM tokens. Mastra's `toModelOutput` sends the full 500-point dataset to the React UI (`BacktestResultPart`) while sending a compact 20-line statistical summary to the LLM!                                                                                                                                                                                                                               |
| **5. Native Durable Schedules (`mastra.schedules`)**                                       | [Mastra Schedules](https://mastra.ai/docs/harness/schedules)                                                          | Added in `@mastra/core@1.50.0`! `mastra.schedules.create({ agentId, cron, timezone, prompt, threadId, resourceId })` provides built-in durable cron scheduling (`pause`, `resume`, `run`, `delete`) with IANA timezone support and `onFinish` lifecycle hooks—eliminating the need to write a custom cron parser for user-scheduled agent tasks!                                                                                                                                                                          |
| **6. Subagents & Supervisor Delegation (`agents` prop + `onDelegationStart`)**             | [Mastra Subagents](https://mastra.ai/docs/subagents)                                                                  | Standalone Custom Agents can be called directly by the user (`@agent-slug`) OR dynamically attached to `canonicalChat`'s `agents` property so the main chat copilot can delegate specialized tasks to a user's installed custom agents with isolated memory!                                                                                                                                                                                                                                                              |
| **7. Native Tool Approvals (`requireApproval: true`) & Channels**                          | [Mastra Channels](https://mastra.ai/docs/channels)                                                                    | Mastra tools support `requireApproval: true`, which automatically pauses execution and renders Approve / Deny cards in Web Chat and messaging channels.                                                                                                                                                                                                                                                                                                                                                                   |

### 3.2 Battle-Tested Open-Source Libraries to Integrate (Don't Build From Scratch!)

Instead of coding a backtester, paper trading matcher, or Telegram bot framework by hand, we wrap these proven open-source TypeScript packages inside Kestrel's plugins:

| Plugin Domain                                        | Open-Source Package to Use                                                                                                                                              | Why It Fits Kestrel & How We Integrate It                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| :--------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Backtesting & Paper Trading Core**                 | **[`backtest-kit`](https://github.com/tripolskypetr/backtest-kit)** ([Docs](https://backtest-kit.github.io/))                                                           | **Production-grade TypeScript engine** built specifically for running **Backtest, Paper (`Live`), and Walker (multi-strategy comparison)** from a single strategy schema (`addStrategySchema`, `addExchangeSchema`, `addRiskSchema`, `addFrameSchema`, `Backtest.run()`, `Live.background()`). It uses Node `AsyncLocalStorage` temporal barriers to make look-ahead bias architecturally impossible, includes built-in Sharpe/MaxDD/WinRate/Expectancy markdown & JSON reports, trailing stops, breakeven, partial closes, and slippage/fees! We simply feed Kestrel's `@kestrel/data` candles/ticks into `addExchangeSchema`! |
| **Streaming & Incremental Indicators**               | **[`trading-signals`](https://github.com/bennycode/trading-signals)** & **[`indicatorts`](https://github.com/cinar/indicatorts)** + Kestrel's `@kestrel/indicators/smc` | While `@kestrel/indicators` has great SMC primitives (FVG, Order Blocks, Liquidity Sweeps, BOS/CHoCH), `trading-signals` provides streaming `O(1)` `.update(price)` indicators (ADX, Ichimoku, VWAP, Stochastic, Williams %R, PSAR, Supertrend, OBV, CCI) ideal for live Paper Trading ticks and rich strategy building without writing 30 indicator formulas by hand.                                                                                                                                                                                                                                                          |
| **Safe Dynamic Strategy Expression / Script Runner** | **[`quickjs-emscripten`](https://github.com/justjake/quickjs-emscripten)** (or Mastra `LocalSandbox` with `allowNetwork: false`)                                        | Lets AI agents write real, flexible JavaScript/TypeScript `getSignal(ctx)` strategy logic (combining SMC + indicators + math + custom conditions) and execute it inside a deterministic, memory-capped, zero-network WebAssembly sandbox in milliseconds!                                                                                                                                                                                                                                                                                                                                                                       |
| **Telegram Bot & Interactive Menus**                 | **[`grammY`](https://grammy.dev/)** ([GitHub](https://github.com/grammyjs/grammy)) + `@grammyjs/menu` & `@grammyjs/conversations`                                       | Replaces the manual raw `fetch` plumbing in `packages/ai/src/telegram/` with the gold-standard TypeScript Telegram framework. Gives us declarative interactive button menus (`@grammyjs/menu`), step-by-step wizard dialogs (`@grammyjs/conversations`), automatic rate-limit throttling (`@grammyjs/transformer-throttler`), and 1-line command plugin registration.                                                                                                                                                                                                                                                           |

## 4. User Experience (UX): Effortless 1-Click Plugin Installation

You emphasized that installing and using plugins must require **the least manual work possible**—step-by-step, visual, and effortless for non-technical users and vibe coders.

### 4.1 How a User Installs a Plugin in Kestrel (The 3-Step Flow)

All plugins ship dormant inside the monorepo (`plugins/*`). A new user starts with a clean, uncluttered Kestrel workspace (Research Chat, Chart, Overview, Journal, Market, Alerts).

1. **Step 1 — Open the Visual Plugin Store (`/settings/plugins` or `⌘K → Plugins`)**:
   - The user sees a clean Hoplite grid of available plugins (**Backtesting Lab**, **Paper Trading Broker**, **Telegram Copilot & Cron**, **Custom Agent Studio**), each with a 1-sentence description, feature badges (e.g., `Adds 3 AI Tools`, `Adds Sidebar Tab`, `Adds 5 Strategy Skills`), and a single **[ Install Plugin ]** button.
2. **Step 2 — 1-Click Install (or Guided 30-Second Setup Drawer if Config Needed)**:
   - **Zero-Config Plugins (Backtesting, Paper Trading, Custom Agents)**: Clicking **[ Install ]** immediately activates the plugin in `< 200ms`! If it's Paper Trading, it automatically provisions a default `$100,000 Virtual Demo Account` and a `$50,000 AI Agent Sandbox Account` with sensible risk defaults (`1% risk/trade`)—zero forms required!
   - **External Credential Plugins (Telegram Bot)**: Clicking **[ Install ]** opens a friendly **3-Step Guided Setup Drawer**:
     - _Step 1_: Click link to open `@BotFather` on Telegram and paste your Bot Token (validated live with a green checkmark via `getMe` API).
     - _Step 2_: Click **[Auto-Configure Webhook]** (Kestrel calls Telegram's `setWebhook` API automatically in the background—no CLI scripts needed!).
     - _Step 3_: Click **[Open My Bot & Link Account]** (opens `https://t.me/<your_bot>?start=<one_time_link_token>`, which links your Kestrel user account automatically on first tap—no manual 6-digit code typing!).
3. **Step 3 — Instant Workspace & Agent Upgrade**:
   - The moment a plugin is installed for a user:
     - Its **Sidebar Navigation item** (e.g., `Backtesting` or `Paper Trading`) smoothly appears in the left rail.
     - Its **Dashboard Widgets** appear in the Overview "Add Widget" drawer.
     - Its **AI Tools & `SKILL.md` Playbooks** are immediately injected into that user's `RequestContext`—so in their very next chat message, Kestrel's agents know how to use the new plugin!
   - Clicking **[ Uninstall / Disable ]** cleanly hides all UI, stops any scheduled tasks for that user, and removes its tools from the agent context (with a checkbox to either keep or wipe saved plugin data).

## 5. Target Technical Architecture: `@kestrel/plugin-sdk` & `PluginHost`

### 5.1 Monorepo Directory Structure

```text
kestrel/
├── packages/
│   ├── config/                 # Shared ESLint, TS, Tailwind (Hoplite tokens)
│   ├── shared/                 # Core schemas, env, encryption, DI container
│   ├── db/                     # Core PostgreSQL + pgvector + RLS + user_installed_plugins & plugin_storage
│   ├── indicators/             # Core SMC math + IndicatorRegistry + trading-signals bridge
│   ├── data/                   # Core market adapters + MarketDataProviderRegistry
│   ├── plugin-sdk/             # NEW: @kestrel/plugin-sdk (definePlugin, PluginHost, Skills, UI slots)
│   └── ai/                     # Slimmed Core AI: Mastra instance, committee core, canonical tools
├── plugins/                    # NEW: Self-contained installable plugins (in-monorepo workspace packages)
│   ├── backtesting/            # @kestrel/plugin-backtesting (backtest-kit + QuickJS/Sandbox + Strategy Skills)
│   ├── paper-trading/          # @kestrel/plugin-paper-trading (backtest-kit Live + Worker TickBus + Dual Accounts)
│   ├── telegram-bot/           # @kestrel/plugin-telegram (grammY + Mastra Schedules + 1-click BotFather wizard)
│   └── custom-agents/          # @kestrel/plugin-custom-agents (Standalone Mastra Agents + SKILL.md Studio)
├── apps/
│   ├── web/                    # Next.js 16 Host (Plugin Store UI, dynamic nav/widgets/tool cards, API gateway)
│   └── worker/                 # Node.js Worker Host (TickBus + per-user active plugin jobs)
```

### 5.2 The `@kestrel/plugin-sdk` Contract (`packages/plugin-sdk/src/types.ts`)

Every plugin is defined using `definePlugin()`. Notice how there are **zero subscription or billing fields**—instead, it focuses on **1-click onboarding (`setupWizard`), Mastra `skills` (`SKILL.md`), `tools`, `agents`, `jobs`, `tickSubscribers`, and `ui` slots**:

```typescript
// packages/plugin-sdk/src/types.ts
import type { Symbol, Tick } from '@kestrel/shared';
import type { Skill } from '@mastra/core/skills';
import type { ComponentType } from 'react';
import type { z } from 'zod';

export interface KestrelPluginManifest {
  /** Unique kebab-case ID, e.g. 'backtesting', 'paper-trading', 'telegram-bot', 'custom-agents' */
  id: string;
  name: string;
  version: string;
  tagline: string;
  description: string;
  category:
    | 'trading-execution'
    | 'quant-research'
    | 'channels-automation'
    | 'agents-skills'
    | 'market-data';
  iconName: string;
  /** Whether installing requires zero config ('instant') or a guided drawer ('wizard') */
  installMode: 'instant' | 'wizard';
  /** Per-user settings Zod schema — automatically renders the Settings form & encrypts secret fields! */
  settingsSchema?: z.ZodObject<any>;
  defaultSettings?: Record<string, unknown>;
}

export interface PluginToolRegistration<TInput = any, TOutput = any> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  /** Optional Mastra toModelOutput transformer so large chart/equity arrays don't bloat LLM tokens */
  toModelOutput?: (output: TOutput) => unknown;
  access: 'read-only' | 'sensitive-read' | 'write';
  /** Dynamic confirmation check (e.g. true for Personal Paper Account, false for Agent Sandbox Account!) */
  requiresConfirmation?:
    boolean | ((input: TInput, ctx: PluginExecutionContext) => Promise<boolean> | boolean);
  /** Which core agents receive this tool when the user has installed this plugin */
  attachTo: Array<'canonical-chat' | 'technical' | 'fundamental' | 'risk' | 'sentiment'>;
  execute: (input: TInput, ctx: PluginExecutionContext) => Promise<TOutput>;
}

export interface KestrelPlugin {
  manifest: KestrelPluginManifest;
  /**
   * Native Mastra Agent Skills! Can be inline `createSkill(...)` objects or
   * relative directory paths to `skills/<skill-name>/SKILL.md` inside the plugin package.
   * Automatically injected into the user's agents when this plugin is installed!
   */
  skills?: Array<Skill | string>;
  /** AI Tools registered by this plugin */
  tools?: PluginToolRegistration[];
  /** Standalone Mastra Agents registered by this plugin */
  agents?: PluginStandaloneAgentRegistration[];
  /** Background jobs (only executed for users who have installed & enabled this plugin) */
  jobs?: PluginJobRegistration[];
  /** Real-time worker live tick subscribers */
  tickSubscribers?: PluginTickSubscriber[];
  /** Alert delivery channels (e.g. 'telegram', 'discord') */
  alertChannels?: PluginAlertChannelRegistration[];
  /** Custom technical indicators added to IndicatorRegistry */
  indicators?: PluginIndicatorRegistration[];
  /** Enriches SymbolResearchPacket for users who installed this plugin */
  packetEnrichers?: PluginPacketEnricher[];
  /** HTTP endpoints mounted at `/api/plugins/[pluginId]/[...path]` */
  apiRoutes?: Record<string, PluginApiRouteHandler>;
  /** Runs automatically when a user clicks "Install Plugin" (e.g. seeds default $100k paper account) */
  onUserInstall?: (ctx: PluginUserLifecycleContext) => Promise<void>;
  /** Runs when a user clicks "Uninstall Plugin" */
  onUserUninstall?: (ctx: PluginUserLifecycleContext & { wipeData?: boolean }) => Promise<void>;
}
```

### 5.3 How Per-User Plugin Installation Works at Runtime

1. **Database Table (`user_installed_plugins` in `@kestrel/db`)**:
   - Columns: `userId`, `tenantId` (RLS-enforced), `pluginId`, `status` (`'installed' | 'disabled'`), `settings` (`jsonb` — secret fields encrypted via `@kestrel/shared/encryption`), `installedAt`, `updatedAt`.
2. **Per-Request Resolution in `/api/chat` and Mastra `RequestContext`**:
   - When a user sends a chat message, Kestrel loads their `installedPluginIds: string[]` (cached in memory/Redis for 60s, invalidated on install/uninstall) and places it into Mastra's `requestContext`.
   - `canonicalChat` and the specialist desks resolve their `tools` and `skills` dynamically per request:
     ```typescript
     const installed = requestContext.get('installedPlugins') as string[];
     const tools = pluginHost.resolveToolsForUser(installed, userDisabledTools);
     const skills = pluginHost.resolveSkillsForUser(installed);
     ```
   - If User A hasn't installed `@kestrel/plugin-backtesting`, the LLM never even sees `run_backtest` or the backtesting skills—saving tokens and keeping the agent laser-focused!

## 6. Deep Architecture of the 4 Plugins (Powered by Mastra & OSS Libraries)

### 6.1 Plugin 1: `@kestrel/plugin-backtesting` (Skills + Knowledge + `backtest-kit`)

You explicitly asked that agents be able to **create and backtest strategies flexibly using skills and knowledge, not just hardcoded rules**. Here is how we achieve that without building a backtester from scratch:

```text
User Prompt: "Design and backtest a London Killzone Liquidity Sweep + FVG strategy on XAUUSD 15m"
    │
    ▼
1. Mastra Skill Discovery (`skill` & `skill_read` tools)
   Agent loads `plugins/backtesting/skills/smc-strategy-design/SKILL.md`
   and `references/backtest-kit-api.md` + `references/smc-primitives.md`
    │
    ▼
2. Strategy SynthesisTool (`create_and_backtest_strategy`)
   Agent writes a clean, self-contained `getSignal(ctx)` strategy module using:
   - Pre-computed SMC series (`ctx.smc.fvg`, `ctx.smc.orderBlocks`, `ctx.smc.liquiditySweeps`, `ctx.smc.bosChoch`, `ctx.smc.killzones`)
   - 35+ streaming TA indicators from `trading-signals` / `@kestrel/indicators` (`ctx.ta.ema`, `ctx.ta.rsi`, `ctx.ta.adx`, `ctx.ta.vwap`, `ctx.ta.atr`)
   - Custom mathematical expressions, multi-condition state machines, or session filters
    │
    ▼
3. Sandboxed Execution on `backtest-kit` (`QuickJS` / `LocalSandbox` + `Backtest.run`)
   - Syntax & safety check (0ms network access, deterministic clock)
   - `backtest-kit` steps bar-by-bar through `@kestrel/data` historical candles
   - Zero look-ahead bias enforced by `backtest-kit` temporal barrier
   - Models realistic spread, slippage, SL/TP tie-breaking, trailing stops, and partial exits
    │
    ▼
4. Rich Output (`toModelOutput` split)
   - Full trade list + 500-point equity curve + drawdown series saved to `plg_backtest_runs` & streamed to React `BacktestResultPart`
   - Compact statistical summary (Win Rate, Profit Factor, Sharpe, MaxDD, Expectancy, Session Breakdown) returned to the Agent so it can critique and iterate on the strategy!
```

**Built-In Strategy Skills (`plugins/backtesting/skills/*/SKILL.md`) Shipped with the Plugin:**

- `skills/strategy-coder/SKILL.md`: Teaches the agent the exact TypeScript `getSignal(ctx)` API, how to avoid overfitting, how to size stops with ATR or swing structure, and how to interpret Sharpe/Sortino/Profit Factor.
- `skills/ict-smc-playbooks/SKILL.md` (with `references/silver-bullet.md`, `references/asian-sweep-reversal.md`, `references/order-block-mitigation.md`): Deep institutional SMC knowledge that the agent reads via `skill_read` when asked to build smart-money strategies.
- `skills/quant-mean-reversion-trend/SKILL.md`: Volatility breakout, Bollinger Keltner squeeze, RSI divergence, and multi-timeframe trend-following blueprints.
- **User Custom Skills**: Users can also add their own Markdown trading playbooks in the Backtesting Lab UI, which are validated with Mastra's `validateSkillContent()` and immediately searchable by the agent via `skill_search`!

### 6.2 Plugin 2: `@kestrel/plugin-paper-trading` (Dual-Mode Virtual Broker on `backtest-kit` Live + Worker `TickBus`)

Because `backtest-kit` runs the exact same strategy and order schemas in both `Backtest.run()` and `Live.background()`, **any strategy an agent backtests can be deployed to Paper Trading in 1 click**, alongside manual or conversational paper orders!

- **Instant 1-Click Install (`onUserInstall`)**:
  - Automatically creates two virtual accounts for the user in `plg_paper_accounts`:
    1. **Personal Paper Account (`$100,000`, `mode: 'confirm'`)**: When you tell the agent _"Buy 1 lot XAUUSD with SL at 2635 and TP at 2670"_, the agent drafts the order, validates risk against your account balance, and shows an interactive **Approve / Deny** card in chat or Telegram.
    2. **AI Agent Sandbox Account (`$50,000`, `mode: 'autonomous_sandbox'`)**: Agents, scheduled cron routines, or live-running `backtest-kit` strategies can open, modify, trail, and close virtual positions 24/7 without manual confirmation!
- **Real-Time Sub-Second Tick Fills (`apps/worker` `TickBus`)**:
  - Subscribes to live BiQuote SignalR (Gold/FX) and Binance WebSocket (Crypto) ticks.
  - Matches pending `limit`/`stop` orders and open `stopLoss`/`takeProfit`/`trailingStop` levels in `< 0.1ms` using an in-memory symbol price index, persists fills to PostgreSQL, updates account equity, auto-logs closed trades to the Trade Journal (`source: 'paper'`), and fires instant notifications.

### 6.3 Plugin 3: `@kestrel/plugin-telegram` (`grammY` + Mastra Native `Schedules` + 1-Click Wizard)

- **Powered by [`grammY`](https://grammy.dev/)**: Extracts all legacy Telegram files out of `packages/ai/src/{bot,telegram}` and upgrades them with `grammY` and `@grammyjs/menu` for rich interactive inline keyboards.
- **Dynamic Cross-Plugin Menus**: If the user also has **Backtesting** or **Paper Trading** installed, the Telegram bot automatically displays `[📊 Backtest Setup]` and `[💼 Paper Positions]` buttons in Telegram!
- **Mastra Native `mastra.schedules` Integration**:
  - Users can say in Web Chat or Telegram: _"Every weekday at 07:30 London time, run my ICT agent on XAUUSD and send the briefing to Telegram."_
  - Under the hood, the plugin calls `mastra.schedules.create({ agentId, cron: '30 7 * * 1-5', timezone: 'Europe/London', prompt, ... })` and uses the `onFinish` hook to deliver the formatted report straight to the user's linked Telegram chat!

### 6.4 Plugin 4: `@kestrel/plugin-custom-agents` (Standalone Agents + `SKILL.md` + MCP)

Per **Decision D-04**, Custom Agents are strictly **Standalone Agents** (leaving the core 4-Desk Committee untouched):

- **Visual Agent Builder & `.agent.md` Upload (`/plugins/custom-agents`)**:
  - Create a standalone agent in 30 seconds by picking:
    1. **Name, `@slug`, and Persona Instructions** (or choose from 1-click starter templates like _@ict-sniper_, _@pine-coder_, _@macro-fed-watcher_, _@prop-risk-coach_).
    2. **Attached Skills (`SKILL.md`)**: Attach built-in trading playbooks or upload your own Markdown knowledge files (`references/`) that the agent searches using Mastra's `skill_read` and `skill_search` tools.
    3. **Allowed Tools Checkboxes**: Select which core tools and installed plugin tools (e.g., `create_and_backtest_strategy`, `paper_place_order`, `web_search`) this agent is allowed to use.
    4. **Model Picker & Optional MCP Server URL**: Pin a specific BYOK model (e.g., DeepSeek R1, Claude Sonnet, Gemini Pro) and optionally connect an external [Model Context Protocol (`@mastra/mcp`)](https://mastra.ai/docs/connections/mcp) server.
- **How Users Talk to Their Custom Agents**:
  - **Direct Selection / `@mention` in Chat**: Select the custom agent from the top chat bar or type `@ict-sniper analyze XAUUSD 15m` in any thread.
  - **Mastra Subagent Delegation**: Optionally toggle _"Allow Kestrel Main Chat to delegate tasks to this agent"_—using Mastra's `agents` subagent property (`onDelegationStart` / `onDelegationComplete`) with isolated subagent memory!
