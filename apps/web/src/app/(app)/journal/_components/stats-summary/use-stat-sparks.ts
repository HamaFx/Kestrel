// SPDX-License-Identifier: Apache-2.0

// Rolling sparkline series (trades, win-rate, avg R, cumulative R) derived
// from the most recent closed journal entries.
import type { JournalEntry } from '@kestrel/shared';
import { useMemo } from 'react';

export interface StatSparks {
  trades: number[];
  winRate: number[];
  avgR: number[];
  cumR: number[];
}

export function useStatSparks(entries: readonly JournalEntry[]): StatSparks {
  // Sparkline values: rolling cumulative R-multiple over the last 20 closed entries.
  const closedSpark = useMemo(() => {
    return entries
      .filter(
        (e): e is JournalEntry & { rMultiple: number } =>
          e.rMultiple !== null && e.rMultiple !== undefined,
      )
      .slice(0, 20)
      .reverse();
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

  const tradesSpark = useMemo(() => closedSpark.map((_, i) => i + 1), [closedSpark]);
  const avgRSpark = useMemo(() => closedSpark.map((e) => e.rMultiple), [closedSpark]);

  return { trades: tradesSpark, winRate: winRateSpark, avgR: avgRSpark, cumR };
}
