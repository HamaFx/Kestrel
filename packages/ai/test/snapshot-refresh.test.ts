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

// Shared snapshot refresh runner: the `/api/cron/snapshots` route executes
// this code, including the candles_1m tail prune.

import { getCandlesUnchecked } from '@kestrel/data';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runSnapshotRefresh } from '../src/snapshots/refresh';

vi.mock('@kestrel/data', () => ({
  getCandlesUnchecked: vi.fn(),
}));

vi.mock('../src/snapshots/compute', () => ({
  computeDailySnapshot: vi.fn(() => ({})),
  previousUtcMidnight: () => new Date('2026-05-26T00:00:00Z'),
}));

vi.mock('../src/snapshots/persistence', () => ({
  upsertSnapshot: vi.fn(async () => undefined),
}));

const { deleteSpy } = vi.hoisted(() => ({
  deleteSpy: vi.fn(async () => undefined),
}));

vi.mock('@kestrel/db', () => ({
  getDb: () => ({
    delete: () => ({ where: deleteSpy }),
    select: () => ({
      // The runner awaits the count query directly and chains `.where()` for
      // the prune query; make `from()` satisfy both shapes.
      from: () => {
        const rows = Promise.resolve([{ count: 4, n: 4 }]);
        return Object.assign(rows, { where: async () => [{ count: 4, n: 4 }] });
      },
    }),
  }),
}));

vi.mock('@kestrel/db/schema', () => ({
  candles1m: { t: 't', symbol: 'symbol' },
}));

beforeEach(() => {
  vi.mocked(getCandlesUnchecked).mockReset();
  deleteSpy.mockClear();
});

describe('runSnapshotRefresh', () => {
  it('processes every supported catalog symbol and tail-prunes candles_1m', async () => {
    vi.mocked(getCandlesUnchecked).mockResolvedValue([] as never);

    const result = await runSnapshotRefresh({ signal: new AbortController().signal });

    expect(result.processed).toBe(18);
    expect(result.note).toMatch(/symbols=18\/18/);
    expect(result.note).toMatch(/pruned=4/);
    expect(getCandlesUnchecked).toHaveBeenCalledTimes(18);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });

  it('counts errors but keeps going across all symbols', async () => {
    vi.mocked(getCandlesUnchecked)
      .mockRejectedValueOnce(new Error('upstream down'))
      .mockResolvedValue([] as never);

    const result = await runSnapshotRefresh({ signal: new AbortController().signal });

    expect(result.processed).toBe(17);
    expect(result.note).toMatch(/symbols=17\/18/);
    expect(result.note).toMatch(/errors=1/);
  });

  it('can skip the candles_1m prune for read-only backfills', async () => {
    vi.mocked(getCandlesUnchecked).mockResolvedValue([] as never);

    const result = await runSnapshotRefresh({ pruneCandles1m: false });

    expect(result.pruned).toBe(0);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
