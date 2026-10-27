'use client';

// SPDX-License-Identifier: Apache-2.0

// Certified Trade Plan Ticket header: verified status line, deterministic plan
// id with copy affordance, execution-direction badge, the Hoplite Risk
// Guardrail banner, the Bull/Bear Tug-of-War bar, and the four deep
// `#0a0b0c` execution wells.
import { IconAlertTriangle, IconCheck, IconCopy, IconShieldX } from '@tabler/icons-react';
import { useState } from 'react';

import { cn } from '@/lib/formatters/cn';

import type { ExtractedTradeLevels } from './extract-trade-levels';
import { InstrumentWells, TugOfWarBar } from './syndicate-instrument-wells';

export function SyndicateGuardrailBanner({
  levels,
}: {
  levels: Pick<ExtractedTradeLevels, 'isVetoed' | 'vetoReason' | 'dissent'>;
}) {
  if (!levels.isVetoed && !levels.dissent) return null;
  if (levels.isVetoed) {
    return (
      <div className="border-bear/40 bg-bear/[0.05] rounded-xl border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <IconShieldX className="text-bear size-4 shrink-0" />
            <div>
              <div className="text-bear font-mono text-[11px] font-bold tracking-wider uppercase">
                SETUP BLOCKED BY RISK GUARDRAIL
              </div>
              <div className="text-fg-subtle font-mono text-[10px] uppercase">
                HOPLITE · DESK-III · IMMUTABLE 1.0% CEILING
              </div>
            </div>
          </div>
          <span className="border-bear/30 bg-bear/10 text-bear rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase">
            Risk Veto Active
          </span>
        </div>
        {levels.vetoReason ? (
          <p className="text-fg-muted mt-2 text-xs leading-relaxed">{levels.vetoReason}</p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="border-warn/40 bg-warn/[0.05] rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconAlertTriangle className="text-warn size-4 shrink-0" />
          <div>
            <div className="text-warn font-mono text-[11px] font-bold tracking-wider uppercase">
              HOPLITE RISK GUARDRAIL — DESKS DISSENT
            </div>
            <div className="text-fg-subtle font-mono text-[10px] uppercase">
              REDUCE SIZING TO 0.5% UNTIL DESKS RE-ALIGN
            </div>
          </div>
        </div>
        <span className="border-warn/30 bg-warn/10 text-warn rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase">
          0.5% Cap
        </span>
      </div>
    </div>
  );
}

function DirectionBadge({ direction }: { direction: ExtractedTradeLevels['direction'] }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-3 py-1 text-center font-mono text-xs font-bold uppercase',
        direction === 'BUY'
          ? 'text-bull bg-bull/10 border-bull/30 shadow-[0_0_12px_rgba(63,158,61,0.2)]'
          : direction === 'SELL'
            ? 'text-bear bg-bear/10 border-bear/30 shadow-[0_0_12px_rgba(224,44,16,0.2)]'
            : 'text-warn bg-warn/10 border-warn/30',
      )}
    >
      {direction === 'BUY' ? 'BUY / GO' : direction === 'SELL' ? 'SELL / GO' : 'STAND ASIDE'}
    </span>
  );
}

export function SyndicateTicketHeader({
  symbol,
  planId,
  levels,
  mode,
}: {
  symbol: string | null;
  planId: string;
  levels: ExtractedTradeLevels;
  mode: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {/* ── Verified header row ── */}
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <span className="bg-bull size-2.5 shrink-0 rounded-full shadow-[0_0_8px_#3f9e3d]" />
          <div className="min-w-0">
            <div className="text-fg flex flex-wrap items-center gap-1.5 font-mono text-[11px] font-bold tracking-wider uppercase">
              <span>VERIFIED SYNDICATE DOSSIER{symbol ? ` · ${symbol}` : ''}</span>
            </div>
            <div className="text-fg-subtle mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px]">
              <span>PLAN {planId}</span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(`${planId} ${symbol ?? ''}`.trim());
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="hover:text-fg inline-flex min-h-6 items-center transition-colors"
                title="Copy plan id"
                aria-label="Copy plan id"
              >
                {copied ? (
                  <IconCheck className="text-bull size-3" />
                ) : (
                  <IconCopy className="size-3" />
                )}
              </button>
              <span>·</span>
              <span className="tabular-nums">
                {levels.dissent ? 'DESKS DISSENT' : 'ALIGNMENT CONFIRMED'}
              </span>
              <span>·</span>
              <span>{mode === 'single' ? 'FAST SCOUT' : '4-DESK COUNCIL'}</span>
            </div>
          </div>
        </div>
        <DirectionBadge direction={levels.direction} />
      </div>

      {/* ── Guardrail banner ── */}
      <SyndicateGuardrailBanner levels={levels} />

      {/* ── Tug-of-War consensus bar ── */}
      <TugOfWarBar bullProbability={levels.bullProbability} />

      {/* ── Four deep execution wells ── */}
      <InstrumentWells
        rr={levels.rr !== '—' ? levels.rr : undefined}
        levels={[
          { label: 'ENTRY ZONE', value: levels.entry },
          { label: 'INVALIDATION (SL)', value: levels.invalidation, tone: 'bear' },
          { label: 'TP1 (40% SCALE)', value: levels.tp1, tone: 'bull' },
          { label: 'TP2 RUNNER', value: levels.tp2, tone: 'bull' },
        ]}
      />
    </div>
  );
}
