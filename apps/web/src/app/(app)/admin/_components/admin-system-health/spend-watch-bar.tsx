'use client';

// SPDX-License-Identifier: Apache-2.0

// Daily spend watch aggregate gauge.
import { IconAlertTriangle, IconWallet } from '@tabler/icons-react';

import { RingGauge } from '@/components/ui/ring-gauge';
import { cn } from '@/lib/formatters/cn';
import type { SpendWatchSummary } from '@/lib/services/admin-dtos';

/**
 * §5.3 (Q4) — daily spend watch aggregate. Alerts are informational only:
 * per the owner's Q4 decision the daily ledger is never capped and a
 * threshold crossing never blocks a turn.
 */
export function SpendWatchBar({ watch }: { watch: SpendWatchSummary }) {
  const over = watch.usersOverThreshold > 0;
  const threshold = `$${watch.thresholdUsd % 1 === 0 ? watch.thresholdUsd.toFixed(0) : watch.thresholdUsd.toFixed(2)}`;
  const count = `${watch.usersOverThreshold} ${watch.usersOverThreshold === 1 ? 'user has' : 'users have'}`;
  const top = watch.overThreshold[0];
  const topPct =
    top && watch.thresholdUsd > 0 ? Math.min(100, (top.spendUsd / watch.thresholdUsd) * 100) : 0;

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4',
        over ? 'border-warn/25 bg-warn/5' : 'border-border bg-bg-elev-1',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {over ? (
            <IconAlertTriangle className="text-warn size-4 shrink-0" aria-hidden="true" />
          ) : (
            <IconWallet className="text-fg-subtle size-4 shrink-0" aria-hidden="true" />
          )}
          <h3 className={cn('text-sm font-semibold', over ? 'text-warn' : 'text-fg')}>
            Daily Spend Watch
          </h3>
        </div>

        <div className="flex flex-col items-end gap-0.5">
          <RingGauge
            value={topPct}
            tone={over ? 'danger' : 'brand'}
            size={72}
            showLabel={false}
            label="top user spend"
          />
          <span className="text-fg-subtle font-mono text-[9px] tracking-wider uppercase">
            Top user
          </span>
        </div>
      </div>

      <p className="text-fg-subtle text-xs">
        {over
          ? `${count} reached the ${threshold} per-user daily spend threshold today (UTC ledger).${top ? ` Top user: $${top.spendUsd.toFixed(2)}.` : ''}`
          : `No user has reached the ${threshold} per-user daily spend threshold today (UTC ledger).`}{' '}
        Informational only — spend is never capped (Q4).
      </p>
    </div>
  );
}
