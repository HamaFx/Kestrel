'use client';

// SPDX-License-Identifier: Apache-2.0

// Step 2 of the pre-session ritual: hard stop on the day's drawdown budget.
// The slider shows the consequence immediately, and the gauge shows how much
// of today's cap the realised R has already consumed.
import { IconShieldCheck } from '@tabler/icons-react';

import { RingGauge } from '@/components/ui/ring-gauge';
import { cn } from '@/lib/formatters/cn';

const MIN_R = 0.5;
const MAX_R = 3;

export function RiskBudgetSection({
  maxDailyR,
  usedDailyR,
  onSelect,
}: {
  maxDailyR: number;
  usedDailyR: number;
  onSelect: (value: number) => void;
}) {
  const aboveDefault = maxDailyR > 1;
  const usedR = Math.max(0, -usedDailyR);
  const usedPct = maxDailyR > 0 ? Math.min(100, (usedR / maxDailyR) * 100) : 0;
  const tone = usedPct >= 100 ? 'danger' : usedPct >= 66 ? 'warn' : 'success';

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

      <div className="surface-well flex items-center gap-3 rounded-xl p-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2 font-mono">
            <span className="text-fg-subtle text-[10px] tracking-wider uppercase">
              Daily loss cap
            </span>
            <span
              className={cn(
                'text-sm font-bold tabular-nums',
                aboveDefault ? 'text-warn' : 'text-danger',
              )}
            >
              -{maxDailyR.toFixed(1)}R · ≈{maxDailyR.toFixed(1)}% account
            </span>
          </div>

          <input
            type="range"
            min={MIN_R}
            max={MAX_R}
            step={0.5}
            value={maxDailyR}
            aria-label="Max daily drawdown budget in R"
            aria-valuemin={MIN_R}
            aria-valuemax={MAX_R}
            aria-valuenow={maxDailyR}
            aria-valuetext={`${maxDailyR.toFixed(1)} R maximum daily loss`}
            onChange={(event) => onSelect(parseFloat(event.target.value))}
            className="accent-danger w-full cursor-pointer"
          />

          <div className="text-fg-subtle flex justify-between font-mono text-[9px] tabular-nums">
            <span>0.5R</span>
            <span className="text-brand">1.0R Aegis default</span>
            <span>3.0R</span>
          </div>

          <p
            className={cn(
              'text-[11px] leading-relaxed',
              aboveDefault ? 'text-warn' : 'text-fg-subtle',
            )}
          >
            {aboveDefault
              ? `Above the 1.0R Aegis default. A full stop day can cost about ${maxDailyR.toFixed(1)}% of the account.`
              : 'Within the 1.0R Aegis default. At the cap, stop trading for the day.'}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1">
          <RingGauge value={usedPct} size={64} tone={tone} showLabel={false} label="daily R used" />
          <span className="text-fg-muted font-mono text-[10px] font-semibold tabular-nums">
            {usedR.toFixed(2)}R
          </span>
          <span className="text-fg-subtle font-mono text-[8px] tracking-wider uppercase">
            of cap
          </span>
        </div>
      </div>
    </div>
  );
}
