// SPDX-License-Identifier: Apache-2.0
// Importance metadata (accent ribbon + label + glyph) for calendar events.

import type { EconomicEvent } from '@kestrel/shared';

export const IMPORTANCE = {
  high: {
    ribbon: 'var(--color-danger)',
    label: 'High impact',
    glyph: '▲',
  },
  medium: {
    ribbon: 'var(--color-warn)',
    label: 'Medium impact',
    glyph: '■',
  },
  low: {
    ribbon: 'transparent',
    label: 'Low impact',
    glyph: '•',
  },
} as const satisfies Record<
  EconomicEvent['importance'],
  { ribbon: string; label: string; glyph: string }
>;

export type EventImportance = (typeof IMPORTANCE)[EconomicEvent['importance']];
