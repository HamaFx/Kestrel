# Kestrel — Architecture & Database Audit

**Date:** 2026-10-31
**Auditor:** DeepSeek V4.1 Flash (OpenCode), with four parallel exploration subagents
**Scope:** Static audit of the repository at `/data/home/Kestrel` (commit `e92a0af5`, branch `main`)
**Method:** Read-only code and migration inspection. Four parallel deep-dive passes (DB/RLS, web security, AI/data resilience, worker/concurrency), with the highest-impact claims independently re-verified by the lead auditor against source.
**Status:** No files were modified. No live database was reachable from the audit machine.

> **Proposed repo location when moved:** `docs/audit/kestrel-architecture-db-audit-2026-10-31.md`

---

## 0. How to read this

- **🔴 Red flags** = could lose money, corrupt trading data, leak user data or keys, or crash production.
- **🟠** = high-impact correctness/reliability issue.
- **🟡** = real but lower blast radius.
- Every finding names the files to look at. Findings marked "suspected" depend on runtime configuration or library behaviour and need empirical confirmation.
- **Scope limitations:** (1) No live database was reachable — schema statements describe what the 118 migrations _say_ the schema is, not an introspected database. (2) This was a static read: no load testing, no runtime probing, no dependency-vulnerability scan. (3) The repo's own documentation was treated as untrusted per the brief; some findings below contradict it.

**A note on the framing:** Kestrel is not a Supabase-first application. Supabase appears in exactly two roles — Storage for uploaded chart images (raw `fetch` with a `service_role` key) and, in cloud deploys, as the hosted Postgres vendor. There is no Supabase Auth, no `@supabase/supabase-js`, no edge functions, no PostgREST, and no Realtime integration. Auth is Auth.js v5 against the same Postgres.

---

## 1. System overview

**Shape.** pnpm + Turborepo monorepo. Next.js 16 web app (`apps/web`, ~103 API routes), a long-running Node worker (`apps/worker`), seven shared packages (`db`, `data`, `ai`, `indicators`, `shared`, `plugin-sdk`, `test-utils`) and four plugins (`telegram-bot`, `paper-trading`, `backtesting`, `custom-agents`). ~320k LOC, 1,213 commits (296 in the last 30 days).

### 1.1 Data flow

1. **Market data** (`packages/data`): BiQuote REST (primary), Binance, Finnhub, plus FRED / CFTC / Marketaux for macro. Failover is sequential with health scoring, per-provider timeouts (8–10s) and self-throttling. Responses are cached in-memory/Redis with a 3s/10s stale-while-revalidate envelope.
   An opt-in worker pipeline (SignalR + Binance websockets → `live_ticks` / `candles_1m`) exists but is **off by default** (`WORKER_ENABLE_TICK_STREAM=0`). The shipped default is on-demand REST.
2. **AI** (`packages/ai`): Mastra (on the Vercel AI SDK). A chat turn carries the user's BYOK credentials, an execution plan routes it to a _canonical_ single agent or the _committee_ (technical / fundamental / risk / sentiment specialists plus a synthesizer). Output passes a numeric "evidence gate" that rejects numbers not present in tool output. Chat text, tool calls, opinions and cost telemetry persist to Postgres; long "full" runs go through a durable job queue (`full_analysis_queue`).
3. **User data:** trading journal, alerts, watchlists, settings, chat threads, plus an autonomous paper-trading sandbox (accounts / positions / orders / fills) and a backtesting engine with parameter sweeps.
4. **Worker:** node-cron jobs (alerts every minute, briefings, snapshots, retention …), pg-boss queues for backtests and sweeps, and the optional websocket feeds. Schedulers also exist as Vercel cron routes and VM systemd timers; the Botkeep profile pokes the web cron endpoints from inside the worker.

### 1.2 Source of truth

- Postgres is the source of truth for all user-facing state.
- Market data's source of truth is **upstream providers**. `live_ticks` and `candles_1m` are caches, not authoritative history, and are stale-tolerant by design.
- AI spend is authoritative in **integer cents** (`daily_ai_spend`, `ai_budget_reservations`) — a genuinely good, drift-free pattern that is not applied elsewhere.

