// SPDX-License-Identifier: Apache-2.0

'use client';

/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCircleCheck,
  IconCpu,
  IconNews,
  IconRobot,
  IconShield,
  IconTerminal2,
  IconTrendingUp,
} from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { useMemo, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface AgentOpinion {
  agentName?: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning?: string;
  summary?: string;
}

interface AgentProgress {
  agentName: string;
  status: 'pending' | 'running' | 'done' | 'error';
  opinion?: AgentOpinion;
  error?: string;
}

interface AgentDeliberationProps {
  agents: AgentProgress[];
  mode: string;
  status?: 'complete' | 'failed' | 'retrying';
  error?: string;
}

const AGENT_META: Record<
  string,
  { icon: ReactNode; label: string; tokenClass: string; activeClass: string }
> = {
  technical: {
    icon: <IconTrendingUp className="size-4" />,
    label: 'Technical',
    tokenClass: 'text-bull',
    activeClass: 'border-bull/40 bg-bull/10',
  },
  fundamental: {
    icon: <IconNews className="size-4" />,
    label: 'Macro',
    tokenClass: 'text-info',
    activeClass: 'border-info/40 bg-info/10',
  },
  risk: {
    icon: <IconShield className="size-4" />,
    label: 'Risk',
    tokenClass: 'text-bear',
    activeClass: 'border-bear/40 bg-bear/10',
  },
  sentiment: {
    icon: <IconRobot className="size-4" />,
    label: 'Sentiment',
    tokenClass: 'text-warn',
    activeClass: 'border-warn/40 bg-warn/10',
  },
  decision: {
    icon: <IconCpu className="size-4" />,
    label: 'Consensus',
    tokenClass: 'text-brand',
    activeClass: 'border-brand/40 bg-brand/10',
  },
};

const FALLBACK_META = {
  icon: <IconRobot className="size-4" />,
  label: 'Specialist',
  tokenClass: 'text-fg-muted',
  activeClass: 'border-border bg-bg-elev-2',
} as const;

const BIAS_TOKEN: Record<AgentOpinion['bias'], string> = {
  bullish: 'text-bull',
  bearish: 'text-bear',
  neutral: 'text-fg-muted',
};

function formatPlainModeLabel(mode: string): string {
  const normalized = mode.toLowerCase();
  if (normalized === 'single') {
    return 'Single-desk analysis (1 specialist desk)';
  }
  if (normalized === 'full') {
    return 'Full Committee (4 Specialist Desks)';
  }
  return `Committee Analysis · ${mode}`;
}

export function AgentDeliberation({ agents, mode, status, error }: AgentDeliberationProps) {
  if (!Array.isArray(agents) || agents.length === 0) return null;
  const hasDone = agents.some((a) => a.status === 'done');
  const isFailed = status === 'failed';
  const isRetrying = status === 'retrying';
  const allDone =
    agents.length > 0 && agents.every((a) => a.status === 'done' || a.status === 'error');
  const doneCount = agents.filter((a) => a.status === 'done').length;
  const progressPct = agents.length > 0 ? Math.round((doneCount / agents.length) * 100) : 0;

  const opinions = agents.filter((a) => a.opinion);
  const avgConfidence =
    opinions.length > 0
      ? Math.round(
          (opinions.reduce((s, a) => s + (a.opinion?.confidence ?? 0), 0) / opinions.length) * 100,
        )
      : 0;
  const biasCounts = {
    bullish: opinions.filter((a) => a.opinion?.bias === 'bullish').length,
    bearish: opinions.filter((a) => a.opinion?.bias === 'bearish').length,
    neutral: opinions.filter((a) => a.opinion?.bias === 'neutral').length,
  };
  const dissent = biasCounts.bullish > 0 && biasCounts.bearish > 0;
  const confidenceTone =
    avgConfidence > 75 ? 'bg-bull' : avgConfidence >= 50 ? 'bg-warn' : 'bg-bear';

  return (
    <div
      role="status"
      aria-live="polite"
      className="surface-panel border-border/80 bg-bg-elev-1 flex flex-col gap-3 rounded-xl border p-4 shadow-sm"
    >
      {/* Header & Step Progress */}
      <div className="border-border/60 flex items-center justify-between gap-2 border-b pb-2.5">
        <div className="text-fg flex items-center gap-2 text-xs font-semibold">
          <IconCpu className="text-brand size-3.5" />
          <span>{formatPlainModeLabel(mode)}</span>
        </div>

        {!allDone && (
          <div className="flex items-center gap-2">
            <span className="text-fg-subtle font-mono text-xs tabular-nums">
              {doneCount}/{agents.length} Ready
            </span>
            <div className="bg-bg-elev-3 h-1.5 w-16 overflow-hidden rounded-full">
              <m.div
                className="bg-brand h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Unified Horizontal 4-Desk Status Cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {agents.map((a) => {
          const meta = AGENT_META[a.agentName] ?? FALLBACK_META;
          return <AgentNode key={a.agentName} agent={a} meta={meta} />;
        })}
      </div>

      {/* Subtle SVG Progress Connector when partially complete */}
      <AnimatePresence>
        {hasDone && !allDone ? (
          <m.div
            key="fusion"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center"
          >
            <ConnectorLines agents={agents} />
          </m.div>
        ) : null}
      </AnimatePresence>

      {/* Compact Live Committee Progress Trace */}
      {!allDone ? <TelemetryLog agents={agents} /> : null}

      {!hasDone ? (
        <div className="text-fg-subtle flex items-center justify-between text-xs">
          <span>Analyzing live market data…</span>
        </div>
      ) : null}

      {/* Settled Verdict Summary */}
      <AnimatePresence>
        {allDone && !isFailed && !isRetrying ? (
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
                <span className="text-fg font-mono text-xs font-bold tabular-nums">
                  {avgConfidence}%
                </span>
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
        ) : null}
      </AnimatePresence>

      {isFailed || isRetrying ? (
        <div
          role="status"
          className={cn(
            'rounded-md p-3 text-xs',
            isFailed
              ? 'border-danger/30 bg-danger/10 text-danger border'
              : 'border-warn/30 bg-warn/10 text-warn border',
          )}
        >
          <div className="font-semibold">
            {isRetrying
              ? 'Retrying Full Committee analysis…'
              : 'Full Committee analysis incomplete'}
          </div>
          <p className="mt-1 leading-relaxed">
            {error ??
              (isRetrying
                ? 'A temporary issue occurred. Retrying the Full Committee analysis automatically…'
                : 'One of the specialist desks could not complete its check, so an incomplete trade plan was withheld.')}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function AgentNode({
  agent,
  meta,
}: {
  agent: AgentProgress;
  meta: { icon: ReactNode; label: string; tokenClass: string; activeClass: string };
}) {
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

function ConnectorLines({ agents }: { agents: AgentProgress[] }) {
  const n = agents.length;
  const cx = 50;
  const cy = 12;
  const lines = agents
    .map((a, i) => ({ a, x: n > 0 ? ((i + 0.5) / n) * 100 : 50 }))
    .filter((d) => d.a.status === 'done');

  return (
    <svg viewBox="0 0 100 12" preserveAspectRatio="none" className="h-3 w-full" aria-hidden="true">
      {lines.map((d, i) => (
        <m.line
          key={i}
          x1={d.x}
          y1={0}
          x2={cx}
          y2={cy}
          stroke="var(--color-border)"
          strokeWidth={0.8}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.3, delay: i * 0.05 }}
        />
      ))}
    </svg>
  );
}

function TelemetryLog({ agents }: { agents: AgentProgress[] }) {
  const lines = useMemo(() => {
    const result: Array<{ line: string; tone: string }> = [];

    for (let i = 0; i < agents.length; i++) {
      const a = agents[i]!;
      const meta = AGENT_META[a.agentName] ?? FALLBACK_META;

      let statusTag: string;
      let statusTone: string;
      switch (a.status) {
        case 'pending':
          statusTag = '[ QUEUED ]';
          statusTone = 'text-fg-subtle';
          break;
        case 'running':
          statusTag = '[ ANALYZING ]';
          statusTone = 'text-fg';
          break;
        case 'done':
          statusTag = '[ READY ]';
          statusTone = 'text-bull';
          break;
        case 'error':
          statusTag = '[ UNAVAILABLE ]';
          statusTone = 'text-danger';
          break;
      }

      const label = `${meta.label} Desk`.padEnd(16, ' ');
      result.push({
        line: `${label} ${statusTag}`,
        tone: statusTone,
      });
    }

    const hasRunning = agents.some((a) => a.status === 'running');
    const doneCount = agents.filter((a) => a.status === 'done').length;
    if (hasRunning) {
      result.push({
        line: `trade plan synthesis  [ ACTIVE ]`,
        tone: 'text-brand',
      });
    } else if (doneCount > 0 && agents.some((a) => a.status !== 'done' && a.status !== 'error')) {
      result.push({
        line: `trade plan synthesis  [ STANDBY ]`,
        tone: 'text-fg-subtle',
      });
    }

    return result;
  }, [agents]);

  return (
    <div className="bg-bg-elev-2/50 border-border/70 overflow-hidden rounded-lg border">
      <div className="border-border/60 flex items-center gap-2 border-b px-3 py-1.5">
        <IconTerminal2 className="text-fg-subtle size-3" />
        <span className="text-fg-subtle font-mono text-xs">Live Committee Progress</span>
      </div>
      <div className="grid grid-cols-1 gap-1 px-3 py-2 font-mono text-xs sm:grid-cols-2">
        {lines.map((l, i) => (
          <div key={i} className={l.tone || 'text-fg-subtle'}>
            {l.line}
          </div>
        ))}
      </div>
    </div>
  );
}

function BiasDistribution({
  counts,
  total,
}: {
  counts: { bullish: number; bearish: number; neutral: number };
  total: number;
}) {
  const rows: Array<{ label: string; count: number; bar: string }> = [
    { label: 'Bull', count: counts.bullish, bar: 'bg-bull' },
    { label: 'Bear', count: counts.bearish, bar: 'bg-bear' },
    { label: 'Neutral', count: counts.neutral, bar: 'bg-fg-muted' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      {rows.map((r) => {
        const pct = total > 0 ? (r.count / total) * 100 : 0;
        return (
          <div key={r.label} className="flex items-center gap-1.5">
            <span className="text-fg-subtle text-xs">{r.label}</span>
            <div className="bg-bg-elev-3 h-1.5 w-12 overflow-hidden rounded-sm">
              <m.div
                className={cn('h-full rounded-sm', r.bar)}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              />
            </div>
            <span className="text-fg-muted font-mono text-xs tabular-nums">{r.count}</span>
          </div>
        );
      })}
    </div>
  );
}
