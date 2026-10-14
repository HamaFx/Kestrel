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

vi.mock('@kestrel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kestrel/db')>();
  return {
    ...actual,
    closeDb: vi.fn(),
    listDistinctSymbols: vi.fn(async () => ['XAUUSD']),
  };
});

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
      last: 2400.1,
      volume: 10,
      source: 0,
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
