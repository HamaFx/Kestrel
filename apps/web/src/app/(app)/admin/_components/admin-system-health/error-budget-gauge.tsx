'use client';

// SPDX-License-Identifier: Apache-2.0

// Error budget gauge — how much error budget remains.
import { IconMinus } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';

/**
 * Error budget gauge — shows how much error budget remains.
 * Green (>50%), Yellow (10-50%), Red (<10% or exhausted).
 */
export function ErrorBudgetGauge({ budget }: { budget: number | null }) {
  if (budget === null) {
    return (
      <span className="text-fg-subtle text-xs" aria-label="No data available">
        <IconMinus className="inline size-3" aria-hidden="true" /> N/A
      </span>
    );
  }

  const pct = Math.round(budget * 100);
  const color = pct > 50 ? 'text-success' : pct > 10 ? 'text-warn' : 'text-danger';
  const barColor = pct > 50 ? 'bg-success' : pct > 10 ? 'bg-warn' : 'bg-danger';

  return (
    <div className="flex items-center gap-2" aria-label={`Error budget: ${pct}% remaining`}>
      <div className="bg-bg-elev-3 h-2 w-16 overflow-hidden rounded-full">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <span className={cn('font-mono text-xs font-bold', color)}>{pct}%</span>
    </div>
  );
}
