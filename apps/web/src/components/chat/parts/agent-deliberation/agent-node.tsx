// SPDX-License-Identifier: Apache-2.0

'use client';

// Status card for a single specialist desk inside the deliberation panel.
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';

import type { AgentMeta, AgentProgress } from './agent-meta';

export function AgentNode({
  agent,
  meta,
  isSingle,
}: {
  agent: AgentProgress;
  meta: AgentMeta;
  isSingle?: boolean;
}) {
  const status = agent.status;

  return (
    <div
      aria-label={`${meta.label} desk: ${status}`}
      className={cn(
        'surface-chip flex justify-between rounded-lg border p-2.5 transition-all',
        isSingle ? 'flex-row items-center sm:p-3' : 'flex-col gap-1.5',
        status === 'pending' && 'border-border/40 bg-bg-elev-1 text-fg-subtle',
        status === 'running' &&
          cn(
            'border-brand/50 bg-bg-elev-2 text-fg shadow-[0_0_12px_rgba(255,54,22,0.15)]',
            meta.activeClass,
          ),
        status === 'done' && 'border-border/70 bg-bg-elev-1 text-fg',
        status === 'error' && 'border-danger/40 bg-danger/10 text-danger',
      )}
    >
      <div
        className={cn('flex items-center gap-2', isSingle ? 'min-w-0 flex-1' : 'justify-between')}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'shrink-0',
              status !== 'error' && status !== 'pending' && meta.tokenClass,
            )}
          >
            {meta.icon}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-brand font-mono text-[9px] font-semibold tracking-wider uppercase">
              {meta.code ?? 'DESK'}
            </span>
            <span className="text-fg truncate text-xs font-semibold">{meta.label} Desk</span>
          </div>
        </div>
        {isSingle && meta.epithet ? (
          <span className="text-fg-muted ml-4 hidden truncate font-serif text-xs italic sm:inline-block">
            {meta.epithet}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {status === 'done' && agent.opinion ? (
          <span
            className={cn(
              'rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase',
              agent.opinion.bias === 'bullish'
                ? 'border-bull/30 bg-bull/10 text-bull'
                : agent.opinion.bias === 'bearish'
                  ? 'border-bear/30 bg-bear/10 text-bear'
                  : 'border-border bg-bg-elev-2 text-fg-muted',
            )}
          >
            {agent.opinion.bias}
          </span>
        ) : null}
        {status === 'done' ? (
          <span className={cn('shrink-0', meta.tokenClass)}>
            <IconCircleCheck className="text-bull size-3.5" />
          </span>
        ) : status === 'error' ? (
          <span className="text-danger shrink-0">
            <IconAlertCircle className="size-3.5" />
          </span>
        ) : status === 'running' ? (
          <span className="bg-brand size-2 shrink-0 animate-pulse rounded-full" />
        ) : (
          <span className="bg-border size-1.5 shrink-0 rounded-full" />
        )}
      </div>
    </div>
  );
}