### 1.3 Layers that were built and then removed (confirmed clean)

The credit/subscription/payment stack (`0114`), core `portfolio_*` tables (`0116`), `analysis_jobs` (`0084`), `telegram_updates` (`0115`), and shadow/quality tables (`0118`) were all dropped, and no code references them. That cleanup was done properly.

What remains half-dead: **two parallel AI tool systems** — legacy `packages/ai/src/tools/` shims (default ON via `PHASE_TOOLS_SHIMS`) alongside `mastra-v2/tools/canonical/`, with removal targeted 2026-12-15.

### 1.4 Row Level Security design (as intended)

41 tables carry `tenant_isolation` policies (`USING` + `WITH CHECK`) keyed on `current_setting('app.current_tenant', true)`. `packages/db/src/connection/scope.ts` sets that GUC inside a transaction (`withTenantDb*`). `MULTI_USER_ENABLED=1` without `KESTREL_ENABLE_RLS=1` refuses to open a connection. An admin role (`hamafx_admin`, `BYPASSRLS`) exists for worker/migration paths via `ADMIN_DATABASE_URL`. **See R1: this design is not currently enforced.**

---

## 2. Red flags

### 🔴 R1 — Row Level Security is installed but not actually enforced in either documented deployment

**What's wrong.** The connection role decides whether RLS applies, and the app connects as a superuser:

- Docker: `POSTGRES_USER: hamafx` (`docker-compose.yml:33`) makes `hamafx` the Postgres superuser; app and worker connect as `postgres://hamafx:...@db` (`docker-compose.yml:126,177`). Superusers bypass RLS **even with FORCE ROW LEVEL SECURITY**.
- Cloud: the deploy generator's default is `postgres://postgres.<project-ref>:...@...pooler.supabase.com` (`scripts/deploy-cloud.mjs:114`) — Supabase's privileged role.
- The one role that would enforce it, `kestrel_app` (`NOBYPASSRLS`), is created `NOLOGIN` (`packages/db/drizzle/0094_shared_app_role.sql:15-23`) and nothing points `DATABASE_URL` at it. Code comments also reference a role named `kestrel_admin` that no migration creates (`packages/db/src/connection/scope.ts:96`).

**Why it matters.** Every RLS policy is currently decorative. Tenant isolation rests entirely on hand-written `WHERE user_id = ...` predicates in the query layer. Those are applied consistently today, but one forgotten predicate in any future route is a silent cross-tenant data leak with no safety net. With open registration by default (R3), that is a live risk.

**Where:** `docker-compose.yml:33,126,177`; `scripts/deploy-cloud.mjs:110-120`; `packages/db/drizzle/0094_shared_app_role.sql`; `packages/db/src/connection/pools.ts:176-207`; `packages/db/src/connection/scope.ts:49-52,137-155,185-206`.

---

### 🔴 R2 — Every price, balance, P&L and fee is a floating-point number; there is not one `numeric` column in the database

`grep -i "numeric\|decimal"` over all 119 migrations matches only a column _named_ `price_decimals`.

| Area            | Columns                                                                                         | Type               |
| --------------- | ----------------------------------------------------------------------------------------------- | ------------------ |
| Trading journal | `entry, stop, target, exit, size, r_multiple`                                                   | `double precision` |
| Paper trading   | `balance`, `realized_pnl`, `unrealized_pnl`, `entry_fee`, `exit_fee`, `quantity`, `close_price` | `double precision` |
| Backtesting     | `initial_balance`, `final_equity`, `risk_pct`, `best_score`                                     | `double precision` |
| Market data     | `live_ticks.bid/ask/mid`, `candles_1m.o/h/l/c/v`                                                | `double precision` |
| AI cost         | `chat_telemetry.est_cost_usd` (`double precision`); `agent_opinions.cost_usd` (**`real`**)      | float4/float8      |
| Symbol metadata | `symbol_catalog.pip_size`                                                                       | **`real`**         |

