/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Kestrel worker entry point.
//
// The worker holds persistent market-data connections. Ticks flow into
// `TickBuffer`, which is drained once per second and upserted into
// `live_ticks`; the candle aggregator consumes the same validated stream.
// Binance WebSocket data is handled alongside the primary feed.
//
// Lifecycle:
//   1. loadEnv — fail fast if required env is missing.
//   2. createLogger — JSON in prod, pretty in dev.
//   3. installSignalHandlers — graceful shutdown on SIGTERM / SIGINT.
//   4. start SignalR consumer + Binance WS consumer + the 1Hz flush loop.
//   5. heartbeat to healthchecks.io every 30s while the consumer is alive.

import { getDb, initLangfuse, shutdownLangfuse } from '@kestrel/ai';
import { closeDb } from '@kestrel/db';
import { getCapabilityReport } from '@kestrel/shared';

import { Candle1mAggregator, type ClosedCandle } from './aggregator/candle-1m.js';
import { BinanceStreamConsumer } from './binance/index.js';
import { loadEnv, type WorkerEnv } from './env.js';
import { ping } from './healthchecks.js';
import { createHealthServer, createProxyServer } from './http-server.js';
import { createLogger, type Logger } from './log.js';
import { flushClosedCandle } from './persistence/candles-1m.js';
import { flushLiveTicks } from './persistence/live-ticks.js';
import { startScheduler } from './scheduler.js';
import { notifyReady, notifyStatus, notifyStopping, notifyWatchdog } from './sd-notify.js';
import {
  createDefaultBuildConnection,
  SignalRConsumer,
  type BuildConnection,
  type NormalizedTick,
} from './signalr/consumer.js';
import { TickBuffer } from './signalr/tick-buffer.js';
import { SymbolManager } from './symbol-manager.js';

interface ShutdownState {
  shuttingDown: boolean;
  /** Cleanup callbacks run in reverse-registration order on shutdown. */
  cleanups: Array<() => Promise<void> | void>;
}

const state: ShutdownState = { shuttingDown: false, cleanups: [] };

function installSignalHandlers(log: Logger): void {
  const handle = (signal: NodeJS.Signals): void => {
    if (state.shuttingDown) {
      log.warn('second signal received — exiting immediately', { signal });
      process.exit(1);
      return;
    }
    state.shuttingDown = true;
    log.info('shutdown signal received', { signal });

    void (async () => {
      // Run cleanups in reverse order so dependencies tear down first.
      for (let i = state.cleanups.length - 1; i >= 0; i -= 1) {
        try {
          await state.cleanups[i]?.();
        } catch (err) {
          log.error('cleanup failed', { err: String(err) });
        }
      }
      log.info('shutdown complete');
      process.exit(0);
    })();
  };

  process.on('SIGTERM', () => handle('SIGTERM'));
  process.on('SIGINT', () => handle('SIGINT'));
}

/** Register a cleanup callback to run on graceful shutdown. */
export function onShutdown(fn: () => Promise<void> | void): void {
  state.cleanups.push(fn);
}

/**
 * Compose the SignalR consumer + tick buffer + flush loop. Exported for
 * tests so they can drive the same wiring with a stubbed connection.
 */
export interface RunWorkerArgs {
  env: WorkerEnv;
  log: Logger;
  /** Override the SignalR factory (tests pass a fake builder). */
  buildConnection?: BuildConnection;
  /** Override the flush loop interval (tests use a tiny number). */
  flushIntervalMs?: number;
  /** Override the heartbeat interval (tests use a tiny number or 0 to disable). */
  heartbeatIntervalMs?: number;
  /**
   * Tap that fires on every validated tick so the candle aggregator can
   * consume the same validated event without re-walking its schema.
   */
  onTick?: (tick: NormalizedTick) => void;
}

export interface RunningWorker {
  consumer: SignalRConsumer;
  binanceConsumer: BinanceStreamConsumer;
  buffer: TickBuffer;
  aggregator: Candle1mAggregator;
  /** Returns the epoch ms of the last tick (0 if none received yet). */
  getLastTickAt(): number;
  /** Idempotent. Cleanly tears down timers + the hub. */
  stop(): Promise<void>;
}

