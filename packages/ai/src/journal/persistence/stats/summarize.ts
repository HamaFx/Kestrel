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

import type { JournalEntry, JournalStats } from '@kestrel/shared';

import { accumulateEntry, createStatsAccumulator, DOW_KEYS, sessionFromHour } from './accumulate';

export function summarize(entries: JournalEntry[]): JournalStats {
  const acc = createStatsAccumulator();
  const ordered = [...entries].sort((a, b) => a.openedAt - b.openedAt);
  for (const e of ordered) accumulateEntry(acc, e);

  const closed = acc.wins + acc.losses + acc.breakevens;
  const winRate = closed === 0 ? 0 : acc.wins / closed;
  const avgR = acc.countWithR === 0 ? 0 : acc.totalR / acc.countWithR;
  const avgHoldMs = acc.holdCount === 0 ? 0 : acc.totalHoldMs / acc.holdCount;
  // Profit factor: gross wins / |gross losses|. Return null when
  // there are no losses (Infinity is not meaningful in the UI).
  const profitFactor: number | null =
    acc.sumLosingR === 0
      ? acc.sumWinningR > 0
        ? null
        : 0
      : acc.sumWinningR / Math.abs(acc.sumLosingR);

  const avgWinR = acc.wins === 0 ? 0 : acc.sumWinningR / acc.wins;
  const avgLossR = acc.losses === 0 ? 0 : acc.sumLosingR / acc.losses;
  const recoveryFactor = acc.maxDrawdown === 0 ? 0 : acc.totalR / acc.maxDrawdown;

  // Current streak: if no closed trades, none. Otherwise reflect the
  // active streak at the end of the ordered walk.
  const currentStreakOut: JournalStats['currentStreak'] =
    closed === 0
      ? { type: 'none', count: 0 }
      : acc.currentStreak === null
        ? { type: 'none', count: 0 }
        : { type: acc.currentStreak, count: acc.currentStreakLen };

  // Build by-session from by-hour.
  const sessionGroups = new Map<string, { trades: number; wins: number; totalR: number }>();
  for (const [hour, group] of acc.byHourMap) {
    const session = sessionFromHour(hour);
    const existing = sessionGroups.get(session) ?? { trades: 0, wins: 0, totalR: 0 };
    existing.trades += group.trades;
    existing.wins += group.wins;
    existing.totalR += group.totalR;
    sessionGroups.set(session, existing);
  }

  const bySymbol = Array.from(acc.bySymbolMap.entries())
    .map(([symbol, g]) => ({
      symbol,
      trades: g.trades,
      winRate: g.trades === 0 ? 0 : g.wins / g.trades,
      totalR: g.totalR,
      expectancy: g.trades === 0 ? 0 : g.totalR / g.trades,
    }))
    .sort((a, b) => b.totalR - a.totalR);

  const bySession = Array.from(sessionGroups.entries())
    .map(([session, g]) => ({
      session,
      trades: g.trades,
      winRate: g.trades === 0 ? 0 : g.wins / g.trades,
      totalR: g.totalR,
    }))
    .sort((a, b) => b.totalR - a.totalR);

  const byHour = Array.from(acc.byHourMap.entries())
    .map(([hour, g]) => ({
      hour,
      trades: g.trades,
      winRate: g.trades === 0 ? 0 : g.wins / g.trades,
      totalR: g.totalR,
    }))
    .sort((a, b) => a.hour - b.hour);

  const byDayOfWeek = DOW_KEYS.map((day) => {
    const g = acc.byDowMap.get(day) ?? { trades: 0, wins: 0, totalR: 0 };
    return {
      day: day.charAt(0).toUpperCase() + day.slice(1),
      trades: g.trades,
      winRate: g.trades === 0 ? 0 : g.wins / g.trades,
      totalR: g.totalR,
    };
  });

  const byTag = Array.from(acc.byTagMap.entries())
    .map(([tag, g]) => ({
      tag,
      trades: g.trades,
      winRate: g.trades === 0 ? 0 : g.wins / g.trades,
      totalR: g.totalR,
      expectancy: g.trades === 0 ? 0 : g.totalR / g.trades,
    }))
    .sort((a, b) => b.totalR - a.totalR);

  return {
    count: entries.length,
    wins: acc.wins,
    losses: acc.losses,
    breakevens: acc.breakevens,
    open: acc.open,
    winRate,
    avgR,
    totalR: acc.totalR,
    maxDrawdown: acc.maxDrawdown,
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
