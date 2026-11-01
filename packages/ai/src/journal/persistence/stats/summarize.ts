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

// Journal stats assembly: fold the entries through the accumulator, then
// derive the win-rate / streak / grouping / distribution contract.
//
// R8 (audit 2026-10-31): every derived metric is a *measurement*. When the
// window holds nothing to measure (no closed trade, no R multiple, no closed
// holding period) it is null, never 0 — a 0 reads as a measured "flat"
// result, and the chat's numeric evidence gate accepts it as fact. Counts
// (`count`, `wins`, `perDayOfWeek`, `rDistribution`) stay real integers
// because counting is itself a measurement.

import type { JournalEntry, JournalStats } from '@kestrel/shared';

import { accumulateEntry, createStatsAccumulator, DOW_KEYS, sessionFromHour } from './accumulate';

type Measured = number | null;

/**
 * `JournalStats` with every measured value nullable. Null means "nothing in
 * the window was available to measure", not "zero": consumers must render
 * absence rather than a number. Counts remain plain numbers.
 */
export type JournalStatsSummary = Omit<
  JournalStats,
  | 'winRate'
  | 'avgR'
  | 'totalR'
  | 'maxDrawdown'
  | 'avgWinR'
  | 'avgLossR'
  | 'recoveryFactor'
  | 'avgHoldMs'
  | 'profitFactor'
  | 'bySymbol'
  | 'bySession'
  | 'byHour'
  | 'byDayOfWeek'
  | 'byTag'
> & {
  winRate: Measured;
  avgR: Measured;
  totalR: Measured;
  maxDrawdown: Measured;
  avgWinR: Measured;
  avgLossR: Measured;
  recoveryFactor: Measured;
  avgHoldMs: Measured;
  profitFactor: Measured;
  bySymbol: Array<{
    symbol: string;
    trades: number;
    winRate: Measured;
    totalR: Measured;
    expectancy: Measured;
  }>;
  bySession: Array<{ session: string; trades: number; winRate: Measured; totalR: Measured }>;
  byHour: Array<{ hour: number; trades: number; winRate: Measured; totalR: Measured }>;
  byDayOfWeek: Array<{ day: string; trades: number; winRate: Measured; totalR: Measured }>;
  byTag: Array<{
    tag: string;
    trades: number;
    winRate: Measured;
    totalR: Measured;
    expectancy: Measured;
  }>;
};

/** Descending by total R, with the unmeasured (null) buckets last. */
function byTotalRDesc(a: { totalR: Measured }, b: { totalR: Measured }): number {
  if (a.totalR === null && b.totalR === null) return 0;
  if (b.totalR === null) return -1;
  if (a.totalR === null) return 1;
  return b.totalR - a.totalR;
}