**Why it matters.** Float OHLC is industry-standard and defensible. Float _accumulation_ — balances, lifetime P&L, aggregated R-multiples, `SUM(cost_usd)` — drifts and cannot be compared exactly. The project already knows the correct pattern: AI spend was deliberately migrated to integer cents (`0057` → `0089`) after hitting summation drift. Paper-trading balances and fees should follow that precedent. `cost_usd real` (≈7 significant digits) is the clearest error, and it is summed in SQL (`/api/settings/usage-by-agent` computes `sum(cost_usd)::float8` and derives a synthetic remainder row by subtraction — float cancellation).

**Where:** `packages/db/drizzle/0109_paper_trading_plugin_tables.sql:26-29,64-78,120-129,172-175`; `0108:32-33`; `0000:35-41,105`; `0025_multi_agent_orchestration.sql:15`; `packages/db/src/schema/ops/journal.ts:40-48`.

---

### 🔴 R3 — A self-registered stranger can burn the operator's AI keys, and the spending cap is off by default

Three settings compound:

1. `REGISTRATION_MODE` defaults to `open`.
2. `ENFORCE_BUDGET` defaults to off; effective daily cap becomes `$1,000,000` and no turn is ever rejected. Spend is recorded, never blocked.
3. `getUserWithSettings` lets non-admin users inherit the **operator's** configured provider keys as fallback.

**Why it matters.** On an internet-facing instance this is an open credit card: an attacker registers, chats at up to 30 turns/min per account, and the operator pays. The ledger correctly prevents draining _another user's_ budget, but the shared operator key is the exposure. There are no global concurrency caps on AI turns or on `/api/market/stream` (a 1-hour SSE).

**Where:** `packages/shared/src/env/schema/runtime.ts:89,143-146`; `packages/ai/src/budget/index.ts:53-72`; `packages/db/src/queries/user-settings.ts:117-139`.

---

### 🔴 R4 — Cron endpoints are callable by any logged-in user

`withCronAuth` accepts the `CRON_SECRET` bearer token **or any valid session**. Only 5 of 14 `/api/cron/*` routes opt into `requireAdminSession`. Callable by any registered user: `briefings`, `news`, `warm-cache`, `calendar`, `embedding-backfill`, `fred-actuals`, `weekly-review`, `snapshots`, `cot` — plus `/api/health/alerts`. `/api/cron/*` is also excluded from the CSRF proxy.

**Why it matters.** Any user (and with R3, any stranger) can trigger jobs that fan out to all tenants, send emails/Telegram messages, hammer paid providers, and generate LLM cost. `briefings` and `weekly-review` are the worst offenders. Related nit: the bearer check builds `Bearer ${env.CRON_SECRET}` with no emptiness guard, so `Bearer undefined` becomes a valid token if the secret is unset.

**Where:** `apps/web/src/lib/http/cron.ts:42-99`; the nine routes under `apps/web/src/app/api/cron/`.

---

### 🔴 R5 — Decrypted BYOK API keys are shipped to the browser

The API-keys settings page decrypts the user's provider keys server-side and passes them into a `'use client'` component, which seeds React state with the plaintext (`useState(currentValue)`). The values are embedded in the RSC flight payload of the HTML page.

**Why it matters.** This contradicts the codebase's own invariant — `/api/me/keys` deliberately never returns key values, and plugin settings are correctly masked via `maskPluginSettings`. Plaintext keys in page memory mean any XSS, malicious extension, shared device, or HTML cache exposure yields usable OpenAI/Anthropic/Gemini keys. The fix is the write-only pattern the project already uses elsewhere.

**Where:** `apps/web/src/app/(app)/settings/api-keys/page.tsx:79,191` → `_components/provider-key-sections.tsx:60` → `_components/api-key-card.tsx:1,56`.

---

### 🟠 R6 — Partial closes in paper trading can double-credit and corrupt position size

`applyClose` computes new position state in JavaScript from a row read earlier, then writes it guarded only by `status = 'open'`:

```ts
quantity: args.position.quantity - closeQuantity,   // computed from the stale read
realizedPnl: args.position.realizedPnl + pnl,
```

The comment claims the claim protects against double fills — true for a _full_ close (which flips status), but two concurrent **partial** closes both still see `status='open'`, both update, both insert a fill, and both credit the balance. The second write overwrites the first's quantity/P&L: filled quantity can exceed position size and realized P&L is lost or double-counted. Concurrency is realistic — a tick subscriber and the once-a-minute market-watch job can evaluate the same stop simultaneously.

