'use client';

// SPDX-License-Identifier: Apache-2.0

// The 2×2 Analysis Breakdown Grid: shows all 4 market angles (Macro, Technicals,
// Risk, Sentiment) with bias badges, confidence bars, and expandable reasoning.
import { IconAlertCircle, IconAlertTriangle } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';

import { AGENT_META, FALLBACK_META, type AgentProgress } from '../agent-deliberation/agent-meta';
import { BiasDistribution } from '../agent-deliberation/bias-distribution';

export interface SyndicateDeskGridProps {
  agents: AgentProgress[];
  opinions: AgentProgress[];
  avgConfidence: number;
  biasCounts: { bullish: number; bearish: number; neutral: number };
  dissent: boolean;
  confidenceTone: string;
}

export function SyndicateDeskGrid({
  agents,
  opinions,
  avgConfidence,
  biasCounts,
  dissent,
  confidenceTone,
}: SyndicateDeskGridProps) {
  const primaryBias = opinions[0]?.opinion?.bias ?? 'neutral';

  if (opinions.length === 0) return null;

  return (
    <div
      aria-label={`Analysis verdict: ${dissent ? 'mixed' : primaryBias}, ${avgConfidence}% confidence`}
      className="flex flex-col gap-3.5"
      data-testid="syndicate-desk-grid"
    >
      {/* ── Aggregate Confidence Row ── */}
      <div className="surface-chip border-edge/80 flex flex-col gap-2 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <span className="text-fg text-xs font-semibold">Overall Confidence</span>
          <span className="text-brand font-mono text-xs font-bold tabular-nums">
            {avgConfidence}%
          </span>
        </div>
        <div className="bg-bg-elev-3 h-1.5 w-full overflow-hidden rounded-full">
          <div
            className={cn('h-full rounded-full transition-all duration-500', confidenceTone)}
            style={{ width: `${avgConfidence}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <BiasDistribution counts={biasCounts} total={opinions.length} />
          {dissent ? (
            <span className="border-warn/30 bg-warn/10 text-warn inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold">
              <IconAlertTriangle className="size-3.5" />
              Mixed signals
            </span>
          ) : null}
        </div>
      </div>

      {/* ── 2×2 Analysis Breakdown Grid ── */}
      <div
        className={cn(
          'grid gap-2 sm:gap-2.5',
          opinions.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
        )}
      >
        {opinions.map((a) => {
          const meta = AGENT_META[a.agentName] ?? FALLBACK_META;
          const op = a.opinion!;
          const opPct = Math.round(op.confidence * 100);
          const pillStyle =
            op.bias === 'bullish'
              ? 'border-bull/30 bg-bull/10 text-bull'
              : op.bias === 'bearish'
                ? 'border-bear/30 bg-bear/10 text-bear'
                : 'border-warn/30 bg-warn/10 text-warn';
          return (
            <div
              key={a.agentName}
              className="surface-chip border-edge/80 hover:border-brand/40 relative min-w-0 overflow-hidden rounded-xl border p-3 transition-all sm:p-3.5"
            >
              <div className="relative z-10">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-brand font-mono text-[10px] font-semibold tracking-wider uppercase">
                    {meta.code ?? 'ANALYSIS'}
                  </span>
                  <span
                    className={cn(
                      'rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase',
                      pillStyle,
                    )}
                  >
                    {op.bias}
                  </span>
                </div>

                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      op.bias === 'bullish'
                        ? 'bg-bull'
                        : op.bias === 'bearish'
                          ? 'bg-bear'
                          : 'bg-warn',
                    )}
                  />
                  <span className="text-fg text-xs font-semibold">{meta.label}</span>
                </div>

                <div className="mt-2 flex flex-col gap-1">
                  <div className="text-fg-subtle flex items-center justify-between font-mono text-[10px]">
                    <span>CONFIDENCE</span>
                    <span className="text-fg font-semibold tabular-nums">{opPct}%</span>
                  </div>
                  <div className="surface-well h-1 w-full overflow-hidden rounded-full">
                    <div
                      className={cn(
                        'h-full',
                        op.bias === 'bullish'
                          ? 'bg-bull'
                          : op.bias === 'bearish'
                            ? 'bg-bear'
                            : 'bg-warn',
                      )}
                      style={{ width: `${opPct}%` }}
                    />
                  </div>
                </div>

                <p className="text-fg-muted mt-2 text-xs leading-relaxed">
                  {op.summary ?? meta.epithet}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Expandable Detailed Breakdown ── */}
      <details className="group/details">
        <summary className="text-fg-muted hover:text-fg cursor-pointer text-xs font-medium select-none">
          Read Detailed Breakdown
        </summary>
        <div className="border-border/30 mt-2 flex flex-col gap-2 border-t pt-2">
          {opinions.map((a) => {
            const meta = AGENT_META[a.agentName] ?? FALLBACK_META;
            const op = a.opinion!;
            return (
              <div
                key={a.agentName}
                className="surface-chip border-edge/80 rounded-lg border p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-fg text-xs font-semibold">{meta.label}</span>
                  <span
                    className={cn(
                      'font-mono text-xs font-bold uppercase tabular-nums',
                      op.bias === 'bullish'
                        ? 'text-bull'
                        : op.bias === 'bearish'
                          ? 'text-bear'
                          : 'text-fg-muted',
                    )}
                  >
                    {op.bias} · {Math.round(op.confidence * 100)}%
                  </span>
                </div>
                <p className="text-fg-muted mt-1 text-xs leading-relaxed">
                  {op.reasoning ?? op.summary}
                </p>
              </div>
            );
          })}
        </div>
      </details>

      {/* ── Failure Notices ── */}
      {agents
        .filter((a) => a.status === 'error' && a.error)
        .map((a) => {
          const meta = AGENT_META[a.agentName] ?? FALLBACK_META;
          return (
            <div
              key={`error-${a.agentName}`}
              className="border-danger/30 bg-danger/10 text-danger flex items-center gap-1.5 rounded-lg border p-2.5 text-xs"
            >
              <IconAlertCircle className="size-3.5 shrink-0" />
              <span>
                {meta.label} check unavailable: {a.error}
              </span>
            </div>
          );
        })}
    </div>
  );
}
