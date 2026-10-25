'use client';

// SPDX-License-Identifier: Apache-2.0

// Settled 4-Desk Committee Consensus Ledger rendered inside assistant messages.
// Replaces tilted rubber stamps and tug-of-war bars with a clean institutional
// scorecard.
import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';

import { cn } from '@/lib/formatters/cn';

import { DESK_DISPLAY_NAMES, DESK_ORDER, type PixelAgentOpinion } from './character-profiles';

interface PixelDeskDeliberationProps {
  opinions: PixelAgentOpinion[];
  mode?: string;
  className?: string;
}

/**
 * PixelDeskDeliberation
 * Renders the settled 4-Desk Committee Consensus Ledger inside assistant messages.
 * Replaces tilted rubber stamps and tug-of-war bars with a clean institutional scorecard.
 */
export function PixelDeskDeliberation({
  opinions,
  mode = 'full',
  className,
}: PixelDeskDeliberationProps) {
  const [expanded, setExpanded] = useState(false);

  const avgConfidence =
    opinions.length > 0
      ? Math.round(
          (opinions.reduce((sum, o) => sum + (o.confidence ?? 0.8), 0) / opinions.length) * 100,
        )
      : 85;

  const biasCounts = {
    bullish: opinions.filter((o) => o.bias === 'bullish').length,
    bearish: opinions.filter((o) => o.bias === 'bearish').length,
    neutral: opinions.filter((o) => o.bias === 'neutral').length,
  };

  const isDisputed =
    (biasCounts.bullish > 0 && biasCounts.bearish > 0) ||
    (biasCounts.bullish > 0 && biasCounts.neutral >= 2) ||
    (biasCounts.bearish > 0 && biasCounts.neutral >= 2);

  const majorityBias =
    biasCounts.bullish >= biasCounts.bearish && biasCounts.bullish >= biasCounts.neutral
      ? 'bullish'
      : biasCounts.bearish >= biasCounts.bullish && biasCounts.bearish >= biasCounts.neutral
        ? 'bearish'
        : 'neutral';

  return (
    <div
      role="region"
      aria-label="Multi-agent committee verdict"
      className={cn(
        'border-border bg-bg-elev-1 mt-2 flex w-full flex-col gap-3 rounded-xl border p-4 shadow-sm',
        className,
      )}
    >
      {/* Header Row: Mode + Verdict Pill + Aggregate Conviction */}
      <div className="border-border/70 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'size-2 rounded-full',
              isDisputed
                ? 'bg-warn'
                : majorityBias === 'bullish'
                  ? 'bg-bull'
                  : majorityBias === 'bearish'
                    ? 'bg-bear'
                    : 'bg-fg-muted',
            )}
          />
          <h4 className="text-fg text-xs font-semibold">
            {mode === 'full'
              ? '4-Desk Committee Consensus'
              : mode === 'single'
                ? 'Specialist Desk Read'
                : `Committee Consensus · ${mode}`}
          </h4>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-fg-muted font-mono text-xs tabular-nums">
            Conviction {avgConfidence}%
          </span>
          <span
            className={cn(
              'rounded-md border px-2 py-0.5 font-mono text-xs font-semibold uppercase',
              isDisputed
                ? 'border-warn/40 bg-warn/10 text-warn'
                : majorityBias === 'bullish'
                  ? 'border-bull/40 bg-bull/10 text-bull'
                  : majorityBias === 'bearish'
                    ? 'border-bear/40 bg-bear/10 text-bear'
                    : 'border-border bg-bg-elev-2 text-fg-muted',
            )}
          >
            {isDisputed
              ? 'Mixed / Split'
              : majorityBias === 'bullish'
                ? 'Bullish Consensus'
                : majorityBias === 'bearish'
                  ? 'Bearish Consensus'
                  : 'Neutral Consensus'}
          </span>
        </div>
      </div>

      {/* 4-Column Desk Scorecard */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DESK_ORDER.map((deskId) => {
          const op = opinions.find((o) => o.agentName === deskId);
          const bias = op?.bias ?? 'neutral';
          const conf = op ? Math.round((op.confidence ?? 0.8) * 100) : null;

          return (
            <div
              key={deskId}
              className="border-border/80 bg-bg-elev-2/60 flex flex-col gap-1.5 rounded-lg border p-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-fg text-xs font-semibold">{DESK_DISPLAY_NAMES[deskId]}</span>
                {conf !== null && (
                  <span className="text-fg-subtle font-mono text-xs tabular-nums">{conf}%</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'font-mono text-xs font-semibold uppercase',
                    bias === 'bullish'
                      ? 'text-bull'
                      : bias === 'bearish'
                        ? 'text-bear'
                        : 'text-fg-muted',
                  )}
                >
                  {op ? bias : 'Standby'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Segmented Conviction Distribution Bar (Clean Replacement for Tug-of-War) */}
      <div className="flex items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3 font-mono tabular-nums">
          <span className="text-bull">Bull: {biasCounts.bullish}</span>
          <span className="text-fg-muted">Neutral: {biasCounts.neutral}</span>
          <span className="text-bear">Bear: {biasCounts.bearish}</span>
        </div>
        {opinions.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-fg-muted hover:text-fg cursor-pointer touch-manipulation font-medium transition-colors"
          >
            {expanded ? 'Hide desk notes' : `Read ${opinions.length} desk rationales`}
          </button>
        )}
      </div>

      {/* Expandable Desk Rationales */}
      <AnimatePresence initial={false}>
        {expanded && opinions.length > 0 && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="border-border/70 flex flex-col gap-2 overflow-hidden border-t pt-3"
          >
            {opinions.map((op) => (
              <div
                key={op.agentName}
                className="border-border/80 bg-bg-elev-2/50 flex flex-col gap-1 rounded-lg border p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-fg text-xs font-semibold capitalize">
                    {op.agentName} Desk
                  </span>
                  <span
                    className={cn(
                      'font-mono text-xs font-semibold uppercase tabular-nums',
                      op.bias === 'bullish'
                        ? 'text-bull'
                        : op.bias === 'bearish'
                          ? 'text-bear'
                          : 'text-fg-muted',
                    )}
                  >
                    {op.bias} · {Math.round((op.confidence ?? 0.8) * 100)}%
                  </span>
                </div>
                <p className="text-fg-muted text-xs leading-relaxed">{op.reasoning}</p>
              </div>
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
