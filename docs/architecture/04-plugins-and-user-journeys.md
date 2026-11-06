# 04. Plugin Architecture, Backtesting, Paper Trading & Trader Journeys

> **Visual SVG Board:** [`docs/assets/market-data-worker-and-plugins-flow.svg`](../assets/market-data-worker-and-plugins-flow.svg)

---

## 1. Dual-Registry Plugin SDK Architecture (`@kestrel/plugin-sdk`)

Kestrel's plugin architecture separates **server/worker capabilities** from **browser React UI components** so the worker never bundles React and uninstalled plugins add **zero tokens** to a user's AI prompt:

```
+--------------- [ PLUGIN RUNTIME ] ---------------+
|                                                  |
| ●  server registry   plugins/registry.ts         |
| │  — tools, api routes, cron jobs, tick hooks    |
| │                                                |
| ●  client registry   plugins/ui-registry.ts      |
| │  — pages, dashboard widgets, chat tool cards   |
| │                                                |
| ●  db state          user_installed_plugins      |
|    — per-user enablement + aes-256-gcm secrets   |
+--------------------------------------------------+
```

- **Per-User Prompt Hygiene (`packages/ai/src/plugins/runtime.ts`):** When a user starts a chat turn, `loadActivePluginRuntime(userId)` queries `user_installed_plugins`. Only the tools, skills (`SKILL.md`), and packet enrichers belonging to that user's **enabled** plugins are registered on the agent.
- **Automatic Secret Encryption (`packages/plugin-sdk/src/settings.ts`):** Any field in a plugin's Zod `settingsSchema` marked with `.meta({ secret: true })` (such as Telegram's `botToken`) is automatically encrypted with AES-256-GCM (`ENCRYPTION_SECRET`) before saving to `user_installed_plugins.settings` and masked as `"••••••••"` in `GET /api/plugins/[pluginId]/settings`.

---

## 2. QuickJS WASM Backtesting Pipeline (`@kestrel/plugin-backtesting`)

The Backtesting plugin lets traders write or generate custom JavaScript `getSignal(ctx)` strategies and test them against historical OHLCV bars inside a deterministic, memory-and-CPU-capped **QuickJS WebAssembly sandbox**:

```
+------------- [ BACKTEST PIPELINE ] --------------+
|                                                  |
| ●  1. coverage gate  verify bar count + freshness|
| │                                                |
| ●  2. precompute ta   33 indicator + level series|
| │                                                |
| ●  3. quickjs wasm    run getSignal(ctx) per bar |
| │                                                |
| ●  4. bar simulator   spread + slippage + stops  |
| │                                                |
| ●  5. metrics & save  sharpe, sortino, drawdown  |
+--------------------------------------------------+
```

```
+------------- [ SANDBOX & SWEEPS ] ---------------+
|                                                  |
| Guardrail / Feature    | Specification           |
| -----------------------+------------------------ |
| Runtime Engine         | QuickJS WASM (no I/O)   |
| Memory Limit           | 32 MB heap cap          |
| CPU Interrupt          | 2,000 ms per run        |
| Look-Ahead Prevention  | offset > 0 throws error |
| Tie-Breaking Rule      | Pessimistic (SL first)  |
| Parameter Grid Sweeps  | Train/Test split via DB |
+--------------------------------------------------+
```

### How Anti-Look-Ahead & Pessimistic Simulation Work

1. **Market Data Coverage Gate (`services/market-data-gate.ts`):** Refuses to run if historical candle coverage is insufficient or if the feed is degraded.
2. **33 Precomputed Feature Series (`engine/features.ts`):** Precomputes EMA (`9, 20, 21, 50, 200`), SMA (`20, 50, 200`), RSI (`14`), ATR (`14`), MACD (`12, 26, 9`), Bollinger Bands (`20, 2`), PDH/PDL, Asian session high/low, and swing highs/lows across all bars in O(N) time.
3. **QuickJS Sandbox (`engine/sandbox/quickjs.ts` & `driver.ts`):** Evaluates `getSignal(ctx)` at bar index `i`. Calling `ctx.bar(offset)` or `ctx.indicator(name, offset)` with `offset > 0` (future bar) immediately throws a look-ahead violation error inside the sandbox.
4. **Pessimistic Bar-by-Bar Simulator (`engine/simulator/loop.ts`):**
   - Applies half-spread on limit/target fills and full spread + slippage on market/stop fills.
   - If a single candle's `high` and `low` touch both the Stop Loss and Take Profit, the simulator **always fills the Stop Loss first** (pessimistic tie-breaking).
   - Supports automatic break-even (`breakEvenAtR`) and dynamic trailing stops (`atr`, `percent`, `fixed`).

