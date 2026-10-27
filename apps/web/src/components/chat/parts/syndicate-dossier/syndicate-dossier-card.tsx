'use client';

// SPDX-License-Identifier: Apache-2.0

// The canonical Certified Syndicate Dossier (Locked Decision 4A): one unified
// card that retires `MastraReportCard`'s free-floating summary,
// `VerdictSummary`, and `ConveneCommitteePart`'s synthesis block. Header +
// plan ticket + guardrail + 4 execution wells sit above adaptive segmented
// tabs for the 4-Desk Matrix, the Cross-Examination ledger, and the data
// provenance panel. On desktop with the War Room open the parent passes
// `compactInline` so the desks/clashes live only in the sidecar.
import { IconDatabase, IconSwords, IconUsers } from '@tabler/icons-react';
import { useMemo, useState, type ReactNode } from 'react';

import { cn } from '@/lib/formatters/cn';

import type { AgentProgress } from '../agent-deliberation/agent-meta';
import {
  buildSyndicatePlanId,
  extractSyndicateTradeLevels,
  type SyndicateTradeOpinion,
} from './extract-trade-levels';
import { SyndicateClashStrip, type SyndicateClash } from './syndicate-clash-strip';
import { SyndicateDeskGrid } from './syndicate-desk-grid';
import { SyndicateTicketHeader } from './syndicate-dossier-header';

type DossierTab = 'desks' | 'clash' | 'data';

export interface SyndicateDossierCardProps {
  agents: AgentProgress[];
  opinions: AgentProgress[];
  mode: string;
  status?: 'complete' | 'failed' | 'retrying';
  critiques?: readonly SyndicateClash[];
  symbol?: string | null;
  /** Raw opinions (with `rawData.keyLevels`) preferred for level extraction. */
  tradeOpinions?: readonly SyndicateTradeOpinion[];
  /** Arbiter synthesis markdown used as the level-extraction fallback. */
  text?: string;
  dataQuality?: string;
  /** Desktop War Room is open: collapse the desk/clash tabs into a pill. */
  compactInline?: boolean;
  onOpenWarRoom?: () => void;
  /** Adapter extras (`mastra-report`): accessible region + test hooks. */
  regionLabel?: string;
  testId?: string;
  badge?: ReactNode;
  children?: ReactNode;
  className?: string;
}

function DataPanel({
  symbol,
  mode,
  dataQuality,
  deskCount,
}: {
  symbol: string | null;
  mode: string;
  dataQuality?: string;
  deskCount: number;
}) {
  const rows: Array<[string, string]> = [
    ['Symbol', symbol ?? '—'],
    ['Mode', mode === 'single' ? 'Fast Scout (single-pass)' : 'Convene Council (4-desk)'],
    ['Desks', `${deskCount} specialist desk${deskCount === 1 ? '' : 's'}`],
    ['Packet', dataQuality === 'complete' || !dataQuality ? 'Verified against live feed' : dataQuality],
  ];
  return (
    <div className="border-border/30 flex flex-col gap-1.5 border-t pt-2.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 font-mono text-[11px]">
          <span className="text-fg-subtle uppercase">{label}</span>
          <span className="text-fg truncate text-right tabular-nums">{value}</span>
        </div>
      ))}
      <p className="text-fg-subtle mt-1 font-mono text-[10px] leading-relaxed">
        Numerically audited against the locked market packet; no unverified levels are certified.
      </p>
    </div>
  );
}

