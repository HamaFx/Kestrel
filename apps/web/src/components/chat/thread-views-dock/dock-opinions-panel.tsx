'use client';

// SPDX-License-Identifier: Apache-2.0

// Syndicate War Room sidecar: the live Hoplite Plasma Circuit Spine while a
// council run is in flight, or the settled 4-Desk Matrix + Cross-Examination
// ledger hydrated from the newest `data-multi-agent-meta` (so a page reload
// with `agentProgress === null` still shows the full committee record).
import { IconUsers } from '@tabler/icons-react';
import type { UIMessage } from 'ai';

import type { AgentProgress } from '@/lib/chat-transport';

import { SyndicateCircuitLive } from '../parts/syndicate-dossier/syndicate-circuit-live';
import { SyndicateClashStrip } from '../parts/syndicate-dossier/syndicate-clash-strip';
import { SyndicateDeskGrid } from '../parts/syndicate-dossier/syndicate-desk-grid';
import { useLatestSyndicateMeta } from './use-latest-syndicate-meta';

export function DockOpinionsPanel({
  agentProgress,
  messages = [],
}: {
  agentProgress?: AgentProgress | null;
  messages?: UIMessage[];
}) {
  const latest = useLatestSyndicateMeta(messages, agentProgress);
  const agents = Array.isArray(latest?.agents) ? latest.agents : [];
  const opinions = agents.filter((a) => a.opinion);
  const isRunning =
    Boolean(latest) &&
    latest?.status !== 'complete' &&
    latest?.status !== 'failed' &&
    agents.some((a) => a.status === 'running' || a.status === 'pending');
  const doneCount = agents.filter((a) => a.status === 'done').length;
  const avgConfidence =
    opinions.length > 0
      ? Math.round(
          (opinions.reduce((sum, a) => sum + (a.opinion?.confidence ?? 0), 0) / opinions.length) *
            100,
        )
      : 0;

  return (
    <div className="scrollbar-hide h-full overflow-y-auto p-4">
      <div className="border-border/40 mb-3.5 flex items-center justify-between border-b pb-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-brand size-2 animate-pulse rounded-full" />
          <span className="text-brand font-mono text-[10px] font-semibold tracking-wider uppercase">
            SYNDICATE WAR ROOM
          </span>
        </div>
        <span className="text-fg-subtle font-mono text-[10px] uppercase tabular-nums">
          {latest?.symbol ? `${latest.symbol} · ` : ''}
          {opinions.length > 0
            ? `${doneCount}/${agents.length} DESKS · ${avgConfidence}% CONV`
            : 'AWAITING COUNCIL'}
        </span>
      </div>

      {latest ? (
        isRunning ? (
          <SyndicateCircuitLive agentProgress={latest} className="max-w-none" />
        ) : (
          <div className="flex flex-col gap-4">
            <SyndicateDeskGrid
              agents={agents}
              opinions={opinions}
              avgConfidence={avgConfidence}
              biasCounts={{
                bullish: opinions.filter((a) => a.opinion?.bias === 'bullish').length,
                bearish: opinions.filter((a) => a.opinion?.bias === 'bearish').length,
                neutral: opinions.filter((a) => a.opinion?.bias === 'neutral').length,
              }}
              dissent={
                opinions.some((a) => a.opinion?.bias === 'bullish') &&
                opinions.some((a) => a.opinion?.bias === 'bearish')
              }
              confidenceTone={avgConfidence > 75 ? 'bg-bull' : 'bg-warn'}
            />
            <SyndicateClashStrip critiques={latest.critiques} opinions={opinions} />
          </div>
        )
      ) : (
        <div className="surface-card border-border/40 bg-bg-elev-1 flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-xl border p-6 text-center shadow-sm">
          <IconUsers className="text-brand size-8 stroke-1" />
          <p className="font-display text-fg text-sm font-normal">4-Desk Committee Ready</p>
          <p className="text-fg-muted max-w-xs font-serif text-xs italic">
            HORUS, ASTROLABE, HOPLITE, and SENTINEL opinions synchronize here in real time.
          </p>
        </div>
      )}
    </div>
  );
}
