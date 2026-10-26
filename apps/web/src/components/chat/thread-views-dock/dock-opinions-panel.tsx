'use client';

// SPDX-License-Identifier: Apache-2.0

// 4-Desk opinions tab: live deliberation or the empty-state copy.
import { IconUsers } from '@tabler/icons-react';

import type { AgentProgress } from '@/lib/chat-transport';

import { AgentDeliberation } from '../parts/agent-deliberation';

export function DockOpinionsPanel({ agentProgress }: { agentProgress?: AgentProgress | null }) {
  return (
    <div className="scrollbar-hide h-full overflow-y-auto p-4">
      <div className="mb-3.5 flex items-center justify-between border-b border-border/40 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="size-2 animate-pulse rounded-full bg-brand" />
          <span className="font-mono text-[10px] font-semibold tracking-wider text-brand uppercase">
            COUNCIL DELIBERATION CHAMBER
          </span>
        </div>
        <span className="font-mono text-[10px] text-fg-subtle uppercase">4/4 Desks</span>
      </div>

      {agentProgress ? (
        <AgentDeliberation
          agents={agentProgress.agents}
          mode={agentProgress.mode}
          status={agentProgress.status}
          error={agentProgress.error}
          {...(agentProgress.comparisonSymbols
            ? { comparisonSymbols: agentProgress.comparisonSymbols }
            : {})}
        />
      ) : (
        <div className="surface-card flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-xl border border-border/40 bg-bg-elev-1 p-6 text-center shadow-sm">
          <IconUsers className="size-8 stroke-1 text-brand" />
          <p className="font-display text-sm font-normal text-fg">4-Desk Committee Ready</p>
          <p className="max-w-xs font-serif text-xs italic text-fg-muted">
            Opinions from the Macro, Quant, Risk, and Sentiment desks will synchronize here in real time.
          </p>
        </div>
      )}
    </div>
  );
}
