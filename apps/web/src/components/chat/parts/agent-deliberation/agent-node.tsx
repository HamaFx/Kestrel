// SPDX-License-Identifier: Apache-2.0

'use client';

// Status card for a single specialist desk inside the deliberation panel.
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';

import type { AgentMeta, AgentProgress } from './agent-meta';

export function AgentNode({ agent, meta }: { agent: AgentProgress; meta: AgentMeta }) {
  const status = agent.status;

  return (
    <div
      aria-label={`${meta.label} desk: ${status}`}
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg border p-2.5 transition-colors',
        status === 'pending' && 'bg-bg-elev-2/50 text-fg-subtle border-border/60',
        status === 'running' && cn('text-fg', meta.activeClass),
        status === 'done' && 'bg-bg-elev-2 text-fg border-border/80',
        status === 'error' && 'bg-danger/10 text-danger border-danger/40',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn('shrink-0', status !== 'error' && status !== 'pending' && meta.tokenClass)}
        >
          {meta.icon}
        </span>
        <span className="truncate text-xs font-semibold">{meta.label}</span>
      </div>

      {status === 'done' ? (
        <span className={cn('shrink-0', meta.tokenClass)}>
          <IconCircleCheck className="size-3.5" />
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
  );
}
