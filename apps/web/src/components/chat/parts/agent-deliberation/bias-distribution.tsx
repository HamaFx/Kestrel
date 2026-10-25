// SPDX-License-Identifier: Apache-2.0

'use client';

// Segmented bull/bear/neutral distribution bars for the settled verdict.
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

export function BiasDistribution({
  counts,
  total,
}: {
  counts: { bullish: number; bearish: number; neutral: number };
  total: number;
}) {
  const rows: Array<{ label: string; count: number; bar: string }> = [
    { label: 'Bull', count: counts.bullish, bar: 'bg-bull' },
    { label: 'Bear', count: counts.bearish, bar: 'bg-bear' },
    { label: 'Neutral', count: counts.neutral, bar: 'bg-fg-muted' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      {rows.map((r) => {
        const pct = total > 0 ? (r.count / total) * 100 : 0;
        return (
          <div key={r.label} className="flex items-center gap-1.5">
            <span className="text-fg-subtle text-xs">{r.label}</span>
            <div className="bg-bg-elev-3 h-1.5 w-12 overflow-hidden rounded-sm">
              <m.div
                className={cn('h-full rounded-sm', r.bar)}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              />
            </div>
            <span className="text-fg-muted font-mono text-xs tabular-nums">{r.count}</span>
          </div>
        );
      })}
    </div>
  );
}
