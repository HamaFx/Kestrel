// SPDX-License-Identifier: Apache-2.0

'use client';

// Settled committee verdict: aggregate conviction, 2x2 Parallel Strategist Matrix,
// expandable breakdowns, and Arbiter synthesis verdict block.
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
  const primaryBias = opinions[0]?.opinion?.bias ?? 'neutral';

  return (
    <m.div
      key="verdict"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      aria-label={`Desk verdict: ${dissent ? 'mixed' : primaryBias}, ${avgConfidence}% confidence`}
      className="surface-card flex flex-col gap-4 rounded-xl border border-border/40 bg-bg-elev-1 p-4 shadow-sm sm:p-5"
    >
      {/* ── Conviction & Distribution Bar ── */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/30 bg-bg-elev-2 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-fg">Committee Conviction</span>
          <span className="font-mono text-xs font-bold tabular-nums text-brand">{avgConfidence}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-sm bg-bg-elev-3">
          <m.div
            className={cn('h-full rounded-sm', confidenceTone)}
            initial={{ width: 0 }}
            animate={{ width: `${avgConfidence}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <BiasDistribution counts={biasCounts} total={opinions.length} />
          {dissent ? (
            <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
              <IconAlertTriangle className="size-3.5" />
              Mixed signals
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Parallel 2x2 Strategist Matrix (Option 3A) ── */}
      {opinions.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {opinions.map((a) => {
            const meta = AGENT_META[a.agentName] ?? FALLBACK_META;
            const op = a.opinion!;
            const isBull = op.bias === 'bullish';
            const isBear = op.bias === 'bearish';
            const pillStyle = isBull
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : isBear
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-400';
            const opPct = Math.round(op.confidence * 100);

            return (
              <div
                key={a.agentName}
                className="group relative flex flex-col justify-between rounded-xl border border-border/40 bg-bg-elev-2 p-3.5 transition-all hover:border-brand/40"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[9px] font-semibold tracking-wider text-brand uppercase">
                      {meta.code ?? 'DESK // SPECIALIST'}
                    </span>
                    <span className={cn('rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase border', pillStyle)}>
                      {op.bias}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-1.5">
                    <span className={cn('size-2 rounded-full', isBull ? 'bg-emerald-400' : isBear ? 'bg-rose-400' : 'bg-amber-400')} />
                    <span className="text-xs font-semibold text-fg">{meta.label} Desk</span>
                  </div>

                  <div className="mt-2 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between font-mono text-[9px] text-fg-subtle">
                      <span>CONFIDENCE</span>
                      <span className="font-semibold tabular-nums text-fg">{opPct}%</span>
                    </div>
                    <div className="h-0.5 w-full overflow-hidden rounded-full bg-bg-elev-1">
                      <div
                        className={cn('h-full', isBull ? 'bg-emerald-400' : isBear ? 'bg-rose-400' : 'bg-amber-400')}
                        style={{ width: `${opPct}%` }}
                      />
                    </div>
                  </div>

                  <p className="mt-2.5 font-serif text-sm italic text-fg leading-relaxed">
                    &ldquo;{meta.epithet ?? op.summary}&rdquo;
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Expandable Specialist Breakdowns (test contract + deep inspection) ── */}
      {opinions.length > 0 && (
        <details className="group/details mt-0.5">
          <summary className="cursor-pointer text-xs font-medium text-fg-muted select-none hover:text-fg">
            View Specialist Breakdowns
          </summary>
          <div className="mt-2 flex flex-col gap-2 border-t border-border/30 pt-2">
            {opinions.map((a) => {
              const meta = AGENT_META[a.agentName] ?? FALLBACK_META;
              const op = a.opinion!;
              return (
                <div key={a.agentName} className="rounded-md border border-border/40 bg-bg-elev-2 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-fg">{meta.label} Desk</span>
                    <span className={cn('font-mono text-xs font-bold uppercase tabular-nums', BIAS_TOKEN[op.bias])}>
                      {op.bias} · {Math.round(op.confidence * 100)}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                    {op.reasoning ?? op.summary}
                  </p>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* ── Arbiter Synthesis Verdict Block ── */}
      <div className="rounded-xl border-t border-brand/40 bg-gradient-to-b from-bg-elev-2 to-bg-elev-1 p-5 shadow-md">
        <div className="flex items-center justify-between border-b border-brand/20 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="size-2 animate-pulse rounded-full bg-brand" />
            <span className="font-mono text-xs font-bold tracking-wider text-brand uppercase">
              STAGE II // ARBITER SYNTHESIS VERDICT
            </span>
          </div>
          <span className="font-mono text-[11px] text-fg-subtle">
            ALIGNMENT: {avgConfidence}%
          </span>
        </div>

        <div className="mt-3">
          <h4 className="font-serif text-xl italic text-fg">
            {dissent ? 'Mixed Syndicate Signals: Proceed with Qualified Sizing' : `Unified ${primaryBias.toUpperCase()} Synthesis`}
          </h4>
          <p className="mt-1.5 text-xs leading-relaxed text-fg-muted sm:text-sm">
            {dissent
              ? 'Dissenting viewpoints detected between technical and macro models. Risk desk caps exposure to 0.5% allocation until break of structure confirms alignment.'
              : `Strong alignment across all active desks confirms ${primaryBias} regime. Execution protocols active with standard 1.0% risk parameter.`}
          </p>
        </div>
      </div>

      {/* ── Error Notices ── */}
      {agents
        .filter((a) => a.status === 'error' && a.error)
        .map((a) => {
          const meta = AGENT_META[a.agentName] ?? FALLBACK_META;
          return (
            <div
              key={`error-${a.agentName}`}
              className="flex items-center gap-1.5 rounded-sm border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-400"
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
