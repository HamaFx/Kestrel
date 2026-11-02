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

// Shared economic-calendar actuals runner: the worker `fred-actuals` job and
// `/api/cron/fred-actuals` both execute this code, so the zero-key BiQuote
// refresh and the FRED backfill can never drift between them.

import { fetchUpcomingEvents, fred } from '@kestrel/data';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runFredActualsRefresh } from '../src/calendar/actuals';
import * as calendar from '../src/persistence/calendar';

vi.mock('@kestrel/data', () => ({
  fetchUpcomingEvents: vi.fn().mockResolvedValue([]),
  fred: {
    fetchObservations: vi.fn(),
    fredMeta: vi.fn(),
  },
}));

vi.mock('../src/persistence/calendar', () => ({
  listFredEventsMissingActual: vi.fn(),
  parseFredEventId: vi.fn(),
  patchEventActual: vi.fn(),
  upsertEvents: vi.fn().mockResolvedValue({ inserted: 0 }),
}));

beforeEach(() => {
  vi.mocked(fetchUpcomingEvents).mockReset().mockResolvedValue([]);
  vi.mocked(calendar.upsertEvents)
    .mockReset()
    .mockResolvedValue({ inserted: 0 } as never);
  vi.mocked(calendar.listFredEventsMissingActual).mockReset();
  vi.mocked(calendar.parseFredEventId).mockReset();
  vi.mocked(calendar.patchEventActual).mockReset();
  vi.mocked(fred.fetchObservations).mockReset();
  vi.mocked(fred.fredMeta).mockReset();
});

describe('runFredActualsRefresh', () => {
  it('runs the zero-key BiQuote refresh then short-circuits when the FRED key is missing', async () => {
    vi.mocked(fetchUpcomingEvents).mockResolvedValue([{ id: 'ev-1' }] as never);
    vi.mocked(calendar.upsertEvents).mockResolvedValue({ inserted: 1 } as never);

    const result = await runFredActualsRefresh({ fredApiKey: null });

    expect(result.processed).toBe(1);
    expect(result.note).toBe('biquote_upserted=1, FRED_API_KEY missing');
    expect(calendar.listFredEventsMissingActual).not.toHaveBeenCalled();
  });

  it('patches each candidate with the closest observation', async () => {
    vi.mocked(calendar.listFredEventsMissingActual).mockResolvedValue([
      { id: 'fred:50:2026-05-01' } as never,
      { id: 'fred:51:2026-05-15' } as never,
    ]);
    vi.mocked(calendar.parseFredEventId).mockImplementation((id: string) =>
      id === 'fred:50:2026-05-01'
        ? { releaseId: 50, releaseDate: '2026-05-01' }
        : { releaseId: 51, releaseDate: '2026-05-15' },
    );
    vi.mocked(fred.fredMeta).mockReturnValue({
      seriesId: 'PAYEMS',
      title: 'NFP',
      importance: 'high',
    } as never);
    vi.mocked(fred.fetchObservations).mockResolvedValue([
      { date: '2026-05-02', value: 200_000 } as never,
      { date: '2026-05-04', value: 150_000 } as never,
    ]);
    vi.mocked(calendar.patchEventActual).mockResolvedValue(undefined as never);

    const result = await runFredActualsRefresh({ fredApiKey: 'test-key' });

    expect(result.processed).toBe(2);
    expect(result.note).toMatch(/filled=2/);
    expect(calendar.patchEventActual).toHaveBeenCalledWith(
      'fred:50:2026-05-01',
      200_000,
      expect.any(Date),
    );
  });

  it('skips rows with un-parseable ids and missing meta', async () => {
    vi.mocked(calendar.listFredEventsMissingActual).mockResolvedValue([
      { id: 'fred:50:2026-05-01' } as never,
      { id: 'malformed' } as never,
    ]);
    vi.mocked(calendar.parseFredEventId).mockImplementation((id: string) =>
      id === 'malformed' ? null : { releaseId: 50, releaseDate: '2026-05-01' },
    );
    vi.mocked(fred.fredMeta).mockReturnValue(null);

    const result = await runFredActualsRefresh({ fredApiKey: 'test-key' });

    expect(result.note).toMatch(/skipped=2/);
  });
});
