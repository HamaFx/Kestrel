'use client';

// SPDX-License-Identifier: Apache-2.0

// Hydrates the Council War Room from the latest settled
// `data-multi-agent-meta` part so a page reload (`agentProgress === null`)
// still shows the 4-desk grid and the cross-examination ledger instead of an
// empty "committee ready" placeholder.
import type { UIMessage } from 'ai';
import { useMemo } from 'react';

import { projectCompletedJob } from '@/lib/chat-transport/job-result';
import type { AgentProgress } from '@/lib/chat-transport/types';

export function useLatestSyndicateMeta(
  messages: UIMessage[],
  liveProgress?: AgentProgress | null,
): AgentProgress | null {
  return useMemo(() => {
    const isLive =
      liveProgress &&
      Array.isArray(liveProgress.agents) &&
      liveProgress.agents.length > 0 &&
      liveProgress.status !== 'complete';

    // A run in flight always wins: never overwrite live telemetry with history.
    if (isLive) return liveProgress;

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message || message.role !== 'assistant') continue;
      for (const part of message.parts ?? []) {
        const candidate = part as { type?: string; data?: Record<string, unknown> };
        if (candidate.type !== 'data-multi-agent-meta' || !candidate.data) continue;
        const data = candidate.data;
        if (!Array.isArray(data.agentOpinions) || data.agentOpinions.length === 0) continue;

        const projection = projectCompletedJob(
          {
            agentOpinions: data.agentOpinions,
            ...(Array.isArray(data.committeeCritiques)
              ? { committeeCritiques: data.committeeCritiques }
              : {}),
            ...(typeof data.mode === 'string' ? { mode: data.mode } : {}),
            ...(typeof data.symbol === 'string' ? { symbol: data.symbol } : {}),
            ...(typeof data.dataQuality === 'string' ? { dataQuality: data.dataQuality } : {}),
          },
          message.id,
        );
        if (projection.completedProgress) return projection.completedProgress;
      }
    }

    return liveProgress ?? null;
  }, [messages, liveProgress]);
}
