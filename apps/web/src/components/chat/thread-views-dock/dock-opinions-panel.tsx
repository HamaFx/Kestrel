'use client';

// SPDX-License-Identifier: Apache-2.0

// 4-Desk opinions tab: live deliberation or the empty-state copy.
import { IconUsers } from '@tabler/icons-react';

import type { AgentProgress } from '@/lib/chat-transport';

import { AgentDeliberation } from '../parts/agent-deliberation';

export function DockOpinionsPanel({ agentProgress }: { agentProgress?: AgentProgress | null }) {
  return (
    <div className="scrollbar-hide h-full overflow-y-auto p-4">
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
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 text-center">
          <IconUsers className="text-fg-subtle size-8 stroke-1" />
          <p className="text-fg-muted text-sm font-medium">4-Desk Committee Ready</p>
          <p className="text-fg-subtle max-w-xs text-xs">
            Opinions from the Technical, Macro, Risk, and Sentiment desks appear here during
            analysis.
          </p>
        </div>
      )}
    </div>
  );
}
