'use client';

// SPDX-License-Identifier: Apache-2.0

// Cross-Examination & Clashes ledger (Locked Decision 3A): renders the
// `committeeCritiques` from `packages/ai/src/committee/critique-steps.ts` —
// which desks confirmed peer assumptions (✓) versus challenged them (⚔️),
// the revised confidence, and the exact critique text. When a run predates the
// critique round but the desks still dissent, a synthesized Dissenting Desk
// Clash compares the opposing rationales instead of showing an empty ledger.
import { IconSwords } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';
import { resolveStrategistDesk } from '@/lib/kestrel-strategist-desks';

import { AGENT_META, FALLBACK_META, type AgentProgress } from '../agent-deliberation/agent-meta';

export interface SyndicateClash {
  agentName: string;
  confirms: boolean;
  revisedConfidence: number;
  critique: string;
}

export function SyndicateClashStrip({
  critiques,
  opinions,
}: {
  critiques?: readonly SyndicateClash[];
  opinions?: readonly AgentProgress[];
}) {
  const ledger = critiques ?? [];
  const challenges = ledger.filter((clash) => !clash.confirms).length;
  const bulls = (opinions ?? []).filter((a) => a.opinion?.bias === 'bullish');
  const bears = (opinions ?? []).filter((a) => a.opinion?.bias === 'bearish');
  const hasSynthesizedDissent = ledger.length === 0 && bulls.length > 0 && bears.length > 0;

  return (
    <div className="flex flex-col gap-2.5" data-testid="syndicate-clash-strip">
      <div className="border-border/30 flex items-center justify-between border-b pb-2">
        <span className="text-brand flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-wider uppercase">
          <IconSwords className="size-3.5" /> Adversarial Cross-Examination
        </span>
        <span className="text-fg-subtle font-mono text-[10px] uppercase tabular-nums">
          {ledger.length > 0
            ? `${challenges} CLASH${challenges === 1 ? '' : 'ES'} · ${ledger.length} AUDIT${
                ledger.length === 1 ? '' : 'S'
              }`
            : 'NO CRITIQUE ROUND'}
        </span>
      </div>

      {ledger.map((clash) => {
        const meta = AGENT_META[clash.agentName] ?? FALLBACK_META;
        const desk = resolveStrategistDesk(clash.agentName);
        return (
          <div
            key={`${clash.agentName}-${clash.critique.slice(0, 24)}`}
            className={cn(
              'surface-chip rounded-lg border p-2.5',
              clash.confirms ? 'border-bull/25' : 'border-brand/30 bg-brand/[0.04]',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase',
                    clash.confirms
                      ? 'border-bull/30 bg-bull/10 text-bull'
                      : 'border-brand/40 bg-brand/10 text-brand',
                  )}
                >
                  {clash.confirms ? '✓ CONFIRMED' : '⚔️ CHALLENGED'}
                </span>
                <span className="text-fg font-mono text-[10px] font-semibold tracking-wider uppercase">
                  {desk.code}
                </span>
                <span className="text-fg-subtle font-mono text-[10px]">{meta.label}</span>
              </div>
              <span className="text-fg-muted font-mono text-[10px] tabular-nums">
                CONF {Math.round(clash.revisedConfidence * 100)}%
              </span>
            </div>
            <p className="text-fg-muted mt-1.5 text-xs leading-relaxed">{clash.critique}</p>
          </div>
        );
      })}

      {hasSynthesizedDissent ? (
        <div className="border-warn/30 bg-warn/[0.05] rounded-lg border p-2.5">
          <div className="text-warn font-mono text-[10px] font-bold tracking-wider uppercase">
            ⚔️ Dissenting Desk Clash — no peer-critique round recorded
          </div>
          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            {bulls.map((a) => (
              <p key={`bull-${a.agentName}`} className="text-fg-muted text-xs leading-relaxed">
                <span className="text-bull font-mono text-[10px] uppercase">
                  {(AGENT_META[a.agentName] ?? FALLBACK_META).code} bullish ·
                </span>{' '}
                {a.opinion?.reasoning ?? a.opinion?.summary}
              </p>
            ))}
            {bears.map((a) => (
              <p key={`bear-${a.agentName}`} className="text-fg-muted text-xs leading-relaxed">
                <span className="text-bear font-mono text-[10px] uppercase">
                  {(AGENT_META[a.agentName] ?? FALLBACK_META).code} bearish ·
                </span>{' '}
                {a.opinion?.reasoning ?? a.opinion?.summary}
              </p>
            ))}
          </div>
          <p className="text-fg-subtle mt-1.5 font-mono text-[10px]">
            Desks disagree on direction — the Arbiter caps exposure until alignment returns.
          </p>
        </div>
      ) : null}

      {ledger.length > 0 && challenges === 0 ? (
        <p className="text-bull font-mono text-[10px] tracking-wide uppercase">
          All audited desks confirmed their peers — no unresolved clashes.
        </p>
      ) : null}
    </div>
  );
}
