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

// Shared CoT ingestion runner: the worker `cot` job and `/api/cron/cot` both
// execute this code, so these assertions pin the single implementation.

import { cftc } from '@kestrel/data';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runCotIngestion } from '../src/cot/ingest';
import * as persistence from '../src/cot/persistence';

vi.mock('@kestrel/data', () => ({
  cftc: {
    fetchLatestRows: vi.fn(),
    parseCftcInt: (s: string | undefined) =>
      s == null || s === '' ? null : Number.parseInt(s, 10),
    toCftcName: (s: string) => `cftc:${s}`,
  },
}));

vi.mock('../src/cot/persistence', () => ({ upsertCoTReport: vi.fn() }));

const SAMPLE_ROW = {
  report_date_as_yyyy_mm_dd: '2026-05-23',
  dealer_positions_long_all: '100',
  dealer_positions_short_all: '50',
  asset_mgr_positions_long_all: '80',
  asset_mgr_positions_short_all: '40',
  lev_money_positions_long_all: '70',
  lev_money_positions_short_all: '30',
  other_rept_positions_long_all: '20',
  other_rept_positions_short_all: '10',
} as never;

beforeEach(() => {
  vi.mocked(cftc.fetchLatestRows).mockReset();
  vi.mocked(persistence.upsertCoTReport).mockReset();
});

describe('runCotIngestion', () => {
  it('iterates supported symbols, upserts each row, and reports counts', async () => {
    vi.mocked(cftc.fetchLatestRows).mockResolvedValue([SAMPLE_ROW, SAMPLE_ROW]);
    vi.mocked(persistence.upsertCoTReport).mockResolvedValue(undefined as never);

    const result = await runCotIngestion({ signal: new AbortController().signal });

    // 3 supported symbols × 2 rows = 6 upserts; processed = symbols handled.
    expect(result.processed).toBe(3);
    expect(result.note).toMatch(/upserted=6/);
    expect(persistence.upsertCoTReport).toHaveBeenCalledTimes(6);
  });

  it('continues past per-symbol failures', async () => {
    vi.mocked(cftc.fetchLatestRows)
      .mockRejectedValueOnce(new Error('cftc down'))
      .mockResolvedValueOnce([SAMPLE_ROW])
      .mockResolvedValueOnce([SAMPLE_ROW]);
    vi.mocked(persistence.upsertCoTReport).mockResolvedValue(undefined as never);

    const result = await runCotIngestion({ signal: new AbortController().signal });

    expect(result.processed).toBe(2);
    expect(result.note).toMatch(/errors=1/);
  });

  it('skips rows whose report_date_as_yyyy_mm_dd is malformed', async () => {
    const bad = { ...(SAMPLE_ROW as Record<string, unknown>), report_date_as_yyyy_mm_dd: '' };
    vi.mocked(cftc.fetchLatestRows).mockResolvedValue([bad as never, SAMPLE_ROW] as never);
    vi.mocked(persistence.upsertCoTReport).mockResolvedValue(undefined as never);

    await runCotIngestion({ signal: new AbortController().signal });

    expect(persistence.upsertCoTReport).toHaveBeenCalledTimes(3);
  });

  it('stops at the next symbol boundary when the signal is aborted', async () => {
    const controller = new AbortController();
    vi.mocked(cftc.fetchLatestRows).mockResolvedValue([SAMPLE_ROW]);
    vi.mocked(persistence.upsertCoTReport).mockImplementation(async () => {
      controller.abort();
    });

    const result = await runCotIngestion({ signal: controller.signal });

    expect(result.processed).toBe(1);
  });
});
