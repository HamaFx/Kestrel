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

// R16 (audit 2026-10-31) — sweeps start on the queue, never in the caller.
//
// These tests pin the migrated contract shared by the HTTP route and the chat
// tool: create the sweep row, enqueue `backtest-sweep`, return immediately
// with the queued row (HTTP 202), and do no engine work in the web process. A
// queue failure marks the row failed and surfaces as 503 instead of leaving a
// sweep that will never run.

import type * as KestrelData from '@kestrel/data';
import type { PluginApiRouteContext, PluginExecutionContext } from '@kestrel/plugin-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sweepRoutes } from '../src/api/routes/sweeps';
import type * as QueriesModule from '../src/db/queries';
import { SweepInputSchema } from '../src/schemas';
import { enqueueSweepForUser, SweepQueueUnavailableError } from '../src/services/sweep-enqueue';
import { sweepTools } from '../src/tools/sweeps';

const mocks = vi.hoisted(() => ({
  enqueueJob: vi.fn(),
  getCandles: vi.fn(),
  createBacktestSweep: vi.fn(),
  getBacktestSweep: vi.fn(),
  updateBacktestSweep: vi.fn(),
  getBacktestStrategy: vi.fn(),
}));

vi.mock('@kestrel/db/queue', () => ({
  BACKTEST_SWEEP_QUEUE: 'backtest-sweep',
  enqueueJob: mocks.enqueueJob,
}));

vi.mock('@kestrel/data', async (importOriginal) => {
  const actual = await importOriginal<typeof KestrelData>();
  return { ...actual, getCandles: mocks.getCandles };
});

vi.mock('../src/db/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof QueriesModule>();
  return {
    ...actual,
    createBacktestSweep: mocks.createBacktestSweep,
    getBacktestSweep: mocks.getBacktestSweep,
    updateBacktestSweep: mocks.updateBacktestSweep,
    getBacktestStrategy: mocks.getBacktestStrategy,
  };
});

const SOURCE = 'function getSignal(ctx) { return null; }';

const INPUT = {
  name: 'Queue-only sweep',
  source: SOURCE,
  symbol: 'XAUUSD',
  timeframe: '1h',
  parameterSpace: [{ name: 'threshold', values: [1, 2] }],
  objective: 'expectancyR',
};

function sweepRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sweep-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    name: 'Queue-only sweep',
    strategyId: null,
    symbol: 'XAUUSD',
    timeframe: '1h',
    source: SOURCE,
    baseParams: {},
    parameterSpace: [{ name: 'threshold', values: [1, 2] }],
    objective: 'expectancyR',
    count: 1000,
    initialBalance: 10_000,
    riskPct: 1,
    minTrades: 5,
    persistRuns: false,
    status: 'queued',
    total: 2,
    completed: 0,
    bestParams: null,
    bestMetrics: null,
    bestScore: null,
    results: [],
    error: null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    ...overrides,
  };
}

const log = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const storage = {
  get: vi.fn(),
  set: vi.fn(),
  list: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
};

function execContext(): PluginExecutionContext {
  return {
    pluginId: 'backtesting',
    userId: 'user-1',
    tenantId: 'tenant-1',
    settings: {},
    storage,
    log,
  };
}

function routeContext(method: string, body?: unknown): PluginApiRouteContext {
  return {
    request: new Request('http://localhost/api/plugins/backtesting/sweeps', {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    }),
    params: {},
    pluginId: 'backtesting',
    userId: 'user-1',
    tenantId: 'tenant-1',
    settings: {},
    storage,
    log,
  };
}