export function SyndicateDossierCard({
  agents,
  opinions,
  mode,
  critiques,
  symbol = null,
  tradeOpinions,
  text,
  dataQuality,
  compactInline,
  onOpenWarRoom,
  regionLabel,
  testId,
  badge,
  children,
  className,
}: SyndicateDossierCardProps) {
  const [tab, setTab] = useState<DossierTab>('desks');

  const levels = useMemo(
    () =>
      extractSyndicateTradeLevels({
        symbol,
        ...(tradeOpinions && tradeOpinions.length > 0
          ? { opinions: tradeOpinions }
          : {
              opinions: opinions.map((a) => ({
                agentName: a.agentName,
                bias: a.opinion?.bias ?? ('neutral' as const),
                confidence: a.opinion?.confidence ?? 0,
                ...(a.opinion?.reasoning ? { reasoning: a.opinion.reasoning } : {}),
              })),
            }),
        ...(text ? { text } : {}),
      }),
    [symbol, opinions, tradeOpinions, text],
  );
  const planId = useMemo(
    () =>
      buildSyndicatePlanId(
        [
          symbol ?? '',
          mode,
          ...opinions.map((a) => `${a.agentName}:${a.opinion?.bias ?? '?'}:${a.opinion?.confidence ?? 0}`),
          levels.entry,
          levels.invalidation,
        ].join('|'),
      ),
    [symbol, mode, opinions, levels.entry, levels.invalidation],
  );

  const clashCount =
    (critiques ?? []).filter((clash) => !clash.confirms).length ||
    (levels.dissent ? 1 : 0);
  const doneDesks = opinions.length;

  const tabs: Array<{ id: DossierTab; label: string; icon: typeof IconUsers }> = [
    { id: 'desks', label: `🏛️ 4 Desks (${doneDesks}/${doneDesks || 4})`, icon: IconUsers },
    { id: 'clash', label: `⚔️ Cross-Examination (${clashCount})`, icon: IconSwords },
    { id: 'data', label: '📊 Data & Sources', icon: IconDatabase },
  ];

  return (
    <section
      {...(regionLabel ? { role: 'region', 'aria-label': regionLabel } : {})}
      {...(testId ? { 'data-testid': testId } : {})}
      className={cn(
        'surface-panel border-brand/40 bg-brand/[0.03] mt-3 flex w-full flex-col gap-3.5 rounded-xl border p-4 shadow-xl sm:p-5',
        className,
      )}
      style={{
        backgroundImage:
          'radial-gradient(ellipse 52% 44% at 100% 0%, rgba(255,54,22,0.10) 0%, transparent 70%)',
      }}
    >
      <SyndicateTicketHeader symbol={symbol} planId={planId} levels={levels} mode={mode} />
      {badge}

      {compactInline ? (
        <div className="border-brand/30 bg-brand/[0.04] flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
          <span className="text-brand font-mono text-[10px] font-semibold tracking-wider uppercase">
            🏛️ 4 Desks &amp; Cross-Examination open in War Room
          </span>
          {onOpenWarRoom ? (
            <button
              type="button"
              onClick={onOpenWarRoom}
              className="text-brand hover:text-brand-fg min-h-11 font-mono text-[10px] font-bold uppercase transition-colors sm:min-h-9"
            >
              View →
            </button>
          ) : null}
        </div>
      ) : (
        <div role="tablist" aria-label="Dossier views" className="flex flex-wrap items-center gap-1.5">
          {tabs.map(({ id, label, icon: Icon }) => {
            const isActive = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(id)}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-[10px] font-semibold tracking-wide uppercase transition-all sm:min-h-9',
                  isActive
                    ? 'border-brand/40 bg-brand/10 text-brand'
                    : 'border-border/50 bg-bg-elev-2 text-fg-muted hover:text-fg',
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      )}

      {!compactInline && tab === 'desks' && opinions.length > 0 ? (
        <SyndicateDeskGrid
          agents={agents}
          opinions={opinions}
          avgConfidence={Math.round(
            (opinions.reduce((sum, a) => sum + (a.opinion?.confidence ?? 0), 0) /
              opinions.length) *
              100,
          )}
          biasCounts={{
            bullish: opinions.filter((a) => a.opinion?.bias === 'bullish').length,
            bearish: opinions.filter((a) => a.opinion?.bias === 'bearish').length,
            neutral: opinions.filter((a) => a.opinion?.bias === 'neutral').length,
          }}
          dissent={levels.dissent}
          confidenceTone={
            Math.round(
              (opinions.reduce((sum, a) => sum + (a.opinion?.confidence ?? 0), 0) /
                opinions.length) *
                100,
            ) > 75
              ? 'bg-bull'
              : 'bg-warn'
          }
        />
      ) : null}

      {!compactInline && tab === 'clash' ? (
        <SyndicateClashStrip critiques={critiques} opinions={opinions} />
      ) : null}

      {!compactInline && tab === 'data' ? (
        <DataPanel symbol={symbol} mode={mode} dataQuality={dataQuality} deskCount={doneDesks} />
      ) : null}

      {children}
    </section>
  );
}
