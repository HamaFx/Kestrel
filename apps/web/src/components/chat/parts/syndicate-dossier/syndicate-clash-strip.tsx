'use client';

// SPDX-License-Identifier: Apache-2.0

// Desk alignment ledger: the four specialist desks run independently, so a
// directional split between them is the signal worth surfacing. The strip
// derives the bull/bear split from the settled opinions and quotes each side's
// own reasoning. The fusion synthesizer adjudicates the conflict; this panel
// only makes it visible.
import { IconSwords } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';
import { resolveStrategistDesk } from '@/lib/kestrel-strategist-desks';

import { AGENT_META, FALLBACK_META, type AgentProgress } from '../agent-deliberation/agent-meta';

export function SyndicateClashStrip({ opinions }: { opinions?: readonly AgentProgress[] }) {
  const bulls = (opinions ?? []).filter((a) => a.opinion?.bias === 'bullish');
  const bears = (opinions ?? []).filter((a) => a.opinion?.bias === 'bearish');
  const neutrals = (opinions ?? []).filter((a) => a.opinion?.bias === 'neutral');
  const hasDissent = bulls.length > 0 && bears.length > 0;

  return (
    <div className="flex flex-col gap-2.5" data-testid="syndicate-clash-strip">
      <div className="border-border/30 flex items-center justify-between border-b pb-2">
        <span className="text-brand flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-wider uppercase">
          <IconSwords className="size-3.5" /> Desk Alignment
        </span>
        <span className="text-fg-subtle font-mono text-[10px] uppercase tabular-nums">
          {bulls.length} BULL · {bears.length} BEAR · {neutrals.length} NEUTRAL
        </span>
      </div>

      {hasDissent ? (
        <div className="border-warn/30 bg-warn/[0.05] rounded-lg border p-2.5">
          <div className="text-warn font-mono text-[10px] font-bold tracking-wider uppercase">
            Desks disagree on direction
          </div>
          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            {bulls.map((a) => (
              <p key={`bull-${a.agentName}`} className="text-fg-muted text-xs leading-relaxed">
                <span className="text-bull font-mono text-[10px] uppercase">
                  {deskCode(a.agentName)} bullish ·
                </span>{' '}
                {a.opinion?.reasoning ?? a.opinion?.summary}
              </p>
            ))}
            {bears.map((a) => (
              <p key={`bear-${a.agentName}`} className="text-fg-muted text-xs leading-relaxed">
                <span className="text-bear font-mono text-[10px] uppercase">
                  {deskCode(a.agentName)} bearish ·
                </span>{' '}
                {a.opinion?.reasoning ?? a.opinion?.summary}
              </p>
            ))}
          </div>
          <p className="text-fg-subtle mt-1.5 font-mono text-[10px]">
            The synthesizer weighs each desk equally and adjudicates the conflict in the final
            report.
          </p>
        </div>
      ) : (
        <div
          className={cn(
            'surface-chip rounded-lg border p-2.5',
            bulls.length > 0 || bears.length > 0 ? 'border-bull/25' : 'border-border/40',
          )}
        >
          <p className="text-fg-muted text-xs leading-relaxed">
            {bulls.length > 0 || bears.length > 0
              ? 'All reporting desks agree on direction.'
              : 'No directional conviction from the reporting desks.'}
          </p>
        </div>
      )}
    </div>
  );
}

function deskCode(agentName: string): string {
  return (AGENT_META[agentName] ?? FALLBACK_META).code ?? resolveStrategistDesk(agentName).code;
}