**Why it matters.** It is simulated money, so no real loss — but the paper sandbox is the stated basis for trusting a strategy ("deploy backtest to paper"), and corrupted fills quietly invalidate that signal. This bug class gets copied into real broker integrations later.

**Where:** `plugins/paper-trading/src/services/position-lifecycle.ts:95-118`; `plugins/paper-trading/src/db/queries/positions.ts:184-202`. Same class: margin / max-open-position checks are check-then-act snapshots (`fill-engine.ts:87-125`, `trading.ts:74-84`); there is no liquidation/stop-out, so a gapped stop drives `balance` negative with no floor.

---

### 🟠 R7 — Chart uploads live in a permanently public bucket, and the cleanup job can never delete them

Uploads use the Supabase **service-role key** server-side and the bucket is required to be **PUBLIC** (`lib/http/storage.ts:31-33`). The returned URL is a world-readable `/object/public/...` link with no expiry, no per-user ACL, and no signed-URL flow despite a comment describing one. The cleanup cron is broken: objects are written to `<userId>/<YYYY-MM-DD>/...` but the cron lists bare `YYYY-MM-DD` prefixes, so it never deletes anything.

**Why it matters.** User chart screenshots (which can include account details, notes, strategy) are readable forever by anyone with the URL, and storage grows unbounded. Mitigating: random-prefixed filenames, no path traversal, authenticated + rate-limited upload, type allowlist, `sharp` re-encode.

**Where:** `apps/web/src/lib/http/storage.ts:105-137,151-157`; `apps/web/src/app/api/cron/cleanup-uploads/route.ts:110-116`.

---

### 🟠 R8 — Stale prices silently flow into the AI, alerts, and paper fills

The data layer has rich (`getPriceWithMeta`) and plain (`getPrice`) getters. The **canonical AI tools use the plain form**, discarding `stale` and quote age before the model sees them. The alert evaluator has no staleness check. The backtester consumes stale-while-revalidate candles (a window up to 1 day old can be accepted). Two paths _fabricate_ values: the DXY proxy returns `{value: 0, change24h: 0}` on missing inputs, and `forecast_volatility` substitutes ATR = 0 and prints "expected ±0.0 pips". Both zeros are then valid grounding for the numeric evidence gate.

**Why it matters.** The model can present a stale price as current, an alert can fire on yesterday's candle, and a fabricated zero can pass as evidence-backed. The research-packet path does this correctly (`freshness: 'stale'`, warnings, stale packets rejected) — the right pattern exists and wasn't applied to the chat tools.

**Where:** `packages/data/src/adapters/price.ts:96-99`; `packages/ai/src/mastra-v2/tools/canonical/price.ts:59`, `candles.ts:54`; `packages/ai/src/alerts/evaluator/readings.ts:71-120`; `packages/ai/src/tools/get-intermarket.ts:153-158`; `packages/ai/src/tools/forecast-volatility.ts:88-107`.

---

### 🟠 R9 — The realtime pipeline is off by default, and bar writes fail silently

`WORKER_ENABLE_TICK_STREAM` defaults to `'0'`: the SignalR consumer, Binance consumer, candle aggregator, tick buffer and `live_ticks` flusher are all inert, so paper fills run off the once-a-minute REST job. Separately, a closed bar's DB write is fire-and-forget with a 10s timeout and **no retry** — a failure or shutdown silently drops that minute forever. There is no gap backfill, and a replayed same-minute tick can _regress_ the open bar's close price (close is overwritten unconditionally).

**Why it matters.** Claims about streaming do not match a default install. Dropped bars accumulate quiet holes that indicators then compute over.

**Where:** `apps/worker/src/env.ts:50-57`; `apps/worker/src/bootstrap/candle-flush.ts:36-83`; `apps/worker/src/aggregator/candle-1m.ts:94-104`; `.env.example:183`.

---

### 🟠 R10 — One hung Telegram call can wedge the whole worker's alert job

