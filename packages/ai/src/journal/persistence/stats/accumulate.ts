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

// Single-pass accumulator behind `summarize`: walks closed trades in time
// order and records every counter, streak, grouping, and distribution bucket.

import type { JournalEntry } from '@kestrel/shared';

export const DOW_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

type Group = { trades: number; wins: number; totalR: number };

export interface StatsAccumulator {
  wins: number;
  losses: number;
  breakevens: number;
  open: number;
  totalR: number;
  countWithR: number;
  // Phase B — UX_UPGRADE_PLAN.md item 13.
  // Trackers for the extended metrics.
  sumWinningR: number;
  sumLosingR: number;
  longestWinStreak: number;
  longestLossStreak: number;
  currentStreak: 'win' | 'loss' | null;
  currentStreakLen: number;
  totalHoldMs: number;
  holdCount: number;
  // Per-day-of-week: count entries whose closedAt falls on each
  // weekday. Sunday = 0 in JS Date.getDay(). We use closedAt when
  // available, otherwise fall back to openedAt so the chart still
  // has data for trades that are still open.
  perDow: {
    sunday: number;
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
  };
  // Max drawdown: walk entries in time order, accumulate a peak,
  // track the largest (peak − current) drop.
  cumulativeR: number;
  peakR: number;
  maxDrawdown: number;
  // Phase 2 — rich analytics accumulators.
  bySymbolMap: Map<string, Group>;
  byHourMap: Map<number, Group>;
  byDowMap: Map<string, Group>;
  byTagMap: Map<string, Group>;
  rDistributionBuckets: Array<{ bucket: string; min: number; max: number; count: number }>;
}

/**
 * Extended-metric trackers are initialised to safe defaults so the legacy
 * return shape (without the optional fields) is preserved when entries is
 * empty.
 */
export function createStatsAccumulator(): StatsAccumulator {
  return {
    wins: 0,
    losses: 0,
    breakevens: 0,
    open: 0,
    totalR: 0,
    countWithR: 0,
    sumWinningR: 0,
    sumLosingR: 0,
    longestWinStreak: 0,
    longestLossStreak: 0,
    currentStreak: null,
    currentStreakLen: 0,
    totalHoldMs: 0,
    holdCount: 0,
    perDow: {
      sunday: 0,
      monday: 0,
      tuesday: 0,
      wednesday: 0,
      thursday: 0,
      friday: 0,
      saturday: 0,
    },
    cumulativeR: 0,
    peakR: 0,
    maxDrawdown: 0,
    bySymbolMap: new Map(),
    byHourMap: new Map(),
    byDowMap: new Map(),
    byTagMap: new Map(),
    rDistributionBuckets: [
      { bucket: '[-3,-2)', min: -3, max: -2, count: 0 },
      { bucket: '[-2,-1)', min: -2, max: -1, count: 0 },
      { bucket: '[-1,0)', min: -1, max: 0, count: 0 },
      { bucket: '[0,0]', min: 0, max: 0, count: 0 },
      { bucket: '(0,1]', min: 0, max: 1, count: 0 },
      { bucket: '(1,2]', min: 1, max: 2, count: 0 },
      { bucket: '(2,3]', min: 2, max: 3, count: 0 },
      { bucket: '[3+]', min: 3, max: Infinity, count: 0 },
    ],
  };
}

export function sessionFromHour(hour: number): string {
  if (hour >= 0 && hour < 8) return 'Asian';
  if (hour >= 8 && hour < 16) return 'London';
  if (hour >= 13 && hour < 21) return 'NY';
  return 'Off';
}

function addToBucket(acc: StatsAccumulator, r: number) {
  for (const b of acc.rDistributionBuckets) {
    if (b.bucket === '[0,0]') {
      if (r === 0) {
        b.count += 1;
        return;
      }
      continue;
    }
    if (b.bucket === '[3+]') {
      if (r >= b.min) {
        b.count += 1;
        return;
      }
      continue;
    }
    if (r >= b.min && r < b.max) {
      b.count += 1;
      return;
    }
  }
}

