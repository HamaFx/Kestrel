# 01. System Context, Containers, Monorepo Dependency Graph & RLS Isolation

> **Visual SVG Boards:** [`docs/assets/system-architecture-c4.svg`](../assets/system-architecture-c4.svg) · [`docs/assets/deployment-profiles.svg`](../assets/deployment-profiles.svg)

---

## 1. C4 Level 1 & 2 — Runtime Containers & External Systems

Kestrel runs as two Node.js runtime containers (`@kestrel/web` and `@kestrel/worker`) sharing a single PostgreSQL 16 + `pgvector` database (plus optional Redis for L2 cache mirroring), while connecting outbound to 11 Bring-Your-Own-Key (BYOK) LLM providers, 6 market data providers, and 3 notification channels.

```
+---------------- [ CONTAINERS ] ------------------+
|                                                  |
| ●  web app      next.js 16 :3000 → ui + sse api  |
| ●  worker       node daemon :8081 → cron + ticks |
| ●  postgres 16  55 tables + pgvector + pg-boss   |
| ○  redis        optional l2 cache + packet sync  |
+--------------------------------------------------+
```

```
+------------- [ EXTERNAL INTEGRATIONS ] --------------+
|                                                      |
| Category      | Providers                            |
| --------------+------------------------------------- |
| Market Feeds  | BiQuote, Binance, Finnhub, FRED, CFTC|
| News & Search | Marketaux, Tavily, Brave, Serper     |
| BYOK LLMs     | Google, OpenAI, Anthropic, xAI + 7   |
| Notifications | Web Push (VAPID), Resend, Telegram   |
| --------------+------------------------------------- |
| Total         | 24 external service adapters         |
+------------------------------------------------------+
```

### How the Containers Split Responsibilities

- **`apps/web` (`@kestrel/web` on `:3000`):** Serves the Next.js 16 App Router UI, handles NextAuth v5 authentication + 2FA, streams AI chat responses over Server-Sent Events (`POST /api/chat`), mounts plugin HTTP routes (`/api/plugins/[pluginId]/[[...path]]`), and exposes webhook endpoints (`/api/plugins/telegram-bot/webhook`).
- **`apps/worker` (`@kestrel/worker` on `:8081`):** Runs scheduled background jobs via `node-cron`, processes asynchronous `pg-boss` queues (`backtest-sweep`, `candle-flush`), maintains optional 24/7 SignalR (BiQuote) and Binance WebSocket connections, and serves health probes (`/health/live`, `/health/ready`).
- **PostgreSQL 16 + `pgvector`:** Stores all 55 tables (47 core + 8 plugin tables), `pgvector` HNSW embeddings (`memory_embeddings`, `news_articles`), Mastra workflow state, and `pg-boss` job queues.

---

## 2. Monorepo 13-Package Layered Dependency Graph

Packages in Kestrel follow a strict **top-down dependency direction**—higher layers import lower layers, and `@kestrel/shared` sits at the bottom with zero internal workspace dependencies:

```
+-------------- [ PACKAGE LAYERS ] ----------------+
|                                                  |
| ●  layer 1 (apps)     web, worker                |
| │                                                |
| ●  layer 2 (brains)   ai, backtest, paper, tg    |
| │                                                |
| ●  layer 3 (domain)   data, indicators, sdk, db  |
| │                                                |
| ●  layer 4 (leaf)     shared, config, test-utils |
+--------------------------------------------------+
```