export async function runWorker(args: RunWorkerArgs): Promise<RunningWorker> {
  const { env, log } = args;
  const buildConnection = args.buildConnection ?? (await createDefaultBuildConnection());
  const buffer = new TickBuffer();
  const db = getDb();

  let lastTickAt = 0;

  // L6: Batch ticks before feeding to aggregator and buffer.
  // During high-volume windows (news events), ticks arrive faster than
  // they can be individually processed. Batched feeding reduces method
  // call overhead and Map lookups in both the buffer and aggregator.
  let pendingTicks: NormalizedTick[] = [];
  let batchTimer: NodeJS.Timeout | null = null;
  const BATCH_MS = 50; // flush every 50ms — imperceptible delay for candles

  const flushBatch = () => {
    if (pendingTicks.length === 0) return;
    const ticks = pendingTicks;
    pendingTicks = [];
    const now = Date.now();
    for (const tick of ticks) {
      buffer.push(tick);
      aggregator.feed(tick);
    }
    args.onTick?.(ticks[ticks.length - 1]!);
    lastTickAt = now;
    notifyWatchdog();
  };

  const handleIncomingTick = (tick: NormalizedTick) => {
    pendingTicks.push(tick);
    if (!batchTimer) {
      batchTimer = setTimeout(() => {
        batchTimer = null;
        flushBatch();
      }, BATCH_MS);
    }
    // Notify watchdog immediately on first tick in batch so healthchecks
    // stay responsive.
    if (pendingTicks.length === 1) notifyWatchdog();
  };

  // 1m candle aggregator — emits ClosedCandle events on minute rollover.
  // We write each closed bar to `candles_1m` synchronously; failures are
  // logged but do NOT throw, because a single failed insert shouldn't
  // take down the consumer.
  //
  // A sustained write failure remains visible in logs through the counter below.
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

  const consumer = new SignalRConsumer({
    hubUrl: env.BIQUOTE_HUB_URL,
    onTick: handleIncomingTick,
    buildConnection,
    log: log.with({ module: 'signalr' }),
    // Default to empty; SymbolManager will immediately populate it
    symbols: [],
  });

  const symbolManager = new SymbolManager(log.with({ module: 'symbol-manager' }));

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
  // The consumer is connected and subscribed — tell systemd we're done
  // bootstrapping. Pair with `Type=notify` in kestrel-worker.service so
  // the unit only enters `active (running)` once we're ready.
  notifyReady();
  notifyStatus('signalr + binance ws connected; tick stream active');

  let tickFlushFailureCount = 0; // 5 minutes

  // C1/C2 fix (RELIABILITY_AUDIT_REPORT.md): self-rescheduling setTimeout
  // with in-flight guard so flushes never overlap, and peek-before-drain
  // so ticks are never irretrievably lost on DB write failure.
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

  const getLastTickAt = (): number => lastTickAt;

  return { consumer, binanceConsumer, buffer, aggregator, getLastTickAt, stop };
}

