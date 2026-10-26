'use client';

// SPDX-License-Identifier: Apache-2.0

// Live deliberation state rendered inside the conversation stream. Connects to
// live `agentProgress` when available, with a step-progression fallback.
import { m } from 'motion/react';
import { useEffect, useState } from 'react';

import type { AgentProgress } from '@/lib/chat-transport';
import { cn } from '@/lib/formatters/cn';

import { DESK_DISPLAY_NAMES, DESK_ORDER, type DeskId } from './character-profiles';
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

  const liveAgents = agentProgress?.agents ?? [];
  const isSingle = agentProgress?.mode === 'single' || (liveAgents.length === 1);
  const singleDeskId = (liveAgents[0]?.agentName as DeskId | undefined) ?? 'technical';

  const statusSteps = isSingle
    ? [
        'Ingesting multi-timeframe market structure…',
        'Mapping order blocks, liquidity pools & fair value gaps…',
        'Auditing invalidation levels and ATR volatility buffer…',
        'Formulating specialist execution thesis…',
      ]
    : QUANT_STATUS_STEPS;

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setStepIdx((prev) => (prev + 1) % statusSteps.length);
    }, 2400);
    return () => clearInterval(stepTimer);
  }, [statusSteps.length]);

  const doneCount = liveAgents.filter((a) => a.status === 'done').length;
  const progressPercent =
    liveAgents.length > 0
      ? Math.max(15, Math.round((doneCount / liveAgents.length) * 100))
      : Math.min(20 + stepIdx * 22, 90);

  return (
    <div
      role="status"
      aria-label="Specialists deliberating"
      className={cn(
        'surface-panel border-edge/80 bg-bg-elev-1 my-1 flex w-full max-w-2xl flex-col gap-3 rounded-xl border p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-brand size-2 animate-pulse rounded-full" />
          <span className="text-fg text-xs font-semibold">
            {isSingle ? 'Specialist Desk Deliberation' : '4-Desk Committee Deliberation'}
          </span>
        </div>
        <span className="text-fg-muted font-mono text-xs tabular-nums">
          {liveAgents.length > 0
            ? `${doneCount}/${liveAgents.length} desks ready`
            : `${progressPercent}%`}
        </span>
      </div>

      {/* Adaptive Status Strip: Full-width single desk in single mode, 4-column in full mode */}
      {isSingle ? (
        <div className="surface-chip border-edge/80 flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="flex items-center gap-3">
            {renderDeskGlyph(singleDeskId, {
              isThinking: doneCount === 0,
              isDone: doneCount > 0,
              bias: liveAgents[0]?.opinion?.bias,
            })}
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] font-semibold tracking-wider text-brand uppercase">
                  DESK-II // ASTROLABE
                </span>
                <span className="text-fg text-xs font-semibold">
                  {DESK_DISPLAY_NAMES[singleDeskId]} Desk
                </span>
              </div>
              <span className="text-fg-subtle text-[11px]">
                Multi-Timeframe Structure & Liquidity Specialist
              </span>
            </div>
          </div>
          <span
            className={cn(
              'font-mono text-xs font-semibold uppercase tabular-nums',
              doneCount > 0 ? 'text-bull' : 'text-brand',
            )}
          >
            {liveAgents[0]?.opinion?.bias ?? (doneCount > 0 ? 'Ready' : 'Analyzing')}
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DESK_ORDER.map((deskId, idx) => {
            const liveAgent = liveAgents.find((a) => a.agentName === deskId);
            const status =
              liveAgent?.status ?? (idx < stepIdx ? 'done' : idx === stepIdx ? 'running' : 'pending');

            return (
              <div
                key={deskId}
                className={cn(
                  'surface-chip flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors',
                  status === 'running'
                    ? 'border-brand/50 shadow-[0_0_12px_rgba(255,54,22,0.15)]'
                    : status === 'done'
                      ? 'border-bull/30 bg-bg-elev-1'
                      : 'border-edge/60 bg-bg-elev-1 opacity-70',
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
      )}

      {/* Progress Bar & Active Step */}
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="surface-well bg-bg-elev-3 h-1.5 w-full overflow-hidden rounded-full">
          <m.div
            className="bg-brand h-full rounded-full"
            initial={{ width: '15%' }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        </div>
        <span className="text-fg-muted font-mono text-xs">{statusSteps[stepIdx]}</span>
      </div>
    </div>
  );
}
