// SPDX-License-Identifier: Apache-2.0

'use client';

// Settled committee verdict: aggregate conviction, bias distribution, and the
// expandable specialist breakdowns. Renders as a motion root so the parent
// `AnimatePresence` keeps ownership of enter/exit timing.
import { IconAlertCircle, IconAlertTriangle } from '@tabler/icons-react';
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import { AGENT_META, BIAS_TOKEN, FALLBACK_META, type AgentProgress } from './agent-meta';
import { BiasDistribution } from './bias-distribution';

interface VerdictSummaryProps {
  agents: AgentProgress[];
  opinions: AgentProgress[];
  avgConfidence: number;
  biasCounts: { bullish: number; bearish: number; neutral: number };
  dissent: boolean;
  confidenceTone: string;
}

export function VerdictSummary({
  agents,
  opinions,
  avgConfidence,
  biasCounts,
  dissent,
  confidenceTone,
}: VerdictSummaryProps) {
  return (
    <m.div
      key="verdict"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      aria-label={`Desk verdict: ${dissent ? 'mixed' : (opinions[0]?.opinion?.bias ?? 'neutral')}, ${avgConfidence}% confidence`}
      className="surface-well border-border bg-bg-elev-2 flex flex-col gap-3 rounded-lg border p-3.5"
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-fg text-xs font-semibold">Committee Conviction</span>
          <span className="text-fg font-mono text-xs font-bold tabular-nums">{avgConfidence}%</span>
        </div>
        <div className="bg-bg-elev-3 h-1.5 w-full overflow-hidden rounded-sm">
          <m.div
            className={cn('h-full rounded-sm', confidenceTone)}
            initial={{ width: 0 }}
            animate={{ width: `${avgConfidence}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
        <BiasDistribution counts={biasCounts} total={opinions.length} />
        {dissent ? (
          <span className="text-warn bg-warn/10 border-warn/30 inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-semibold">
            <IconAlertTriangle className="size-3.5" />
            Mixed signals
          </span>
        ) : null}
      </div>

      {opinions.length > 0 ? (
        <details className="group/details mt-0.5">
          <summary className="text-fg-muted hover:text-fg cursor-pointer list-none text-xs font-medium select-none">
            View Specialist Breakdowns
          </summary>
          <div className="border-border/60 mt-2 flex flex-col gap-2 border-t pt-2">
            {opinions.map((a) => {
              const meta = AGENT_META[a.agentName] ?? FALLBACK_META;
              const op = a.opinion!;
              return (
                <div
                  key={a.agentName}
                  className="border-border/80 bg-bg-elev-1/50 rounded-md border p-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-fg text-xs font-semibold">{meta.label} Desk</span>
                    <span
                      className={cn(
                        'font-mono text-xs font-bold uppercase tabular-nums',
                        BIAS_TOKEN[op.bias],
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
      ) : null}

      {agents
        .filter((a) => a.status === 'error' && a.error)
        .map((a) => {
          const meta = AGENT_META[a.agentName] ?? FALLBACK_META;
          return (
            <div
              key={`error-${a.agentName}`}
              className="text-danger bg-danger/10 border-danger/30 flex items-center gap-1.5 rounded-sm border p-2 text-xs"
            >
              <IconAlertCircle className="size-3.5 shrink-0" />
              <span>
                {meta.label} Desk check unavailable: {a.error}
              </span>
            </div>
          );
        })}
    </m.div>
  );
}
