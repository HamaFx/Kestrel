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

// Pure-logic tests for journal stats math, plus the tool-level honesty guards
// from R8 (audit 2026-10-31): `summarize()` reports null (never 0) for every
// metric the window had nothing to measure over, and `get_journal_stats`
// keeps that contract at the tool boundary before a number can be quoted as
// evidence-backed fact.

import {
  GetJournalStatsOutputSchema,
  type GetJournalStatsOutput,
  type JournalEntry,
} from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extractNumbersFromToolOutput } from '../src/committee/grounding';
// The pure tests import the stats helpers from their submodules (not the
// barrel) so the barrel mock below stays effective for the tool.
import { computeRMultiple } from '../src/journal/persistence/stats/r-multiple';
import { summarize } from '../src/journal/persistence/stats/summarize';
import { createToolContext, withToolContext } from '../src/runtime/tool-context';
import { getJournalStatsTool } from '../src/tools/get-journal-stats';

const mocks = vi.hoisted(() => ({ computeStats: vi.fn() }));

// Stub the tenant-scoped query so the tool-level tests can drive the
// coverage probe themselves.
vi.mock('../src/journal/persistence', () => ({
  computeStats: mocks.computeStats,
}));

vi.mock('@kestrel/db', () => ({
  getAdminDb: vi.fn(),
  getDb: vi.fn(),
  hasAdminDbScope: () => false,
  hasTenantDbScope: () => false,
  requireTenantIdForUser: vi.fn(async () => 'tenant-1'),
  schema: {
    journalEntries: {
      userId: 'je.user_id',
      tenantId: 'je.tenant_id',
      openedAt: 'je.opened_at',
      symbol: 'je.symbol',
      side: 'je.side',
      outcome: 'je.outcome',
      rMultiple: 'je.r_multiple',
      tags: 'je.tags',
    },
  },
}));

// Phase D2 — journal/persistence.ts → memory/memory-index.ts →
// embeddings.ts → resolveEmbeddingModel → @kestrel/shared/encryption
// which imports `server-only`. Mock the encryption module so this
// pure-logic test doesn't drag in the server-only runtime check.
vi.mock('@kestrel/shared/encryption', () => ({
  decryptByok: () => null,
  encryptByok: () => '',
  configuredProviders: () => [],
  PROVIDER_IDS: [
    'google',
    'anthropic',
    'openai',
    'groq',
    'mistral',
    'openrouter',
    'xai',
    'deepseek',
  ],
}));