/** Fold one entry (already walked in openedAt order) into the accumulator. */
export function accumulateEntry(acc: StatsAccumulator, e: JournalEntry): void {
  if (e.outcome === 'open') {
    acc.open += 1;
    return;
  }

  // Symbol / hour / day-of-week / tag grouping uses openedAt.
  const openedHour = new Date(e.openedAt).getUTCHours();
  const openedDow = new Date(e.openedAt).getUTCDay();
  const dowKey = DOW_KEYS[openedDow] ?? 'sunday';

  const symbolGroup = acc.bySymbolMap.get(e.symbol) ?? { trades: 0, wins: 0, totalR: 0 };
  symbolGroup.trades += 1;
  if (e.outcome === 'win') symbolGroup.wins += 1;
  if (e.rMultiple !== null) symbolGroup.totalR += e.rMultiple;
  acc.bySymbolMap.set(e.symbol, symbolGroup);

  const hourGroup = acc.byHourMap.get(openedHour) ?? { trades: 0, wins: 0, totalR: 0 };
  hourGroup.trades += 1;
  if (e.outcome === 'win') hourGroup.wins += 1;
  if (e.rMultiple !== null) hourGroup.totalR += e.rMultiple;
  acc.byHourMap.set(openedHour, hourGroup);

  const dowGroup = acc.byDowMap.get(dowKey) ?? { trades: 0, wins: 0, totalR: 0 };
  dowGroup.trades += 1;
  if (e.outcome === 'win') dowGroup.wins += 1;
  if (e.rMultiple !== null) dowGroup.totalR += e.rMultiple;
  acc.byDowMap.set(dowKey, dowGroup);

  for (const tag of e.tags ?? []) {
    const tagGroup = acc.byTagMap.get(tag) ?? { trades: 0, wins: 0, totalR: 0 };
    tagGroup.trades += 1;
    if (e.outcome === 'win') tagGroup.wins += 1;
    if (e.rMultiple !== null) tagGroup.totalR += e.rMultiple;
    acc.byTagMap.set(tag, tagGroup);
  }

  if (e.outcome === 'win') {
    acc.wins += 1;
    if (e.rMultiple !== null) acc.sumWinningR += e.rMultiple;
    if (acc.currentStreak === 'win') {
      acc.currentStreakLen += 1;
    } else {
      acc.currentStreak = 'win';
      acc.currentStreakLen = 1;
    }
    if (acc.currentStreakLen > acc.longestWinStreak) acc.longestWinStreak = acc.currentStreakLen;
  } else if (e.outcome === 'loss') {
    acc.losses += 1;
    if (e.rMultiple !== null) acc.sumLosingR += e.rMultiple;
    if (acc.currentStreak === 'loss') {
      acc.currentStreakLen += 1;
    } else {
      acc.currentStreak = 'loss';
      acc.currentStreakLen = 1;
    }
    if (acc.currentStreakLen > acc.longestLossStreak) acc.longestLossStreak = acc.currentStreakLen;
  } else {
    acc.breakevens += 1;
    // A breakeven doesn't extend a streak in either direction.
    // It also doesn't reset — win/loss streaks continue across
    // breakevens, matching how traders typically think about it.
  }
  if (e.rMultiple !== null) {
    acc.totalR += e.rMultiple;
    acc.countWithR += 1;
    addToBucket(acc, e.rMultiple);

    acc.cumulativeR += e.rMultiple;
    if (acc.cumulativeR > acc.peakR) acc.peakR = acc.cumulativeR;
    const dd = acc.peakR - acc.cumulativeR;
    if (dd > acc.maxDrawdown) acc.maxDrawdown = dd;
  }
  if (e.closedAt !== null) {
    acc.totalHoldMs += e.closedAt - e.openedAt;
    acc.holdCount += 1;
    const d = new Date(e.closedAt);
    const dow = d.getUTCDay();
    switch (dow) {
      case 0:
        acc.perDow.sunday += 1;
        break;
      case 1:
        acc.perDow.monday += 1;
        break;
      case 2:
        acc.perDow.tuesday += 1;
        break;
      case 3:
        acc.perDow.wednesday += 1;
        break;
      case 4:
        acc.perDow.thursday += 1;
        break;
      case 5:
        acc.perDow.friday += 1;
        break;
      case 6:
        acc.perDow.saturday += 1;
        break;
    }
  }
}
