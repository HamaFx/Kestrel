'use client';

// SPDX-License-Identifier: Apache-2.0

// Single SLI card with a headline rate, SLO target and error-budget gauge.
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
    ? 'border-white/[0.06]'
    : isInformational
      ? 'border-white/[0.06]'
      : isOk
        ? 'border-success/20'
        : 'border-danger/20';

  return (
    <div
      className={cn('surface-card rounded-xl border p-4 shadow-sm transition-colors', borderColor)}
    >
      <div className="flex items-center gap-2">
        <span className={cn('size-1.5 rounded-full', statusDot)} aria-hidden="true" />
        {isInformational ? (
          <IconInfoCircle className="text-fg-subtle size-3.5" aria-hidden="true" />
        ) : (
          <Icon className="text-fg-subtle size-3.5" aria-hidden="true" />
        )}
        <h3 className="text-fg truncate text-sm font-semibold">{sli.label}</h3>
        {isInformational ? (
          <span className="text-fg-subtle bg-bg-elev-2 ml-auto rounded-full px-1.5 py-0.5 font-mono text-[9px] tracking-wide uppercase">
            Sentry
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'font-mono text-2xl font-bold tracking-tight tabular-nums',
                isInformational ? 'text-fg-subtle' : statusColor,
              )}
            >
              {isInformational ? '—' : successRate}
            </span>
            <span className="text-fg-subtle font-mono text-[10px]">/ SLO {sloTargetPct}</span>
          </div>
          {sli.details ? <p className="text-fg-subtle mt-1 text-[11px]">{sli.details}</p> : null}
        </div>

        <div className="flex shrink-0 flex-col items-center gap-0.5">
          {isInformational ? (
            <span className="text-fg-subtle font-mono text-[9px]">via Sentry</span>
          ) : (
            <>
              <ErrorBudgetGauge budget={sli.errorBudget} />
              <span className="text-fg-subtle font-mono text-[8px] tracking-wider uppercase">
                Budget
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
