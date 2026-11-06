# Kestrel Architecture Diagrams — Master Index & Tooling Guide

This directory (`docs/architecture/`) is the visual map of the Kestrel platform. It shows how all 13 workspace packages, the AI engine, the market data failover pipeline, the background worker, the PostgreSQL Row-Level Security (RLS) database, and the 3 bundled plugins (`backtesting`, `paper-trading`, `telegram-bot`) fit together.

---

## 1. Why Kestrel Uses This Diagram Stack (Best Tools & Frameworks in 2026)

Modern software architecture visualization uses a **Diagram-as-Code + C4 Layered Model** approach so diagrams stay version-controlled in Git, readable by AI coding agents, and easy for humans to scan:

| Tool / Framework                                                                                   | What It Is Best For                                                                                                                                                         | How Kestrel Uses It                                                                                              |
| :------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------- |
| **[mdxcn Plain-Text Figures](https://mdxcn.dev)** (`docs/figures.md`)                              | Diff-friendly, `grep`-able, zero-dependency framed text blocks that survive terminal reading, PR reviews, and AI context windows.                                           | **Primary inline documentation standard** enforced by `pnpm check:figures` across all `docs/**/*.md` files.      |
| **[C4 Architecture Model](https://c4model.com/) + [Structurizr](https://structurizr.com/)**        | Zoomable 4-level hierarchy (_System Context → Containers → Components → Code_) so non-developers and architects can understand the big picture before zooming into details. | Structures the 4 architecture guides in this folder from high-level System Context down to individual pipelines. |
| **[D2 (Declarative Diagramming)](https://d2lang.com/) & [Mermaid](https://mermaid.js.org/)**       | Text-to-SVG compilation for complex multi-column architecture boards and sequence flows.                                                                                    | Used as the design layout model for the dark-mode SVG visual boards stored in `docs/assets/*.svg`.               |
| **[React Flow (`@xyflow/react`)](https://reactflow.dev/) & [Excalidraw](https://excalidraw.com/)** | Interactive browser-based node graphs where users can click nodes, filter layers, and step through execution flows.                                                         | Used for interactive architecture exploration in the browser.                                                    |

```
+------------ [ DIAGRAM STACK ] ------------+
|                                           |
| ●  mdxcn       inline markdown figures    |
| ●  c4 model    4-level zoom hierarchy     |
| ●  svg boards  docs/assets/*.svg          |
| ○  react flow  interactive browser map    |
+-------------------------------------------+
```

---

## 2. Visual Architecture Map & File Index

Read these four documents in order to go from the 30,000-foot system view down to specific pipelines:

| Guide                                                                                           | What You Will See Inside                                                                                                                                                                                                                                                                                                      | Companion Visual SVG Board                                                                                                                                                        |
| :---------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[01. System Context, Containers & RLS](01-system-context-and-containers.md)**                 | Who uses Kestrel, how Next.js (`apps/web`), the Worker (`apps/worker`), and PostgreSQL 16 + `pgvector` connect, how the 13 monorepo packages depend on each other, and how Row-Level Security (`withUserTenant`) isolates every user's data.                                                                                  | [`docs/assets/system-architecture-c4.svg`](../assets/system-architecture-c4.svg) & [`docs/assets/deployment-profiles.svg`](../assets/deployment-profiles.svg)                     |
| **[02. AI Chat, 4-Desk Committee & RAG Pipeline](02-ai-chat-and-committee-pipeline.md)**        | Everything that happens after a user sends a chat message: prompt-injection screening, integer-cent budget reservation, the Unified Router (`routeUnified`), Single vs. Full 4-Desk Specialist Committee, numeric/staleness grounding verification, hybrid `pgvector` + FTS memory, and human-in-the-loop confirmation cards. | [`docs/assets/ai-chat-and-committee-pipeline.svg`](../assets/ai-chat-and-committee-pipeline.svg) & [`docs/assets/multi-agent-committee.svg`](../assets/multi-agent-committee.svg) |
| **[03. Market Data, Worker Jobs & Streaming Pipeline](03-market-data-and-worker-pipelines.md)** | How Kestrel fetches prices, candles, macro indicators, and news across 6 external providers (BiQuote, Binance, Finnhub, FRED, CFTC, Marketaux) with health-scored failover, plus how the background worker runs scheduled jobs, 24/7 WebSocket tick streaming, and the durable 1m candle outbox.                              | [`docs/assets/market-data-worker-and-plugins-flow.svg`](../assets/market-data-worker-and-plugins-flow.svg)                                                                        |
| **[04. Plugins, Backtesting, Paper Trading & Trader Flows](04-plugins-and-user-journeys.md)**   | How the Plugin SDK splits server and UI code, how the QuickJS WASM backtester simulates strategies without look-ahead bias, how the Paper Trading virtual broker fills orders on live ticks, how Telegram Bot commands and alerts work, and how closed trades feed the AI Coach.                                              | [`docs/assets/market-data-worker-and-plugins-flow.svg`](../assets/market-data-worker-and-plugins-flow.svg)                                                                        |

---

## 3. High-Level End-to-End Platform Loop

Every subsystem in Kestrel feeds a single closed feedback loop for the trader:

```
+---------------- [ TRADER LOOP ] -----------------+
|                                                  |
| ●  1. market feeds    biquote → binance → fred   |
| │                                                |
| ●  2. ai research     4 desks → verified fusion  |
| │                                                |
| ●  3. backtesting     quickjs wasm → grid sweep  |
| │                                                |
| ●  4. paper trading   live ticks → virtual fills |
| │                                                |
| ●  5. trade journal   mfe/mae replay → ai coach  |
| │                                                |
| ○  6. pgvector rag    longitudinal memory recall |
+--------------------------------------------------+
```

1. **Market Feeds (`@kestrel/data` & `@kestrel/worker`):** Ingest live quotes, OHLCV candles, FRED yields, CFTC positioning, and Marketaux news for 18 instruments (Gold `XAUUSD`, 11 Forex pairs, 6 Crypto pairs).
2. **AI Research (`@kestrel/ai`):** Assembles a 30-second cached `SymbolResearchPacket`, convenes the 4 specialist desks (`Technical`, `Fundamental`, `Risk`, `Sentiment`), verifies every price citation deterministically, and synthesizes a conflict-aware answer.
3. **Strategy Backtesting (`@kestrel/plugin-backtesting`):** Tests trading ideas in an isolated QuickJS WebAssembly sandbox against historical bars with pessimistic spread/slippage accounting and train/test parameter sweeps.
4. **Live Paper Trading (`@kestrel/plugin-paper-trading`):** Deploys strategies or manual orders into two virtual accounts (`Personal Demo` with confirmation vs. `AI Agent Sandbox` autonomous) matched against live ticks.
5. **Journal, Alerts & Coaching (`@kestrel/web`, `@kestrel/ai`, `@kestrel/plugin-telegram-bot`):** Logs executions, replays MFE/MAE price excursions on charts, delivers multi-channel alerts (Web Push, Email, Telegram), and indexes lessons into `pgvector` memory so the AI remembers the trader's habits on the next turn.