---

## 3. Paper Trading Virtual Broker & Live Strategy Runner (`@kestrel/plugin-paper-trading`)

Every user who installs Paper Trading gets two isolated virtual accounts seeded in PostgreSQL (`plg_paper_trading_accounts`):

- **`Personal Demo` (`confirm` mode):** Manual orders and AI tool proposals require explicit user confirmation.
- **`AI Agent Sandbox` (`autonomous_sandbox` mode):** Autonomous forward-testing desk where the AI and deployed QuickJS strategies can place and manage virtual trades automatically.

```
+-------------- [ PAPER BROKER LOOP ] -------------+
|                                                  |
| ●  1. order entry     ui form, chat tool, or bot |
| │                                                |
| ●  2. fill engine     tickbus (<1s) or 1m cron   |
| │                                                |
| ●  3. bracket ratchet break-even @ r + trailing  |
| │                                                |
| ●  4. position close  atomic sql claim + balance |
| │                                                |
| ●  5. journal sync    auto-log + pgvector index  |
+--------------------------------------------------+
```

1. **One-Click Strategy Deployment (`deploy-to-paper-button.tsx` → `strategy-runs.ts`):** Any completed Backtesting run can be deployed directly to the Paper Trading desk (`plg_paper_trading_strategy_runs`). Every minute, `strategy-runner.ts` evaluates the strategy in QuickJS on closed bars and manages live paper orders/positions.
2. **Atomic Double-Close Guard (`db/queries/positions.ts`):** Because both sub-second `TickBus` events and the 1-minute `market-watch` cron job evaluate open positions, `claimPositionClose` uses an atomic `UPDATE ... WHERE status = 'open' AND quantity >= close_qty` statement so concurrent ticks can never double-close or double-credit a position.
3. **AI Research Packet Enrichment (`packet-enricher.ts`):** Open paper positions (entry, stop, target, unrealized PnL, and R-multiple) are automatically injected into `SymbolResearchPacket` so the 4-Desk Committee's Risk Desk gives advice tailored to the user's live exposure.

---

## 4. Alerts, Trade Journal Replay & Telegram Copilot Flow

```
+------------- [ ALERTS & TELEGRAM ] --------------+
|                                                  |
| ●  1. alert evaluator 1m cron claims active rules|
| │                                                |
| ●  2. rule check      price / rsi / ema / candle |
| │                                                |
| ●  3. noise control   quiet hours + cooldowns    |
| │                                                |
| ●  4. fan-out push    web-push + email + telegram|
+--------------------------------------------------+
```

- **Trade Journal & MFE/MAE Setup Replay (`apps/web/src/app/(app)/journal/`):**
  - When a trade is closed (manually, via CSV import, or auto-synced from Paper Trading), the trader can open `<SetupReplayModal />` (`apps/web/src/lib/services/journal/replay.ts`), which fetches historical candles with a 55-bar warmup window, steps bar-by-bar through the trade, and computes **Maximum Favorable Excursion (MFE)**, **Maximum Adverse Excursion (MAE)**, and **Edge Capture Ratio**.
  - Clicking **AI Review** (`reviewTrade`) or **AI Coach** (`getCoachInsights`) analyzes the trader's behavioral patterns and updates Mastra working memory.
- **Telegram Copilot (`@kestrel/plugin-telegram-bot`):**
  - Links a user's personal BotFather bot via a one-time `/start <token>` deep link (`bot/link.ts`).
  - Verifies every incoming webhook with `X-Telegram-Bot-Api-Secret-Token` (`server/webhook.ts`), deduplicates `update_id` atomically (`server/update-ledger.ts`), and enforces that `chat.id === linkedChatId` (`bot/runner.ts`).
  - Supports 14 commands (`/price`, `/candles`, `/news`, `/calendar`, `/positions`, `/alerts`, `/alert`, `/snooze`, `/briefing`, `/ask`, `/analyze`, `/status`, `/unlink`, `/help`) plus scheduled timezone-aware morning briefings (`jobs/daily-briefing.ts`).
