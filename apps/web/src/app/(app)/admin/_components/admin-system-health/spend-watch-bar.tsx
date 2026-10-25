'use client';

// SPDX-License-Identifier: Apache-2.0

// Daily spend watch aggregate bar.
import { IconAlertTriangle, IconWallet } from '@tabler/icons-react';

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

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-sm border p-4 sm:flex-row sm:items-center sm:justify-between',
        over ? 'border-warn/25 bg-warn/5' : 'border-border bg-bg-elev-1',
      )}
    >
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
      <p className="text-fg-subtle text-xs">
        {over
          ? `${count} reached the ${threshold} per-user daily spend threshold today (UTC ledger).`
          : `No user has reached the ${threshold} per-user daily spend threshold today (UTC ledger).`}{' '}
        Informational only — spend is never capped (Q4).
      </p>
    </div>
  );
}