Alert delivery is serial, unbounded (`listEvaluable` has no `LIMIT`) and not wired to the job's abort signal. The Telegram adapter calls grammY with **no timeout** (library default 500s) against a 120s job budget. Delivery is at-least-once: dying after a provider accepted but before `markFired` re-sends on a later tick, and a timed-out job leaves the claim held for the 30-minute lease. Webhook dedup is non-atomic (check-then-set on plugin storage rather than a unique insert), so concurrent Telegram retries can double-execute and double-spend AI budget; the dedicated `telegram_updates` table from `0067` was dropped unused.

**Why it matters.** Head-of-line blocking delays every other user's alerts; a stuck send starves the job guard, trips the health endpoint, and triggers the autoheal restart loop.

**Where:** `packages/ai/src/alerts/evaluator/evaluate.ts:148-232`; `plugins/telegram-bot/src/alerts.ts:62`; `plugins/telegram-bot/src/bot/telegram-api.ts:47-66`; `plugins/telegram-bot/src/server/webhook.ts:110-180`; `0115_drop_legacy_telegram_updates.sql`.

---

### 🟠 R11 — Migration apply can silently skip migrations

Drizzle applies a migration only if its `when` is greater than the newest recorded `created_at` — it does not follow journal order. `0111`, `0112` and `0113` share the identical `when=1792900506784` in `_journal.json`; they applied here only because the baseline predates them. Any _future_ migration with a `when` at or below the applied maximum is silently skipped on upgraded databases. Supporting gaps: `migration-reconcile.mjs` has a no-op missing-table check (`const requiredTables = []`), and `migrate-status` reports edited files as "pending" while the migrator will skip them. `0038`'s RLS cutover is a run of unguarded `CREATE POLICY` statements, and while `0041` exists because migrations were once silently dropped by the Supabase pooler, `0041` re-applies **no RLS** — so that failure mode would leave tenant tables unprotected undetected.

**Why it matters.** You can deploy believing a schema change is live when it is not, with nothing in the repo to detect it.

**Where:** `packages/db/drizzle/meta/_journal.json` (entries 110–112); `packages/db/scripts/migration-reconcile.mjs:191-199`; `packages/db/scripts/migrate-status.mjs:121-127`; `packages/db/drizzle/0038:38-288`.

---

### 🟡 R12 — SSRF: user-supplied base URL is fetched server-side

`POST /api/settings/test-market-provider` accepts `baseUrl` from the body and the server fetches it (`packages/data/src/providers/provider-adapters.ts:181-189` → `providers/biquote/rest/call.ts:57-75`) with no host allowlist and no rate limit — a probe target for internal services and cloud metadata endpoints. `/api/settings/test-provider` is likewise unthrottled.

### 🟡 R13 — Unvalidated model output on some paths

Coach insights parse the LLM response with bare `JSON.parse` (no schema) and, on failure, store up to 300 chars of raw model prose as the summary, which flows into working memory and the UI (`packages/ai/src/journal/coach-insights.ts:272-307`). Journal entry levels and alert levels extracted from the model are `z.number()` with **no sanity bounds and no cross-check against live market data** (`packages/ai/src/mastra-v2/mutation/mutation-extract.ts:53-65`; `packages/shared/src/schemas/alerts.ts:40-53`). The confirmation gate before DB writes is good; nothing stops `entry: 999999`.

### 🟡 R14 — No provider failover within a turn

`shouldFallback()` / `makeFallbackPart()` exist with a UI renderer, but **no production caller** — only tests. Circuit-breaker state is consulted when a model is _resolved_, so a 429/5xx mid-turn fails the turn (502) instead of continuing elsewhere. The breaker also misses deadline-induced failures: any abort is classified `cancelled` and cancelled runs record no failure, so a provider that reliably hangs at 55s never trips it. Custom-agent streams and XAUUSD conversation/research runs have **no retry**; Mastra-native tools do not get the 25s per-tool timeout that the legacy registry applies.

### 🟡 R15 — Prompt-injection defenses inspect only the last user message

