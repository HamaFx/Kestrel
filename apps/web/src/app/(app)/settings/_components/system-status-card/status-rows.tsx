// SPDX-License-Identifier: Apache-2.0

// Presentational rows for the system status card: channel rows, background
// job health, and the market phase indicator.

import type { describeMarketPhase, getMarketPhase } from '@kestrel/shared';
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';

import type { ChannelStatus } from './status-data';

export function ChannelRow({ channel }: { channel: ChannelStatus }) {
  const c = channel;
  return (
    <li className="surface-well flex items-center gap-3 rounded-xl border border-white/5 p-2.5">
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex size-8 shrink-0 items-center justify-center rounded-lg',
          c.ready ? 'bg-success/15 text-success' : 'bg-bg-elev-2 text-fg-subtle',
        )}
      >
        {c.ready ? (
          <IconCircleCheck className="size-4" strokeWidth={2.25} />
        ) : (
          <IconAlertCircle className="size-4" strokeWidth={2.25} />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-fg text-sm font-semibold">{c.label}</span>
        <span className="text-fg-subtle truncate text-xs tabular-nums">{c.detail}</span>
      </div>
      <span
        className={cn(
          'rounded-md px-2 py-0.5 font-mono text-[11px] font-bold uppercase tabular-nums ring-1',
          c.ready
            ? 'bg-success/10 text-success ring-success/30'
            : 'bg-bg-elev-2 text-fg-muted ring-divider',
        )}
      >
        {c.ready ? 'Ready' : 'Off'}
      </span>
    </li>
  );
}

function RowIcon({ healthy }: { healthy: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-lg',
        healthy ? 'bg-success/15 text-success' : 'bg-warn/15 text-warn',
      )}
    >
      {healthy ? (
        <IconCircleCheck className="size-4" strokeWidth={2.25} />
      ) : (
        <IconAlertCircle className="size-4" strokeWidth={2.25} />
      )}
    </span>
  );
}

export function CronHealthRow({
  stuckJobs,
  recentErrors,
}: {
  stuckJobs: number;
  recentErrors: number;
}) {
  const cronHealthy = stuckJobs === 0 && recentErrors === 0;

  return (
    <div className="border-border/60 -mx-5 border-t px-5 pt-3.5">
      <div className="flex items-center gap-3">
        <RowIcon healthy={cronHealthy} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-fg text-sm font-semibold">Background jobs</span>
          <span className="text-fg-subtle text-xs">
            {cronHealthy
              ? 'All jobs healthy (last 24h)'
              : `${stuckJobs} stuck · ${recentErrors} error${recentErrors === 1 ? '' : 's'} (last 24h)`}
          </span>
        </div>
      </div>
    </div>
  );
}

export function MarketPhaseRow({
  marketPhase,
  description,
}: {
  marketPhase: ReturnType<typeof getMarketPhase>;
  description: ReturnType<typeof describeMarketPhase>;
}) {
  return (
    <div className="border-border/60 -mx-5 border-t px-5 pt-3.5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-lg',
            marketPhase.isOpen
              ? marketPhase.liquidity === 'high'
                ? 'bg-success/15 text-success'
                : marketPhase.liquidity === 'medium'
                  ? 'bg-warn/15 text-warn'
                  : 'bg-fg-muted/15 text-fg-muted'
              : 'bg-bg-elev-2 text-fg-subtle',
          )}
        >
          {marketPhase.isOpen ? (
            <IconCircleCheck className="size-4" strokeWidth={2.25} />
          ) : (
            <IconAlertCircle className="size-4" strokeWidth={2.25} />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-fg text-sm font-semibold">Market phase</span>
          <span className="text-fg-subtle text-xs">{description}</span>
        </div>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 font-mono text-[11px] font-bold uppercase tabular-nums ring-1',
            marketPhase.isOpen
              ? marketPhase.liquidity === 'high'
                ? 'bg-success/10 text-success ring-success/30'
                : marketPhase.liquidity === 'medium'
                  ? 'bg-warn/10 text-warn ring-warn/30'
                  : 'bg-bg-elev-2 text-fg-muted ring-divider'
              : 'bg-bg-elev-2 text-fg-muted ring-divider',
          )}
        >
          {marketPhase.isOpen ? marketPhase.liquidity : 'Closed'}
        </span>
      </div>
    </div>
  );
}
