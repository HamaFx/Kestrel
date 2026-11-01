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

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RunSystemActionOutput } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createToolContext, withToolContext } from '../src/runtime/tool-context';
import { runSystemActionTool } from '../src/tools/run-system-action';

const mocks = vi.hoisted(() => ({
  fetchResonanceInputsMock: vi.fn(),
  onConflictDoUpdateMock: vi.fn(),
  insertValuesMock: vi.fn(),
  state: { currentUserRole: 'admin' as 'admin' | 'user' },
}));

vi.mock('@kestrel/db', () => {
  const schema = {
    users: { id: 'user.id', role: 'user.role' },
    snapshots: { symbol: 'snapshots.symbol', kind: 'snapshots.kind', asOf: 'snapshots.as_of' },
    intermarketResonance: { date: 'intermarket_resonance.date' },
  };

  return {
    hasAdminDbScope: () => false,
    hasTenantDbScope: vi.fn(() => false),
    getDb: () => ({
      select: () => ({
        from: (table: unknown) => ({
          where: () => {
            if (table === schema.users) {
              return [{ role: mocks.state.currentUserRole }];
            }

            if (table === schema.snapshots) {
              return [
                { asOf: new Date('2026-05-28T00:00:00Z'), data: { close: 2350.0 } },
                { asOf: new Date('2026-05-27T00:00:00Z'), data: { close: 2340.0 } },
                { asOf: new Date('2026-05-26T00:00:00Z'), data: { close: 2330.0 } },
                { asOf: new Date('2026-05-25T00:00:00Z'), data: { close: 2320.0 } },
                { asOf: new Date('2026-05-22T00:00:00Z'), data: { close: 2310.0 } },
              ];
            }

            return [];
          },
        }),
      }),
      insert: () => ({
        values: (values: unknown) => {
          mocks.insertValuesMock(values);
          return { onConflictDoUpdate: mocks.onConflictDoUpdateMock };
        },
      }),
    }),
    schema,
  };
});

vi.mock('@kestrel/data', () => ({
  fred: {
    fetchResonanceInputs: mocks.fetchResonanceInputsMock,
  },
}));

function makeContext(latestUserMessageText: string) {
  return createToolContext({
    threadId: 'thread-1',
    userId: 'user-1',
    latestUserMessageText,
    budget: { spent: 0.15, max: 10.0 },
  });
}

/** Dates matching the mocked gold snapshots, so every point aligns. */
const DATES = ['2026-05-28', '2026-05-27', '2026-05-26', '2026-05-25', '2026-05-22'];

function resonanceInputs(realYields: number[], inflation = 2.2) {
  return {
    realYields: DATES.map((date, i) => ({ date, value: realYields[i]! })),
    breakevenInflation: DATES.map((date) => ({ date, value: inflation })),
  };
}

async function runSync() {
  return (await withToolContext(makeContext('Please run the resonance sync now.'), () =>
    Promise.resolve(runSystemActionTool.execute!({ action: 'resonance_sync' }, {} as any)),
  )) as RunSystemActionOutput;
}

describe('run_system_action', () => {
  beforeEach(() => {
    mocks.state.currentUserRole = 'admin';
    vi.clearAllMocks();
    process.env['FRED_API_KEY'] = 'test-fred-key';

    // Not collinear with the mocked gold closes (the last yield breaks the
    // even spacing), so residuals are non-zero and divergences are defined.
    mocks.fetchResonanceInputsMock.mockResolvedValue(
      resonanceInputs([2.1, 2.05, 2.0, 1.95, 1.7], 2.2),
    );
    mocks.onConflictDoUpdateMock.mockResolvedValue({});
  });

  it('runs the resonance sync for an admin on an explicit request', async () => {
    const result = await runSync();

    expect(result.action).toBe('resonance_sync');
    expect(result.status).toBe('success');
    expect(result.consoleLogs[0]).toContain('Initiating action: RESONANCE_SYNC');
    expect(mocks.fetchResonanceInputsMock).toHaveBeenCalledOnce();
    expect(mocks.onConflictDoUpdateMock).toHaveBeenCalled();

    // R8: dxyIndex has no real feed in this sync, so it stays NULL instead of
    // a hard-coded 100; the divergence scores are real numbers.
    const rows = mocks.insertValuesMock.mock.calls.map(([v]) => v as Record<string, unknown>);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row['dxyIndex'] === null)).toBe(true);
    expect(rows.every((row) => typeof row['divergenceScore'] === 'number')).toBe(true);
  });

  it('refuses to write a fabricated slope when real yields have no variance', async () => {
    // All real yields identical → the OLS denominator is 0 and the slope is
    // undefined. Nothing may be persisted as a "measured" coefficient.
    mocks.fetchResonanceInputsMock.mockResolvedValue(resonanceInputs([2.0, 2.0, 2.0, 2.0, 2.0]));

    const result = await runSync();

    expect(result.status).toBe('error');
    expect(result.message).toMatch(/no variance/i);
    expect(mocks.insertValuesMock).not.toHaveBeenCalled();
    expect(mocks.onConflictDoUpdateMock).not.toHaveBeenCalled();
  });

  it('stores NULL divergence when the fit is exact (0/0 is not a z-score)', async () => {
    // Gold falls exactly 10 per unit of real yield, so every residual is 0 and
    // the residual spread is 0. `residual / 1` would fabricate a z-score.
    mocks.fetchResonanceInputsMock.mockResolvedValue(resonanceInputs([1, 2, 3, 4, 5]));

    const result = await runSync();

    expect(result.status).toBe('success');
    expect(result.message).toMatch(/divergence scores are NULL/i);
    const rows = mocks.insertValuesMock.mock.calls.map(([v]) => v as Record<string, unknown>);
    expect(rows.every((row) => row['divergenceScore'] === null)).toBe(true);
    expect(rows.every((row) => row['dxyIndex'] === null)).toBe(true);
  });

  it('rejects non-admin callers before any FRED fetch or DB write', async () => {
    mocks.state.currentUserRole = 'user';

    await expect(
      withToolContext(makeContext('Run the resonance sync now.'), () =>
        Promise.resolve(runSystemActionTool.execute!({ action: 'resonance_sync' }, {} as any)),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(mocks.fetchResonanceInputsMock).not.toHaveBeenCalled();
    expect(mocks.onConflictDoUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects implicit or ambient-health-triggered requests', async () => {
    await expect(
      withToolContext(makeContext('How stale is the resonance data right now?'), () =>
        Promise.resolve(runSystemActionTool.execute!({ action: 'resonance_sync' }, {} as any)),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    expect(mocks.fetchResonanceInputsMock).not.toHaveBeenCalled();
    expect(mocks.onConflictDoUpdateMock).not.toHaveBeenCalled();
  });
});
