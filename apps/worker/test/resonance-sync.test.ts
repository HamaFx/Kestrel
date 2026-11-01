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

// R8 (audit 2026-10-31) honesty guards for the background resonance sync:
// the job must not persist a fabricated OLS slope of 0 (zero variance in real
// yields) or a fake z-score from `residual / 1` (zero residual spread). The
// interactive `run_system_action` tool refuses and writes nothing in the
// first case, and stores NULL divergence in the second; this job follows.

import { fred } from '@kestrel/data';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runResonanceSync } from '../src/jobs/resonance-sync';
import { createLogger } from '../src/log';
import { TenantRouter } from '../src/tenant-router';

const mocks = vi.hoisted(() => ({
  insertedRows: [] as Array<Record<string, unknown>>,
  insertCalls: 0,
  snapshotRows: [] as Array<{ asOf: Date; data: { close?: number } }>,
}));

vi.mock('@kestrel/ai', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: async () => mocks.snapshotRows,
      }),
    }),
    insert: () => ({
      values: (rows: Array<Record<string, unknown>>) => {
        mocks.insertCalls += 1;
        mocks.insertedRows = rows;
        return { onConflictDoUpdate: async () => undefined };
      },
    }),
  }),
}));

vi.mock('@kestrel/db', () => ({
  schema: {
    snapshots: { symbol: 'snapshots.symbol', kind: 'snapshots.kind', asOf: 'snapshots.asOf' },
    intermarketResonance: { date: 'intermarket_resonance.date' },
  },
}));

vi.mock('@kestrel/data', () => ({
  fred: { fetchResonanceInputs: vi.fn() },
}));

const log = createLogger({ service: 'test', forceJson: true });
const testRouter = new TenantRouter();
const ORIGINAL_FRED_KEY = process.env['FRED_API_KEY'];

const DATES = ['2026-05-01', '2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08'];

interface Point {
  date: string;
  realYield: number;
  gold: number;
}

function mockInputs(points: Point[]): void {
  vi.mocked(fred.fetchResonanceInputs).mockResolvedValue({
    realYields: points.map((p) => ({ date: p.date, value: p.realYield })),
    breakevenInflation: points.map((p) => ({ date: p.date, value: 2.3 })),
  } as never);
  mocks.snapshotRows = points.map((p) => ({
    asOf: new Date(`${p.date}T00:00:00Z`),
    data: { close: p.gold },
  }));
}

function runJob() {
  return runResonanceSync({
    log,
    signal: new AbortController().signal,
    tenantRouter: testRouter,
  });
}

beforeEach(() => {
  process.env['FRED_API_KEY'] = 'test-key';
  vi.mocked(fred.fetchResonanceInputs).mockReset();
  mocks.insertedRows = [];
  mocks.insertCalls = 0;
  mocks.snapshotRows = [];
});

afterEach(() => {
  if (ORIGINAL_FRED_KEY === undefined) delete process.env['FRED_API_KEY'];
  else process.env['FRED_API_KEY'] = ORIGINAL_FRED_KEY;
});

describe('runResonanceSync', () => {
  it('skips when FRED_API_KEY is missing', async () => {
    delete process.env['FRED_API_KEY'];
    const r = await runJob();
    expect(r.processed).toBe(0);
    expect(r.note).toBe('FRED_API_KEY missing');
    expect(mocks.insertCalls).toBe(0);
  });

  it('skips when fewer than five observations align', async () => {
    mockInputs(DATES.slice(0, 4).map((date, i) => ({ date, realYield: i, gold: 2000 - i })));
    const r = await runJob();
    expect(r.processed).toBe(0);
    expect(r.note).toMatch(/insufficient data/);
    expect(mocks.insertCalls).toBe(0);
  });

  it('writes nothing when real yields have no variance (denominator 0)', async () => {
    // Every yield identical: the OLS slope is undefined. The old behaviour
    // persisted b=0 (a fake coefficient) and derived divergence from it.
    mockInputs(
      DATES.map((date, i) => ({ date, realYield: 1.5, gold: 2000 + i * 3 - (i % 2) * 5 })),
    );
    const r = await runJob();

    expect(r.processed).toBe(0);
    expect(r.note).toMatch(/not estimable/);
    expect(r.note).toMatch(/nothing written/);
    expect(mocks.insertCalls).toBe(0);
    expect(mocks.insertedRows).toEqual([]);
  });

  it('stores observations with NULL divergence when the residual spread is zero', async () => {
    // Gold sits exactly on a line through the yields: every residual is 0, so
    // the standardized divergence is 0/0. The old behaviour divided by a
    // fallback 1.0 and stored fake z-scores.
    mockInputs(
      DATES.map((date, i) => ({
        date,
        realYield: 1 + i,
        gold: 2000 - 12 * (1 + i),
      })),
    );
    const r = await runJob();

    expect(r.processed).toBe(DATES.length);
    expect(r.note).toMatch(/divergence scores null/);
    expect(mocks.insertCalls).toBe(1);
    expect(mocks.insertedRows).toHaveLength(DATES.length);
    for (const row of mocks.insertedRows) {
      // The observations themselves are real and stored...
      expect(typeof row['realYieldPct']).toBe('number');
      expect(typeof row['goldClose']).toBe('number');
      // ...but no fake z-score is persisted (0 would be equally fabricated).
      expect(row['divergenceScore']).toBeNull();
      expect(row['dxyIndex']).toBeNull();
    }
  });

  it('stores real divergence scores when the fit is estimable', async () => {
    // Non-degenerate yield spread with residuals that vary.
    const golds = [1990, 1985, 1972, 1970, 1962, 1958];
    mockInputs(DATES.map((date, i) => ({ date, realYield: 1 + i * 0.25, gold: golds[i]! })));
    const r = await runJob();

    expect(r.processed).toBe(DATES.length);
    expect(r.note).toBe(`synchronized=${DATES.length} observations`);
    expect(mocks.insertCalls).toBe(1);
    for (const row of mocks.insertedRows) {
      expect(typeof row['divergenceScore']).toBe('number');
      expect(Number.isFinite(row['divergenceScore'])).toBe(true);
    }
    // Standardized residuals are centred, so they must not all be identical.
    const scores = mocks.insertedRows.map((row) => row['divergenceScore'] as number);
    expect(new Set(scores).size).toBeGreaterThan(1);
  });
});