The detector is configured `lastMessageOnly: true`, so tool output, news, web search, memory and retrieved knowledge are never scanned. Defense there is a narrow regex quarantine plus the optional Jev service, which **fails open** when unavailable; `wrapExternalContent` (the untrusted-data delimiter) is defined but has zero callers; memory recall content is inserted without quarantine. Direct user-message injection is handled well (422 gate + normalization + strict-mode policy).

### 🟡 R16 — Worker availability: event-loop blocking and restart loops

The QuickJS strategy sandbox runs synchronously on the event loop (up to 5s per evaluation) and a sweep can run 200 combinations x 2 slices in the same process that serves health checks, tick ingestion and every cron job — minutes of blockage, cancellable only between combinations. A systemd timer restarts the worker container every 5 minutes, and autoheal restarts on `/health/jobs` reporting a wedged job — which is what a long-but-healthy backtest looks like. In the Botkeep profile, alerts are double-scheduled (worker 1-minute cron plus an embedded poker hitting `/api/cron/alerts` every 5 minutes), and the web route evaluates all tenants without the worker's partition filter.

---

## 3. Architecture & database improvements (high value)

**Tenant model needs one owner.** The tenant id is "the user's id" by convention (`hamafx_resolve_tenant_id` falls back to `user_id`), the personal-organization trigger assumes exactly 1:1 user↔org, and `getTenantIdForUser` throws if a user is ever in two organizations (`packages/db/src/tenant.ts:48-50`). Decide explicitly: single-tenant-per-user forever (delete the org abstraction), or shared organizations (stamp `tenant_id` from membership, stop throwing).

**Make RLS real, then lean on it.** The machinery exists — `withTenantDb*`, the `app.current_tenant` GUC, 41 policies, and an isolation test suite. What is missing is a login-enabled `kestrel_app` with `DATABASE_URL` pointed at it. Do it on a scratch database first: it will surface every query that relied on superuser rights, which is exactly the audit you want.

**Add a money-type convention.** Keep `double precision` for OHLC. Move accumulated money (balances, P&L, fees, aggregated R-multiples) to `numeric(20,8)` or integer minor units, matching the cents approach already proven in the budget ledger. Convert paper-trading and journal columns in one migration and expose a single money helper so nobody reintroduces `0.1 + 0.2`.

**Replace read-modify-write with conditional SQL.** Generalize the pattern already used for full closes:
`UPDATE ... SET quantity = quantity - $1, realized_pnl = realized_pnl + $2 WHERE id = $3 AND status = 'open' AND quantity >= $1 RETURNING *`. Same for margin/position-count checks (verify inside the insert transaction) and the `cron_runs` lock reclaim, which is not race-safe.

**Close the stale-data contract.** Freshness metadata must never be dropped between provider and consumer. Make meta-returning getters the default; rename the plain ones to read as dangerous (`getPriceUnchecked`). Have the alert evaluator and fill engine reject ticks older than a threshold; make the backtester refuse stale windows unless overridden. Return `null` instead of `{value: 0}` from `dxyProxy` so the evidence gate rejects it.

**Give the worker a failure story.** Configure a pg-boss dead-letter queue; add healthcheck UUIDs to the six jobs that lack them; apply per-tool and per-provider timeouts on the Mastra-native path; pass abort signals and explicit HTTP timeouts to Telegram, Resend, Supabase Storage and social sentiment; gate the 5-minute self-update on idle so it stops killing in-flight work.

**Fix the migration ledger before it bites.** De-duplicate `when` values; add a preflight that fails when a journal `when` is <= the applied maximum; implement the empty `requiredTables` check; make `migrate-status` distinguish "pending" from "already applied but modified".

**Smaller but real.** Index `verificationToken(expires)` and `alerts(user_id, created_at DESC)`; drop ~8 redundant indexes whose leading columns are covered by a unique/composite; replace `update_updated_at()`'s per-row `information_schema.columns` lookup, which runs on every `user`, `user_settings`, `chat_threads` and `journal_entries` update.

---

## 4. Cleanup & dead weight (low priority)

