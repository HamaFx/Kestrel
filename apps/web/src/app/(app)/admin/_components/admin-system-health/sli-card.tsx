'use client';

// SPDX-License-Identifier: Apache-2.0

// Single SLI card with icon, gauge, and details.
import { IconActivity, IconInfoCircle } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';
import type { SliSnapshot } from '@/lib/services/admin-dtos';

import { ErrorBudgetGauge } from './error-budget-gauge';
import { SLI_ICONS } from './sli-icons';

export function SliCard({ sli }: { sli: SliSnapshot }) {
  const Icon = SLI_ICONS[sli.key] ?? IconActivity;
  const isInformational = sli.informational === true;
  const successRate =
    sli.current !== null ? `${Math.round(sli.current * 10000) / 100}%` : 'No data';
  const sloTargetPct = `${Math.round(sli.sloTarget * 10000) / 100}%`;

  const isOk = sli.current !== null && sli.current >= sli.sloTarget;
  const noData = sli.current === null;
  const statusColor = noData
    ? 'text-fg-subtle'
    : isInformational
      ? 'text-fg-subtle'
      : isOk
        ? 'text-success'
        : 'text-danger';
  const statusDot = noData
    ? 'bg-fg-subtle'
    : isInformational
      ? 'bg-fg-subtle'
      : isOk
        ? 'bg-success'
        : 'bg-danger';
  const borderColor = noData
    ? 'border-border'
    : isInformational
      ? 'border-border'
      : isOk
        ? 'border-success/20'
        : 'border-danger/20';

  return (
    <div className={cn('rounded-sm border p-4 transition-colors', borderColor)}>
      <div className="mb-3 flex items-center gap-2">
        <span className={cn('size-2 rounded-full', statusDot)} aria-hidden="true" />
        {isInformational ? (
          <IconInfoCircle className="text-fg-subtle size-4" aria-hidden="true" />
        ) : (
          <Icon className="text-fg-subtle size-4" aria-hidden="true" />
        )}
        <h3 className="text-fg truncate text-sm font-semibold">{sli.label}</h3>
        {isInformational && (
          <span className="text-fg-subtle bg-bg-elev-2 text-caption rounded-sm px-1.5 py-0.5 font-medium tracking-wide uppercase">
            Sentry
          </span>
        )}
      </div>

      <div className="mb-2 flex items-baseline gap-2">
        <span
          className={cn(
            'font-mono text-2xl font-bold',
            isInformational ? 'text-fg-subtle' : statusColor,
          )}
        >
          {isInformational ? '—' : successRate}
        </span>
        <span className="text-fg-subtle text-xs">/ SLO {sloTargetPct}</span>
      </div>

      {sli.details && <p className="text-fg-subtle mb-2 text-xs">{sli.details}</p>}

      <div className="border-border flex items-center gap-2 border-t pt-2">
        <span className="text-fg-subtle text-xs">Budget:</span>
        {isInformational ? (
          <span className="text-fg-subtle text-xs">via Sentry</span>
        ) : (
          <ErrorBudgetGauge budget={sli.errorBudget} />
        )}
      </div>
    </div>
  );
}
