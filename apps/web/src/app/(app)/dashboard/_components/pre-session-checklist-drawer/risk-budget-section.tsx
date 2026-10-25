'use client';

// SPDX-License-Identifier: Apache-2.0

// Step 2 of the pre-session ritual: hard stop on the day's drawdown budget.
import { IconShieldCheck } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';

export function RiskBudgetSection({
  maxDailyR,
  onSelect,
}: {
  maxDailyR: number;
  onSelect: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-caption text-fg-subtle flex items-center gap-1.5 font-semibold tracking-wider uppercase">
          <IconShieldCheck className="text-danger size-3.5" />
          2. Max Daily Drawdown Budget
        </span>
        <span className="text-danger font-mono text-xs font-bold tabular-nums">
          -{maxDailyR.toFixed(1)}R Hard Stop
        </span>
      </div>
      <p className="text-fg-subtle text-xs">
        If cumulative realized losses reach this limit today, stop trading immediately.
      </p>
      <div className="flex flex-wrap gap-2">
        {[1.0, 1.5, 2.0, 2.5, 3.0].map((r) => {
          const active = maxDailyR === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => onSelect(r)}
              className={cn(
                'rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold tabular-nums transition-all active:translate-y-[0.5px]',
                active
                  ? 'border-danger bg-danger/15 text-danger ring-danger font-bold ring-1'
                  : 'border-border bg-bg-elev-1 text-fg-subtle hover:text-fg',
              )}
            >
              {r.toFixed(1)}R Max
            </button>
          );
        })}
      </div>
    </div>
  );
}