- **Dual AI tool stacks:** `packages/ai/src/tools/` shims (default ON) vs `mastra-v2/tools/canonical/`; removal target 2026-12-15 — confirm the native path passes with `PHASE_TOOLS_SHIMS=0` before then.
- **Dead code:** `apps/web/src/lib/services/usage-alerts.ts` (producers live in `packages/ai/src/budget/budget-alerts.ts`); `apps/web/src/services/news-service.ts` (route reimplements it inline); `listActiveTenants` (exported, zero callers); two competing error envelopes (`jsonApiError` vs `errorResponse`).
- **Dead schema:** `chat_telemetry.credits_charged` / `wallet_balance_after` are read but never written (credits permanently 0); `organization.plan` has no plans table; eight enum types created and never applied to a column (`user_role`, `journal_outcome`, `briefing_kind`, `bot_platform`, `portfolio_status`, `payment_status`, `plan_interval`, `subscription_status`); dead function `hamafx_set_decision_signal_outcome_tenant_id()` re-created by the newest migration (`0117`) while referencing a table dropped in `0052`.
- **Config/flag duplication:** the `feature_flags` DB table is admin-manageable but never consulted (`readFeatureFlag` is env-only). `WORKER_MODE` defaults to `systemd`, but no job units exist in the repo, so a systemd-mode install gets no core or plugin jobs.
- **Comment rot:** `scope.ts` / `pools.ts` reference a `kestrel_admin` role that does not exist; `fork/route.ts` claims rate limiting it does not have; `storage.ts` describes a signed-URL design it does not implement; several schema comments say "ms epoch" for `timestamptz` columns. The README still links deleted docs (`docs/pwa.md`, `docs/audit/`).
- **Process gap:** `scripts/check-route-security.mjs` (a CI gate) is a text grep for wrapper names — a route whose _comment_ mentions `withAuth` passes. That is how nine unguarded cron routes passed CI. Harden or replace with a per-route manifest.

---

## 5. Action plan

### Phase 0 — Stop the bleeding (small, contained, ~a day)

1. Require `CRON_SECRET` or an admin session on **every** cron route; make the bearer check fail closed when the secret is empty (R4).
2. Enable the budget cap and set `REGISTRATION_MODE=disabled` if the instance is public (R3).
3. Make API-key inputs write-only (R5).
4. Add a host allowlist to the market-provider tester (R12).

### Phase 1 — Make isolation real

Create a login-enabled `kestrel_app`, point `DATABASE_URL` at it on a scratch database, run `pnpm test:postgres-rls` plus the app integration tests, fix whatever surfaces, then settle the tenant model decision (R1).

### Phase 2 — Money and trade-data integrity

Atomic partial closes and fills; money-type migration for balances/P&L/fees; liquidation floor (R6, R2).

### Phase 3 — Data honesty

Freshness propagation; remove fabricated zeros; staleness gates in alerts/fills/backtests; per-tool and per-provider timeouts; alert abort/timeout; restore mid-turn fallback (R8, R9, R10, R14).

### Phase 4 — Platform hygiene

Migration-ledger preflight and `when` de-duplication (R11); dead-letter queue; index cleanup; `update_updated_at()` fix; private-bucket or signed-URL uploads (R7); dead-code sweep; AI tool-stack consolidation before the December target.

---

## Appendix A — Verified by the lead auditor

These claims were re-checked directly against source, not accepted from a subagent:

- R1: `docker-compose.yml:33` `POSTGRES_USER: hamafx`; `:126,177` app/worker `DATABASE_URL` as `hamafx`; `0094` creates `kestrel_app` `NOLOGIN`; `deploy-cloud.mjs:114` default `postgres.<project-ref>`; `pools.ts:176-207` uses `DATABASE_URL || POSTGRES_URL`.
- R2: `grep -i numeric\|decimal` across `packages/db/drizzle/*.sql` returns only `price_decimals`; `grep doublePrecision(` across `packages/db/src/schema/` returns 24 columns, `numeric(` returns none.
- R4: `withCronAuth` allows any session unless `requireAdminSession`; 5 of 14 cron routes opt in.
- R5: `page.tsx` decrypts and passes `decrypted` into a `'use client'` component that seeds `useState`.
- R6: `position-lifecycle.ts:95-118` computes the patch from a stale read; `positions.ts:184-202` guards only `status = 'open'`.
- R7: object path `<userId>/<day>/...` vs cleanup prefixes `YYYY-MM-DD`; public URL builder at `storage.ts:137`.
- R8: canonical price tool calls `getPrice` (not the meta variant); `computeDxyProxy` returns `{value: 0}`; `shouldFallback`/`makeFallbackPart` referenced only by tests.
- R9: `apps/worker/src/env.ts:54-57` default `'0'`.
- R11: `_journal.json` entries 110–112 share `when=1792900506784`; `migration-reconcile.mjs:191-199` has an empty `requiredTables`.