export function summarize(entries: JournalEntry[]): JournalStatsSummary {
  const acc = createStatsAccumulator();
  const ordered = [...entries].sort((a, b) => a.openedAt - b.openedAt);
  for (const e of ordered) accumulateEntry(acc, e);

  const closed = acc.wins + acc.losses + acc.breakevens;
  const winRate: Measured = closed === 0 ? null : acc.wins / closed;
  const avgR: Measured = acc.countWithR === 0 ? null : acc.totalR / acc.countWithR;
  const totalR: Measured = acc.countWithR === 0 ? null : acc.totalR;
  const avgHoldMs: Measured = acc.holdCount === 0 ? null : acc.totalHoldMs / acc.holdCount;
  // Profit factor: gross wins / |gross losses| over scored trades. Both
  // sides must be measured: no scored win means the numerator is unknown
  // (not 0), and a zero gross loss makes the ratio infinite. A measured win
  // at exactly 0R is a real numerator of 0.
  const profitFactor: Measured =
    acc.winsWithR === 0 || acc.lossesWithR === 0 || acc.sumLosingR === 0
      ? null
      : acc.sumWinningR / Math.abs(acc.sumLosingR);

  // R8: a win/loss average needs at least one *scored* win/loss. Wins without
  // an R multiple must not pull the average toward 0.
  const avgWinR: Measured = acc.winsWithR === 0 ? null : acc.sumWinningR / acc.winsWithR;
  const avgLossR: Measured = acc.lossesWithR === 0 ? null : acc.sumLosingR / acc.lossesWithR;
  const maxDrawdown: Measured = acc.countWithR === 0 ? null : acc.maxDrawdown;
  const recoveryFactor: Measured =
    totalR === null || maxDrawdown === null || maxDrawdown === 0 ? null : totalR / maxDrawdown;

  // Current streak: if no closed trades, none. Otherwise reflect the
  // active streak at the end of the ordered walk.
  const currentStreakOut: JournalStats['currentStreak'] =
    closed === 0
      ? { type: 'none', count: 0 }
      : acc.currentStreak === null
        ? { type: 'none', count: 0 }
        : { type: acc.currentStreak, count: acc.currentStreakLen };

  // Build by-session from by-hour.
  const sessionGroups = new Map<
    string,
    { trades: number; wins: number; withR: number; totalR: number }
  >();
  for (const [hour, group] of acc.byHourMap) {
    const session = sessionFromHour(hour);
    const existing = sessionGroups.get(session) ?? { trades: 0, wins: 0, withR: 0, totalR: 0 };
    existing.trades += group.trades;
    existing.wins += group.wins;
    existing.withR += group.withR;
    existing.totalR += group.totalR;
    sessionGroups.set(session, existing);
  }

  const bySymbol = Array.from(acc.bySymbolMap.entries())
    .map(([symbol, g]) => ({
      symbol,
      trades: g.trades,
      // The bucket only exists for trades that closed, so this is a real
      // win rate; the guard keeps the unmeasured case explicit.
      winRate: g.trades === 0 ? null : g.wins / g.trades,
      // R totals are only meaningful over trades that carry an R multiple.
      totalR: g.withR === 0 ? null : g.totalR,
      expectancy: g.withR === 0 ? null : g.totalR / g.withR,
    }))
    .sort(byTotalRDesc);

  const bySession = Array.from(sessionGroups.entries())
    .map(([session, g]) => ({
      session,
      trades: g.trades,
      winRate: g.trades === 0 ? null : g.wins / g.trades,
      totalR: g.withR === 0 ? null : g.totalR,
    }))
    .sort(byTotalRDesc);

  const byHour = Array.from(acc.byHourMap.entries())
    .map(([hour, g]) => ({
      hour,
      trades: g.trades,
      winRate: g.trades === 0 ? null : g.wins / g.trades,
      totalR: g.withR === 0 ? null : g.totalR,
    }))
    .sort((a, b) => a.hour - b.hour);

  // Every weekday stays present so the seven-bar chart keeps its shape, but a
  // day with no closed trades reports null, not a fabricated 0% win rate.
  const byDayOfWeek = DOW_KEYS.map((day) => {
    const g = acc.byDowMap.get(day) ?? { trades: 0, wins: 0, withR: 0, totalR: 0 };
    return {
      day: day.charAt(0).toUpperCase() + day.slice(1),
      trades: g.trades,
      winRate: g.trades === 0 ? null : g.wins / g.trades,
      totalR: g.withR === 0 ? null : g.totalR,
    };
  });

  const byTag = Array.from(acc.byTagMap.entries())
    .map(([tag, g]) => ({
      tag,
      trades: g.trades,
      winRate: g.trades === 0 ? null : g.wins / g.trades,
      totalR: g.withR === 0 ? null : g.totalR,
      expectancy: g.withR === 0 ? null : g.totalR / g.withR,
    }))
    .sort(byTotalRDesc);

  return {
    count: entries.length,
    wins: acc.wins,
    losses: acc.losses,
    breakevens: acc.breakevens,
    open: acc.open,
    winRate,
    avgR,
    totalR,
    maxDrawdown,
    longestWinStreak: acc.longestWinStreak,
    longestLossStreak: acc.longestLossStreak,
    profitFactor,
    avgHoldMs,
    perDayOfWeek: acc.perDow,
    // Phase 2 — rich analytics suite.
    avgWinR,
    avgLossR,
    maxWinStreak: acc.longestWinStreak,
    maxLossStreak: acc.longestLossStreak,
    currentStreak: currentStreakOut,
    recoveryFactor,
    rDistribution: acc.rDistributionBuckets.map((b) => ({ bucket: b.bucket, count: b.count })),
    bySymbol,
    bySession,
    byHour,
    byDayOfWeek,
    byTag,
  };
}