function entry(partial: Partial<JournalEntry>): JournalEntry {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    symbol: 'XAUUSD',
    side: 'long',
    openedAt: 0,
    closedAt: null,
    entry: 100,
    stop: null,
    target: null,
    exit: null,
    size: null,
    outcome: 'open',
    rMultiple: null,
    notes: null,
    tags: [],
    attachments: [],
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe('computeRMultiple', () => {
  it('long winner: exit above entry, scaled by stop distance', () => {
    // entry=100, stop=95 (risk=5), exit=110 → R = 10/5 = 2
    expect(computeRMultiple({ side: 'long', entry: 100, stop: 95, exit: 110 })).toBeCloseTo(2);
  });
  it('long loser: exit below entry → negative R', () => {
    expect(computeRMultiple({ side: 'long', entry: 100, stop: 95, exit: 95 })).toBeCloseTo(-1);
  });
  it('short winner: exit below entry', () => {
    expect(computeRMultiple({ side: 'short', entry: 100, stop: 105, exit: 90 })).toBeCloseTo(2);
  });
  it('short loser: exit above entry', () => {
    expect(computeRMultiple({ side: 'short', entry: 100, stop: 105, exit: 105 })).toBeCloseTo(-1);
  });
  it('returns 0 when stop equals entry (zero risk)', () => {
    expect(computeRMultiple({ side: 'long', entry: 100, stop: 100, exit: 110 })).toBe(0);
  });
});

describe('summarize', () => {
  it('reports counts as 0 and every measured metric as null for empty input', () => {
    const s = summarize([]);
    expect(s).toMatchObject({ count: 0, wins: 0, losses: 0, breakevens: 0, open: 0 });
    // Counts are real; derived metrics were never measured, so 0 would be a
    // fabricated reading (R8).
    expect(s.winRate).toBeNull();
    expect(s.avgR).toBeNull();
    expect(s.totalR).toBeNull();
    expect(s.byDayOfWeek.every((d) => d.trades === 0 && d.winRate === null)).toBe(true);
    expect(s.byDayOfWeek.every((d) => d.totalR === null)).toBe(true);
  });

  it('counts open trades but excludes them from win-rate / avgR', () => {
    const s = summarize([
      entry({ outcome: 'open' }),
      entry({ outcome: 'win', rMultiple: 1.5 }),
      entry({ outcome: 'win', rMultiple: 2 }),
      entry({ outcome: 'loss', rMultiple: -1 }),
    ]);
    expect(s.count).toBe(4);
    expect(s.open).toBe(1);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.winRate).toBeCloseTo(2 / 3, 5);
    expect(s.totalR).toBeCloseTo(2.5);
    expect(s.avgR).toBeCloseTo(2.5 / 3, 5);
  });

  it('breakevens count as closed but contribute zero to R', () => {
    const s = summarize([
      entry({ outcome: 'breakeven', rMultiple: 0 }),
      entry({ outcome: 'win', rMultiple: 1 }),
    ]);
    expect(s.breakevens).toBe(1);
    expect(s.winRate).toBeCloseTo(0.5);
    expect(s.totalR).toBeCloseTo(1);
  });
});