## Appendix B — Open questions that need runtime verification

1. **Live schema**: run `pnpm --filter @kestrel/db inventory:live` (read-only by design) against the real database with a read-only `DATABASE_URL` to confirm policy coverage, actual column types, index usage and table sizes.
2. **Actual deployment profile**: is the production instance Docker (superuser) or Vercel + Supabase pooler? This determines how urgent R1 is.
3. **Instance exposure**: is the deployed URL publicly reachable, and is `REGISTRATION_MODE` actually `open` there? This determines the urgency of R3 and R4.
4. **`WORKER_ENABLE_TICK_STREAM`** in the live `.env` — if `1`, R9's bar-loss path is live.
5. **Which cron scheduler is active in production** (worker node-cron, Vercel cron, VM systemd, Botkeep poker, or several) — determines the R16 double-scheduling scope.

## Appendix C — Remediation status (updated 2026-10-31)

Commit messages reference this document's finding ids.

### Phase 0 — complete

R4 (cron authorisation), R3 (budget enforcement), R5 (write-only BYOK fields) and R12 (SSRF in the market-provider tester) are implemented and committed, each with a test.

### Phase 1 — implemented, cutover pending

- **Schema.** Migration `0119` grants the non-bypass application role (`kestrel_app`) every table and re-arms default privileges for whichever role executes migrations — closing the `provider_circuit_state` gap and stopping the next table from repeating it. Guarded by `packages/db/test/postgres-app-role.test.ts`, which migrates a disposable database and asserts _as that role_: non-superuser/non-bypass, every table granted, tenant isolation, cross-tenant write rejection, and fail-closed unscoped reads and writes.
- **Per-user scope.** `withUserTenant` (and a read-only variant) is applied across the server components that read tenant data, and across the cron fan-out jobs, which scope each user individually.
- **System-wide work** moved to the admin (BYPASSRLS) connection: `alerts`, `cleanup-telemetry`, `health-alerts`, and the user discovery in `briefings` / `weekly-review`.
- **Cutover still pending.** `DATABASE_URL` must point at `kestrel_app`; until it does, the app still connects as a superuser and **RLS is not enforced**. Provisioning is in place: `pnpm --filter @kestrel/db provision:app-role`.

### Found while implementing (not in the original findings)

- **`docker/postgres/init-admin-role.sh` never provisioned `hamafx_admin`.** Its heredoc (`<<-EOSQL`) was unquoted, so `DO $$` expanded to `DO <pid>`; with `ON_ERROR_STOP=1` psql aborted before the `ALTER ROLE … WITH PASSWORD`, and no other file in the repo sets that password. On a fresh volume the role exists (created by migration `0037`) but cannot authenticate, so `ADMIN_DATABASE_URL` fails. Fixed by escaping the delimiters; verified on fresh containers.
- **`@kestrel/ai`'s DI-backed `getDb()` ignored the admin scope**, so `withAdminDb` never reached AI code — a cron route could open an admin scope and still read zero rows. Fixed (`hasAdminDbScope()`), covered by `packages/ai/test/runtime-db-scope.test.ts`.
- **Two classes of tenant read remain unscoped** and are tracked rather than fixed: `(app)/chat/page.tsx` reads through `@/lib/services` (invisible to the static guard, which sees only direct `@kestrel/db` access), and the `'use server'` action files under `(app)/settings/` — server actions are separate requests and do not inherit the page's scope, so under the hardened role a key save would read no existing keys and write nothing.
- `cleanup-tokens` purges only `verificationToken`, which has no RLS policy: it needs the `expires` index noted above, not a tenant scope.
