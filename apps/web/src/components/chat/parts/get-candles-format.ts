// SPDX-License-Identifier: Apache-2.0

// Formatting helpers for the `get_candles` tool part.

export function formatBarTime(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(ms);
  // Short locale time — date is implied by the bar context.
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