export async function main(): Promise<void> {
  // Load secrets from the configured vault before
  // loadEnv() runs. No-op when SECRETS_VAULT_PROVIDER is unset or 'none'.
  const { loadSecretsFromVault } = await import('@kestrel/shared/vault');
  await loadSecretsFromVault();

  const env = loadEnv();
  const log = createLogger({ service: 'worker', commit: env.DEPLOYED_SHA });

  // ── Langfuse LLM Observability ──────────────────────────────────────
  // Silently skipped when LANGFUSE_* env vars are not set.
  initLangfuse({ service: 'worker' });

  // Eagerly initialize Mastra storage schema so the first workflow run
  // doesn't pay the one-time DDL cost. Non-fatal: lazy init retries.
  const { initializeKestrelMastra } = await import('@kestrel/ai/mastra');
  await initializeKestrelMastra().catch((err: unknown) => {
    log.warn('Mastra storage init failed (non-fatal; lazy init will retry)', { err: String(err) });
  });

  log.info('worker starting', {
    banner: [
      '██╗  ██╗███████╗███████╗████████╗██████╗ ███████╗██╗',
      '██║ ██╔╝██╔════╝██╔════╝╚══██╔══╝██████╔╝██╔════╝██║',
      '█████╔╝ █████╗  ███████╗   ██║   ██████╔╝█████╗  ██║',
      '██╔═██╗ ██╔══╝  ╚════██║   ██║   ██╔══██╗██╔══╝  ██║',
      '██║  ██╗███████╗███████║   ██║   ██║  ██║███████╗███████╗',
      '╚═╝  ╚═╝╚══════╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝',
    ].join('\n'),
  });

  const capabilityReport = getCapabilityReport(process.env);
  log.info('worker capabilities', {
    enabled: capabilityReport.enabled,
    disabled: capabilityReport.disabled,
  });

  log.info('worker starting', {
    nodeVersion: process.version,
    biquoteHubUrl: env.BIQUOTE_HUB_URL,
    healthchecksConfigured: Boolean(env.HC_SIGNALR_UUID),
    workerMode: env.WORKER_MODE,
  });

  if (env.WORKER_MODE === 'docker') {
    const stopScheduler = startScheduler(log, env);
    // Register scheduler stop function so cron tasks are
    // torn down cleanly on shutdown.
    onShutdown(stopScheduler);
  }

  process.on('unhandledRejection', (reason) => {
    log.error('unhandledRejection', { reason: String(reason) });
  });
  // Node.js documentation warns that resuming after an uncaught exception can
  // lead to undefined behavior; exit and let the supervisor restart the worker.
  process.on('uncaughtException', (err) => {
    log.error('uncaughtException', { err: String(err) });
    process.exit(1);
  });

  installSignalHandlers(log);

  const worker = await runWorker({ env, log });

  // ── HTTP server: health checks + BiQuote REST proxy ──────────────────
  // Wrap post-startup initialisation in try/catch so the worker's
  // stop() is always called if the health server or shutdown registrations
  // fail. This ensures timers (heartbeat, flush, batch) are properly cleared.
  // healthServer is hoisted so the catch block can close the port.
  let healthServer: ReturnType<typeof createHealthServer> | null = null;
  let proxyServer: ReturnType<typeof createProxyServer> | null = null;
  try {
    healthServer = createHealthServer({
      log,
      getLastTickAt: worker.getLastTickAt,
      isSignalRConnected: () => worker.consumer.isStarted(),
      isBinanceConnected: () => worker.binanceConsumer.isConnected(),
      // H4 fix — expose dropped-tick counter for health monitoring.
      getDroppedTicks: () => worker.consumer.droppedTicks(),
      getRequestId: () => env.DEPLOYED_SHA,
    });
    proxyServer = createProxyServer({
      log,
      getLastTickAt: worker.getLastTickAt,
      isSignalRConnected: () => worker.consumer.isStarted(),
      isBinanceConnected: () => worker.binanceConsumer.isConnected(),
      getDroppedTicks: () => worker.consumer.droppedTicks(),
      getRequestId: () => env.DEPLOYED_SHA,
    });

    // Bind on all container interfaces so Docker's published localhost port
    // can reach the server. Compose keeps the host-side port bound to
    // 127.0.0.1, so this does not expose the worker publicly.
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        healthServer?.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        healthServer?.off('error', onError);
        log.info('Health server listening', {
          host: env.WORKER_HTTP_HOST ?? '127.0.0.1',
          port: env.WORKER_HTTP_PORT,
        });
        resolve();
      };
      healthServer!.once('error', onError);
      healthServer!.once('listening', onListening);
      healthServer!.listen(env.WORKER_HTTP_PORT, env.WORKER_HTTP_HOST ?? '127.0.0.1');
    });

    onShutdown(() => closeDb());
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        proxyServer?.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        proxyServer?.off('error', onError);
        log.info('Proxy server listening', {
          host: env.WORKER_HTTP_HOST ?? '127.0.0.1',
          port: env.WORKER_PROXY_PORT,
        });
        resolve();
      };
      proxyServer!.once('error', onError);
      proxyServer!.once('listening', onListening);
      proxyServer!.listen(env.WORKER_PROXY_PORT, env.WORKER_HTTP_HOST ?? '127.0.0.1');
    });

    onShutdown(() => {
      healthServer!.close();
      proxyServer?.close();
      return worker.stop();
    });
    onShutdown(() => shutdownLangfuse());
    // Flush Mastra observability exporters (Langfuse traces) before exit
    // so in-flight spans are not lost on process termination.
    onShutdown(async () => {
      const { flushMastraObservability, getKestrelMastra } = await import('@kestrel/ai/mastra');
      await flushMastraObservability(getKestrelMastra().instance).catch(() => {});
    });
  } catch (err) {
    // Clean up worker resources if post-startup initialisation
    // fails. Without this, internal timers (heartbeat, flush, batch)
    // would leak because onShutdown was never registered.
    log.error('post-startup initialisation failed — tearing down worker', { err: String(err) });
    healthServer?.close();
    // The proxy may have been created before its listener bound.
    // Close is idempotent for an unbound server.
    proxyServer?.close();
    await worker.stop();
    throw err;
  }

  log.info('worker running — feeding live_ticks from BiQuote SignalR');
}

// Only run main() when invoked as the entrypoint, not when imported by tests.
const isEntryPoint = (() => {
  try {
    const moduleUrl = new URL(import.meta.url).pathname;
    const argv1 = process.argv[1];
    return Boolean(argv1) && (moduleUrl === argv1 || moduleUrl.endsWith(argv1!));
  } catch {
    return false;
  }
})();

if (isEntryPoint) {
  main().catch((err: unknown) => {
    const msg = JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      msg: 'worker bootstrap failed',
      err: String(err),
    });
    // Use process.stderr so the structured JSON error goes to stderr
    // where the systemd journal / container runtime can capture it.
    process.stderr.write(msg + '\n');
    process.exit(1);
  });
}