describe('Phase B item 13 — extended journal stats', () => {
  it('reports null for unmeasured extended metrics and 0 only for real counts', () => {
    const s = summarize([]);
    expect(s.maxDrawdown).toBeNull();
    expect(s.longestWinStreak).toBe(0);
    expect(s.longestLossStreak).toBe(0);
    expect(s.profitFactor).toBeNull();
    expect(s.avgHoldMs).toBeNull();
    expect(s.avgWinR).toBeNull();
    expect(s.avgLossR).toBeNull();
    expect(s.recoveryFactor).toBeNull();
    expect(s.perDayOfWeek).toEqual({
      sunday: 0,
      monday: 0,
      tuesday: 0,
      wednesday: 0,
      thursday: 0,
      friday: 0,
      saturday: 0,
    });
  });

  it('leaves R-derived metrics null when trades closed without an R multiple', () => {
    const s = summarize([
      entry({ outcome: 'win', rMultiple: null }),
      entry({ outcome: 'loss', rMultiple: null }),
      entry({ outcome: 'win', rMultiple: null }),
    ]);
    // The outcome itself is measured...
    expect(s.winRate).toBeCloseTo(2 / 3);
    expect(s.wins).toBe(2);
    // ...but nothing carried an R multiple, so every R-based metric is
    // unmeasured rather than a fabricated 0.
    expect(s.avgR).toBeNull();
    expect(s.totalR).toBeNull();
    expect(s.avgWinR).toBeNull();
    expect(s.avgLossR).toBeNull();
    expect(s.maxDrawdown).toBeNull();
    expect(s.profitFactor).toBeNull();
    expect(s.recoveryFactor).toBeNull();
    expect(s.bySymbol[0]).toMatchObject({
      trades: 3,
      winRate: 2 / 3,
      totalR: null,
      expectancy: null,
    });
    expect(s.byTag).toEqual([]);
  });

  it('keeps a genuine 0 max drawdown when R multiples were measured', () => {
    const s = summarize([
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'win', rMultiple: 1 }),
    ]);
    expect(s.maxDrawdown).toBe(0);
    expect(s.totalR).toBeCloseTo(2);
    // Recovery against a zero drawdown is 0/0, so it stays unmeasured.
    expect(s.recoveryFactor).toBeNull();
  });

  it('needs a scored win and a scored loss to compute a profit factor', () => {
    const s = summarize([
      entry({ outcome: 'win', rMultiple: null }),
      entry({ outcome: 'loss', rMultiple: -1 }),
    ]);
    // The loss is measured; the win was never scored, so the ratio is unknown.
    expect(s.profitFactor).toBeNull();
    expect(s.avgLossR).toBe(-1);
    expect(s.avgWinR).toBeNull();
  });

  it('counts a win at exactly 0R as a scored win for the win average', () => {
    const s = summarize([
      entry({ outcome: 'win', rMultiple: 0 }),
      entry({ outcome: 'win', rMultiple: null }),
    ]);
    // One scored win at 0R is a real measurement, so avgWinR is 0 — not null.
    expect(s.avgWinR).toBe(0);
    expect(s.totalR).toBe(0);
  });

  it('computes max drawdown from a sequence of R-multiples', () => {
    // 1R, 1R, 1R (peak=3), -2R, -2R (drawdown from peak 3 to -1 = 4)
    const s = summarize([
      entry({ openedAt: 1, closedAt: 2, outcome: 'win', rMultiple: 1 }),
      entry({ openedAt: 3, closedAt: 4, outcome: 'win', rMultiple: 1 }),
      entry({ openedAt: 5, closedAt: 6, outcome: 'win', rMultiple: 1 }),
      entry({ openedAt: 7, closedAt: 8, outcome: 'loss', rMultiple: -2 }),
      entry({ openedAt: 9, closedAt: 10, outcome: 'loss', rMultiple: -2 }),
    ]);
    expect(s.maxDrawdown).toBeCloseTo(4);
  });

  it('tracks the longest win and loss streaks (breakevens do not reset)', () => {
    const s = summarize([
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'breakeven', rMultiple: 0 }),
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'loss', rMultiple: -1 }),
      entry({ outcome: 'loss', rMultiple: -1 }),
    ]);
    // Breakevens do not break a streak — the 2 wins + breakeven +
    // 3 wins form a single 5-win streak. The 2 consecutive losses
    // at the tail form the longest loss streak.
    expect(s.longestWinStreak).toBe(5);
    expect(s.longestLossStreak).toBe(2);
  });

  it('a loss does break a win streak', () => {
    const s = summarize([
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'loss', rMultiple: -1 }),
      entry({ outcome: 'win', rMultiple: 1 }),
    ]);
    expect(s.longestWinStreak).toBe(2);
  });

  it('computes profit factor as gross wins / |gross losses|', () => {
    const s = summarize([
      entry({ outcome: 'win', rMultiple: 2 }),
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'loss', rMultiple: -0.5 }),
    ]);
    // (2 + 1) / 0.5 = 6
    expect(s.profitFactor).toBeCloseTo(6);
  });

  it('returns null profit factor when there are wins but no losses', () => {
    const s = summarize([
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'win', rMultiple: 1 }),
    ]);
    expect(s.profitFactor).toBeNull();
  });

  it('returns null profit factor when nothing scored a measurable ratio', () => {
    const s = summarize([entry({ outcome: 'breakeven', rMultiple: 0 })]);
    // 0/0 is undefined, not a flat performance.
    expect(s.profitFactor).toBeNull();
  });

  it('computes avg hold time from closedAt - openedAt', () => {
    const s = summarize([
      entry({ openedAt: 0, closedAt: 60_000, outcome: 'win', rMultiple: 1 }),
      entry({ openedAt: 0, closedAt: 120_000, outcome: 'loss', rMultiple: -1 }),
    ]);
    expect(s.avgHoldMs).toBe(90_000);
  });

  it('groups entries by day of week (UTC) of closedAt', () => {
    // 2026-06-21 is a Sunday (UTC). 2026-06-15 is a Monday.
    // 2026-06-17 is a Wednesday.
    const sunday = Date.UTC(2026, 5, 21, 12, 0, 0); // Sun
    const monday = Date.UTC(2026, 5, 15, 12, 0, 0); // Mon
    const wednesday = Date.UTC(2026, 5, 17, 12, 0, 0); // Wed
    const s = summarize([
      entry({ openedAt: sunday, closedAt: sunday + 1, outcome: 'win', rMultiple: 1 }),
      entry({ openedAt: monday, closedAt: monday + 1, outcome: 'win', rMultiple: 1 }),
      entry({ openedAt: wednesday, closedAt: wednesday + 1, outcome: 'loss', rMultiple: -1 }),
    ]);
    expect(s.perDayOfWeek).toEqual({
      sunday: 1,
      monday: 1,
      tuesday: 0,
      wednesday: 1,
      thursday: 0,
      friday: 0,
      saturday: 0,
    });
  });

  it('open trades do not contribute to per-day-of-week counts', () => {
    const monday = Date.UTC(2026, 5, 15, 12, 0, 0);
    const s = summarize([
      entry({ openedAt: monday, closedAt: null, outcome: 'open', rMultiple: null }),
    ]);
    expect(s.perDayOfWeek?.monday).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tool boundary (R8)
// ---------------------------------------------------------------------------

interface RawBreakdownFixture {
  key: string;
  count: number;
  wins: number;
  closed: number;
  avg_r: number | null;
}

/** Fake Drizzle chain: coverage, then by-symbol, then by-tag (select order). */
function fakeDb(args: {
  coverage: { closed: number; with_r: number };
  symbolRows?: RawBreakdownFixture[];
  tagRows?: RawBreakdownFixture[];
}) {
  let selects = 0;
  return {
    select: () => {
      const index = selects;
      selects += 1;
      const rows =
        index === 0
          ? [args.coverage]
          : index === 1
            ? (args.symbolRows ?? [])
            : (args.tagRows ?? []);
      const chain = {
        from: () => chain,
        where: () => chain,
        groupBy: () => chain,
        orderBy: () => Promise.resolve(rows),
        then: (
          onFulfilled: ((value: unknown) => unknown) | null,
          onRejected?: ((reason: unknown) => unknown) | null,
        ) => Promise.resolve(rows).then(onFulfilled, onRejected),
      };
      return chain;
    },
  };
}

const exec = getJournalStatsTool.execute as unknown as (
  input: unknown,
  options: unknown,
) => Promise<GetJournalStatsOutput>;

function runTool(db: ReturnType<typeof fakeDb>): Promise<GetJournalStatsOutput> {
  return withToolContext(
    createToolContext({
      threadId: 'test-thread',
      userId: 'test-user',
      db: db as never,
    }),
    () => exec({}, {}),
  );
}

describe('get_journal_stats — unmeasured metrics are null, not 0 (R8)', () => {
  beforeEach(() => {
    mocks.computeStats.mockReset();
  });

  it('reports null, never 0, for every unmeasured metric in an empty window', async () => {
    // summarize() is the real one: an empty window has no measurement to
    // report, so the tool must not forward a single fabricated 0.
    mocks.computeStats.mockResolvedValue(summarize([]));
    const output = await runTool(
      fakeDb({
        coverage: { closed: 0, with_r: 0 },
        symbolRows: [{ key: 'EURUSD', count: 2, wins: 0, closed: 0, avg_r: null }],
      }),
    );

    expect(output.stats.count).toBe(0);
    expect(output.stats.winRate).toBeNull();
    expect(output.stats.avgR).toBeNull();
    expect(output.stats.totalR).toBeNull();
    // Deeper extended metrics were unmeasured too (R8 follow-up).
    expect(output.stats.maxDrawdown).toBeNull();
    expect(output.stats.avgWinR).toBeNull();
    expect(output.stats.avgLossR).toBeNull();
    expect(output.stats.recoveryFactor).toBeNull();
    expect(output.stats.avgHoldMs).toBeNull();
    expect(output.stats.profitFactor).toBeNull();
    expect(
      (output.stats.byDayOfWeek ?? []).every((d) => d.winRate === null && d.totalR === null),
    ).toBe(true);
    expect(output.bySymbol[0]).toMatchObject({
      key: 'EURUSD',
      count: 2,
      winRate: null,
      avgR: null,
    });
    expect(output.notes).toMatch(/null rather than 0/i);

    // No exact 0 survives where a measurement would be quoted, including the
    // extended metrics. Genuine counts (`trades: 0`) are excluded on purpose.
    const evidence = extractNumbersFromToolOutput({
      winRate: output.stats.winRate,
      avgR: output.stats.avgR,
      totalR: output.stats.totalR,
      maxDrawdown: output.stats.maxDrawdown,
      avgWinR: output.stats.avgWinR,
      avgLossR: output.stats.avgLossR,
      recoveryFactor: output.stats.recoveryFactor,
      avgHoldMs: output.stats.avgHoldMs,
      profitFactor: output.stats.profitFactor,
      byDayOfWeek: (output.stats.byDayOfWeek ?? []).map((d) => ({
        winRate: d.winRate,
        totalR: d.totalR,
      })),
      bySymbol: output.bySymbol,
    });
    expect(evidence).not.toContain(0);
    expect(GetJournalStatsOutputSchema.safeParse(output).success).toBe(true);
  });

  it('still returns real numbers when trades closed with R multiples', async () => {
    mocks.computeStats.mockResolvedValue(
      summarize([
        entry({ outcome: 'win', rMultiple: 2 }),
        entry({ outcome: 'loss', rMultiple: -1 }),
      ]),
    );
    const output = await runTool(
      fakeDb({
        coverage: { closed: 2, with_r: 2 },
        symbolRows: [{ key: 'XAUUSD', count: 2, wins: 1, closed: 2, avg_r: 0.5 }],
        tagRows: [{ key: 'momentum', count: 2, wins: 1, closed: 2, avg_r: 0.5 }],
      }),
    );

    expect(output.stats.winRate).toBeCloseTo(0.5);
    expect(output.stats.avgR).toBeCloseTo(0.5);
    expect(output.stats.totalR).toBeCloseTo(1);
    expect(output.bySymbol[0]?.winRate).toBeCloseTo(0.5);
    expect(output.bySymbol[0]?.avgR).toBeCloseTo(0.5);
    expect(output.byTag[0]?.avgR).toBeCloseTo(0.5);
    expect(output.notes).toBeUndefined();
  });

  it('parses previously persisted outputs, whether zeros or nulls', () => {
    // Pre-R8 output: measured metrics persisted as fabricated zeros.
    const zeros = {
      stats: {
        count: 0,
        wins: 0,
        losses: 0,
        breakevens: 0,
        open: 0,
        winRate: 0,
        avgR: 0,
        totalR: 0,
        maxDrawdown: 0,
        profitFactor: 0,
        avgHoldMs: 0,
        avgWinR: 0,
        avgLossR: 0,
        recoveryFactor: 0,
        bySymbol: [{ symbol: 'EURUSD', trades: 0, winRate: 0, totalR: 0, expectancy: 0 }],
        byDayOfWeek: [{ day: 'Monday', trades: 0, winRate: 0, totalR: 0 }],
      },
      bySymbol: [{ key: 'EURUSD', count: 1, winRate: 0, avgR: 0 }],
      byTag: [],
    };
    expect(GetJournalStatsOutputSchema.safeParse(zeros).success).toBe(true);

    // Pre-Phase-B output: the extended fields are absent entirely.
    const preExtended = {
      stats: {
        count: 0,
        wins: 0,
        losses: 0,
        breakevens: 0,
        open: 0,
        winRate: 0,
        avgR: 0,
        totalR: 0,
      },
      bySymbol: [],
      byTag: [],
    };
    expect(GetJournalStatsOutputSchema.safeParse(preExtended).success).toBe(true);

    // Current output: unmeasured metrics are null.
    const nulls = {
      stats: summarize([]),
      bySymbol: [{ key: 'EURUSD', count: 1, winRate: null, avgR: null }],
      byTag: [],
    };
    expect(GetJournalStatsOutputSchema.safeParse(nulls).success).toBe(true);
  });
});
