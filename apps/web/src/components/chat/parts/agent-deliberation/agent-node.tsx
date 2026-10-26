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
        'flex flex-col justify-between gap-1.5 rounded-lg border p-2.5 transition-colors',
        status === 'pending' && 'border-[#F4F1EA]/10 bg-[#111114] text-[#F4F1EA]/50',
        status === 'running' && cn('border-[#D4AF37]/40 bg-[#16161A] text-[#F4F1EA]', meta.activeClass),
        status === 'done' && 'border-[#F4F1EA]/15 bg-[#111114] text-[#F4F1EA]',
        status === 'error' && 'border-rose-500/40 bg-rose-500/10 text-rose-400',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-[9px] font-semibold tracking-wider text-[#D4AF37] uppercase">
          {meta.code ?? 'DESK'}
        </span>
        {status === 'done' ? (
          <span className={cn('shrink-0', meta.tokenClass)}>
            <IconCircleCheck className="size-3.5 text-emerald-400" />
          </span>
        ) : status === 'error' ? (
          <span className="shrink-0 text-rose-400">
            <IconAlertCircle className="size-3.5" />
          </span>
        ) : status === 'running' ? (
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-[#D4AF37]" />
        ) : (
          <span className="size-1.5 shrink-0 rounded-full bg-[#F4F1EA]/20" />
        )}
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn('shrink-0', status !== 'error' && status !== 'pending' && meta.tokenClass)}
        >
          {meta.icon}
        </span>
        <span className="truncate text-xs font-semibold">{meta.label}</span>
      </div>
    </div>
  );
}
