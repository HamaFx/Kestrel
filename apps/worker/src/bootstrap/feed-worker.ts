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

// Feed workers: the SignalR + Binance tick stream runner and the runtime
// selector that falls back to 100% on-demand REST mode.
//
// The closed-candle flush rig lives in `candle-flush.ts` and the periodic
// live_ticks flush loop in `tick-flush.ts`.

import { getDb } from '@kestrel/db';
import { isForexWeekend } from '@kestrel/shared';

import { BinanceStreamConsumer } from '../binance/index.js';
import type { WorkerEnv } from '../env.js';
import { ping } from '../healthchecks.js';
import type { Logger } from '../log.js';
import { flushLiveTicks } from '../persistence/live-ticks.js';
import { notifyReady, notifyStatus, notifyStopping, notifyWatchdog } from '../sd-notify.js';
import {
  createDefaultBuildConnection,
  SignalRConsumer,
  type BuildConnection,
  type NormalizedTick,
} from '../signalr/consumer.js';
import { TickBuffer } from '../signalr/tick-buffer.js';
import { SymbolManager } from '../symbol-manager.js';
import { createTickBus, type TickBus } from '../tick-bus.js';
import { createCandleFlushRig } from './candle-flush';
import { createTickFlusher } from './tick-flush';

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
  aggregator: ReturnType<typeof createCandleFlushRig>['aggregator'];
  /** Fan-out for plugin tick subscribers (paper fills, live strategies). */
  tickBus: TickBus;
  /** Returns the epoch ms of the last tick (0 if none received yet). */
  getLastTickAt(): number;
  /** Idempotent. Cleanly tears down timers + the hub. */
  stop(): Promise<void>;
}

export async function runWorker(args: RunWorkerArgs): Promise<RunningWorker> {
  const { env, log } = args;
  const buildConnection = args.buildConnection ?? (await createDefaultBuildConnection());
  const buffer = new TickBuffer();
  const tickBus = createTickBus(log);
  const db = getDb();

  let lastTickAt = 0;

  let pendingTicks: NormalizedTick[] = [];
  let batchTimer: NodeJS.Timeout | null = null;
  const BATCH_MS = 50;
  // Fail-safe bound: an event-loop stall plus a feed replay must not grow the
  // pending batch without limit before the 50ms timer can fire.
  const MAX_PENDING_TICKS = 5_000;

  // Closed-candle flush rig (per-flush timeout + in-flight tracking).
  const candleRig = createCandleFlushRig({ db, log });
  const aggregator = candleRig.aggregator;

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
    // Plugin subscribers see the tick immediately (sub-second paper fills);
    // core persistence stays on the 50ms batch below and is never blocked
    // by a slow/failing plugin.
    tickBus.publish(tick);
    pendingTicks.push(tick);
    if (pendingTicks.length >= MAX_PENDING_TICKS) {
      // Flush synchronously at the cap; the pending timer (if any) will find
      // an empty buffer and no-op.
      flushBatch();
      return;
    }
    if (!batchTimer) {
      batchTimer = setTimeout(() => {
        batchTimer = null;
        flushBatch();
      }, BATCH_MS);
    }
    if (pendingTicks.length === 1) notifyWatchdog();
  };

  const consumer = new SignalRConsumer({
    hubUrl: env.BIQUOTE_HUB_URL,
    onTick: handleIncomingTick,
    buildConnection,
    log: log.with({ module: 'signalr' }),
    symbols: [],
  });

  const symbolManager = new SymbolManager(log.with({ module: 'symbol-manager' }));

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
  notifyReady();
  notifyStatus('signalr + binance ws connected; tick stream active');

  const flusher = createTickFlusher({
    db,
    buffer,
    log,
    flushIntervalMs: args.flushIntervalMs ?? 1_000,
  });
  flusher.schedule();

  const heartbeatIntervalMs = args.heartbeatIntervalMs ?? 30_000;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  if (heartbeatIntervalMs > 0) {
    heartbeatTimer = setInterval(() => {
      const ageMs = Date.now() - lastTickAt;
      const isWeekend = isForexWeekend();
      const hasCrypto = cryptoSymbols.length > 0;
      if (lastTickAt > 0 && ageMs < 60_000) {
        void ping(env.HC_SIGNALR_UUID, 'success', `last_tick=${ageMs}ms`);
      } else if (isWeekend && !hasCrypto) {
        void ping(env.HC_SIGNALR_UUID, 'success', 'market_closed_weekend');
      } else {
        void ping(env.HC_SIGNALR_UUID, 'fail', `no_ticks_for=${Math.floor(ageMs / 1000)}s`);
      }
    }, heartbeatIntervalMs);
    heartbeatTimer.unref();
  }

  const stop = async (): Promise<void> => {
    flusher.stopScheduling();
    tickBus.stop();
    notifyStopping();
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    symbolManager.stop();

    await Promise.all([consumer.stop(), binanceConsumer.stop()]);

    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }
    if (pendingTicks.length > 0) flushBatch();

    await flusher.awaitInFlight();

    try {
      const drained = buffer.peek();
      if (drained.length > 0) {
        await flushLiveTicks({ db, buffer, log }, drained);
        buffer.drain(drained);
      }
    } catch (err) {
      log.warn('final flush on stop failed', { err: String(err) });
    }

    await candleRig.drain();
  };

  const getLastTickAt = (): number => lastTickAt;

  return { consumer, binanceConsumer, buffer, aggregator, tickBus, getLastTickAt, stop };
}

/** The subset of the running worker the HTTP servers + shutdown hooks need. */
export interface WorkerRuntime {
  getLastTickAt(): number;
  stop(): Promise<void>;
  isSignalRConnected(): boolean;
  isBinanceConnected(): boolean;
  getDroppedTicks(): number;
}

/**
 * Start the tick-stream worker when enabled, otherwise stand up the
 * 100% on-demand REST mode stub (no WebSocket connections).
 */
export async function startWorkerRuntime({
  env,
  log,
  tickStreamEnabled,
}: {
  env: WorkerEnv;
  log: Logger;
  tickStreamEnabled: boolean;
}): Promise<WorkerRuntime> {
  if (tickStreamEnabled) {
    const running = await runWorker({ env, log });
    return {
      getLastTickAt: running.getLastTickAt,
      stop: running.stop,
      isSignalRConnected: () => running.consumer.isStarted(),
      isBinanceConnected: () => running.binanceConsumer.isConnected(),
      getDroppedTicks: () => running.consumer.droppedTicks(),
    };
  }

  notifyReady();
  notifyStatus('on-demand REST mode active; tick streaming disabled');
  return {
    getLastTickAt: () => 0,
    stop: async () => {
      notifyStopping();
    },
    isSignalRConnected: () => false,
    isBinanceConnected: () => false,
    getDroppedTicks: () => 0,
  };
}