describe('sweep creation is queue-only (R16)', () => {
  beforeEach(() => {
    mocks.enqueueJob.mockReset();
    mocks.getCandles.mockReset();
    mocks.createBacktestSweep.mockReset();
    mocks.getBacktestSweep.mockReset();
    mocks.updateBacktestSweep.mockReset();
    mocks.updateBacktestSweep.mockResolvedValue(undefined);
    mocks.getBacktestStrategy.mockReset();
    log.error.mockReset();
  });

  it('persists a queued sweep and hands it to the worker queue', async () => {
    mocks.createBacktestSweep.mockResolvedValue(sweepRow());
    mocks.enqueueJob.mockResolvedValue('job-1');

    const { row, jobId } = await enqueueSweepForUser({
      userId: 'user-1',
      tenantId: 'tenant-1',
      input: SweepInputSchema.parse(INPUT),
      settings: {},
    });

    expect(row.status).toBe('queued');
    expect(jobId).toBe('job-1');
    expect(mocks.enqueueJob).toHaveBeenCalledWith('backtest-sweep', {
      userId: 'user-1',
      tenantId: 'tenant-1',
      sweepId: 'sweep-1',
      settings: {},
    });
    // No candle fetch, no sandbox: the engine must not run in the caller.
    expect(mocks.getCandles).not.toHaveBeenCalled();
    expect(mocks.updateBacktestSweep).not.toHaveBeenCalled();
  });

  it('marks the sweep failed and throws when the queue rejects the job', async () => {
    mocks.createBacktestSweep.mockResolvedValue(sweepRow());
    mocks.enqueueJob.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(
      enqueueSweepForUser({
        userId: 'user-1',
        tenantId: 'tenant-1',
        input: SweepInputSchema.parse(INPUT),
        settings: {},
      }),
    ).rejects.toBeInstanceOf(SweepQueueUnavailableError);

    expect(mocks.updateBacktestSweep).toHaveBeenCalledWith(
      'user-1',
      'sweep-1',
      expect.objectContaining({
        status: 'failed',
        error: expect.stringContaining('ECONNREFUSED'),
      }),
    );
  });

  it('marks the sweep failed when the queue suppresses the insert', async () => {
    mocks.createBacktestSweep.mockResolvedValue(sweepRow());
    mocks.enqueueJob.mockResolvedValue(null);

    await expect(
      enqueueSweepForUser({
        userId: 'user-1',
        tenantId: 'tenant-1',
        input: SweepInputSchema.parse(INPUT),
        settings: {},
      }),
    ).rejects.toBeInstanceOf(SweepQueueUnavailableError);

    expect(mocks.updateBacktestSweep).toHaveBeenCalledWith(
      'user-1',
      'sweep-1',
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('chat tool enqueues and returns the queued row without executing the sweep', async () => {
    mocks.createBacktestSweep.mockResolvedValue(sweepRow());
    mocks.enqueueJob.mockResolvedValue('job-1');
    mocks.getBacktestSweep.mockResolvedValue(sweepRow());

    const tool = sweepTools.find((entry) => entry.name === 'backtest_sweep_strategy');
    expect(tool).toBeDefined();
    const detail = await tool!.execute(SweepInputSchema.parse(INPUT), execContext());

    expect(detail.status).toBe('queued');
    expect(detail.completed).toBe(0);
    expect(detail.results).toEqual([]);
    expect(mocks.enqueueJob).toHaveBeenCalledTimes(1);
    expect(mocks.getCandles).not.toHaveBeenCalled();
  });

  it('HTTP create returns 202 with the sweep and job id', async () => {
    mocks.createBacktestSweep.mockResolvedValue(sweepRow());
    mocks.enqueueJob.mockResolvedValue('job-1');
    mocks.getBacktestSweep.mockResolvedValue(sweepRow());

    const handler = sweepRoutes['/sweeps'];
    expect(handler).toBeDefined();
    const response = await handler!(routeContext('POST', INPUT));

    expect(response.status).toBe(202);
    const body = (await response.json()) as {
      sweep: { status: string };
      jobId: string | null;
      message: string;
    };
    expect(body.sweep.status).toBe('queued');
    expect(body.jobId).toBe('job-1');
    expect(body.message).toContain('2 combinations');
  });

  it('HTTP create maps a queue outage to 503', async () => {
    mocks.createBacktestSweep.mockResolvedValue(sweepRow());
    mocks.enqueueJob.mockRejectedValue(new Error('queue is down'));

    const handler = sweepRoutes['/sweeps'];
    const response = await handler!(routeContext('POST', INPUT));

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('QUEUE_UNAVAILABLE');
    expect(body.error.message).toContain('not started');
  });
});