| Layer | Workspace Package               | Path                    | What It Owns                                                       | Imports From Workspace                                              |
| :---: | :------------------------------ | :---------------------- | :----------------------------------------------------------------- | :------------------------------------------------------------------ |
| **1** | `@kestrel/web`                  | `apps/web`              | Next.js 16 UI, Auth.js, API controllers, domain services           | `ai`, `db`, `data`, `indicators`, `plugin-sdk`, `plugins`, `shared` |
| **1** | `@kestrel/worker`               | `apps/worker`           | Cron scheduler, `pg-boss` workers, SignalR/Binance tick streams    | `ai`, `db`, `data`, `plugin-sdk`, `plugins`, `shared`               |
| **2** | `@kestrel/ai`                   | `packages/ai`           | Mastra v2 engine, 4-desk committee, 25+ tools, RAG, budget cents   | `db`, `data`, `indicators`, `plugin-sdk`, `shared`                  |
| **2** | `@kestrel/plugin-backtesting`   | `plugins/backtesting`   | QuickJS WASM strategy sandbox, bar simulator, grid sweeps          | `db`, `data`, `indicators`, `plugin-sdk`, `shared`                  |
| **2** | `@kestrel/plugin-paper-trading` | `plugins/paper-trading` | Dual virtual accounts, live `TickBus` fill engine, strategy runner | `db`, `data`, `plugin-sdk`, `plugin-backtesting`, `shared`          |
| **2** | `@kestrel/plugin-telegram-bot`  | `plugins/telegram-bot`  | BotFather setup wizard, signed webhook, 14 commands, briefings     | `ai`, `db`, `data`, `plugin-sdk`, `plugin-paper-trading`, `shared`  |
| **3** | `@kestrel/data`                 | `packages/data`         | Market data adapters, health-scored failover, L1/L2 SWR cache      | `db`, `shared`                                                      |
| **3** | `@kestrel/indicators`           | `packages/indicators`   | Pure O(N) TA math (SMA, EMA, RSI, ATR, MACD, BB, Pivots, Swings)   | `shared`                                                            |
| **3** | `@kestrel/plugin-sdk`           | `packages/plugin-sdk`   | `PluginHost` (server), `PluginUiRegistry` (client), secret crypto  | `db`, `shared`                                                      |
| **3** | `@kestrel/db`                   | `packages/db`           | 55 Drizzle tables, 126 SQL migrations, RLS wrappers, `pg-boss`     | `shared`                                                            |
| **4** | `@kestrel/shared`               | `packages/shared`       | 18-symbol catalog, Zod schemas, AES-256-GCM, SSRF guard, Pino      | _(none — pure leaf)_                                                |
| **4** | `@kestrel/config`               | `packages/config`       | Shared TypeScript (`tsconfig`) and Tailwind design tokens          | _(none — pure leaf)_                                                |
| **4** | `@kestrel/test-utils`           | `packages/test-utils`   | Candle builders, tool context factories, Postgres template cloner  | `db`, `shared`                                                      |

---

## 3. Authentication, Request Ingress & Multi-Tenant RLS Isolation Pipeline

Kestrel is a multi-user platform where every user's API keys, chat threads, journal entries, alerts, backtests, and paper positions are strictly isolated at the PostgreSQL engine level using **Row-Level Security (RLS)**.

```
+---------------- [ REQUEST & RLS FLOW ] ----------------+
|                                                        |
| ●  1. edge proxy       csrf check + sign x-user-id-sig |
| │                                                      |
| ●  2. withAuth / rsc   verify session + rate limit     |
| │                                                      |
| ●  3. tenant lookup    resolve user_id → tenant_id     |
| │                                                      |
| ●  4. postgres tx      SET LOCAL app.current_tenant_id |
| │                                                      |
| ●  5. rls policy       kestrel_app enforces row match  |
+--------------------------------------------------------+
```

### Step-by-Step Security & Tenant Scoping Flow

1. **Edge Proxy (`apps/web/src/proxy.ts`):**
   - Verifies the NextAuth v5 session cookie (`auth.config.ts`).
   - Enforces CSRF origin validation on mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`).
   - Strips any client-spoofed `x-user-id` headers and attaches an HMAC-SHA256 signed `x-user-id` + `x-user-id-sig` header pair for downstream routes.
2. **Controller & Action Entry (`withAuth` in `apps/web/src/lib/http/api/auth.ts`):**
   - Re-validates that the user account is active and not soft-deleted (throttled via a 60-second in-memory validation cache).
   - Enforces per-user/IP sliding-window rate limits (`rate_limits` table).
3. **Tenant Scope Wrapper (`withUserTenant` / `withUserTenantRO` in `@kestrel/db`):**
   - Maps `userId` to the user's personal `tenantId` (`getTenantIdForUser`, cached with a bounded TTL).
   - Opens a PostgreSQL transaction on the `kestrel_app` role (`NOBYPASSRLS`) and executes:
     ```sql
     SELECT set_config('app.current_tenant_id', $1, true),
            set_config('app.current_user_id', $2, true);
     ```
   - Stores the transaction client inside Node's `AsyncLocalStorage` (`connection/scope.ts`) so every nested `getDb()` call inside `@kestrel/ai`, `@kestrel/db`, or any plugin automatically runs inside that tenant-scoped transaction.
4. **PostgreSQL Row-Level Security Enforcement:**
   - Every tenant-owned table has an RLS policy comparing `tenant_id = current_setting('app.current_tenant_id', true)`.
   - If any code path forgets `withUserTenant`, `app.current_tenant_id` is empty and PostgreSQL returns `0` rows (fail-closed).
   - Cross-tenant background jobs (`apps/worker`) explicitly opt into `withAdminDb(...)`, which sets `app.bypass_rls = 'on'` inside a dedicated transaction before iterating across tenants via `withUserTenant`.
