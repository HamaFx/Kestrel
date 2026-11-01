// SPDX-License-Identifier: Apache-2.0

// Small formatters/guards shared by the journal stats-summary sections.

import type { JournalStatsWithNulls } from '@kestrel/shared';

/**
 * Phase B — UX_UPGRADE_PLAN.md item 13.
 * The extended tiles only render when the server actually measured something
 * for them. Null (or absent) values mean "nothing closed to measure" — R8
 * (audit 2026-10-31) — so they are not shown as zeros.
 */
export function hasExtendedStats(stats: JournalStatsWithNulls): boolean {
  return (
    stats.maxDrawdown != null ||
    stats.avgHoldMs != null ||
    (stats.perDayOfWeek != null && Object.values(stats.perDayOfWeek).some((n) => n > 0))
  );
}

export function formatHoldTime(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h`;
  const day = Math.round(hr / 24);
  return `${day}d`;
}
