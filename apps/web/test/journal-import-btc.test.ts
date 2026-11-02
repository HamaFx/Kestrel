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

// Phase 3 Task 4 — the journal importer must accept BTC-priced trades and
// classify outcomes with the same R-multiple rules as the update path.
//
// Regression: every price was capped at 5,000, so a BTCUSDT trade around
// 60,000-100,000 was rejected at the schema boundary.

import { MAX_PRICE_VALUE } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  importJournalEntriesService,
  JournalImportPayloadSchema,
  type JournalImportTrade,
} from '../src/lib/services/journal/import';

const mocks = vi.hoisted(() => ({
  inserted: [] as Array<Record<string, unknown>>,
}));

vi.mock('@kestrel/db', () => ({
  requireTenantIdForUser: vi.fn(async () => 'tenant-1'),
  withUserTenant: async (_userId: string, work: (db: unknown) => Promise<unknown>) =>
    work({
      insert: () => ({
        values: (rows: Array<Record<string, unknown>>) => {
          mocks.inserted.push(...rows);
          return {
            returning: async () => rows.map((_row, index) => ({ id: `entry-${index}` })),
          };
        },
      }),
    }),
  schema: { journalEntries: { id: 'journal_entries.id' } },
}));

const OPENED_AT = Date.UTC(2026, 9, 1, 12, 0, 0);
const CLOSED_AT = Date.UTC(2026, 9, 1, 16, 0, 0);

function trade(overrides: Partial<JournalImportTrade> = {}): JournalImportTrade {
  return {
    symbol: 'BTCUSDT',
    side: 'long',
    entry: 60_000,
    stop: 59_000,
    target: 62_000,
    exit: 61_000,
    size: 0.5,
    openedAt: OPENED_AT,
    closedAt: CLOSED_AT,
    notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.inserted.length = 0;
});

describe('JournalImportPayloadSchema', () => {
  it('accepts a BTCUSDT trade above the old 5,000 ceiling', () => {
    const parsed = JournalImportPayloadSchema.safeParse({ trades: [trade()] });
    expect(parsed.success).toBe(true);
  });

  it('accepts prices up to MAX_PRICE_VALUE and rejects beyond it', () => {
    const atCeiling = JournalImportPayloadSchema.safeParse({
      trades: [
        trade({ entry: MAX_PRICE_VALUE, stop: MAX_PRICE_VALUE - 1000, target: null, exit: null }),
      ],
    });
    expect(atCeiling.success).toBe(true);

    const beyond = JournalImportPayloadSchema.safeParse({
      trades: [trade({ entry: MAX_PRICE_VALUE + 1, stop: null, target: null, exit: null })],
    });
    expect(beyond.success).toBe(false);
  });
});

describe('importJournalEntriesService', () => {
  it('computes a winning R-multiple for a closed BTC long', async () => {
    const result = await importJournalEntriesService('user-1', [trade()]);

    expect(result.count).toBe(1);
    expect(mocks.inserted[0]).toMatchObject({
      userId: 'user-1',
      tenantId: 'tenant-1',
      symbol: 'BTCUSDT',
      rMultiple: 1,
      outcome: 'win',
    });
  });

  it('classifies a tiny positive R as breakeven (±0.05 threshold)', async () => {
    await importJournalEntriesService('user-1', [
      trade({ entry: 60_000, stop: 59_000, exit: 60_030 }),
    ]);

    expect(mocks.inserted[0]).toMatchObject({ rMultiple: 0.03, outcome: 'breakeven' });
  });

  it('handles a short BTC trade', async () => {
    await importJournalEntriesService('user-1', [
      trade({ side: 'short', entry: 60_000, stop: 61_000, exit: 58_000, target: 57_000 }),
    ]);

    expect(mocks.inserted[0]).toMatchObject({ rMultiple: 2, outcome: 'win' });
  });

  it('keeps an open trade open without an R-multiple', async () => {
    await importJournalEntriesService('user-1', [
      trade({ closedAt: null, exit: null, target: null }),
    ]);

    expect(mocks.inserted[0]).toMatchObject({ rMultiple: null, outcome: 'open' });
  });

  it('rejects a stop on the wrong side with a 400', async () => {
    await expect(
      importJournalEntriesService('user-1', [trade({ stop: 61_000 })]),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a target on the wrong side with a 400', async () => {
    await expect(
      importJournalEntriesService('user-1', [trade({ target: 59_500 })]),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
