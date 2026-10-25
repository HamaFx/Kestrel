// SPDX-License-Identifier: Apache-2.0

// Day-bucket data shapes and local-time day keys for the P&L calendar heatmap.
import type { JournalEntry } from '@kestrel/shared';

export interface DayBucket {
  /** YYYY-MM-DD in local time. */
  key: string;
  /** Day-of-month (1..31). */
  day: number;
  /** Sum of rMultiple for trades closed on this day (closed only). */
  totalR: number;
  /** Number of trades closed on this day. */
  count: number;
  /** The original entries — for the click-through drawer. */
  entries: JournalEntry[];
}

/** A single visible month: its label plus padded 7-column week rows. */
export interface HeatmapMonthData {
  label: string;
  weeks: Array<Array<DayBucket | null>>;
}

/** YYYY-MM-DD in local time. Avoids UTC drift confusing the user. */
export function localDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
