'use client';

// SPDX-License-Identifier: Apache-2.0

// Single alert row: status icon, rule summary, delivery channels, and the
// pause/re-arm and delete controls.
import type { Alert } from '@kestrel/shared';
import {
  IconActivity,
  IconArrowRight,
  IconBell,
  IconBellOff,
  IconBellRinging,
  IconBrandTelegram,
  IconChartBar,
  IconMail,
  IconRefresh,
  IconTrash,
  IconTrendingUp,
} from '@tabler/icons-react';

import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/formatters/cn';
import { formatRelative } from '@/lib/formatters/format';

import { describeAlert } from './describe-alert';

interface AlertRowProps {
  alert: Alert;
  onToggle: () => void;
  onDelete: () => void;
}

export function AlertRow({ alert, onToggle, onDelete }: AlertRowProps) {
  const RuleIcon = ruleIcon(alert);
  const StatusIcon = alert.active ? IconBell : alert.firedAt ? IconBellRinging : IconBellOff;
  const statusTone = alert.active ? 'text-fg' : alert.firedAt ? 'text-warn' : 'text-fg-subtle';

  return (
    <li className="border-border bg-bg-elev-1 relative overflow-hidden rounded-xl border transition-all duration-200 hover:shadow-lg">
      <div
        className={cn(
          'bg-bg-elev-1 flex w-full items-center gap-3 p-4 transition-opacity duration-200',
          !alert.active && 'opacity-65 saturate-50',
        )}
      >
        <div className="relative">
          <span
            aria-hidden
            className={cn(
              'bg-bg-elev-2 inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-white/5',
              statusTone,
            )}
          >
            <StatusIcon className="size-5" strokeWidth={1.75} />
          </span>
          {alert.active && !alert.firedAt && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="bg-brand absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"></span>
              <span className="bg-brand border-bg relative inline-flex h-3 w-3 rounded-full border-2"></span>
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-center gap-2">
            <div className="text-fg flex items-center gap-1.5 text-sm font-semibold tabular-nums">
              <RuleIcon className="text-fg-muted size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{describeAlert(alert)}</span>
            </div>
            <div className="ml-1.5 flex items-center gap-1">
              {alert.channels.includes('email') && (
                <IconMail
                  className="text-fg-muted size-3.5"
                  strokeWidth={2}
                  title="Email delivery"
                />
              )}
              {alert.channels.includes('telegram') && (
                <IconArrowRight
                  className="text-fg size-3.5"
                  strokeWidth={2}
                  title="Telegram delivery"
                />
              )}
              {alert.channels.includes('telegram-bot') && (
                <IconBrandTelegram
                  className="text-fg size-3.5"
                  strokeWidth={2}
                  title="Telegram personal bot delivery"
                />
              )}
            </div>
          </div>
          <p className="text-fg-subtle mt-1 truncate text-xs font-medium">
            {alert.firedAt
              ? `Triggered ${formatRelative(alert.firedAt)}`
              : alert.active
                ? `Watching since ${formatRelative(alert.createdAt)}`
                : `Paused`}
            {alert.note ? <span className="text-fg-muted"> · {alert.note}</span> : ''}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip label={alert.active ? 'Pause' : 'Re-arm'}>
            <button
              type="button"
              onClick={onToggle}
              aria-label={alert.active ? 'Pause alert' : 'Re-arm alert'}
              className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 inline-flex size-10 items-center justify-center rounded-lg transition-colors"
            >
              {alert.active ? (
                <IconBellOff className="size-4" />
              ) : (
                <IconRefresh className="size-4" />
              )}
            </button>
          </Tooltip>
          <Tooltip label="Delete">
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete alert"
              className="text-danger/70 hover:text-danger hover:bg-danger/10 inline-flex size-10 items-center justify-center rounded-lg transition-colors"
            >
              <IconTrash className="size-4" />
            </button>
          </Tooltip>
        </div>
      </div>
    </li>
  );
}

function ruleIcon(a: Alert) {
  switch (a.rule.type) {
    case 'priceCross':
      return IconTrendingUp;
    case 'indicatorCross':
      return IconActivity;
    case 'candleClose':
      return IconChartBar;
  }
}
