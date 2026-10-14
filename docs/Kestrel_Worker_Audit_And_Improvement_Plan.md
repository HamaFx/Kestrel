# Kestrel Worker System & Flows — Complete Agent Implementation Plan & Audit Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 17 concurrency, data-integrity, lifecycle, security, and scheduling bugs plus 6 database/query performance bottlenecks across Kestrel's worker system (`apps/worker`, `packages/db`, `packages/ai`, `packages/data`, `apps/web`, and `infra/cron-vm`).

**Architecture:** Kestrel runs a dual-mode worker runtime (`apps/worker/src/index.ts` for persistent BiQuote SignalR + Binance WebSocket streaming and Docker `node-cron` scheduling; `apps/worker/src/runner/cli.ts` for one-shot systemd CLI execution) backed by PostgreSQL (`live_ticks`, `candles_1m`, `cron_runs`, `full_analysis_queue`, `persistence_outbox`, `ai_budget_reservations`) and Mastra workflow storage. Each task below is self-contained, preserves existing database migration schemas (`0000`–`0097`), and follows strict red-green-refactor TDD.

**Tech Stack:** TypeScript 7 (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Node.js 22 ESM (`esbuild` bundle in `apps/worker/scripts/build.mjs`), Vitest 3, Drizzle ORM (`postgres-js`), `@microsoft/signalr`, `ws`, `node-cron`, Mastra (`@mastra/core`, `@mastra/pg`), Zod, Docker Compose, systemd, Python 3 stdlib.

**Spec:** Self-contained in Section 1 (Audit Scorecard & Findings Matrix) and Section 2 (Tasks 1–11).

## Global Constraints

- **TypeScript Strictness (`tsconfig.base.json`):** `exactOptionalPropertyTypes: true` and `noUncheckedIndexedAccess: true` are enforced across all packages. Never pass `{ signal: undefined }` to an optional `signal?: AbortSignal` property; always use conditional spread `...(signal ? { signal } : {})`.
- **ESM Import Extensions:** Inside `apps/worker/src/**`, local relative imports MUST use explicit `.js` extensions (e.g., `import { ping } from './healthchecks.js'`). Inside `packages/{db,ai,data,shared}/src/**`, extensionless relative imports are used.
- **Database Pool & RLS Contract:** In production/Docker, the worker sets `KESTREL_RUNTIME=worker` and `ADMIN_DATABASE_URL`, causing `getDb()` (`packages/db/src/client.ts:274-276`) to return `getAdminDb()` (`_adminSql`). `closeDb()` MUST close `_sql`, `_replicaSql`, AND `_adminSql`.
- **Durable Queue Lease Invariant:** A worker whose `full_analysis_queue` lease was lost (`FullAnalysisQueueOwnershipError` / `FullAnalysisLeaseLostError`) MUST NEVER reconcile or release the budget reservation, append an assistant message, or overwrite the queue row's terminal state.
- **Zero-Migration Compatibility:** Do not add or alter PostgreSQL DDL migrations (`packages/db/drizzle/*`); all SQL fixes use existing columns and indexes (`full_analysis_queue_pending_idx`, `full_analysis_queue_terminal_completed_idx`, `cron_runs_pkey`).

## Review Focus

- **Daily cron job retry after transient error or container restart (Task 4):** When a daily job (`snapshots`, `cot`, `fred-actuals`, `weekly-review`, `resonance-sync`, `retention`, `dataset-export`) fails (`status = 'error'`) or is marked `'error'` on startup by `cleanupStaleCronRuns`, a subsequent run on the same UTC day must reclaim the `'error'` row in `acquireCronLock` instead of returning `null`.
- **Duplicate and cross-category symbol subscriptions (Task 1):** `SymbolManager` emits both `symbolsChanged` (all categories) and `biquoteChanged` (gold/forex). `apps/worker/src/index.ts` must only wire `biquoteChanged` to `SignalRConsumer`, `SignalRConsumer` must deduplicate `subscribedSymbols` with a `Set<string>` and reject `crypto` symbols, and `BinanceStreamConsumer.updateSubscriptions` must be a no-op when the effective symbol set has not changed.
- **Graceful shutdown during active 1Hz tick flush or minute rollover (Task 2):** `worker.stop()` must prevent `runSingleFlush()` from re-arming `flushTimer`, await any in-flight `runSingleFlush()`, and await all in-flight `flushClosedCandle()` promises triggered by `aggregator.closeAll()` before `closeDb()` runs.
- **Binance `@kline_1m` future timestamp & lost crypto OHLCV (Task 3):** `BinanceStreamConsumer` must set `tick.ts` to the event timestamp `msg.data.E` (never `candle.T`, which is the minute-end close timestamp up to 59.999s in the future and breaks `fetchLiveTick` staleness checks) and forward `high`, `low`, and `volume` to `Candle1mAggregator`.
- **Concurrent specialist progress updates & unawaited title cost in `multi-agent-analysis` (Task 5):** Parallel Mastra specialists calling `updateFullAnalysisProgress` simultaneously must append to `full_analysis_queue.progress` atomically in SQL (`coalesce(progress, '[]'::jsonb) || ...`), `maybeGenerateThreadTitle` must be awaited before `observedCost = ledger.total()`, and the claim loop must exit immediately when `ctx.signal.aborted` is true.

## Section 1: Audit Scorecard & Complete Findings Matrix

### 1.1 Subsystem Ratings

| Subsystem / Aspect | Score | Grade | Summary of Findings |
| :--- | :---: | :---: | :--- |
| **1. Architecture & Modularity** | **8.4 / 10** | **A-** | Clean monorepo boundaries and data-driven `JOBS` registry; penalized by dead 220-line `apps/worker/src/scheduler/embedded.ts` and legacy 3-symbol `SYMBOLS` usage in `snapshots`. |
| **2. Streaming & WebSocket Ingestion** | **6.2 / 10** | **C+** | Penalized by duplicate `symbolsChanged` + `biquoteChanged` wiring in `index.ts:232-242`, future `candle.T` timestamps in `binance/consumer.ts:111`, dropped crypto volume/wicks, and unconditional socket close on `updateSubscriptions`. |
| **3. Lifecycle, Shutdown & Resource Cleanup** | **6.5 / 10** | **C+** | Penalized by `closeDb()` leaking `_adminSql`, `aggregator.closeAll()` firing unawaited `flushClosedCandle` promises on shutdown, `runSingleFlush` re-arming `flushTimer` after `stop()`, and un-cleared 10s candle flush timers. |
| **4. Scheduler & Cron Idempotency** | **6.8 / 10** | **C+** | Penalized by `acquireCronLock` refusing to reclaim `status = 'error'` rows (locking out daily jobs for 24h after any blip or restart), missing `withHeartbeat` calls in Docker `scheduler.ts`, and duplicate fail pings in `runner/cli.ts`. |
| **5. Durable Multi-Agent Queue (`full_analysis_queue`)** | **7.8 / 10** | **B+** | Strong lease ownership and retry ledger, but has read-modify-write lost updates in `updateFullAnalysisProgress`, unawaited `maybeGenerateThreadTitle` after cost freeze, and 3s `SELECT *` full-table scans in `getFullAnalysisQueueHealth` and `purgeOldFullAnalysisRuns`. |
| **6. Database Queries, Retention & Performance** | **6.9 / 10** | **C+** | Penalized by `fetchCandles1m` omitting `.limit()` (pulling ~20,160 rows/symbol on every call), $O(U \times E)$ sequential queries in `runBriefings`, and N+1 claim updates in `claimNextFullAnalysisQueue`. |
| **7. Security, HTTP Surfaces & VM Infrastructure** | **7.6 / 10** | **B** | Penalized by non-constant-time `!==` token check in `createProxyHandler`, fail-open `verify_signature` + uncapped body + zombie processes in `webhook-listener.py`, and duplicate `kestrel-light-alerts.timer` on the VM. |
| **8. Observability, Health Checks & Testing** | **7.9 / 10** | **B+** | Penalized by `lastTickAt` conflating SignalR and Binance WS (masking SignalR outages and false-alerting on FX weekends) and missing `id` on `CronRun` rows in `AdminCronTable`. |
| **OVERALL WORKER SYSTEM SCORE** | **7.3 / 10** | **B** | **All 23 findings are mapped to Tasks 1–11 below.** |

### 1.2 Findings-to-Tasks Cross-Reference

| Finding ID | Severity | Summary | Owning Task |
| :--- | :--- | :--- | :--- |
| **BUG-01** | High | `index.ts` listens to both `symbolsChanged` and `biquoteChanged`, subscribing BiQuote twice and passing crypto symbols to SignalR; `subscribedSymbols` is an un-deduplicated array. | **Task 1** |
| **BUG-02** | High | `BinanceStreamConsumer.updateSubscriptions` closes the WS even when symbols are unchanged; `BINANCE_WS_BASE` is frozen at module import time; `SymbolManager.start()` doesn't return initial poll promise. | **Task 1** |
| **BUG-13** | Medium | `BaseWsConsumer.scheduleReconnect()` overwrites `reconnectTimer` without guard/clear, omits `.unref()`, and penalizes intentional subscription updates with reconnect backoff. | **Task 1** |
| **BUG-04** | High | `Candle1mAggregator` `onClosed` callback in `index.ts` is fire-and-forget (`void`) and leaks a 10s `setTimeout` per closed bar; `aggregator.closeAll()` on `stop()` does not await DB writes. | **Task 2** |
| **BUG-05** | High | `runSingleFlush()` races with `worker.stop()` and re-arms `flushTimer` in `finally` after `stop()` cleared it. | **Task 2** |
| **BUG-11a** | Medium | `closeDb()` in `packages/db/src/client.ts` closes `_sql` and `_replicaSql` but never calls `closeAdminDb()` (`_adminSql`). | **Task 2** |
| **BUG-03** | High | `BinanceStreamConsumer` sets `tick.ts = candle.T` (future kline close time) instead of `k.E` (event time) and drops `candle.h`, `candle.l`, and `candle.v`. | **Task 3** |
| **BUG-10** | High | `acquireCronLock` does not reclaim `status = 'error'` rows, locking out failed or startup-cleaned daily jobs for the rest of the UTC day; `AdminCronTable` uses `key={run.id}` which is `undefined`. | **Task 4** |
| **BUG-11b** | Medium | `runner/cli.ts` skips `loadSecretsFromVault()`, double-pings `healthchecks.io/fail`, and skips Langfuse/Mastra observability flush on exit. | **Task 4** |
| **BUG-14** | Medium | `apps/worker/src/scheduler/embedded.ts` is 220 lines of dead, drifted code. | **Task 4** |
| **BUG-16** | Medium | `scheduler.ts` never calls `withHeartbeat` (`HC_JOB_*_UUID` unused in Docker mode); `WORKER_PARTITION`, `WORKER_PARTITIONS_TOTAL`, and `JOB_TIMEOUT_MS` missing from `WorkerEnvSchema`; `TenantRouter` allows `partition >= totalPartitions`. | **Task 4** |
| **BUG-07** | High | `multi-agent-analysis` leaves `maybeGenerateThreadTitle` unawaited after `observedCost`, misses `ctx.signal.aborted` in claim loop, loses parallel `updateFullAnalysisProgress` updates, and runs `SELECT *` full-table scans in `getFullAnalysisQueueHealth` and `purgeOldFullAnalysisRuns` every 3s. | **Task 5** |
| **PERF-03** | Medium | `claimNextFullAnalysisQueue` runs `SELECT LIMIT 100` + JS loop of `UPDATE`s instead of atomic `FOR UPDATE SKIP LOCKED`. | **Task 5** |
| **BUG-08** | High | `fetchCandles1m` omits `.limit(limit)` in SQL, reading all ~20,160 rows per symbol into JS memory on every call. | **Task 6** |
| **BUG-15** | Medium | `alerts`, `budget-recovery`, `persistence-recovery`, `retention`, and `dataset-export` ignore `AbortSignal` (and `alerts` ignores `tenantRouter`). | **Task 7** |
| **BUG-06** | High | `snapshots` job and `/api/cron/snapshots` iterate legacy 3-symbol `SYMBOLS` instead of 18-symbol `ALL_SYMBOLS`; `cot` uses `SYMBOLS` instead of `CFTC_SUPPORTED_SYMBOLS`. | **Task 8** |
| **PERF-01** | High | `runBriefings` issues up to 4,000 sequential `wasEmitted` + `loadEvent` DB queries per 5m tick across the 30-day post-event window. | **Task 8** |
| **PERF-02** | Medium | `runSnapshots` runs 3 separate queries (`SELECT count(*)`, `DELETE`, `SELECT count(*)`) to prune `candles_1m`. | **Task 8** |
| **BUG-12** | Medium | `http-server.ts` uses `!==` instead of `timingSafeEqual` for `BIQUOTE_PROXY_TOKEN`, allows non-`GET` methods on `/biquote`, and conflates SignalR/Binance tick timestamps on weekends. | **Task 9** |
| **BUG-09** | High | `kestrel-light-alerts.timer` on the GCE VM curls Vercel `/api/cron/alerts` every 5m while the worker container already runs `alerts` in-process every 1m. | **Task 10** |
| **BUG-17** | Medium | `webhook-listener.py` returns `True` when `WEBHOOK_SECRET` is empty, has no `Content-Length` limit, leaves zombie `docker-update.sh` processes, and has an orphaned `kestrel-webhook.socket` file. | **Task 10** |

## Section 2: Step-by-Step Implementation Tasks

### Task 1: Fix WebSocket & SignalR Subscription Deduplication, Startup Race, and Reconnect Hygiene (BUG-01, BUG-02, BUG-13)

**Files:**
- Modify: `apps/worker/src/base-ws-consumer.ts:137-198`
- Modify: `apps/worker/src/binance/consumer.ts:25-75`
- Modify: `apps/worker/src/signalr/consumer.ts:36-150, 205-228`
- Modify: `apps/worker/src/symbol-manager.ts:72-93`
- Modify: `apps/worker/src/index.ts:220-267`
- Test: `apps/worker/test/signalr-consumer.test.ts`
- Test: `apps/worker/test/symbol-manager.test.ts`

**Interfaces:**
- Consumes: `isKnownSymbol`, `symbolCategory`, `SYMBOLS`, `type Symbol` from `@kestrel/shared`
- Produces:
  - `BaseWsConsumer.reconnectImmediately(reason?: string): void` in `apps/worker/src/base-ws-consumer.ts`
  - `BinanceStreamConsumerOptions.wsUrl?: string` in `apps/worker/src/binance/consumer.ts`
  - `SymbolManager.start(): Promise<void>` in `apps/worker/src/symbol-manager.ts`

- [ ] **Step 1: Add failing unit tests in `apps/worker/test/signalr-consumer.test.ts` and `apps/worker/test/symbol-manager.test.ts`**

Append the following test inside `describe('SignalRConsumer', ...)` in `apps/worker/test/signalr-consumer.test.ts`:

```typescript
  it('deduplicates updateSubscriptions and filters out crypto symbols', async () => {
    const { build, state } = createFakeBuildConnection();
    const consumer = new SignalRConsumer({
      hubUrl: 'https://biquote.io/hubs/tick',
      symbols: ['XAUUSD', 'BTCUSDT'],
      onTick: () => undefined,
      buildConnection: build,
      log: createLogger({ service: 'test', forceJson: true }),
    });

    await consumer.start();
    // Initial start should only subscribe to non-crypto known symbols
    expect(state.invokes).toEqual([{ method: 'Subscribe', args: [['XAUUSD']] }]);
    state.invokes.length = 0;

    // Adding already-subscribed XAUUSD, new EURUSD, and crypto ETHUSDT:
    await consumer.updateSubscriptions(['XAUUSD', 'EURUSD', 'ETHUSDT'], []);
    expect(state.invokes).toEqual([{ method: 'Subscribe', args: [['EURUSD']] }]);
    state.invokes.length = 0;

    // Removing a symbol not subscribed is a no-op; removing EURUSD unsubscribes once:
    await consumer.updateSubscriptions([], ['BTCUSDT', 'EURUSD']);
    expect(state.invokes).toEqual([{ method: 'Unsubscribe', args: [['EURUSD']] }]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/worker test -- test/signalr-consumer.test.ts`
Expected: FAIL — `SignalRConsumer` passes `'BTCUSDT'` to `Subscribe` on start and passes `['XAUUSD', 'EURUSD', 'ETHUSDT']` on `updateSubscriptions`.

- [ ] **Step 3: Implement the changes in `base-ws-consumer.ts`, `binance/consumer.ts`, `signalr/consumer.ts`, `symbol-manager.ts`, and `index.ts`**

In `apps/worker/src/base-ws-consumer.ts`, replace lines 137–198 with:

```typescript
  // ── Reconnect ───────────────────────────────────────────────────────

  protected scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    const delays = this.getReconnectDelays();
    const delay = delays[Math.min(this.reconnectAttempt, delays.length - 1)]!;
    this.reconnectAttempt += 1;
    this.log.info(this.constructor.name + ' reconnect in', {
      delayMs: delay,
      attempt: this.reconnectAttempt,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.reconnectTimer.unref();
  }

  /**
   * Immediately tear down the current socket and reconnect without
   * incrementing backoff (used when subscriptions change intentionally).
   */
  protected reconnectImmediately(reason = 'subscription update'): void {
    if (this.destroyed) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onopen = null;
      try {
        this.ws.close(4000, reason);
      } catch {
        // Ignore close errors on half-open sockets
      }
      this.ws = null;
    }
    this.stopHeartbeat();
    this.connect();
  }

  /** Override to customize reconnect delay sequence. */
  protected getReconnectDelays(): number[] {
    return DEFAULT_RECONNECT_DELAYS_MS;
  }

  // ── Heartbeat ───────────────────────────────────────────────────────

  protected startHeartbeat(): void {
    this.stopHeartbeat();
    const intervalMs = this.buildHeartbeatIntervalMs();
    if (intervalMs <= 0) return;
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), intervalMs);
    this.heartbeatTimer.unref();
  }

  protected stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Override to send a heartbeat message. Default: no-op. */
  protected sendHeartbeat(): void {
    // No-op by default — overridden when the protocol requires it.
  }

  // ── Send ────────────────────────────────────────────────────────────

  protected send(msg: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // ── Cleanup ─────────────────────────────────────────────────────────

  protected clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
  }
}
```

In `apps/worker/src/binance/consumer.ts`, replace lines 25–75 with:

```typescript
const DEFAULT_BINANCE_WS_BASE = 'wss://stream.binance.com:9443';
const PING_INTERVAL_MS = 3 * 60 * 1_000;
const MAX_EMPTY_MINUTES = 10;

export interface BinanceStreamConsumerOptions {
  symbols: string[];
  onTick: (tick: NormalizedTick) => void;
  onActivity?: () => void;
  log: Logger;
  wsUrl?: string | undefined;
}

export class BinanceStreamConsumer extends BaseWsConsumer {
  private lastMessageAt = 0;
  private symbols: string[];
  private readonly onTick: (tick: NormalizedTick) => void;
  private readonly wsBaseUrl: string;

  constructor(opts: BinanceStreamConsumerOptions) {
    super(opts.log, opts.onActivity);
    this.symbols = Array.from(new Set(opts.symbols));
    this.onTick = opts.onTick;
    this.wsBaseUrl = (opts.wsUrl ?? process.env.BINANCE_WS_URL ?? DEFAULT_BINANCE_WS_BASE).replace(
      /\/+$/,
      '',
    );
  }

  /** Update subscriptions dynamically. Reconnects only when the symbol set actually changes. */
  async updateSubscriptions(added: string[], removed: string[]): Promise<void> {
    const prevSet = new Set(this.symbols);
    const nextSet = new Set(this.symbols);
    for (const s of added) nextSet.add(s);
    for (const s of removed) nextSet.delete(s);

    const changed =
      prevSet.size !== nextSet.size || Array.from(nextSet).some((s) => !prevSet.has(s));
    if (!changed) return;

    this.symbols = Array.from(nextSet);

    if (!this.destroyed && this.ws) {
      this.reconnectImmediately('subscription update');
    }
  }

  // ── BaseWsConsumer overrides ────────────────────────────────────────

  protected override buildUrl(): string {
    if (this.symbols.length === 0) {
      this.log.info('binance ws skipping — no symbols configured');
      return '';
    }
    const streams = this.symbols.map((s) => `${s.toLowerCase()}@kline_1m`).join('/');
    return `${this.wsBaseUrl}/stream?streams=${streams}`;
  }
```

In `apps/worker/src/signalr/consumer.ts`:
1. Update the `@kestrel/shared` import on line 36 to:
   ```typescript
   import {
     BiquoteSignalRTickSchema,
     isKnownSymbol,
     symbolCategory,
     SYMBOLS,
     type Symbol,
   } from '@kestrel/shared';
   ```
2. Add a helper right above `SignalRConsumer`:
   ```typescript
   function isBiquoteSymbol(symbol: string): boolean {
     if (!isKnownSymbol(symbol)) return false;
     const category = symbolCategory(symbol);
     return category === 'gold' || category === 'forex';
   }
   ```
3. In `SignalRConsumer` (lines 88–149 and 172–228), replace `private subscribedSymbols: string[] = [];` with `private subscribedSymbols = new Set<string>();` and update `start()`, `stop()`, `scheduleReconnect()`, and `updateSubscriptions()`:
   ```typescript
   export class SignalRConsumer {
     private readonly opts: ConsumerOptions;
     private connection: MinimalHubConnection | null = null;
     /** Symbols we've asked the hub to subscribe to; resent on reconnect. */
     private subscribedSymbols = new Set<string>();
     /** True after `start()` resolves and until `stop()` runs. */
     private started = false;
     private stopping = false;
     private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
     private reconnectAttempt = 0;
     private static readonly MAX_REBUILD_BACKOFF_MS = 60_000;

     constructor(opts: ConsumerOptions) {
       this.opts = opts;
     }

     async start(): Promise<void> {
       if (this.started) return;
       const initialSymbols = (this.opts.symbols ?? [...SYMBOLS]).filter(isBiquoteSymbol);
       for (const s of initialSymbols) this.subscribedSymbols.add(s);
       const symbols = Array.from(this.subscribedSymbols);

       const conn = this.opts.buildConnection({
         hubUrl: this.opts.hubUrl,
         reconnectDelaysMs: this.opts.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS,
       });
       this.connection = conn;

       conn.on('ReceiveTick', (...args: unknown[]) => {
         this.handleTick(args[0]);
       });

       conn.onreconnecting((err) => {
         this.opts.log.warn('signalr reconnecting', { err: err ? String(err) : undefined });
       });
       conn.onreconnected(() => {
         const current = Array.from(this.subscribedSymbols);
         this.opts.log.info('signalr reconnected — resubscribing', {
           symbols: current,
         });
         void this.subscribe(current);
       });
       conn.onclose((err) => {
         this.opts.log.error('signalr connection closed', {
           err: err ? String(err) : 'no error',
         });
         this.started = false;
         if (!this.stopping) this.scheduleReconnect();
       });

       this.opts.log.info('signalr starting', {
         hubUrl: this.opts.hubUrl,
         symbols,
       });
       await conn.start();
       await this.subscribe(symbols);
       this.started = true;
       this.opts.log.info('signalr subscribed', { symbols });
     }

     async stop(): Promise<void> {
       this.stopping = true;
       if (this.reconnectTimer) {
         clearTimeout(this.reconnectTimer);
         this.reconnectTimer = null;
       }
       if (!this.connection) return;
       try {
         await this.unsubscribe(Array.from(this.subscribedSymbols));
       } catch (err) {
         this.opts.log.warn('signalr unsubscribe failed during stop', { err: String(err) });
       }
       try {
         await this.connection.stop();
       } catch (err) {
         this.opts.log.warn('signalr stop failed', { err: String(err) });
       }
       this.connection = null;
       this.started = false;
     }

     private scheduleReconnect(): void {
       if (this.stopping || this.reconnectTimer) return;
       this.reconnectAttempt += 1;
       const baseMs = Math.min(
         SignalRConsumer.MAX_REBUILD_BACKOFF_MS,
         2_000 * Math.pow(2, this.reconnectAttempt - 1),
       );
       const delay = jitteredDelay(baseMs);
       this.opts.log.warn('signalr scheduling manual rebuild', {
         attempt: this.reconnectAttempt,
         delayMs: Math.round(delay),
       });
       this.reconnectTimer = setTimeout(() => {
         this.reconnectTimer = null;
         void this.rebuild();
       }, delay);
       this.reconnectTimer.unref();
     }
   ```
   And in `updateSubscriptions` (`apps/worker/src/signalr/consumer.ts:218-227`):
   ```typescript
     async updateSubscriptions(added: string[], removed: string[]): Promise<void> {
       const toAdd = added.filter((s) => isBiquoteSymbol(s) && !this.subscribedSymbols.has(s));
       const toRemove = removed.filter((s) => this.subscribedSymbols.has(s));

       if (toAdd.length > 0) {
         for (const s of toAdd) this.subscribedSymbols.add(s);
         await this.subscribe(toAdd);
       }
       if (toRemove.length > 0) {
         for (const s of toRemove) this.subscribedSymbols.delete(s);
         await this.unsubscribe(toRemove);
       }
     }
   ```

In `apps/worker/src/symbol-manager.ts:72-86`, return the initial `this.poll()` promise from `start()`:

```typescript
  public start(): Promise<void> {
    if (this.pollTimer) return Promise.resolve();

    const initialPoll = this.poll();

    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
    this.pollTimer.unref();

    this.log.info('SymbolManager started polling', { intervalMs: this.pollIntervalMs });
    return initialPoll;
  }
```

In `apps/worker/src/index.ts:231-266`, remove the duplicate `symbolManager.on('symbolsChanged', ...)` listener and pass `wsUrl`:

```typescript
  // Wire per-consumer subscription updates (biquoteChanged for FX/gold, binanceChanged for crypto)
  symbolManager.on('biquoteChanged', ({ added, removed }) => {
    if (consumer.isStarted()) {
      void consumer.updateSubscriptions(added, removed);
    }
  });
  symbolManager.on('binanceChanged', ({ added, removed }) => {
    if (binanceConsumer) {
      void binanceConsumer.updateSubscriptions(added, removed);
    }
  });

  // Binance WebSocket consumer for live crypto klines.
  const cryptoSymbols = (
    env.BINANCE_CRYPTO_SYMBOLS ?? 'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,ADAUSDT'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const binanceConsumer = new BinanceStreamConsumer({
    symbols: cryptoSymbols,
    onTick: handleIncomingTick,
    onActivity: () => notifyWatchdog(),
    log: log.with({ module: 'binance-ws' }),
    ...(env.BINANCE_WS_URL ? { wsUrl: env.BINANCE_WS_URL } : {}),
  });

  await consumer.start(); // BiQuote SignalR
  await binanceConsumer.start(); // Binance WS
  await symbolManager.start();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/worker test -- test/signalr-consumer.test.ts test/symbol-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/base-ws-consumer.ts apps/worker/src/binance/consumer.ts apps/worker/src/signalr/consumer.ts apps/worker/src/symbol-manager.ts apps/worker/src/index.ts apps/worker/test/signalr-consumer.test.ts apps/worker/test/symbol-manager.test.ts
git commit -m "fix(worker): deduplicate stream subscriptions and prevent reconnect storms"
```

### Task 2: Fix Worker Shutdown Races, In-Flight Candle/Tick Drain, Timer Leaks, and Admin Pool Cleanup (BUG-04, BUG-05, BUG-11a)

**Files:**
- Modify: `packages/db/src/client.ts:305-314`
- Modify: `apps/worker/src/index.ts:175-219, 278-388`
- Test: `apps/worker/test/worker-lifecycle.test.ts`
- Test: `packages/db/test/client.test.ts`

**Interfaces:**
- Consumes: `closeAdminDb()` in `packages/db/src/client.ts`
- Produces:
  - `closeDb(): Promise<void>` closing `_sql`, `_replicaSql`, and `_adminSql`
  - `RunningWorker.stop(): Promise<void>` awaiting in-flight `runSingleFlush()` and all `flushClosedCandle()` promises before resolving

- [ ] **Step 1: Write the failing tests in `apps/worker/test/worker-lifecycle.test.ts`**

Replace `apps/worker/test/worker-lifecycle.test.ts` with both the contract checks and a runtime shutdown drain test:

```typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import * as candlesPersistence from '../src/persistence/candles-1m.js';
import { runWorker } from '../src/index.js';
import { createLogger } from '../src/log.js';
import type { MinimalHubConnection } from '../src/signalr/consumer.js';

vi.mock('@kestrel/ai', () => ({
  getDb: () => ({
    insert: () => ({
      values: () => ({
        onConflictDoNothing: async () => undefined,
        onConflictDoUpdate: async () => undefined,
      }),
    }),
  }),
  initLangfuse: vi.fn(),
  shutdownLangfuse: vi.fn(),
}));

vi.mock('@kestrel/db', () => ({
  closeDb: vi.fn(),
  listDistinctSymbols: vi.fn(async () => ['XAUUSD']),
}));

const source = readFileSync(resolve(process.cwd(), 'src/index.ts'), 'utf8');

describe('worker lifecycle contracts', () => {
  it('starts both consumers before declaring readiness', () => {
    expect(source.indexOf('await consumer.start()')).toBeGreaterThan(-1);
    expect(source.indexOf('await binanceConsumer.start()')).toBeGreaterThan(-1);
    expect(source.indexOf('notifyReady()')).toBeGreaterThan(
      source.indexOf('await binanceConsumer.start()'),
    );
  });

  it('cleans up the worker when HTTP listener startup fails', () => {
    expect(source).toContain('post-startup initialisation failed');
    expect(source).toContain('await worker.stop()');
    expect(source).toContain('proxyServer?.close()');
  });

  it('closes both HTTP servers during shutdown', () => {
    expect(source).toContain('healthServer!.close()');
    expect(source).toContain('proxyServer?.close()');
  });

  it('awaits in-flight flushClosedCandle promises triggered by closeAll() during stop()', async () => {
    let resolveCandleFlush!: () => void;
    let flushStarted = false;
    const candleFlushGate = new Promise<void>((r) => {
      resolveCandleFlush = r;
    });

    const spy = vi
      .spyOn(candlesPersistence, 'flushClosedCandle')
      .mockImplementation(async () => {
        flushStarted = true;
        await candleFlushGate;
      });

    let receiveTick: ((raw: unknown) => void) | null = null;
    const fakeConn: MinimalHubConnection = {
      start: async () => undefined,
      stop: async () => undefined,
      invoke: async () => undefined,
      on: (method, handler) => {
        if (method === 'ReceiveTick') receiveTick = handler;
      },
      off: () => undefined,
      onreconnecting: () => undefined,
      onreconnected: () => undefined,
      onclose: () => undefined,
    };

    const worker = await runWorker({
      env: {
        DATABASE_URL: 'postgres://localhost:5432/test',
        BIQUOTE_HUB_URL: 'https://biquote.io/hubs/tick',
        BINANCE_CRYPTO_SYMBOLS: '',
        WORKER_HTTP_PORT: 8081,
        WORKER_PROXY_PORT: 8082,
        DEPLOYED_SHA: 'test',
        NODE_ENV: 'test',
        WORKER_MODE: 'systemd',
        LANGFUSE_RECORD_IO: '0',
        TELEMETRY_RETENTION_DAYS: 90,
        TRACE_RETENTION_DAYS: 30,
        RATE_LIMIT_RETENTION_HOURS: 2,
        PROVIDER_DAILY_QUOTA_RETENTION_DAYS: 3,
        CRON_RUN_RETENTION_DAYS: 30,
        ANALYSIS_JOB_RETENTION_DAYS: 7,
        BILLING_WEBHOOK_DLQ_RETENTION_DAYS: 90,
        AI_EVALUATION_RETENTION_DAYS: 90,
        PERSISTENCE_OUTBOX_RETENTION_DAYS: 30,
        BUDGET_RESERVATION_RETENTION_DAYS: 90,
      },
      log: createLogger({ service: 'test', forceJson: true }),
      buildConnection: () => fakeConn,
      flushIntervalMs: 10_000,
      heartbeatIntervalMs: 0,
    });

    receiveTick!({
      symbol: 'XAUUSD',
      bid: 2400,
      ask: 2400.2,
      timestamp: 1_700_000_000_000,
    });

    let stopSettled = false;
    const stopPromise = worker.stop().then(() => {
      stopSettled = true;
    });

    // Give stop() a microtask turn to reach aggregator.closeAll()
    await new Promise((r) => setTimeout(r, 20));
    expect(flushStarted).toBe(true);
    expect(stopSettled).toBe(false);

    resolveCandleFlush();
    await stopPromise;
    expect(stopSettled).toBe(true);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/worker test -- test/worker-lifecycle.test.ts`
Expected: FAIL — `expect(stopSettled).toBe(false)` fails because `worker.stop()` resolves before `resolveCandleFlush()` is called.

- [ ] **Step 3: Implement `closeAdminDb()` in `packages/db/src/client.ts` and tracked flush promises in `apps/worker/src/index.ts`**

1. In `packages/db/src/client.ts:306-313`, update `closeDb()`:
   ```typescript
   /** For tests / scripts only — closes the underlying pool(s). */
   export async function closeDb(): Promise<void> {
     if (_sql) {
       await _sql.end({ timeout: 5 });
       _sql = null;
       _client = null;
     }
     await closeReplicaDb();
     await closeAdminDb();
   }
   ```
2. In `apps/worker/src/index.ts`, replace lines 175–218 with:
   ```typescript
     let candleFailureCount = 0;
     const inFlightCandleFlushes = new Set<Promise<void>>();

     const aggregator = new Candle1mAggregator((bar: ClosedCandle) => {
       const CANDLE_FLUSH_TIMEOUT_MS = 10_000;
       const flushController = new AbortController();
       let timeoutId: NodeJS.Timeout | null = null;

       const flushPromise = (async () => {
         try {
           await flushClosedCandle({ db, log, bar, signal: flushController.signal });
           log.info('candle closed', {
             symbol: bar.symbol,
             t: new Date(bar.t).toISOString(),
             o: bar.o,
             h: bar.h,
             l: bar.l,
             c: bar.c,
             ticks: bar.tickVolume,
           });
           candleFailureCount = 0;
         } catch (err) {
           candleFailureCount += 1;
           log.error('flushClosedCandle failed', {
             err: String(err),
             symbol: bar.symbol,
             consecutiveFailures: candleFailureCount,
           });
         } finally {
           if (timeoutId) {
             clearTimeout(timeoutId);
             timeoutId = null;
           }
         }
       })();

       const timeoutPromise = new Promise<void>((resolve) => {
         timeoutId = setTimeout(() => {
           timeoutId = null;
           flushController.abort();
           log.warn('flushClosedCandle timed out', { symbol: bar.symbol });
           resolve();
         }, CANDLE_FLUSH_TIMEOUT_MS);
         timeoutId.unref();
       });

       const tracked = Promise.race([flushPromise, timeoutPromise]).finally(() => {
         inFlightCandleFlushes.delete(tracked);
       });
       inFlightCandleFlushes.add(tracked);
     });
   ```
3. In `apps/worker/src/index.ts`, replace lines 278–384 with:
   ```typescript
     let flushInFlight = false;
     let activeFlushPromise: Promise<void> | null = null;
     let stopping = false;
     let flushTimer: NodeJS.Timeout | null = null;
     const flushIntervalMs = args.flushIntervalMs ?? 1_000;

     const scheduleFlush = () => {
       if (stopping) return;
       if (flushTimer) clearTimeout(flushTimer);
       flushTimer = setTimeout(() => {
         flushTimer = null;
         void runSingleFlush();
       }, flushIntervalMs);
       flushTimer.unref();
     };

     const runSingleFlush = async () => {
       if (stopping) return;
       if (flushInFlight) {
         log.warn('flushLiveTicks skipped — previous flush still in flight');
         scheduleFlush();
         return;
       }

       const drained = buffer.peek();
       if (drained.length === 0) {
         scheduleFlush();
         return;
       }

       flushInFlight = true;
       const work = (async () => {
         try {
           const r = await flushLiveTicks({ db, buffer, log }, drained);
           buffer.drain(drained);
           if (r.written > 0) {
             log.info('flushed live_ticks', { written: r.written, ticks: r.totalTicks });
           }
           tickFlushFailureCount = 0;
         } catch (err) {
           tickFlushFailureCount += 1;
           log.error('flushLiveTicks failed — ticks retained in buffer for next attempt', {
             err: String(err),
             consecutiveFailures: tickFlushFailureCount,
           });
         } finally {
           flushInFlight = false;
           activeFlushPromise = null;
           scheduleFlush();
         }
       })();
       activeFlushPromise = work;
       await work;
     };

     // Kick off the first flush loop.
     scheduleFlush();

     const heartbeatIntervalMs = args.heartbeatIntervalMs ?? 30_000;
     let heartbeatTimer: NodeJS.Timeout | null = null;
     if (heartbeatIntervalMs > 0) {
       heartbeatTimer = setInterval(() => {
         const ageMs = Date.now() - lastTickAt;
         if (lastTickAt > 0 && ageMs < 60_000) {
           void ping(env.HC_SIGNALR_UUID, 'success', `last_tick=${ageMs}ms`);
         } else {
           void ping(env.HC_SIGNALR_UUID, 'fail', `no_ticks_for=${Math.floor(ageMs / 1000)}s`);
         }
       }, heartbeatIntervalMs);
       heartbeatTimer.unref();
     }

     const stop = async (): Promise<void> => {
       stopping = true;
       notifyStopping();
       if (flushTimer) {
         clearTimeout(flushTimer);
         flushTimer = null;
       }
       if (heartbeatTimer) {
         clearInterval(heartbeatTimer);
         heartbeatTimer = null;
       }
       symbolManager.stop();

       // Gracefully shut down all stream consumers in parallel
       await Promise.all([consumer.stop(), binanceConsumer.stop()]);

       // Drain any pending batched ticks before final DB flush.
       if (batchTimer) {
         clearTimeout(batchTimer);
         batchTimer = null;
       }
       if (pendingTicks.length > 0) flushBatch();

       // Wait for any in-flight periodic tick flush to finish before final drain.
       if (activeFlushPromise) {
         await activeFlushPromise;
       }

       // Final best-effort flush with peek-before-drain pattern.
       try {
         const drained = buffer.peek();
         if (drained.length > 0) {
           await flushLiveTicks({ db, buffer, log }, drained);
           buffer.drain(drained);
         }
       } catch (err) {
         log.warn('final flush on stop failed', { err: String(err) });
       }

       // Force-close open 1m bars and await all in-flight candle DB writes.
       aggregator.closeAll();
       if (inFlightCandleFlushes.size > 0) {
         await Promise.allSettled([...inFlightCandleFlushes]);
       }
     };
   ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/worker test -- test/worker-lifecycle.test.ts && pnpm --filter @kestrel/db test -- test/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/client.ts apps/worker/src/index.ts apps/worker/test/worker-lifecycle.test.ts
git commit -m "fix(worker,db): await in-flight tick and candle flushes on stop and close admin db pool"
```

### Task 3: Fix Binance `@kline_1m` Future Timestamp Bug and Preserve Crypto OHLCV in `Candle1mAggregator` (BUG-03)

**Files:**
- Modify: `apps/worker/src/signalr/consumer.ts:41-51`
- Modify: `apps/worker/src/binance/consumer.ts:93-119`
- Modify: `apps/worker/src/aggregator/candle-1m.ts:49-143`
- Test: `apps/worker/test/candle-1m.test.ts`

**Interfaces:**
- Produces:
  - Extended `NormalizedTick` in `apps/worker/src/signalr/consumer.ts`:
    ```typescript
    export interface NormalizedTick {
      symbol: Symbol;
      bid: number;
      ask: number;
      mid: number;
      /** ms epoch UTC observation time. */
      ts: number;
      /** Stable string. 'biquote-signalr' or 'binance-ws'. */
      source: 'biquote-signalr' | 'binance-ws';
      /** Optional 1m kline high when tick originates from a kline stream. */
      high?: number;
      /** Optional 1m kline low when tick originates from a kline stream. */
      low?: number;
      /** Optional 1m kline cumulative base-asset volume. */
      volume?: number;
    }
    ```

- [ ] **Step 1: Add failing test in `apps/worker/test/candle-1m.test.ts`**

Append the following test inside `describe('Candle1mAggregator', ...)` in `apps/worker/test/candle-1m.test.ts`:

```typescript
  it('preserves kline high, low, and volume when present on NormalizedTick', () => {
    const closed: ClosedCandle[] = [];
    const agg = new Candle1mAggregator((b) => closed.push(b));

    agg.feed({
      symbol: 'BTCUSDT',
      bid: 65000,
      ask: 65000,
      mid: 65000,
      high: 65150,
      low: 64900,
      volume: 14.25,
      ts: BASE_TS + 5_000,
      source: 'binance-ws',
    });
    agg.feed({
      symbol: 'BTCUSDT',
      bid: 65050,
      ask: 65050,
      mid: 65050,
      high: 65220,
      low: 64890,
      volume: 29.5,
      ts: BASE_TS + 45_000,
      source: 'binance-ws',
    });
    // Next minute rollover
    agg.feed({
      symbol: 'BTCUSDT',
      bid: 65060,
      ask: 65060,
      mid: 65060,
      high: 65070,
      low: 65040,
      volume: 1.1,
      ts: BASE_TS + 61_000,
      source: 'binance-ws',
    });

    expect(closed).toHaveLength(1);
    expect(closed[0]).toEqual({
      symbol: 'BTCUSDT',
      t: BASE_TS,
      o: 65000,
      h: 65220,
      l: 64890,
      c: 65050,
      v: 29.5,
      tickVolume: 2,
      source: 'binance-ws',
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/worker test -- test/candle-1m.test.ts`
Expected: FAIL — `closed[0].h` is `65050` (instead of `65220`), `closed[0].l` is `65000` (instead of `64890`), and `closed[0].v` is `null` (instead of `29.5`).

- [ ] **Step 3: Implement `NormalizedTick` OHLCV fields, Binance event timestamp `k.E`, and `Candle1mAggregator` updates**

1. In `apps/worker/src/signalr/consumer.ts:41-51`, update `NormalizedTick`:
   ```typescript
   export interface NormalizedTick {
     symbol: Symbol;
     bid: number;
     ask: number;
     /** mid = (bid + ask) / 2 — pre-computed so consumers don't recompute. */
     mid: number;
     /** ms epoch UTC. */
     ts: number;
     /** Stable string. 'biquote-signalr' or 'binance-ws'. */
     source: 'biquote-signalr' | 'binance-ws';
     /** Optional kline high when tick originates from a kline stream. */
     high?: number;
     /** Optional kline low when tick originates from a kline stream. */
     low?: number;
     /** Optional kline cumulative volume when tick originates from a kline stream. */
     volume?: number;
   }
   ```
2. In `apps/worker/src/binance/consumer.ts:93-119`, replace `handleMessage`:
   ```typescript
     protected override handleMessage(data: WebSocket.Data): void {
       const now = Date.now();
       this.lastMessageAt = now;

       try {
         const msg = JSON.parse(data.toString());
         if (!msg || !msg.data) return;

         const k = msg.data;
         if (k.e !== 'kline' || !k.k) return;

         const candle = k.k;
         const symbol = k.s;
         const close = Number.parseFloat(candle.c);
         if (!Number.isFinite(close) || close <= 0) return;

         const high = Number.parseFloat(candle.h);
         const low = Number.parseFloat(candle.l);
         const volume = Number.parseFloat(candle.v);
         // Use Binance event timestamp `k.E` (actual observation time), never `candle.T`
         // (which is the minute-end close time up to 59,999ms in the future).
         const eventTs = typeof k.E === 'number' && Number.isFinite(k.E) && k.E > 0 ? k.E : now;

         const tick: NormalizedTick = {
           symbol,
           bid: close,
           ask: close,
           mid: close,
           ts: eventTs,
           source: 'binance-ws',
           ...(Number.isFinite(high) && high > 0 ? { high } : {}),
           ...(Number.isFinite(low) && low > 0 ? { low } : {}),
           ...(Number.isFinite(volume) && volume >= 0 ? { volume } : {}),
         };

         this.onTick(tick);
       } catch (err) {
         this.log.warn('binance ws parse error', { err: String(err) });
       }
     }
   ```
3. In `apps/worker/src/aggregator/candle-1m.ts:49-143`, update `OpenBar` and `Candle1mAggregator`:
   ```typescript
   interface OpenBar {
     bucket: number; // floor(ts / 60_000)
     o: number;
     h: number;
     l: number;
     c: number;
     v: number | null;
     ticks: number;
     source: NormalizedTick['source'];
   }

   const MINUTE_MS = 60_000;

   export class Candle1mAggregator {
     private readonly bars = new Map<Symbol, OpenBar>();
     private readonly onClosed: (bar: ClosedCandle) => void;

     constructor(onClosed: (bar: ClosedCandle) => void) {
       this.onClosed = onClosed;
     }

     feed(tick: NormalizedTick): void {
       const bucket = Math.floor(tick.ts / MINUTE_MS);
       const existing = this.bars.get(tick.symbol);

       if (!existing) {
         this.bars.set(tick.symbol, this.openBar(bucket, tick));
         return;
       }

       if (bucket < existing.bucket) {
         // Stale tick — ignore.
         return;
       }

       if (bucket === existing.bucket) {
         const candidateHigh = tick.high !== undefined ? Math.max(tick.mid, tick.high) : tick.mid;
         const candidateLow = tick.low !== undefined ? Math.min(tick.mid, tick.low) : tick.mid;
         if (candidateHigh > existing.h) existing.h = candidateHigh;
         if (candidateLow < existing.l) existing.l = candidateLow;
         existing.c = tick.mid;
         if (tick.volume !== undefined) existing.v = tick.volume;
         existing.ticks += 1;
         existing.source = tick.source;
         return;
       }

       // bucket > existing.bucket — rollover.
       this.emitClosed(tick.symbol, existing);
       this.bars.set(tick.symbol, this.openBar(bucket, tick));
     }

     closeAll(): void {
       for (const [symbol, bar] of this.bars) {
         this.emitClosed(symbol, bar);
       }
       this.bars.clear();
     }

     peek(symbol: Symbol): OpenBar | undefined {
       return this.bars.get(symbol);
     }

     private openBar(bucket: number, tick: NormalizedTick): OpenBar {
       const h = tick.high !== undefined ? Math.max(tick.mid, tick.high) : tick.mid;
       const l = tick.low !== undefined ? Math.min(tick.mid, tick.low) : tick.mid;
       return {
         bucket,
         o: tick.mid,
         h,
         l,
         c: tick.mid,
         v: tick.volume ?? null,
         ticks: 1,
         source: tick.source,
       };
     }

     private emitClosed(symbol: Symbol, bar: OpenBar): void {
       this.onClosed({
         symbol,
         t: bar.bucket * MINUTE_MS,
         o: bar.o,
         h: bar.h,
         l: bar.l,
         c: bar.c,
         v: bar.v,
         tickVolume: bar.ticks,
         source: bar.source,
       });
     }
   }
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/worker test -- test/candle-1m.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/signalr/consumer.ts apps/worker/src/binance/consumer.ts apps/worker/src/aggregator/candle-1m.ts apps/worker/test/candle-1m.test.ts
git commit -m "fix(worker): use Binance event timestamp E and preserve kline H/L/V in 1m aggregator"
```

### Task 4: Fix `acquireCronLock` Same-Day Error Recovery, Docker Scheduler Heartbeats, Dead Embedded Scheduler, and Admin Cron UI Key (BUG-10, BUG-11b, BUG-14, BUG-16)

**Files:**
- Modify: `apps/worker/src/cron-lock.ts:65-102`
- Modify: `apps/worker/src/env.ts:76-112, 122-179`
- Modify: `apps/worker/src/tenant-router.ts:43-65`
- Modify: `apps/worker/src/scheduler.ts:27-108, 210-337`
- Modify: `apps/worker/src/index.ts:434-439`
- Delete: `apps/worker/src/scheduler/embedded.ts`
- Modify: `apps/worker/src/runner/cli.ts:28-109`
- Modify: `apps/web/src/app/api/admin/cron-history/route.ts:33-41`
- Modify: `apps/web/src/app/(app)/admin/_components/admin-cron-table.tsx:127-140`
- Test: `apps/worker/test/cron-lock.test.ts`
- Test: `apps/worker/test/env.test.ts`
- Test: `apps/worker/test/scheduler.test.ts`

**Interfaces:**
- Produces:
  - `acquireCronLock(jobName: string, db: DbClient): Promise<CronLock | null>` reclaiming `'error'` rows in addition to expired `'started'` rows
  - `startScheduler(log: Logger, env?: WorkerEnv): () => void` wrapping job executions with `withHeartbeat(hcUuid, ...)`
  - `TenantRouter` constructor throwing when `partition >= totalPartitions`

- [ ] **Step 1: Add failing tests in `apps/worker/test/cron-lock.test.ts` and `apps/worker/test/env.test.ts`**

Append to `apps/worker/test/cron-lock.test.ts`:

```typescript
  it('reclaims a lock when an earlier run today ended with status=error', async () => {
    mockExecute.mockResolvedValueOnce([{ job_name: 'snapshots' }]);
    const db = { execute: mockExecute } as unknown as Parameters<typeof acquireCronLock>[1];
    const lock = await acquireCronLock('snapshots', db);
    expect(lock).not.toBeNull();
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
```

Append to `apps/worker/test/env.test.ts`:

```typescript
  it('rejects WORKER_PARTITION >= WORKER_PARTITIONS_TOTAL', () => {
    expect(() =>
      loadEnv({
        ...VALID,
        WORKER_PARTITION: '4',
        WORKER_PARTITIONS_TOTAL: '4',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/WORKER_PARTITION must be less than WORKER_PARTITIONS_TOTAL/);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kestrel/worker test -- test/cron-lock.test.ts test/env.test.ts`
Expected: FAIL — `loadEnv` does not validate `WORKER_PARTITION < WORKER_PARTITIONS_TOTAL`.

- [ ] **Step 3: Implement changes in `cron-lock.ts`, `env.ts`, `tenant-router.ts`, `scheduler.ts`, `index.ts`, `runner/cli.ts`, and `cron-history`**

1. In `apps/worker/src/cron-lock.ts:69-85`, update the reclaim query so both stale `'started'` rows AND failed `'error'` rows from today can be retried:
   ```typescript
     // M-8 + BUG-10: Reclaim stale 'started' locks (older than LOCK_TTL_MS)
     // OR previous 'error' runs from today (including rows marked 'error' by
     // cleanupStaleCronRuns on worker restart) so transient failures can self-heal.
     const reclaimed = await db.execute(sql`
       UPDATE cron_runs
       SET status = 'started',
           started_at = now(),
           finished_at = NULL,
           note = 'reclaimed stale or failed lock'
       WHERE job_name = ${jobName}
         AND run_date = ${today}::date
         AND (
           status = 'error'
           OR (status = 'started' AND started_at < ${staleThreshold})
         )
       RETURNING job_name
     `);
     if (reclaimed.length > 0) {
       return buildLock(db, jobName, today);
     }
   ```
2. In `apps/worker/src/env.ts`:
   - Add to `WorkerEnvSchema` (around line 85):
     ```typescript
       HC_JOB_BUDGET_RECOVERY_UUID: optionalNonEmpty,
       HC_JOB_PERSISTENCE_RECOVERY_UUID: optionalNonEmpty,
       HC_JOB_RETENTION_UUID: optionalNonEmpty,
       HC_JOB_DATASET_EXPORT_UUID: optionalNonEmpty,
     ```
   - Add to `WorkerEnvSchema` (around line 127):
     ```typescript
       JOB_TIMEOUT_MS: z.coerce.number().int().min(1000).max(3_600_000).default(120_000),
       WORKER_PARTITION: z.preprocess(
         (v) => (v === '' ? undefined : v),
         z.coerce.number().int().min(0).optional(),
       ),
       WORKER_PARTITIONS_TOTAL: z.preprocess(
         (v) => (v === '' ? undefined : v),
         z.coerce.number().int().min(1).optional(),
       ),
     ```
   - In `loadEnv()` (`apps/worker/src/env.ts:175`), add:
     ```typescript
     if (
       result.data.WORKER_PARTITION !== undefined &&
       result.data.WORKER_PARTITIONS_TOTAL !== undefined &&
       result.data.WORKER_PARTITION >= result.data.WORKER_PARTITIONS_TOTAL
     ) {
       throw new Error(
         `WORKER_PARTITION must be less than WORKER_PARTITIONS_TOTAL (got ${result.data.WORKER_PARTITION} >= ${result.data.WORKER_PARTITIONS_TOTAL})`,
       );
     }
     ```
3. In `apps/worker/src/tenant-router.ts:51-64`, validate partition bounds:
   ```typescript
     constructor(opts?: { partition?: number; totalPartitions?: number }) {
       const rawPartition =
         opts?.partition !== undefined ? String(opts.partition) : process.env.WORKER_PARTITION;
       const rawTotal =
         opts?.totalPartitions !== undefined
           ? String(opts.totalPartitions)
           : process.env.WORKER_PARTITIONS_TOTAL;

       if (!rawPartition || !rawTotal) {
         this.partition = 0;
         this.totalPartitions = 1;
         this.isSingleWorker = true;
       } else {
         this.partition = Math.max(0, parseInt(rawPartition, 10) || 0);
         this.totalPartitions = Math.max(1, parseInt(rawTotal, 10) || 1);
         if (this.partition >= this.totalPartitions) {
           throw new Error(
             `Invalid worker partition config: WORKER_PARTITION (${this.partition}) must be < WORKER_PARTITIONS_TOTAL (${this.totalPartitions})`,
           );
         }
         this.isSingleWorker = false;
       }
     }
   ```
4. Delete `apps/worker/src/scheduler/embedded.ts`.
5. In `apps/worker/src/scheduler.ts`:
   - Import `type { WorkerEnv } from './env.js';` and `import { withHeartbeat } from './healthchecks.js';`.
   - Update `startScheduler(log: Logger, env?: WorkerEnv): () => void` to forward `env` into `runJobSafely(name, log, env)`.
   - Inside `runJobSafely(name: keyof typeof JOBS, log: Logger, env?: WorkerEnv)`:
     Resolve `const hcUuid = env && job.hcUuidEnvVar ? (env[job.hcUuidEnvVar] as string | undefined) : undefined;` and execute:
     ```typescript
     const jobPromise = Promise.resolve()
       .then(() =>
         withHeartbeat(hcUuid, () => job.run({ log: jobLog, signal: ac.signal, tenantRouter })),
       )
       .finally(() => {
         jobSettled = true;
         if (cleanupRequested) cleanup();
       });
     ```
6. In `apps/worker/src/index.ts:434-439`, pass `env` to `startScheduler(log, env)`.
7. In `apps/worker/src/runner/cli.ts`:
   - At the start of `main()` (line 53), load secrets from vault before `loadEnv()`:
     ```typescript
     const { loadSecretsFromVault } = await import('@kestrel/shared/vault');
     await loadSecretsFromVault();
     ```
   - After `const log = createLogger(...)`, call `initLangfuse({ service: 'worker-cli' });` (imported from `@kestrel/ai`).
   - In the `catch (err)` block (lines 96–103), remove the duplicate `await ping(hcUuid, 'fail', msg.slice(0, 1000));` call because `withHeartbeat` already sent the `fail` ping.
   - In `finally` (lines 104–108), flush Langfuse and Mastra observability before `await closeDb()`:
     ```typescript
     } finally {
       try {
         const { flushMastraObservability, getKestrelMastra } = await import('@kestrel/ai/mastra');
         await flushMastraObservability(getKestrelMastra().instance).catch(() => {});
         await shutdownLangfuse();
       } catch {
         // Best-effort observability flush
       }
       await closeDb();
       process.removeListener('SIGTERM', sigtermHandler);
       process.removeListener('SIGINT', sigtermHandler);
     }
     ```
8. In `apps/web/src/app/api/admin/cron-history/route.ts:38-40`, synthesize the stable `id` field expected by `CronRun`:
   ```typescript
   const rawRuns = await listCronRuns({ since, jobName });
   const runs = rawRuns.map((r) => ({
     id: `${r.jobName}:${r.runDate}`,
     jobName: r.jobName,
     status: r.status,
     note: r.note,
     startedAt: r.startedAt.toISOString(),
     finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
   }));
   return Response.json({ runs });
   ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/worker test -- test/cron-lock.test.ts test/env.test.ts test/scheduler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git rm apps/worker/src/scheduler/embedded.ts
git add apps/worker/src/cron-lock.ts apps/worker/src/env.ts apps/worker/src/tenant-router.ts apps/worker/src/scheduler.ts apps/worker/src/index.ts apps/worker/src/runner/cli.ts apps/web/src/app/api/admin/cron-history/route.ts apps/worker/test/cron-lock.test.ts apps/worker/test/env.test.ts apps/worker/test/scheduler.test.ts
git commit -m "fix(worker): reclaim failed daily cron locks, wire Docker job heartbeats, and remove dead embedded scheduler"
```

### Task 5: Fix `full-analysis` Queue Contention, Atomic Progress Append, Title Cost Settlement, and Full-Table Scan Bottlenecks (BUG-07, PERF-03)

**Files:**
- Modify: `packages/db/src/queries/full-analysis-queue.ts:96-139, 199-219, 323-369`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/ai/src/mastra-v2/workflows/full-analysis.ts:11-25, 524-543, 649-694`
- Modify: `apps/worker/src/jobs/multi-agent-analysis.ts:70-75, 123-145, 290-355, 424-444`
- Test: `apps/worker/test/multi-agent-analysis.integration.test.ts`
- Test: `packages/ai/test/mastra-v2-full-analysis.test.ts`

**Interfaces:**
- Produces:
  - `appendFullAnalysisQueueProgress(input: FullAnalysisLeaseInput & { entry: Record<string, unknown> }): Promise<FullAnalysisQueueRow>` in `packages/db/src/queries/full-analysis-queue.ts`
  - `purgeOldFullAnalysisQueue(retentionCutoff: Date, db?: DbClient): Promise<string[]>` returning deleted `runId`s directly
  - `getFullAnalysisQueueStats(db?: DbClient): Promise<{ pending: number; running: number; stalePending: number; stuckRunning: number }>` in `packages/db/src/queries/full-analysis-queue.ts`

- [ ] **Step 1: Add failing tests in `apps/worker/test/multi-agent-analysis.integration.test.ts`**

Append the following two tests inside `describe('runMultiAgentAnalysis Mastra durable boundary', ...)` in `apps/worker/test/multi-agent-analysis.integration.test.ts`:

```typescript
  it('awaits maybeGenerateThreadTitle before recording observedCost and completing the run', async () => {
    const ctx = context();
    let totalCost = 0.04;
    mockCreateGenerationLedger.mockReturnValueOnce({
      record: vi.fn(() => true),
      recordCost: vi.fn(() => true),
      recordUsage: vi.fn(() => true),
      snapshot: () => ({ entries: [], totalCostUsd: totalCost }),
      total: () => totalCost,
    });
    const mastraMod = await import('@kestrel/ai/mastra');
    vi.mocked(mastraMod.maybeGenerateThreadTitle).mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 15));
      totalCost = 0.042;
    });

    await runMultiAgentAnalysis(ctx);

    expect(mockCompleteFullAnalysisRun).toHaveBeenCalledWith(
      'run-1',
      expect.any(String),
      expect.objectContaining({
        totalCostUsd: 0.042,
      }),
    );
  });

  it('exits the claim loop immediately when ctx.signal is already aborted', async () => {
    const ctx = context();
    const ac = new AbortController();
    ac.abort();
    ctx.signal = ac.signal;

    const result = await runMultiAgentAnalysis(ctx);

    expect(result.processed).toBe(0);
    expect(mockClaimNextFullAnalysisRun).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/worker test -- test/multi-agent-analysis.integration.test.ts`
Expected: FAIL — `mockCompleteFullAnalysisRun` receives `totalCostUsd: 0.04` instead of `0.042`, and `mockClaimNextFullAnalysisRun` is called despite `ctx.signal.aborted === true`.

- [ ] **Step 3: Implement queue SQL optimizations, atomic progress append, and `multi-agent-analysis.ts` fixes**

1. In `packages/db/src/queries/full-analysis-queue.ts`:
   - Update `updateFullAnalysisQueueProgress` (lines 199–218) so that when `entry` is provided, it appends atomically in SQL without a prior read, while remaining backward-compatible with `progress`:
     ```typescript
     export async function updateFullAnalysisQueueProgress(
       input: FullAnalysisLeaseInput & {
         progress?: Array<Record<string, unknown>>;
         entry?: Record<string, unknown>;
       },
     ): Promise<FullAnalysisQueueRow> {
       const db = input.db ?? getDb();
       const progressExpr = input.entry
         ? sql`CASE
             WHEN jsonb_array_length(coalesce(${schema.fullAnalysisQueue.progress}, '[]'::jsonb)) >= 50
             THEN (coalesce(${schema.fullAnalysisQueue.progress}, '[]'::jsonb) - 0) || ${JSON.stringify([input.entry])}::jsonb
             ELSE coalesce(${schema.fullAnalysisQueue.progress}, '[]'::jsonb) || ${JSON.stringify([input.entry])}::jsonb
           END`
         : (input.progress ?? []);
       const rows = await db
         .update(schema.fullAnalysisQueue)
         .set({ progress: progressExpr as never, updatedAt: new Date() })
         .where(
           and(
             eq(schema.fullAnalysisQueue.runId, input.runId),
             eq(schema.fullAnalysisQueue.workerRunId, input.workerRunId),
             eq(schema.fullAnalysisQueue.status, 'running'),
             gt(schema.fullAnalysisQueue.leaseExpiresAt, new Date()),
           ),
         )
         .returning();
       const row = rows[0];
       if (!row) throw new FullAnalysisQueueOwnershipError();
       return row;
     }
     ```
   - Update `purgeOldFullAnalysisQueue` (lines 323–337) to use `completedAt` (which matches `full_analysis_queue_terminal_completed_idx`) with fallback to `updatedAt` and return `Array<{ runId: string }>`:
     ```typescript
     export async function purgeOldFullAnalysisQueue(
       retentionCutoff: Date,
       db: DbClient = getDb(),
     ): Promise<number> {
       const rows = await purgeOldFullAnalysisQueueWithIds(retentionCutoff, db);
       return rows.length;
     }

     export async function purgeOldFullAnalysisQueueWithIds(
       retentionCutoff: Date,
       db: DbClient = getDb(),
     ): Promise<string[]> {
       const rows = await db
         .delete(schema.fullAnalysisQueue)
         .where(
           and(
             inArray(schema.fullAnalysisQueue.status, [
               'succeeded',
               'failed',
               'cancelled',
               'blocked',
             ]),
             or(
               lt(schema.fullAnalysisQueue.completedAt, retentionCutoff),
               and(
                 isNull(schema.fullAnalysisQueue.completedAt),
                 lt(schema.fullAnalysisQueue.updatedAt, retentionCutoff),
               ),
             ),
           ),
         )
         .returning({ runId: schema.fullAnalysisQueue.runId });
       return rows.map((r) => r.runId);
     }
     ```
   - Export `purgeOldFullAnalysisQueueWithIds` from `packages/db/src/queries/index.ts` and `packages/db/src/index.ts`.
   - In `packages/ai/src/mastra-v2/workflows/full-analysis.ts`:
     - Update `updateFullAnalysisProgress` (lines 524–543) to use atomic `entry` append when `updateFullAnalysisQueueProgress` supports it, falling back cleanly if mocked in unit tests:
       ```typescript
       export async function updateFullAnalysisProgress(
         runId: string,
         workerRunId: string,
         step: string,
         mode: MastraAnalysisMode = 'full',
       ): Promise<void> {
         try {
           const entry = {
             type: 'data-agent-progress',
             data: committeeProgressSnapshot(mode, step),
           };
           const row = await getFullAnalysisQueueRow(runId, undefined, getDb());
           const progress = [...(row?.progress ?? []), entry].slice(-50);
           await projectQueueRow(
             await updateFullAnalysisQueueProgress({
               runId,
               workerRunId,
               progress,
               entry,
               db: getDb(),
             }),
           );
         } catch (error) {
           if (isLeaseError(error)) throw new FullAnalysisLeaseLostError();
           throw error;
         }
       }
       ```
     - Update `getFullAnalysisQueueHealth` (lines 675–694) to query only active (`pending` and `running`) rows rather than scanning all terminal rows:
       ```typescript
       export async function getFullAnalysisQueueHealth(): Promise<FullAnalysisQueueHealth> {
         try {
           const db = getDb();
           const [pending, running] = await Promise.all([
             listFullAnalysisQueueRows('pending', db),
             listFullAnalysisQueueRows('running', db),
           ]);
           const now = Date.now();
           return {
             pending: pending.length,
             running: running.length,
             stalePending: pending.filter((row) => now - row.createdAt.getTime() > 10 * 60_000)
               .length,
             stuckRunning: running.filter(
               (row) =>
                 (row.leaseExpiresAt?.getTime() ?? 0) <= now ||
                 now - row.updatedAt.getTime() > 30_000,
             ).length,
           };
         } catch (error) {
           flog.warn('Full-analysis queue health unavailable', { error: serializeError(error) });
           return { pending: 0, running: 0, stalePending: 0, stuckRunning: 0, unavailable: true };
         }
       }
       ```
2. In `apps/worker/src/jobs/multi-agent-analysis.ts`:
   - At line 128, check `ctx.signal?.aborted` at the start of each iteration:
     ```typescript
     for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
       if (ctx.signal?.aborted) {
         ctx.log.info('Full-analysis poll aborted by signal');
         break;
       }
       const claimed = await claimNextFullAnalysisRun(workerRunId, (tenantId) =>
         ctx.tenantRouter.isMyTenant(tenantId),
       );
     ```
   - Around lines 290–350, await `maybeGenerateThreadTitle` before computing final `observedCost = ledger.total()` and settling `coordinator.complete(...)`:
     ```typescript
           // Record initial workflow cost before assistant message persistence
           // so a failure in appendAssistantMessage still settles the workflow cost.
           observedCost = ledger.total();
           coordinator?.markResult(observedCost);

           await touchFullAnalysisRun(runId, workerRunId);
           if (leaseLost) throw new FullAnalysisLeaseLostError();

           const assistant: UIMessage = {
             id: crypto.randomUUID(),
             role: 'assistant',
             parts: [
               { type: 'text', text: modeResult.finalText },
               {
                 type: 'data-multi-agent-meta',
                 data: {
                   engine: 'mastra',
                   executionOutcome: 'completed',
                   answerOutcome: modeResult.answerOutcome,
                   memoryMode: modeResult.memoryMode,
                   memoryBackfill: modeResult.memoryBackfill,
                   modelSnapshot: modeResult.modelSnapshot,
                   terminalReason: 'worker-completed',
                   mode: modeResult.mode,
                   symbol: modeResult.symbol,
                   packetId: modeResult.packet.packetId,
                   dataQuality: modeResult.packet.dataQuality,
                   totalCostUsd: modeResult.totalCostUsd,
                   totalLatencyMs: modeResult.totalLatencyMs,
                   agentOpinions: modeResult.agentOpinions,
                 },
               } as UIMessage['parts'][number],
             ],
           };
           const persistedAssistant = await appendAssistantMessage(
             payload.userId,
             payload.threadId,
             assistant,
             { idempotencyKey: `analysis-job:${runId}:assistant` },
           );

           try {
             await maybeGenerateThreadTitle({
               userId: payload.userId,
               threadId: payload.threadId,
               firstUser: userText,
               firstAssistant: modeResult.finalText,
               env,
               ledger,
               ledgerId: `title:${runId}`,
             });
           } catch (titleErr) {
             ctx.log.warn('Thread title generation failed (non-fatal)', {
               runId,
               err: String(titleErr),
             });
           }

           observedCost = ledger.total();
           coordinator?.markResult(observedCost);

           await coordinator!.complete({
             finalText: modeResult.finalText,
             agentOpinions: modeResult.agentOpinions,
             mode: modeResult.mode,
             totalCostUsd: observedCost,
             ledgerSnapshot: ledger.snapshot(),
             totalLatencyMs: modeResult.totalLatencyMs,
             messageId: persistedAssistant.messageId,
           });
     ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/worker test -- test/multi-agent-analysis.integration.test.ts && pnpm --filter @kestrel/ai test -- test/mastra-v2-full-analysis.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/queries/full-analysis-queue.ts packages/db/src/queries/index.ts packages/db/src/index.ts packages/ai/src/mastra-v2/workflows/full-analysis.ts apps/worker/src/jobs/multi-agent-analysis.ts apps/worker/test/multi-agent-analysis.integration.test.ts
git commit -m "fix(worker,ai,db): await thread title cost, guard claim loop on abort, and optimize queue health/progress queries"
```

### Task 6: Fix `fetchCandles1m` Unbounded 20,160-Row Full-Symbol Scan (BUG-08)

**Files:**
- Modify: `packages/data/src/providers/candles-1m/index.ts:35-136`
- Modify: `packages/data/test/candles-1m-provider.test.ts:34-44`

**Interfaces:**
- Preserves: `fetchCandles1m(args: FetchCandles1mArgs): Promise<FetchCandles1mResult>` returning `bars` in ascending time order (oldest-first)

- [ ] **Step 1: Update `packages/data/test/candles-1m-provider.test.ts` to assert `.limit(limit)` is called on the query**

In `packages/data/test/candles-1m-provider.test.ts`, update `makeFakeDb` (lines 34–44) and add a test verifying `.limit()` is invoked in SQL:

```typescript
function makeFakeDb(rows: FakeRow[], onLimit?: (n: number) => void) {
  // Simulate Postgres ORDER BY t DESC LIMIT n when .limit(n) is chained,
  // while also supporting the legacy un-limited call so the test fails before the fix.
  const sortedDesc = [...rows].sort((a, b) => b.t.getTime() - a.t.getTime());
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => {
            const limitFn = vi.fn(async (n: number) => {
              onLimit?.(n);
              return sortedDesc.slice(0, n);
            });
            // Allow awaiting orderBy() directly (pre-fix) or chaining .limit() (post-fix)
            const promise = Promise.resolve(rows) as Promise<FakeRow[]> & {
              limit: typeof limitFn;
            };
            promise.limit = limitFn;
            return promise;
          }),
        })),
      })),
    })),
  } as unknown as NonNullable<Parameters<typeof fetchCandles1m>[0]['db']>;
}
```

And add this test inside `describe('fetchCandles1m', ...)`:

```typescript
  it('pushes the row limit down to the SQL query via .limit()', async () => {
    const now = Date.now();
    const rows = [
      bar(new Date(now - 60_000).toISOString(), 2390),
      bar(new Date(now - 1_000).toISOString(), 2391),
    ];
    let capturedLimit = 0;
    const db = makeFakeDb(rows, (n) => {
      capturedLimit = n;
    });

    const r = await fetchCandles1m({ symbol: 'XAUUSD', count: 50, db });
    expect(capturedLimit).toBe(50);
    expect(r.bars).toHaveLength(2);
    expect(r.bars[0]?.o).toBe(2390);
    expect(r.bars[1]?.o).toBe(2391);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/data test -- test/candles-1m-provider.test.ts`
Expected: FAIL — `expect(capturedLimit).toBe(50)` fails with `Received: 0` because `fetchCandles1m` never calls `.limit()`.

- [ ] **Step 3: Implement `.orderBy(desc(candles1m.t)).limit(limit)` in `packages/data/src/providers/candles-1m/index.ts`**

Replace lines 35–136 of `packages/data/src/providers/candles-1m/index.ts` with:

```typescript
import type { getDb } from '@kestrel/db';
import { candles1m } from '@kestrel/db/schema';
import type { Symbol } from '@kestrel/shared';
import { desc, eq } from 'drizzle-orm';

import { ProviderEmptyError } from '../../errors';

const PROVIDER = 'candles-1m';
const FRESHNESS_WINDOW_MS = 90_000;

export interface FetchCandles1mArgs {
  symbol: Symbol;
  /** Number of bars to return (oldest-first). */
  count: number;
  /** Inject the drizzle client. Defaults to `getDb()`. */
  db?: ReturnType<typeof getDb>;
  /** Override the freshness window (used by tests). */
  freshnessWindowMs?: number;
}

export interface Candles1mBar {
  /** ms epoch UTC. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
}

export interface FetchCandles1mResult {
  bars: Candles1mBar[];
  /** Stable string forwarded to the Candle DTO's `source` field. */
  provider: string;
}

/**
 * Read the latest `count` 1m bars for `symbol`, oldest-first. Throws
 * `ProviderEmptyError` (NOT `ProviderError`) if no bars exist or the
 * freshest bar is stale, so the failover runner falls through without
 * recording a health failure.
 */
export async function fetchCandles1m(args: FetchCandles1mArgs): Promise<FetchCandles1mResult> {
  const db = args.db ?? (await loadDb());
  const window = args.freshnessWindowMs ?? FRESHNESS_WINDOW_MS;
  const limit = Math.max(1, Math.min(args.count, 5000));

  // Query only the `limit` newest rows via the (symbol, t) index, then
  // reverse in memory so callers receive oldest-first ascending order.
  const rowsDesc = await db
    .select({
      t: candles1m.t,
      o: candles1m.o,
      h: candles1m.h,
      l: candles1m.l,
      c: candles1m.c,
      v: candles1m.v,
      source: candles1m.source,
    })
    .from(candles1m)
    .where(eq(candles1m.symbol, args.symbol))
    .orderBy(desc(candles1m.t))
    .limit(limit);

  if (rowsDesc.length === 0) {
    throw new ProviderEmptyError(PROVIDER, `no candles_1m rows for ${args.symbol}`);
  }

  // Ensure ascending order regardless of whether a test stub returned asc or desc
  const ascending = [...rowsDesc].sort((a, b) => a.t.getTime() - b.t.getTime());
  const newestRow = ascending[ascending.length - 1];
  if (!newestRow) {
    throw new ProviderEmptyError(PROVIDER, 'unexpected empty rows');
  }

  const newest = newestRow.t.getTime();
  const ageMs = Date.now() - newest;
  if (ageMs > window) {
    throw new ProviderEmptyError(
      PROVIDER,
      `candles_1m stale for ${args.symbol}: newest bar ${ageMs}ms ago`,
    );
  }

  const slice = ascending.slice(-limit);
  const provider = newestRow.source;

  return {
    bars: slice.map((r) => ({
      t: r.t.getTime(),
      o: r.o,
      h: r.h,
      l: r.l,
      c: r.c,
      v: r.v,
    })),
    provider,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kestrel/data test -- test/candles-1m-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/providers/candles-1m/index.ts packages/data/test/candles-1m-provider.test.ts
git commit -m "perf(data): push LIMIT and DESC ordering to SQL in fetchCandles1m"
```

### Task 7: Thread `AbortSignal` and `TenantRouter` Across `alerts`, `budget-recovery`, `persistence-recovery`, `retention`, and `dataset-export` (BUG-15)

**Files:**
- Modify: `apps/worker/src/jobs/alerts.ts:21-39`
- Modify: `packages/ai/src/alerts/evaluator.ts:318-335`
- Modify: `apps/worker/src/jobs/budget-recovery.ts:26-45`
- Modify: `packages/ai/src/cost.ts:472-512`
- Modify: `apps/worker/src/jobs/persistence-recovery.ts:25-38`
- Modify: `packages/ai/src/persistence-recovery.ts:344-383`
- Modify: `apps/worker/src/jobs/retention.ts:27-65`
- Modify: `packages/db/src/retention.ts:454-470`
- Modify: `apps/worker/src/jobs/dataset-export.ts:100-125, 245-270`
- Test: `packages/ai/test/persistence-recovery.test.ts`
- Test: `apps/worker/test/dataset-export.test.ts`

**Interfaces:**
- Produces:
  - `evaluateAlerts(opts?: { env?: EvaluatorEnv; signal?: AbortSignal; ownsTenant?: (userId: string) => boolean }): Promise<EvaluationResult>`
  - `recoverStaleBudgetReservations(cutoff: Date, limit?: number, signal?: AbortSignal): Promise<{ scanned: number; released: number; failed: number }>`
  - `replayPersistenceFailures(limit?: number, signal?: AbortSignal): Promise<{ claimed: number; completed: number; failed: number; dead: number }>`
  - `runVacuumAnalyze(signal?: AbortSignal): Promise<void>`

- [ ] **Step 1: Add failing test in `packages/ai/test/persistence-recovery.test.ts`**

Append to `describe('persistence outbox replay', ...)` in `packages/ai/test/persistence-recovery.test.ts`:

```typescript
  it('stops claiming outbox rows immediately when signal is aborted', async () => {
    const ac = new AbortController();
    ac.abort();

    const result = await replayPersistenceFailures(10, ac.signal);

    expect(result).toEqual({
      claimed: 0,
      completed: 0,
      failed: 0,
      dead: 0,
    });
    expect(mockTxExecute).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/ai test -- test/persistence-recovery.test.ts`
Expected: FAIL — `mockTxExecute` is called because `replayPersistenceFailures` does not accept or check `signal`.

- [ ] **Step 3: Thread `signal` and `ownsTenant` through the 5 jobs and their backing services**

1. In `packages/ai/src/alerts/evaluator.ts:318-326`:
   ```typescript
   export async function evaluateAlerts(
     opts: {
       env?: EvaluatorEnv;
       signal?: AbortSignal;
       ownsTenant?: (userId: string) => boolean;
     } = {},
   ): Promise<EvaluationResult> {
     const allAlerts = await listEvaluable();
     const alerts = opts.ownsTenant
       ? allAlerts.filter((a) => opts.ownsTenant!(a.userId))
       : allAlerts;
   ```
   And in `apps/worker/src/jobs/alerts.ts:21-26`:
   ```typescript
   export async function runAlerts(ctx: JobContext): Promise<JobResult> {
     const result = await evaluateAlerts({
       ...(ctx.signal ? { signal: ctx.signal } : {}),
       ownsTenant: (userId) => ctx.tenantRouter.isMyTenant(userId),
     });
   ```
2. In `packages/ai/src/cost.ts:472-512`:
   ```typescript
   export async function recoverStaleBudgetReservations(
     cutoff: Date,
     limit = 100,
     signal?: AbortSignal,
   ): Promise<{ scanned: number; released: number; failed: number }> {
     if (signal?.aborted) return { scanned: 0, released: 0, failed: 0 };
     const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
     const rows = resultRows<{ id: string }>(
       await getDb().execute(
         sql`
         SELECT r.id
         FROM ai_budget_reservations r
         WHERE r.status = 'reserved' AND r.created_at < ${cutoff.toISOString()}
           AND NOT EXISTS (
             SELECT 1
             FROM full_analysis_queue q
             WHERE q.run_id = r.run_id
               AND (
                 q.status = 'pending'
                 OR (q.status = 'running' AND q.lease_expires_at > now())
               )
           )
         ORDER BY r.created_at ASC
         LIMIT ${boundedLimit}
       `,
       ),
     );

     let released = 0;
     let failed = 0;
     for (const row of rows) {
       if (signal?.aborted) break;
       try {
         if (await releaseBudgetReservation(row.id)) released += 1;
       } catch (err) {
         failed += 1;
         log.error('stale budget reservation recovery failed', {
           reservationId: row.id,
           err: String(err),
         });
       }
     }
     return { scanned: rows.length, released, failed };
   }
   ```
   And in `apps/worker/src/jobs/budget-recovery.ts:26-29`:
   ```typescript
   export async function runBudgetRecovery(ctx: JobContext): Promise<JobResult> {
     const cutoff = new Date(Date.now() - RESERVATION_STALE_MS);
     const result = await recoverStaleBudgetReservations(cutoff, RECOVERY_BATCH_SIZE, ctx.signal);
   ```
3. In `packages/ai/src/persistence-recovery.ts:344-360`:
   ```typescript
   export async function replayPersistenceFailures(
     limit = 25,
     signal?: AbortSignal,
   ): Promise<{
     claimed: number;
     completed: number;
     failed: number;
     dead: number;
   }> {
     const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
     let claimed = 0;
     let completed = 0;
     let failed = 0;
     let dead = 0;

     for (let i = 0; i < boundedLimit; i++) {
       if (signal?.aborted) break;
       const item = await claimOne();
       if (!item) break;
   ```
   And in `apps/worker/src/jobs/persistence-recovery.ts:25-27`:
   ```typescript
   export async function runPersistenceRecovery(ctx: JobContext): Promise<JobResult> {
     const result = await replayPersistenceFailures(REPLAY_BATCH_SIZE, ctx.signal);
   ```
4. In `packages/db/src/retention.ts:455-470`:
   ```typescript
   export async function runVacuumAnalyze(signal?: AbortSignal): Promise<void> {
     const db = getDb();
     const tables = [
       'chat_telemetry',
       'chat_tool_telemetry',
       'rate_limits',
       'provider_daily_quota',
       'diagnostic_traces',
       'persistence_outbox',
       'ai_budget_reservations',
       'chat_messages',
     ];
     for (const table of tables) {
       if (signal?.aborted) break;
       await db.execute(sql.raw(`VACUUM ANALYZE "${table}"`));
     }
   }
   ```
   And in `apps/worker/src/jobs/retention.ts:27-57`:
   ```typescript
   export async function runRetention(ctx: JobContext): Promise<JobResult> {
     if (ctx.signal?.aborted) return { processed: 0, note: 'aborted' };
     const result = await runRetentionCleanup();
     if (!ctx.signal?.aborted) {
       await runVacuumAnalyze(ctx.signal);
     }
   ```
5. In `apps/worker/src/jobs/dataset-export.ts:100-120, 245-270`, pass `signal?: AbortSignal` to `uploadToB2`:
   ```typescript
   async function uploadToB2(
     sourceDir: string,
     version: string,
     signal?: AbortSignal,
   ): Promise<void> {
     const bucket = process.env.B2_BUCKET ?? '';
     const keyId = process.env.B2_KEY_ID ?? '';
     const appKey = process.env.B2_APPLICATION_KEY ?? '';
     if (!bucket || !keyId || !appKey) {
       throw new Error('B2 env (B2_BUCKET/B2_KEY_ID/B2_APPLICATION_KEY) not configured');
     }
     await execFileAsync(
       'rclone',
       ['copyto', join(sourceDir, version), `kestrel:${bucket}/datasets/${version}`],
       {
         env: {
           ...process.env,
           RCLONE_CONFIG_KESTREL_TYPE: 'b2',
           RCLONE_CONFIG_KESTREL_ACCOUNT: keyId,
           RCLONE_CONFIG_KESTREL_KEY: appKey,
         },
         timeout: 120_000,
         ...(signal ? { signal } : {}),
       },
     );
   }
   ```
   And pass `ctx.signal` at line 248: `await uploadToB2(datasetsDir, version, ctx.signal);`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/ai test -- test/persistence-recovery.test.ts && pnpm --filter @kestrel/worker test -- test/dataset-export.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/jobs/alerts.ts packages/ai/src/alerts/evaluator.ts apps/worker/src/jobs/budget-recovery.ts packages/ai/src/cost.ts apps/worker/src/jobs/persistence-recovery.ts packages/ai/src/persistence-recovery.ts apps/worker/src/jobs/retention.ts packages/db/src/retention.ts apps/worker/src/jobs/dataset-export.ts packages/ai/test/persistence-recovery.test.ts
git commit -m "fix(worker,ai,db): thread AbortSignal and tenantRouter across recovery, retention, export, and alert jobs"
```

### Task 8: Expand `snapshots` to All 18 Catalog Symbols, Batch-Optimize `briefings`, and Use `CFTC_SUPPORTED_SYMBOLS` in `cot` (BUG-06, PERF-01, PERF-02)

**Files:**
- Modify: `apps/worker/src/jobs/snapshots.ts:28-99`
- Modify: `apps/web/src/app/api/cron/snapshots/route.ts:36-78`
- Modify: `apps/worker/src/jobs/cot.ts:26-45`
- Modify: `apps/web/src/app/api/cron/cot/route.ts:31-55`
- Modify: `apps/worker/src/jobs/briefings.ts:43-115`
- Modify: `apps/worker/test/snapshots-job.test.ts:66-102`
- Modify: `apps/worker/test/briefings.test.ts`

**Interfaces:**
- Consumes: `ALL_SYMBOLS`, `CFTC_SUPPORTED_SYMBOLS` from `@kestrel/shared`

- [ ] **Step 1: Update `apps/worker/test/snapshots-job.test.ts` to assert all 18 catalog symbols (`ALL_SYMBOLS`) are processed**

In `apps/worker/test/snapshots-job.test.ts`, update the two tests in `describe('runSnapshots', ...)` (lines 66–102):

```typescript
describe('runSnapshots', () => {
  it('processes every supported catalog symbol (18 symbols) and tail-prunes candles_1m', async () => {
    vi.mocked(data.getCandles).mockResolvedValue([] as never);
    vi.mocked(ai.computeDailySnapshot).mockReturnValue({} as never);
    vi.mocked(ai.upsertSnapshot).mockResolvedValue(undefined as never);

    const r = await runSnapshots({
      log,
      signal: new AbortController().signal,
      tenantRouter: testRouter,
    });
    expect(r.processed).toBe(18);
    expect(r.note).toMatch(/symbols=18\/18/);
    expect(r.note).toMatch(/pruned=0/);
    expect(data.getCandles).toHaveBeenCalledTimes(18);
    expect(ai.upsertSnapshot).toHaveBeenCalledTimes(18);
  });

  it('counts errors but keeps going across all 18 symbols', async () => {
    vi.mocked(data.getCandles)
      .mockRejectedValueOnce(new Error('upstream down'))
      .mockResolvedValue([] as never);
    vi.mocked(ai.computeDailySnapshot).mockReturnValue({} as never);
    vi.mocked(ai.upsertSnapshot).mockResolvedValue(undefined as never);

    const r = await runSnapshots({
      log,
      signal: new AbortController().signal,
      tenantRouter: testRouter,
    });
    expect(r.processed).toBe(17);
    expect(r.note).toMatch(/symbols=17\/18/);
    expect(r.note).toMatch(/errors=1/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/worker test -- test/snapshots-job.test.ts`
Expected: FAIL — `expect(r.processed).toBe(18)` fails with `Received: 3` because `snapshots.ts` imports the legacy 3-symbol `SYMBOLS` constant.

- [ ] **Step 3: Update `snapshots.ts`, `/api/cron/snapshots`, `cot.ts`, `/api/cron/cot`, and `briefings.ts`**

1. In `apps/worker/src/jobs/snapshots.ts:31, 42-65`:
   - Change `import { SYMBOLS } from '@kestrel/shared';` to `import { ALL_SYMBOLS } from '@kestrel/shared';`.
   - Iterate `for (const symbol of ALL_SYMBOLS)` and report `symbols=${processed}/${ALL_SYMBOLS.length}` in `note`.
2. In `apps/web/src/app/api/cron/snapshots/route.ts`:
   - Replace `SYMBOLS` with `ALL_SYMBOLS` imported from `@/lib/services/api-boundary` (or `@kestrel/shared`).
3. In `apps/worker/src/jobs/cot.ts:28, 43`:
   - Change `import { SYMBOLS, type Symbol } from '@kestrel/shared';` to `import { CFTC_SUPPORTED_SYMBOLS, type Symbol } from '@kestrel/shared';` and iterate `for (const symbol of CFTC_SUPPORTED_SYMBOLS)`.
4. In `apps/worker/src/jobs/briefings.ts:43-103`, filter `myUserIds` once before querying candidate events so worker partitions that own 0 active users skip all DB queries, and check `ctx.signal?.aborted` inside the inner user loop as well:
   ```typescript
   export async function runBriefings(ctx: JobContext): Promise<JobResult> {
     const now = Date.now();
     const log = ctx.log;

     const allUserIds = await getActiveUserIds();
     const userIds = allUserIds.filter((userId) => ctx.tenantRouter.isMyTenant(userId));
     if (userIds.length === 0) {
       return { processed: 0, note: 'no owned active users' };
     }

     const preCandidates = await findHighImpactEventsInWindow({
       fromMs: now,
       toMs: now + PRE_WINDOW_MS,
     });

     let preEmitted = 0;
     for (const c of preCandidates) {
       if (ctx.signal?.aborted) {
         log.warn('briefings aborted', { phase: 'pre' });
         break;
       }
       for (const userId of userIds) {
         if (ctx.signal?.aborted) break;
         try {
           const r = await emitPreEvent(userId, c.id);
           if (r.emitted) preEmitted += 1;
         } catch (err) {
           log.error('emitPreEvent failed', { userId, eventId: c.id, err: String(err) });
         }
       }
     }

     const postCandidates = await findHighImpactEventsInWindow({
       fromMs: now - POST_CATCHUP_MS,
       toMs: now - POST_GRACE_MS,
       requireActual: true,
     });

     let postEmitted = 0;
     for (const c of postCandidates) {
       if (ctx.signal?.aborted) {
         log.warn('briefings aborted', { phase: 'post' });
         break;
       }
       for (const userId of userIds) {
         if (ctx.signal?.aborted) break;
         try {
           const r = await emitPostEvent(userId, c.id);
           if (r.emitted) postEmitted += 1;
         } catch (err) {
           log.error('emitPostEvent failed', { userId, eventId: c.id, err: String(err) });
         }
       }
     }
   ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/worker test -- test/snapshots-job.test.ts test/cot-job.test.ts test/briefings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/jobs/snapshots.ts apps/web/src/app/api/cron/snapshots/route.ts apps/worker/src/jobs/cot.ts apps/worker/src/jobs/briefings.ts apps/worker/test/snapshots-job.test.ts
git commit -m "fix(worker): expand daily snapshots to all 18 catalog symbols and pre-filter tenant users in briefings"
```

### Task 9: Harden Worker HTTP Health & Proxy Servers and Separate SignalR vs Binance Liveness (BUG-12)

**Files:**
- Modify: `apps/worker/src/http-server.ts:8-150`
- Modify: `apps/worker/src/index.ts:132-167, 335-350, 463-478`
- Test: `apps/worker/test/http-server.test.ts`

**Interfaces:**
- Produces:
  - `HealthServerDeps.isBinanceConnected?: () => boolean` in `apps/worker/src/http-server.ts`
  - Constant-time `timingSafeEqual` Bearer token verification on both `/health` and `/biquote` proxy
  - `405 Method Not Allowed` for non-`GET`/`HEAD` requests to `/biquote`

- [ ] **Step 1: Add failing test in `apps/worker/test/http-server.test.ts`**

Append the following test inside `describe('worker health server', ...)` in `apps/worker/test/http-server.test.ts`:

```typescript
  it('rejects non-GET/HEAD requests on the BiQuote proxy with 405', async () => {
    process.env.BIQUOTE_PROXY_TOKEN = 'secret-token';
    const proxy = createProxyServer({
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), with: vi.fn() },
      getLastTickAt: () => Date.now(),
      isSignalRConnected: () => true,
    });
    const response = await request(proxy, '/biquote/api/XAUUSD', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token' },
    });
    expect(response.status).toBe(405);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kestrel/worker test -- test/http-server.test.ts`
Expected: FAIL — `response.status` is `502` (attempted upstream fetch) instead of `405`.

- [ ] **Step 3: Implement constant-time proxy auth, HTTP method guard, and weekend-aware SignalR heartbeat**

1. In `apps/worker/src/http-server.ts`, replace lines 8–150 with:
   ```typescript
   export interface HealthServerDeps {
     log: Logger;
     getLastTickAt: () => number;
     isSignalRConnected: () => boolean;
     isBinanceConnected?: () => boolean;
     getDroppedTicks?: () => number;
     isProxyConfigured?: () => boolean;
     getRequestId?: () => string;
   }

   export interface WorkerHttpServers {
     health: http.Server;
     proxy: http.Server;
   }

   function sendJson(res: http.ServerResponse, status: number, body: Record<string, unknown>): void {
     res.writeHead(status, {
       'Content-Type': 'application/json',
       'Cache-Control': 'no-store',
       'X-Content-Type-Options': 'nosniff',
     });
     res.end(JSON.stringify(body));
   }

   function verifyBearerToken(headerValue: string | undefined, expectedToken: string): boolean {
     const provided = Buffer.from(headerValue ?? '');
     const expected = Buffer.from(`Bearer ${expectedToken}`);
     return provided.length === expected.length && timingSafeEqual(provided, expected);
   }

   function createHealthHandler(deps: HealthServerDeps): http.RequestListener {
     const { getLastTickAt, isSignalRConnected } = deps;
     const healthToken = process.env.WORKER_HEALTH_TOKEN;
     const isProd = process.env.NODE_ENV === 'production';

     function hasValidToken(req: http.IncomingMessage): boolean {
       if (!healthToken) return !isProd;
       return verifyBearerToken(req.headers.authorization, healthToken);
     }

     return (req, res) => {
       if (
         req.url !== '/' &&
         req.url !== '/health' &&
         req.url !== '/api/health' &&
         req.url !== '/health/live' &&
         req.url !== '/health/ready' &&
         req.url !== '/health/dependencies'
       ) {
         res.writeHead(404);
         res.end();
         return;
       }
       if (!hasValidToken(req)) {
         sendJson(res, healthToken ? 401 : 503, { status: 'unauthorized' });
         return;
       }

       const liveOnly = req.url === '/health/live';
       const dependenciesOnly = req.url === '/health/dependencies';
       const ageMs = Date.now() - getLastTickAt();
       const ready = getLastTickAt() > 0 && ageMs < 120_000 && isSignalRConnected();
       const healthy = liveOnly || dependenciesOnly || ready;
       sendJson(res, healthy ? 200 : 503, {
         status: liveOnly || dependenciesOnly ? 'ok' : ready ? 'ok' : 'degraded',
         ...(liveOnly
           ? { live: true }
           : dependenciesOnly
             ? { capabilities: getCapabilityReport(process.env) }
             : {
                 ready,
                 lastTickAgeMs: ageMs,
                 signalrConnected: isSignalRConnected(),
                 ...(deps.isBinanceConnected ? { binanceConnected: deps.isBinanceConnected() } : {}),
                 droppedTicks: deps.getDroppedTicks?.() ?? 0,
                 proxyConfigured:
                   deps.isProxyConfigured?.() ?? Boolean(process.env.BIQUOTE_PROXY_TOKEN),
                 capabilities: getCapabilityReport(process.env),
               }),
         uptimeMs: process.uptime() * 1000,
       });
     };
   }

   function createProxyHandler(deps: HealthServerDeps): http.RequestListener {
     const baseUrl = process.env.BIQUOTE_BASE_URL ?? 'https://biquote.io';
     const proxyToken = process.env.BIQUOTE_PROXY_TOKEN;
     const isProd = process.env.NODE_ENV === 'production';

     return async (req, res) => {
       if (!req.url?.startsWith('/biquote')) {
         res.writeHead(404);
         res.end();
         return;
       }
       if (!proxyToken && isProd) {
         res.writeHead(503, {
           'Content-Type': 'application/json',
           'Cache-Control': 'no-store',
           'Retry-After': '86400',
           'X-Content-Type-Options': 'nosniff',
         });
         res.end(
           JSON.stringify({
             status: 'error',
             message: 'BiQuote proxy not configured',
             ...(deps.getRequestId ? { requestId: deps.getRequestId() } : {}),
           }),
         );
         return;
       }
       if (proxyToken && !verifyBearerToken(req.headers.authorization, proxyToken)) {
         sendJson(res, 403, {
           status: 'error',
           message: 'forbidden',
           ...(deps.getRequestId ? { requestId: deps.getRequestId() } : {}),
         });
         return;
       }
       if (req.method !== 'GET' && req.method !== 'HEAD') {
         sendJson(res, 405, {
           status: 'error',
           message: 'method not allowed',
           ...(deps.getRequestId ? { requestId: deps.getRequestId() } : {}),
         });
         return;
       }

       let target: URL | undefined;
       try {
         const base = assertSafeOutboundUrl(baseUrl, { protocols: ['https:'] });
         target = assertSafeOutboundUrl(new URL(req.url.slice('/biquote'.length) || '/', base), {
           protocols: ['https:'],
           hosts: [base.hostname],
         });
         const upstream = await fetch(target, {
           signal: AbortSignal.timeout(10_000),
           headers: { accept: 'application/json' },
         });
         res.writeHead(upstream.status, {
           'Content-Type': upstream.headers.get('content-type') || 'application/json',
           'Cache-Control': 'no-store',
         });
         res.end(await upstream.text());
       } catch (err) {
         deps.log.error('biquote-proxy error', {
           target: target?.hostname ?? 'invalid',
           err: String(err),
         });
         sendJson(res, 502, {
           status: 'error',
           message: 'BiQuote upstream request failed',
           ...(deps.getRequestId ? { requestId: deps.getRequestId() } : {}),
         });
       }
     };
   }
   ```
2. In `apps/worker/src/index.ts:463-477`, pass `isBinanceConnected: () => binanceConsumer.isConnected()` to `createHealthServer` and `createProxyServer`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kestrel/worker test -- test/http-server.test.ts test/http-server-separation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/http-server.ts apps/worker/src/index.ts apps/worker/test/http-server.test.ts
git commit -m "fix(worker): use timingSafeEqual on proxy auth, guard HTTP methods, and expose binanceConnected"
```

### Task 10: Harden Cron-VM Webhook Listener & Remove Duplicate `kestrel-light-alerts` Systemd Timer (BUG-09, BUG-17)

**Files:**
- Modify: `infra/cron-vm/scripts/webhook-listener.py:17-122`
- Delete: `infra/cron-vm/units/kestrel-webhook.socket`
- Delete: `infra/cron-vm/units/kestrel-light-alerts.service`
- Delete: `infra/cron-vm/units/kestrel-light-alerts.timer`
- Modify: `infra/cron-vm/_provision-docker.sh:222-248`

**Interfaces:**
- Produces:
  - Fail-closed `verify_signature(body: bytes, signature_header: str) -> bool` returning `False` when `WEBHOOK_SECRET` is empty
  - `MAX_BODY_BYTES = 1_048_576` payload size cap (returning HTTP `413` on oversized requests)
  - `SIGCHLD` ignore + `start_new_session=True` on `subprocess.Popen` to prevent zombie child processes

- [ ] **Step 1: Run a failing verification check on `webhook-listener.py`**

Run:
```bash
python3 -c "import importlib.util; spec = importlib.util.spec_from_file_location('wl', 'infra/cron-vm/scripts/webhook-listener.py'); mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); assert mod.verify_signature(b'{}', '') is False, 'Must fail closed when WEBHOOK_SECRET is empty'"
```
Expected: FAIL with `AssertionError: Must fail closed when WEBHOOK_SECRET is empty`.

- [ ] **Step 2: Replace `infra/cron-vm/scripts/webhook-listener.py` and remove the duplicate/orphaned systemd units**

1. Replace `infra/cron-vm/scripts/webhook-listener.py` with:
   ```python
   #!/usr/bin/env python3
   """GitHub webhook listener for Kestrel auto-deploy.

   Listens on port 9000. Receives push events from GitHub, validates the
   HMAC-SHA256 signature against WEBHOOK_SECRET, and runs docker-update.sh
   in the background.

   Stdlib only — no pip packages needed.
   """

   import hashlib
   import hmac
   import json
   import os
   import signal
   import subprocess
   from http.server import BaseHTTPRequestHandler, HTTPServer

   WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "").strip()
   UPDATE_SCRIPT = "/opt/kestrel/scripts/docker-update.sh"
   PORT = int(os.environ.get("WEBHOOK_PORT", "9000"))
   MAX_BODY_BYTES = 1_048_576  # 1 MiB ceiling to prevent memory exhaustion


   def verify_signature(body: bytes, signature_header: str) -> bool:
       """Constant-time HMAC-SHA256 comparison. Fails closed when secret is unset."""
       if not WEBHOOK_SECRET or not signature_header:
           return False
       try:
           algo, sig_hex = signature_header.split("=", 1)
           if algo != "sha256":
               return False
       except ValueError:
           return False
       expected = hmac.new(
           WEBHOOK_SECRET.encode(), body, hashlib.sha256
       ).hexdigest()
       return hmac.compare_digest(expected, sig_hex)


   class WebhookHandler(BaseHTTPRequestHandler):
       """Handles POST /hooks/update from GitHub."""

       def do_POST(self):
           if self.path != "/hooks/update":
               self.send_error(404, "Not Found")
               return

           try:
               content_length = int(self.headers.get("Content-Length", "0"))
           except ValueError:
               self.send_error(400, "Invalid Content-Length")
               return

           if content_length < 0 or content_length > MAX_BODY_BYTES:
               self.send_error(413, "Payload Too Large")
               return

           body = self.rfile.read(content_length) if content_length > 0 else b""

           # Validate HMAC signature first before trusting headers or JSON body
           signature = self.headers.get("X-Hub-Signature-256", "")
           if not verify_signature(body, signature):
               self.send_error(403, "Invalid signature")
               return

           event = self.headers.get("X-GitHub-Event", "")
           if event != "push":
               self.send_response(200)
               self.end_headers()
               self.wfile.write(b'{"status":"ignored","reason":"not a push event"}\n')
               return

           try:
               payload = json.loads(body)
           except json.JSONDecodeError:
               self.send_error(400, "Invalid JSON")
               return

           ref = payload.get("ref", "")
           if ref != "refs/heads/main":
               self.send_response(200)
               self.end_headers()
               self.wfile.write(
                   b'{"status":"ignored","reason":"not main branch"}\n'
               )
               return

           print(
               f"[webhook] push to main detected — running {UPDATE_SCRIPT}",
               flush=True,
           )
           subprocess.Popen(
               [UPDATE_SCRIPT],
               stdout=subprocess.DEVNULL,
               stderr=subprocess.DEVNULL,
               start_new_session=True,
           )

           self.send_response(202)
           self.end_headers()
           self.wfile.write(b'{"status":"accepted"}\n')

       def log_message(self, format, *args):
           print(f"[webhook] {args[0]}", flush=True)


   def main():
       if hasattr(signal, "SIGCHLD"):
           signal.signal(signal.SIGCHLD, signal.SIG_IGN)
       print(f"[webhook] starting on port {PORT}", flush=True)
       server = HTTPServer(("0.0.0.0", PORT), WebhookHandler)
       try:
           server.serve_forever()
       except KeyboardInterrupt:
           pass
       finally:
           server.server_close()


   if __name__ == "__main__":
       main()
   ```
2. Delete `infra/cron-vm/units/kestrel-webhook.socket`, `infra/cron-vm/units/kestrel-light-alerts.service`, and `infra/cron-vm/units/kestrel-light-alerts.timer`.
3. In `infra/cron-vm/_provision-docker.sh:221-248`, remove `kestrel-light-alerts` and `kestrel-light-alerts.timer` from the installation loops and add `systemctl disable --now kestrel-light-alerts.timer 2>/dev/null || true` right before `systemctl daemon-reload`. (Keep `kestrel-light-alerts.service` and `kestrel-light-alerts.timer` in `MANAGED_UNITS` inside `infra/cron-vm/scripts/sync-systemd-units.sh:21` so existing hosts auto-delete the unit files on sync.)

- [ ] **Step 3: Run verification checks**

Run:
```bash
python3 -c "import importlib.util; spec = importlib.util.spec_from_file_location('wl', 'infra/cron-vm/scripts/webhook-listener.py'); mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); assert mod.verify_signature(b'{}', '') is False"
bash -n infra/cron-vm/_provision-docker.sh infra/cron-vm/scripts/sync-systemd-units.sh
```
Expected: Exit code 0.

- [ ] **Step 4: Commit**

```bash
git rm infra/cron-vm/units/kestrel-webhook.socket infra/cron-vm/units/kestrel-light-alerts.service infra/cron-vm/units/kestrel-light-alerts.timer
git add infra/cron-vm/scripts/webhook-listener.py infra/cron-vm/_provision-docker.sh
git commit -m "fix(infra): harden webhook-listener.py and remove duplicate kestrel-light-alerts timer"
```

### Task 11: Final Monorepo Verification Gate

**Files:**
- Verify: `apps/worker`, `packages/db`, `packages/data`, `packages/ai`, `apps/web`, `scripts/check-env-contract.mjs`

- [ ] **Step 1: Run environment contract verification**

Run: `node scripts/check-env-contract.mjs`
Expected: `Environment contract check passed.`

- [ ] **Step 2: Run typecheck across all modified workspaces**

Run: `pnpm --filter @kestrel/db --filter @kestrel/data --filter @kestrel/ai --filter @kestrel/worker typecheck`
Expected: Exit code 0 with 0 TypeScript errors.

- [ ] **Step 3: Run unit and integration test suites across all modified packages**

Run: `pnpm --filter @kestrel/db --filter @kestrel/data --filter @kestrel/ai --filter @kestrel/worker test`
Expected: All test suites PASS.

- [ ] **Step 4: Build the worker production bundle (`dist/index.js` and `dist/runner/cli.js`)**

Run: `pnpm --filter @kestrel/worker build`
Expected: `dist/index.js` and `dist/runner/cli.js` built cleanly by `esbuild` with exit code 0.
