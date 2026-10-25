'use client';

// SPDX-License-Identifier: Apache-2.0

// Impact badge: importance glyph + currency/country chip in the meta strip.
import type { EventImportance } from './event-importance';

export function ImpactBadge({
  importance,
  children,
}: {
  importance: EventImportance;
  children: React.ReactNode;
}) {
  return (
    <span
      className="text-fg font-bold uppercase tabular-nums"
      title={importance.label}
      aria-label={importance.label}
    >
      <span aria-hidden className="mr-1">
        {importance.glyph}
      </span>
      {children}
    </span>
  );
}
