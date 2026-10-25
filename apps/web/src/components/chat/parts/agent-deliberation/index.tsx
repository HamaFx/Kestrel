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

// 4-desk deliberation panel shell. Desk metadata lives in `agent-meta.tsx`
// and every section below the header is its own component.
import { IconCpu } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import {
  AGENT_META,
  FALLBACK_META,
  formatPlainModeLabel,
  type AgentDeliberationProps,
} from './agent-meta';
import { AgentNode } from './agent-node';
import { ConnectorLines } from './connector-lines';
import { TelemetryLog } from './telemetry-log';
import { VerdictSummary } from './verdict-summary';

export function AgentDeliberation({
  agents,
  mode,
  status,
  error,
  comparisonSymbols,
}: AgentDeliberationProps) {
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
          <span>{formatPlainModeLabel(mode, comparisonSymbols)}</span>
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
          <VerdictSummary
            agents={agents}
            opinions={opinions}
            avgConfidence={avgConfidence}
            biasCounts={biasCounts}
            dissent={dissent}
            confidenceTone={confidenceTone}
          />
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
