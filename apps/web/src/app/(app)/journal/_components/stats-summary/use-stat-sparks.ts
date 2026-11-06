// SPDX-License-Identifier: Apache-2.0

// Rolling sparkline series (trades per day, win-rate, avg R, cumulative R)
// derived from the most recent closed journal entries.
import type { JournalEntry } from '@kestrel/shared';
import { useMemo } from 'react';

export interface StatSparks {
  trades: number[];
  winRate: number[];
  avgR: number[];
  cumR: number[];
}

export function useStatSparks(entries: readonly JournalEntry[]): StatSparks {
  // Sort chronologically (oldest → newest) and take the most recent 20 closed trades.
  const closedSpark = useMemo(() => {
    return [...entries]
      .filter(
        (e): e is JournalEntry & { rMultiple: number } =>
          e.rMultiple !== null && e.rMultiple !== undefined && e.outcome !== 'open',
      )
      .sort((a, b) => (a.closedAt ?? a.openedAt) - (b.closedAt ?? b.openedAt))
      .slice(-20);
  }, [entries]);

  const cumR = useMemo(() => {
    let cumulative = 0;
    const res: number[] = [];
    for (const e of closedSpark) {
      cumulative += e.rMultiple;
      res.push(cumulative);
    }
    return res;
  }, [closedSpark]);

  // Win-rate rolling window sparkline
  const winRateSpark = useMemo(() => {
    const res: number[] = [];
    for (let i = 1; i <= closedSpark.length; i += 1) {
      const slice = closedSpark.slice(0, i);
      const wins = slice.filter((e) => e.rMultiple > 0).length;
      res.push((wins / slice.length) * 100);
    }
    return res;
  }, [closedSpark]);

  // Daily trade count across recent active trading days (instead of a synthetic 1..N index)
  const tradesSpark = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const e of closedSpark) {
      const ts = e.closedAt ?? e.openedAt;
      const day = new Date(ts).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    return [...byDay.values()];
  }, [closedSpark]);

  const avgRSpark = useMemo(() => closedSpark.map((e) => e.rMultiple), [closedSpark]);

  return { trades: tradesSpark, winRate: winRateSpark, avgR: avgRSpark, cumR };
}
