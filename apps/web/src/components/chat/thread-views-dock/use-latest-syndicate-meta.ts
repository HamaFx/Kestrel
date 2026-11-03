'use client';

// SPDX-License-Identifier: Apache-2.0

// Hydrates the Council War Room from the latest settled
// `data-multi-agent-meta` part so a page reload (`agentProgress === null`)
// still shows the 4-desk grid and the alignment ledger instead of an empty
// "committee ready" placeholder.
import type { UIMessage } from 'ai';
import { useMemo } from 'react';

import type { AgentProgress } from '@/lib/chat-transport/types';

interface SettledOpinion {
  agentName: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
  summary?: string;
  model?: string;
  latencyMs?: number;
}

function isSettledOpinion(value: unknown): value is SettledOpinion {
  const opinion = value as Partial<SettledOpinion> | null;
  return (
    typeof opinion?.agentName === 'string' &&
    (opinion.bias === 'bullish' || opinion.bias === 'bearish' || opinion.bias === 'neutral') &&
    typeof opinion.confidence === 'number' &&
    typeof opinion.reasoning === 'string'
  );
}

/** Project one persisted `data-multi-agent-meta` payload onto the War Room shape. */
function progressFromMeta(data: Record<string, unknown>): AgentProgress | null {
  if (!Array.isArray(data.agentOpinions)) return null;
  const opinions = data.agentOpinions.filter(isSettledOpinion);
  if (opinions.length === 0) return null;
  const mode = typeof data.mode === 'string' ? data.mode : 'full';
  const desks =
    mode === 'single' ? ['technical'] : ['technical', 'fundamental', 'risk', 'sentiment'];
  const byAgent = new Map(opinions.map((opinion) => [opinion.agentName, opinion]));
  return {
    agents: desks.map((agentName) => {
      const opinion = byAgent.get(agentName);
      return {
        agentName,
        status: 'done' as const,
        ...(opinion ? { opinion } : {}),
      };
    }),
    mode,
    stage: 'fusion',
    status: 'complete',
    ...(typeof data.symbol === 'string' ? { symbol: data.symbol } : {}),
    ...(typeof data.dataQuality === 'string' ? { dataQuality: data.dataQuality } : {}),
  };
}

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
        const projection = progressFromMeta(candidate.data);
        if (projection) return projection;
      }
    }

    return liveProgress ?? null;
  }, [messages, liveProgress]);
}
