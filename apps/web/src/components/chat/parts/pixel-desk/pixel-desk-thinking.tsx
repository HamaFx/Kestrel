'use client';

// SPDX-License-Identifier: Apache-2.0

// Live deliberation state rendered inside the conversation stream. Connects to
// live `agentProgress` when available, with a step-progression fallback.
import { m } from 'motion/react';
import { useEffect, useState } from 'react';

import type { AgentProgress } from '@/lib/chat-transport';
import { cn } from '@/lib/formatters/cn';

import { DESK_DISPLAY_NAMES, DESK_ORDER } from './character-profiles';
import { QUANT_STATUS_STEPS, renderDeskGlyph } from './pixel-primitives';

/**
 * PixelDeskThinking
 * Clean live deliberation state rendered inside the conversation stream.
 * Connects to live `agentProgress` when available, with a graceful step progression fallback.
 */
export function PixelDeskThinking({
  agentProgress,
  className,
}: {
  agentProgress?: AgentProgress | null;
  className?: string;
}) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setStepIdx((prev) => (prev + 1) % QUANT_STATUS_STEPS.length);
    }, 2400);
    return () => clearInterval(stepTimer);
  }, []);

  const liveAgents = agentProgress?.agents ?? [];
  const doneCount = liveAgents.filter((a) => a.status === 'done').length;
  const progressPercent =
    liveAgents.length > 0
      ? Math.max(15, Math.round((doneCount / liveAgents.length) * 100))
      : Math.min(20 + stepIdx * 18, 90);

  return (
    <div
      role="status"
      aria-label="Specialists deliberating"
      className={cn(
        'border-border bg-bg-elev-1 my-1 flex w-full max-w-2xl flex-col gap-3 rounded-xl border p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand size-2 animate-pulse rounded-full" />
          <span className="text-fg text-xs font-semibold">
            {agentProgress?.mode === 'single'
              ? 'Specialist Desk Analysis'
              : '4-Desk Committee Deliberation'}
          </span>
        </div>
        <span className="text-fg-muted font-mono text-xs tabular-nums">
          {liveAgents.length > 0
            ? `${doneCount}/${liveAgents.length} desks ready`
            : `${progressPercent}%`}
        </span>
      </div>

      {/* 4-Column Live Status Strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DESK_ORDER.map((deskId, idx) => {
          const liveAgent = liveAgents.find((a) => a.agentName === deskId);
          const status =
            liveAgent?.status ?? (idx < stepIdx ? 'done' : idx === stepIdx ? 'running' : 'pending');

          return (
            <div
              key={deskId}
              className={cn(
                'border-border/80 flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors',
                status === 'running'
                  ? 'bg-bg-elev-2 border-brand/40'
                  : status === 'done'
                    ? 'bg-bg-elev-2/70 border-bull/30'
                    : 'bg-bg-elev-1 opacity-65',
              )}
            >
              {renderDeskGlyph(deskId, {
                isThinking: status === 'running',
                isDone: status === 'done',
                bias: liveAgent?.opinion?.bias,
              })}
              <div className="flex min-w-0 flex-col">
                <span className="text-fg truncate text-xs font-semibold">
                  {DESK_DISPLAY_NAMES[deskId]}
                </span>
                <span
                  className={cn(
                    'font-mono text-xs capitalize tabular-nums',
                    status === 'running'
                      ? 'text-brand'
                      : status === 'done'
                        ? 'text-bull'
                        : 'text-fg-subtle',
                  )}
                >
                  {liveAgent?.opinion?.bias ?? status}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress Bar & Active Step */}
      <div className="flex flex-col gap-1.5">
        <div className="bg-bg-elev-3 h-1 w-full overflow-hidden rounded-full">
          <m.div
            className="bg-brand h-full rounded-full"
            initial={{ width: '15%' }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        </div>
        <span className="text-fg-muted text-xs">{QUANT_STATUS_STEPS[stepIdx]}</span>
      </div>
    </div>
  );
}
