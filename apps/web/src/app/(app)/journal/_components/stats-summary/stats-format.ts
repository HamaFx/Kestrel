// SPDX-License-Identifier: Apache-2.0

// Small formatters/guards shared by the journal stats-summary sections.

import type { JournalStats } from '@kestrel/shared';

/**
 * Phase B — UX_UPGRADE_PLAN.md item 13.
 * The extended stats are optional on the schema (for backward
 * compat with data persisted before item 13). We check for the
 * presence of the marker field so the new tiles only render when
 * the server actually computed them.
 */
export function hasExtendedStats(stats: JournalStats): boolean {
  return (
    stats.maxDrawdown !== undefined ||
    stats.longestWinStreak !== undefined ||
    stats.profitFactor !== undefined
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
