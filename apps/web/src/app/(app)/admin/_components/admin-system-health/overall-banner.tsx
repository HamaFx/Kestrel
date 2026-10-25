'use client';

// SPDX-License-Identifier: Apache-2.0

// Large overall status banner at the top of the System Health dashboard.
import {
  IconAlertTriangle,
  IconChartDots,
  IconCircleCheck,
  IconCircleX,
  IconDatabase,
} from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';
import type { HealthSloData } from '@/lib/services/admin-dtos';

export function OverallBanner({ data }: { data: HealthSloData }) {
  const { overall, dbLatencyMs, dbOk, ts, langfuseActive, langfuseBaseUrl } = data;

  const statusConfig = {
    healthy: {
      Icon: IconCircleCheck,
      label: 'All Systems Healthy',
      bg: 'bg-success/5 border-success/25',
      text: 'text-success',
      dot: 'bg-success',
    },
    degraded: {
      Icon: IconAlertTriangle,
      label: 'System Degraded',
      bg: 'bg-warn/5 border-warn/25',
      text: 'text-warn',
      dot: 'bg-warn',
    },
    unhealthy: {
      Icon: IconCircleX,
      label: 'System Unhealthy',
      bg: 'bg-danger/5 border-danger/25',
      text: 'text-danger',
      dot: 'bg-danger',
    },
  } as const;

  const config = statusConfig[overall];

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-sm border p-5 sm:flex-row sm:items-center sm:justify-between',
        config.bg,
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'relative flex size-10 items-center justify-center rounded-full',
            config.bg,
          )}
        >
          <span className={cn('absolute size-3 animate-pulse rounded-full', config.dot)} />
          <config.Icon className={cn('relative size-5', config.text)} aria-hidden="true" />
        </span>
        <div>
          <p
            key={overall}
            aria-live="polite"
            aria-atomic="true"
            className={cn('text-lg font-bold', config.text)}
          >
            {config.label}
          </p>
          <p className="text-fg-subtle text-xs">
            Last checked: {new Date(ts).toLocaleTimeString()}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        <div className="bg-bg-elev-2 flex items-center gap-1.5 rounded-sm px-2 py-1">
          <IconDatabase className="text-fg-subtle size-3" aria-hidden="true" />
          <span className="text-fg-subtle">DB:</span>
          <span className={cn('font-mono font-bold', dbOk ? 'text-success' : 'text-danger')}>
            {dbOk ? `${dbLatencyMs}ms` : 'DOWN'}
          </span>
        </div>
        <div className="bg-bg-elev-2 flex items-center gap-1.5 rounded-sm px-2 py-1">
          <IconChartDots className="text-fg-subtle size-3" aria-hidden="true" />
          <span className="text-fg-subtle">Tracing:</span>
          {langfuseActive && langfuseBaseUrl ? (
            <a
              href={langfuseBaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-success font-mono font-bold underline hover:no-underline"
            >
              Langfuse
            </a>
          ) : (
            <span className="text-fg-subtle font-mono font-bold">Off</span>
          )}
        </div>
      </div>
    </div>
  );
}
