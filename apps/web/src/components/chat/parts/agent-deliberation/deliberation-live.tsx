// SPDX-License-Identifier: Apache-2.0

'use client';

// Live deliberation state: the Hoplite Plasma Circuit Spine on top, and the
// compact desk phalanx + telemetry trace below. Owns the running-state
// aria-label contracts (`${label} desk: ${status}`, `Live Committee Progress`,
// `[ ANALYZING ] / [ QUEUED ] / [ READY ]`).
import { AnimatePresence, m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import { SyndicateCircuitLive } from '../syndicate-dossier/syndicate-circuit-live';
import { AgentNode } from './agent-node';
import {
  AGENT_META,
  FALLBACK_META,
  formatPlainModeLabel,
  type AgentProgress,
} from './agent-meta';
import { ConnectorLines } from './connector-lines';
import { TelemetryLog } from './telemetry-log';

export function DeliberationLive({
  agents,
  mode,
  status,
  error,
  comparisonSymbols,
  stage,
}: {
  agents: AgentProgress[];
  mode: string;
  status?: 'complete' | 'failed' | 'retrying';
  error?: string;
  comparisonSymbols?: string[];
  stage?: string;
}) {
  const hasDone = agents.some((a) => a.status === 'done');
  const isFailed = status === 'failed';
  const isRetrying = status === 'retrying';
  const allDone = agents.every((a) => a.status === 'done' || a.status === 'error');
  const doneCount = agents.filter((a) => a.status === 'done').length;
  const progressPct = agents.length > 0 ? Math.round((doneCount / agents.length) * 100) : 0;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-2.5">
      <SyndicateCircuitLive
        agentProgress={{
          agents,
          mode,
          ...(stage ? { stage } : {}),
          ...(comparisonSymbols ? { comparisonSymbols } : {}),
        }}
      />

      <div className="surface-panel border-border/80 bg-bg-elev-1 flex flex-col gap-3 rounded-xl border p-4 shadow-sm">
        {/* Header & Step Progress */}
        <div className="border-border/60 flex items-center justify-between gap-2 border-b pb-2.5">
          <div className="text-fg flex items-center gap-2 text-xs font-semibold">
            <span className="text-brand font-mono text-[10px] font-bold tracking-wider uppercase">
              {formatPlainModeLabel(mode, comparisonSymbols)}
            </span>
          </div>

          {!allDone ? (
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
          ) : null}
        </div>

        {/* Adaptive Desk Status Cards (phalanx in full mode, chip in single) */}
        <div
          className={cn(
            'grid gap-2',
            agents.length === 1
              ? 'grid-cols-1'
              : agents.length === 2
                ? 'grid-cols-1 sm:grid-cols-2'
                : 'grid-cols-2 sm:grid-cols-4',
          )}
        >
          {agents.map((a) => {
            const meta = AGENT_META[a.agentName] ?? FALLBACK_META;
            return (
              <AgentNode key={a.agentName} agent={a} meta={meta} isSingle={agents.length === 1} />
            );
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
                ? 'Retrying 4-Desk Council analysis…'
                : '4-Desk Council analysis incomplete'}
            </div>
            <p className="mt-1 leading-relaxed">
              {error ??
                (isRetrying
                  ? 'A temporary issue occurred. Retrying the council analysis automatically…'
                  : 'One of the specialist desks could not complete its check, so an incomplete trade plan was withheld.')}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
