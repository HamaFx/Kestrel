// SPDX-License-Identifier: Apache-2.0
// Time formatting helpers for calendar event cards.

export function timeLabel(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}
