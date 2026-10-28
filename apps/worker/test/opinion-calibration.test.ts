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

// Phase 3 (Jev roadmap) — `opinion-calibration` job: opinions older than 4h
// are graded against realized candles_1m closes and marked in `raw_data`.

import type * as KestrelDb from '@kestrel/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runOpinionCalibration } from '../src/jobs/opinion-calibration';
import { createLogger } from '../src/log';
import { TenantRouter } from '../src/tenant-router';

const state = vi.hoisted(() => ({
  opinions: [] as Array<Record<string, unknown>>,
  queue: [] as Array<Record<string, unknown>>,
  threads: [] as Array<Record<string, unknown>>,
  candles: [] as Array<{ t: Date; c: number }>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock('@kestrel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof KestrelDb>();
  const rowsFor = (table: unknown): unknown[] => {
    if (table === actual.schema.agentOpinions) return state.opinions;
    if (table === actual.schema.fullAnalysisQueue) return state.queue;
    if (table === actual.schema.chatThreads) return state.threads;
    if (table === actual.schema.candles1m) return state.candles;
    return [];
  };
  const selectChain = (table: unknown) => {
    const rows = () => Promise.resolve(rowsFor(table));
    const chain: Record<string, unknown> = {};
    chain['where'] = () => chain;
    chain['orderBy'] = () => chain;
    chain['limit'] = (n: number) => rows().then((all) => all.slice(0, n));
    chain['then'] = (
      onFulfilled: (value: unknown[]) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => rows().then(onFulfilled, onRejected);
    return chain;
  };
  return {
    ...actual,
    getDb: () => ({
      select: () => ({ from: (table: unknown) => selectChain(table) }),
      update: () => ({
        set: (patch: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push(patch);
          },
        }),
      }),
    }),
  };
});

const ctx = {
  log: createLogger({ service: 'test', forceJson: true }),
  tenantRouter: new TenantRouter(),
  signal: new AbortController().signal,
};

/**
 * The job merges calibration fields into `raw_data` with an atomic
 * `jsonb || patch` update; this pulls the serialized patch back out of the
 * generated SQL so assertions stay about the payload, not the SQL shape.
 */
function patchOf(update: Record<string, unknown>): Record<string, unknown> {
  const value = update['rawData'] as { queryChunks?: unknown[] } | undefined;
  const raw = (value?.queryChunks ?? []).find(
    (chunk): chunk is string => typeof chunk === 'string',
  );
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

const NOW = Date.now();
const CREATED_AT = new Date(NOW - 5 * 60 * 60 * 1000);
const ENTRY_MS = CREATED_AT.getTime();
const EXIT_MS = ENTRY_MS + 4 * 60 * 60 * 1000;

function opinion(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'opinion-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    threadId: 'thread-1',
    messageId: 'message-1',
    agentName: 'technical',
    bias: 'bullish',
    confidence: 0.8,
    rawData: { symbol: 'XAUUSD' },
    createdAt: CREATED_AT,
    ...overrides,
  };
}

beforeEach(() => {
  state.opinions = [];
  state.queue = [];
  state.threads = [];
  state.candles = [
    { t: new Date(ENTRY_MS), c: 2700 },
    { t: new Date(EXIT_MS), c: 2715 },
  ];
  state.updates = [];
});

describe('runOpinionCalibration', () => {
  it('grades a bullish opinion against the realized 4h close and stores the Brier contribution', async () => {
    state.opinions = [opinion({})];

    const result = await runOpinionCalibration(ctx);

    expect(result.processed).toBe(1);
    expect(state.updates).toHaveLength(1);
    expect(patchOf(state.updates[0]!)).toMatchObject({
      calibrationEvaluated: true,
      correct: true,
    });
    // (0.8 − 1)^2
    expect(patchOf(state.updates[0]!).brierContribution).toBeCloseTo(0.04, 10);
  });

  it('grades a neutral opinion outside the default 0.3% band as incorrect', async () => {
    state.opinions = [opinion({ bias: 'neutral', confidence: 0.7 })];

    const result = await runOpinionCalibration(ctx);

    expect(result.processed).toBe(1);
    // 15 points of a 2700 entry is outside ±0.3% (8.1), so the range call fails.
    expect(patchOf(state.updates[0]!)).toMatchObject({ correct: false });
    expect(patchOf(state.updates[0]!).brierContribution).toBeCloseTo(0.49, 10);
  });

  it('resolves the symbol from the durable Full-analysis result when raw_data has none', async () => {
    state.opinions = [opinion({ rawData: {} })];
    state.queue = [{ messageId: 'message-1', symbol: 'XAUUSD' }];

    const result = await runOpinionCalibration(ctx);

    expect(result.processed).toBe(1);
    expect(patchOf(state.updates[0]!)).toMatchObject({ correct: true });
  });

  it('marks an opinion whose symbol cannot be resolved instead of re-scanning it forever', async () => {
    state.opinions = [opinion({ rawData: {} })];
    state.threads = [{ id: 'thread-1', pinnedSymbol: null }];

    const result = await runOpinionCalibration(ctx);

    expect(result.processed).toBe(0);
    expect(patchOf(state.updates[0]!)).toMatchObject({
      calibrationEvaluated: true,
      correct: null,
      reason: 'symbol_unresolved',
    });
  });

  it('marks an opinion with a missing price window instead of re-scanning it forever', async () => {
    state.opinions = [opinion({})];
    state.candles = [];

    const result = await runOpinionCalibration(ctx);

    expect(result.processed).toBe(0);
    expect(patchOf(state.updates[0]!)).toMatchObject({
      calibrationEvaluated: true,
      correct: null,
      reason: 'price_unavailable',
    });
  });

  it('is a no-op when no ungraded opinions exist in the window', async () => {
    const result = await runOpinionCalibration(ctx);

    expect(result).toEqual({ processed: 0, note: 'no ungraded opinions in the 4h–7d window' });
    expect(state.updates).toHaveLength(0);
  });
});
