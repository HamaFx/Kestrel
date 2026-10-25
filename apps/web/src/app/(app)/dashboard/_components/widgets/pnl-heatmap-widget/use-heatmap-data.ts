// SPDX-License-Identifier: Apache-2.0

// Heatmap windowing: closes grouped per local day, the two visible month
// grids, the selected-day drawer anchor, and window totals.
import type { JournalEntry } from '@kestrel/shared';
import { useMemo, useState } from 'react';

import { localDayKey, type DayBucket, type HeatmapMonthData } from './heatmap-days';

export function useHeatmapData(entries: readonly JournalEntry[]) {
  // The heatmap shows two months — the previous and the current one —
  // so users can compare. Anchor state is the first day of the *older*
  // month being displayed.
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d;
  });

  // Selected day → opens the Drawer with that day's trades.
  const [selectedDay, setSelectedDay] = useState<DayBucket | null>(null);

  // Group closed entries by local day.
  const bucketsByKey = useMemo(() => {
    const map = new Map<string, DayBucket>();
    for (const e of entries) {
      if (e.outcome === 'open') continue;
      if (!e.closedAt) continue;
      const key = localDayKey(e.closedAt);
      const existing = map.get(key);
      if (existing) {
        existing.totalR += e.rMultiple ?? 0;
        existing.count += 1;
        existing.entries.push(e);
      } else {
        map.set(key, {
          key,
          day: new Date(e.closedAt).getDate(),
          totalR: e.rMultiple ?? 0,
          count: 1,
          entries: [e],
        });
      }
    }
    return map;
  }, [entries]);

  // Build two stacked 6×7 calendar grids (current + previous month).
  const months = useMemo(() => {
    const result: HeatmapMonthData[] = [];
    for (let m = 0; m < 2; m++) {
      const ref = new Date(anchor);
      ref.setMonth(anchor.getMonth() + m);
      const year = ref.getFullYear();
      const month = ref.getMonth();
      const firstOfMonth = new Date(year, month, 1);
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      // ISO weekday: Mon=0 … Sun=6.
      const firstDow = (firstOfMonth.getDay() + 6) % 7;

      const cells: Array<DayBucket | null> = [];
      // Leading blanks
      for (let i = 0; i < firstDow; i++) cells.push(null);
      // Day cells
      for (let d = 1; d <= daysInMonth; d++) {
        const ts = new Date(year, month, d).getTime();
        const key = localDayKey(ts);
        cells.push(bucketsByKey.get(key) ?? null);
      }
      // Pad to multiple of 7
      while (cells.length % 7 !== 0) cells.push(null);

      const weeks: Array<Array<DayBucket | null>> = [];
      for (let i = 0; i < cells.length; i += 7) {
        weeks.push(cells.slice(i, i + 7));
      }

      result.push({
        label: ref.toLocaleString(undefined, { month: 'long', year: 'numeric' }),
        weeks,
      });
    }
    return result;
  }, [anchor, bucketsByKey]);

  // Summary stats for the visible window only — matches what the user sees.
  const totals = useMemo(() => {
    let r = 0;
    let count = 0;
    for (const [, b] of bucketsByKey) {
      // Only include buckets within the two visible months.
      const visible = months.some((m) => m.weeks.flat().some((cell) => cell?.key === b.key));
      if (!visible) continue;
      r += b.totalR;
      count += b.count;
    }
    return { r, count };
  }, [bucketsByKey, months]);

  function shiftMonth(delta: number) {
    setAnchor((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + delta);
      return next;
    });
  }

  return { months, totals, selectedDay, setSelectedDay, shiftMonth };
}
