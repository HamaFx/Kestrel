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

// SPDX-License-Identifier: Apache-2.0
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';

import type { AgentProgress } from '@/lib/chat-transport';
import { cn } from '@/lib/cn';
import { getSessionInfo } from '@/lib/session';

import {
  ChartWizardSprite,
  KestrelFalconSprite,
  MacroMageSprite,
  RiskKnightSprite,
} from './pixel-sprites';

const QUANT_STATUS_STEPS = [
  'Reading 15m, 1h & 4h market structure…',
  'Evaluating macro catalysts, real yields & DXY…',
  'Auditing 1% risk sizing & ATR invalidation levels…',
  'Scanning CFTC COT positioning & order flow…',
  'Synthesizing 4-desk committee consensus…',
];

export interface CharacterProfile {
  id: 'technical' | 'fundamental' | 'risk' | 'sentiment';
  name: string;
  role: string;
  badgeClass: string;
  glowColor: string;
  title: string;
  specialty: string;
  indicators: string;
  motto: string;
}

export const CHARACTER_PROFILES: Record<string, CharacterProfile> = {
  technical: {
    id: 'technical',
    name: 'Technical Structure',
    role: 'Desk 01 · Price Action',
    badgeClass: 'text-bull border-bull/30 bg-bull/10',
    glowColor: 'rgba(63, 158, 61, 0.14)',
    title: 'Multi-Timeframe Structure & Liquidity',
    specialty: '4H/1H/15m market structure, order blocks, FVGs & session highs/lows',
    indicators: 'EMA 20/50/200, RSI-14, ATR-14, Session Pivots',
    motto: 'Price structure and liquidity levels define the execution frame.',
  },
  fundamental: {
    id: 'fundamental',
    name: 'Macro & Rates',
    role: 'Desk 02 · Catalysts',
    badgeClass: 'text-info border-info/30 bg-info/10',
    glowColor: 'rgba(79, 163, 181, 0.14)',
    title: 'Central Banks, Real Yields & Releases',
    specialty: '10Y real yields, DXY correlation, central bank policy & high-impact calendar',
    indicators: 'US10Y Real Yield, DXY, CPI/NFP/FOMC Releases',
    motto: 'Rate differentials and macro catalysts drive sustained directional flow.',
  },
  risk: {
    id: 'risk',
    name: 'Risk & Sizing',
    role: 'Desk 03 · Governance',
    badgeClass: 'text-bear border-bear/30 bg-bear/10',
    glowColor: 'rgba(224, 44, 16, 0.14)',
    title: 'Invalidation, Stop Placement & R:R',
    specialty: '1% capital sizing, ATR volatility buffers, and hard invalidation thresholds',
    indicators: 'ATR-14 Stop Distance, 1:2.5+ R:R, Drawdown Guard',
    motto: 'Every thesis requires an explicit price invalidation level before entry.',
  },
  sentiment: {
    id: 'sentiment',
    name: 'Flow & Positioning',
    role: 'Desk 04 · Sentiment',
    badgeClass: 'text-warn border-warn/30 bg-warn/10',
    glowColor: 'rgba(217, 143, 0, 0.14)',
    title: 'COT Institutional Flow & Crowd Skew',
    specialty: 'CFTC Commitments of Traders (COT), commercial hedging & retail crowding',
    indicators: 'CFTC Net Non-Commercials, Retail Long/Short Skew',
    motto: 'Institutional positioning reveals whether a move is crowded or supported.',
  },
};

const DESK_ORDER: Array<'technical' | 'fundamental' | 'risk' | 'sentiment'> = [
  'technical',
  'fundamental',
  'risk',
  'sentiment',
];

export interface PixelAgentOpinion {
  agentName: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
}

interface PixelDeskDeliberationProps {
  opinions: PixelAgentOpinion[];
  mode?: string;
  className?: string;
}

function renderDeskGlyph(
  deskId: string,
  opts?: { isThinking?: boolean; isDone?: boolean; bias?: 'bullish' | 'bearish' | 'neutral' },
) {
  switch (deskId) {
    case 'technical':
      return <ChartWizardSprite {...opts} />;
    case 'fundamental':
      return <MacroMageSprite {...opts} />;
    case 'risk':
      return <RiskKnightSprite {...opts} />;
    default:
      return <KestrelFalconSprite {...opts} />;
  }
}

const QUICK_SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'USDJPY'] as const;

/**
 * PixelDeskStandby
 * Clean, high-signal 4-Desk Research Ledger for the Chat empty state and Dashboard widget.
 * Replaces arcade CRT clutter with a calm, institutional 4-desk matrix and direct brief launcher.
 */
export function PixelDeskStandby({
  pinnedSymbol,
  onSelectPrompt,
  disabled,
  now,
  className,
}: {
  pinnedSymbol?: string | null;
  onSelectPrompt?: (prompt: string) => void;
  disabled?: boolean;
  now?: Date;
  className?: string;
}) {
  const [activeDesk, setActiveDesk] = useState<
    'all' | 'technical' | 'fundamental' | 'risk' | 'sentiment'
  >('all');
  const [customSymbol, setCustomSymbol] = useState<string | null>(null);

  const sessionInfo = useMemo(() => getSessionInfo(now ?? new Date()), [now]);
  const activeSymbol = (customSymbol ?? pinnedSymbol ?? 'XAUUSD').toUpperCase();

  const deskBriefs = useMemo(() => {
    const s = activeSymbol;
    return {
      technical: [
        {
          id: 't1',
          desk: 'Technical',
          title: `${s} 4H → 15m structure & key levels`,
          detail: 'Order blocks, liquidity sweeps, and session high/low pivots',
          prompt: `Run a top-down 4H to 15m technical structure and key liquidity level analysis on ${s}.`,
        },
        {
          id: 't2',
          desk: 'Technical',
          title: `${s} imbalance zones & EMA alignment`,
          detail: 'Fair value gaps, RSI-14 regime, and 20/50/200 EMA confluence',
          prompt: `Map active Fair Value Gaps (FVG) and 20/50/200 EMA trend alignment on ${s}.`,
        },
      ],
      fundamental: [
        {
          id: 'f1',
          desk: 'Macro',
          title: `${sessionInfo.label} macro catalysts for ${s}`,
          detail: 'Upcoming high-impact releases and central bank rate expectations',
          prompt: `What are the key economic calendar catalysts and central bank drivers for ${s} this session?`,
        },
        {
          id: 'f2',
          desk: 'Macro',
          title: `US 10Y real yields & DXY vs ${s}`,
          detail: 'Cross-asset rate divergence and dollar index pressure',
          prompt: `Analyze US 10-year real yields and DXY correlation against ${s} right now.`,
        },
      ],
      risk: [
        {
          id: 'r1',
          desk: 'Risk',
          title: `${s} 1% position size & ATR invalidation`,
          detail: 'Volatility-adjusted stop placement and 1:2.5+ target structure',
          prompt: `Calculate 1% risk position sizing, ATR stop loss distance, and invalidation level for ${s}.`,
        },
        {
          id: 'r2',
          desk: 'Risk',
          title: `Scenario stress test & key breach levels`,
          detail: 'Bull/bear invalidation triggers and maximum drawdown guardrails',
          prompt: `What price level invalidates the current ${s} thesis, and where should risk alerts sit?`,
        },
      ],
      sentiment: [
        {
          id: 's1',
          desk: 'Sentiment',
          title: `${s} CFTC COT institutional positioning`,
          detail: 'Non-commercial speculator net flow vs commercial hedgers',
          prompt: `Check CFTC Commitments of Traders (COT) institutional positioning and net flow for ${s}.`,
        },
        {
          id: 's2',
          desk: 'Sentiment',
          title: `Crowd skew & contrarian exhaustion check`,
          detail: 'Retail positioning extremes and smart-money divergence',
          prompt: `Analyze retail sentiment skew and institutional order flow divergence on ${s}.`,
        },
      ],
    };
  }, [activeSymbol, sessionInfo.label]);

  const visibleBriefs = useMemo(() => {
    if (activeDesk === 'all') {
      return [
        deskBriefs.technical[0]!,
        deskBriefs.fundamental[0]!,
        deskBriefs.risk[0]!,
        deskBriefs.sentiment[0]!,
      ];
    }
    return deskBriefs[activeDesk];
  }, [activeDesk, deskBriefs]);

  return (
    <div
      role="region"
      aria-label="4-Desk AI Research Committee"
      className={cn(
        'border-border bg-bg-elev-1 flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border text-left shadow-sm',
        className,
      )}
    >
      {/* Top Bar: Committee Identity + Active Session + Symbol Selector */}
      <div className="border-border/70 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="bg-bull size-2 rounded-full" />
          <span className="text-fg text-xs font-semibold tracking-tight">
            4-Desk Research Committee
          </span>
          <span className="text-fg-subtle text-xs">·</span>
          <span className="text-fg-muted font-mono text-xs tabular-nums">
            {sessionInfo.label} Session
          </span>
        </div>

        {/* Clean Instrument Switcher */}
        <div className="bg-bg-elev-2 border-border/70 flex items-center gap-0.5 rounded-lg border p-0.5">
          {QUICK_SYMBOLS.map((sym) => {
            const isSelected = activeSymbol === sym;
            return (
              <button
                key={sym}
                type="button"
                onClick={() => setCustomSymbol(sym)}
                className={cn(
                  'cursor-pointer touch-manipulation rounded-md px-2 py-1 font-mono text-xs font-medium transition-colors',
                  isSelected
                    ? 'bg-bg-elev-3 text-fg font-semibold shadow-2xs'
                    : 'text-fg-subtle hover:text-fg',
                )}
              >
                {sym}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4-Column Interactive Desk Matrix (Click any desk to filter its briefs) */}
      <div className="border-border/70 grid grid-cols-2 divide-x divide-y border-b sm:grid-cols-4 sm:divide-y-0">
        {DESK_ORDER.map((deskId) => {
          const profile = CHARACTER_PROFILES[deskId]!;
          const isSelected = activeDesk === deskId;
          return (
            <button
              key={deskId}
              type="button"
              disabled={disabled}
              onClick={() => setActiveDesk(isSelected ? 'all' : deskId)}
              aria-pressed={isSelected}
              className={cn(
                'group flex cursor-pointer touch-manipulation flex-col items-start gap-2 p-3.5 text-left transition-colors disabled:opacity-50',
                isSelected ? 'bg-bg-elev-2' : 'hover:bg-bg-elev-2/50 bg-transparent',
              )}
            >
              <div className="flex w-full items-center justify-between">
                {renderDeskGlyph(deskId)}
                <span
                  className={cn(
                    'rounded-sm border px-1.5 py-0.5 font-mono text-xs font-medium',
                    isSelected
                      ? profile.badgeClass
                      : 'border-border/60 bg-bg-elev-2 text-fg-subtle',
                  )}
                >
                  {deskId === 'technical'
                    ? 'TECH'
                    : deskId === 'fundamental'
                      ? 'MACRO'
                      : deskId === 'risk'
                        ? 'RISK'
                        : 'FLOW'}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-fg text-xs font-semibold">{profile.name}</span>
                <span className="text-fg-subtle line-clamp-1 text-xs">{profile.indicators}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Primary Committee Action + Curated Desk Prompts */}
      {onSelectPrompt && (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-fg-muted text-xs font-medium">
                {activeDesk === 'all'
                  ? `Recommended briefs for ${activeSymbol}`
                  : `${CHARACTER_PROFILES[activeDesk]?.name} briefs for ${activeSymbol}`}
              </span>
              {activeDesk !== 'all' && (
                <button
                  type="button"
                  onClick={() => setActiveDesk('all')}
                  className="text-brand cursor-pointer text-xs font-medium hover:underline"
                >
                  Show all 4 desks
                </button>
              )}
            </div>

            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onSelectPrompt(
                  `Convene full 4-desk research committee on ${activeSymbol} across Technical Structure, Macro & Rates, Risk Sizing, and Institutional Flow.`,
                )
              }
              className="bg-brand hover:bg-brand-soft text-brand-fg inline-flex cursor-pointer touch-manipulation items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <span>Convene Full Committee on {activeSymbol}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {visibleBriefs.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelectPrompt(item.prompt)}
                className="border-border/80 bg-bg-elev-2/60 hover:bg-bg-elev-2 hover:border-fg-subtle/40 flex cursor-pointer touch-manipulation flex-col gap-1 rounded-lg border p-3 text-left transition-colors disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-fg text-xs font-semibold">{item.title}</span>
                  <span className="text-fg-subtle font-mono text-xs">{item.desk}</span>
                </div>
                <span className="text-fg-muted line-clamp-1 text-xs">{item.detail}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * PixelDeskThinking
 * Clean live deliberation state rendered inside the conversation stream.
 * Connects to live `agentProgress` when available, with a graceful step progression fallback.
 */
export function PixelDeskThinking({
  agentProgress,
  className,
}: {
  agentProgress?: AgentProgress | null;
  className?: string;
}) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setStepIdx((prev) => (prev + 1) % QUANT_STATUS_STEPS.length);
    }, 2400);
    return () => clearInterval(stepTimer);
  }, []);

  const liveAgents = agentProgress?.agents ?? [];
  const doneCount = liveAgents.filter((a) => a.status === 'done').length;
  const progressPercent =
    liveAgents.length > 0
      ? Math.max(15, Math.round((doneCount / liveAgents.length) * 100))
      : Math.min(20 + stepIdx * 18, 90);

  return (
    <div
      role="status"
      aria-label="Specialists deliberating"
      className={cn(
        'border-border bg-bg-elev-1 my-1 flex w-full max-w-2xl flex-col gap-3 rounded-xl border p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand size-2 animate-pulse rounded-full" />
          <span className="text-fg text-xs font-semibold">
            {agentProgress?.mode === 'single'
              ? 'Specialist Desk Analysis'
              : '4-Desk Committee Deliberation'}
          </span>
        </div>
        <span className="text-fg-muted font-mono text-xs tabular-nums">
          {liveAgents.length > 0
            ? `${doneCount}/${liveAgents.length} desks ready`
            : `${progressPercent}%`}
        </span>
      </div>

      {/* 4-Column Live Status Strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DESK_ORDER.map((deskId, idx) => {
          const liveAgent = liveAgents.find((a) => a.agentName === deskId);
          const status =
            liveAgent?.status ?? (idx < stepIdx ? 'done' : idx === stepIdx ? 'running' : 'pending');

          return (
            <div
              key={deskId}
              className={cn(
                'border-border/80 flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors',
                status === 'running'
                  ? 'bg-bg-elev-2 border-brand/40'
                  : status === 'done'
                    ? 'bg-bg-elev-2/70 border-bull/30'
                    : 'bg-bg-elev-1 opacity-65',
              )}
            >
              {renderDeskGlyph(deskId, {
                isThinking: status === 'running',
                isDone: status === 'done',
                bias: liveAgent?.opinion?.bias,
              })}
              <div className="flex min-w-0 flex-col">
                <span className="text-fg truncate text-xs font-semibold">
                  {deskId === 'technical'
                    ? 'Technical'
                    : deskId === 'fundamental'
                      ? 'Macro'
                      : deskId === 'risk'
                        ? 'Risk'
                        : 'Sentiment'}
                </span>
                <span
                  className={cn(
                    'font-mono text-xs capitalize tabular-nums',
                    status === 'running'
                      ? 'text-brand'
                      : status === 'done'
                        ? 'text-bull'
                        : 'text-fg-subtle',
                  )}
                >
                  {liveAgent?.opinion?.bias ?? status}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress Bar & Active Step */}
      <div className="flex flex-col gap-1.5">
        <div className="bg-bg-elev-3 h-1 w-full overflow-hidden rounded-full">
          <m.div
            className="bg-brand h-full rounded-full"
            initial={{ width: '15%' }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        </div>
        <span className="text-fg-muted text-xs">{QUANT_STATUS_STEPS[stepIdx]}</span>
      </div>
    </div>
  );
}

/**
 * PixelDeskDeliberation
 * Renders the settled 4-Desk Committee Consensus Ledger inside assistant messages.
 * Replaces tilted rubber stamps and tug-of-war bars with a clean institutional scorecard.
 */
export function PixelDeskDeliberation({
  opinions,
  mode = 'full',
  className,
}: PixelDeskDeliberationProps) {
  const [expanded, setExpanded] = useState(false);

  const avgConfidence =
    opinions.length > 0
      ? Math.round(
          (opinions.reduce((sum, o) => sum + (o.confidence ?? 0.8), 0) / opinions.length) * 100,
        )
      : 85;

  const biasCounts = {
    bullish: opinions.filter((o) => o.bias === 'bullish').length,
    bearish: opinions.filter((o) => o.bias === 'bearish').length,
    neutral: opinions.filter((o) => o.bias === 'neutral').length,
  };

  const isDisputed =
    (biasCounts.bullish > 0 && biasCounts.bearish > 0) ||
    (biasCounts.bullish > 0 && biasCounts.neutral >= 2) ||
    (biasCounts.bearish > 0 && biasCounts.neutral >= 2);

  const majorityBias =
    biasCounts.bullish >= biasCounts.bearish && biasCounts.bullish >= biasCounts.neutral
      ? 'bullish'
      : biasCounts.bearish >= biasCounts.bullish && biasCounts.bearish >= biasCounts.neutral
        ? 'bearish'
        : 'neutral';

  return (
    <div
      role="region"
      aria-label="Multi-agent committee verdict"
      className={cn(
        'border-border bg-bg-elev-1 mt-2 flex w-full flex-col gap-3 rounded-xl border p-4 shadow-sm',
        className,
      )}
    >
      {/* Header Row: Mode + Verdict Pill + Aggregate Conviction */}
      <div className="border-border/70 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'size-2 rounded-full',
              isDisputed
                ? 'bg-warn'
                : majorityBias === 'bullish'
                  ? 'bg-bull'
                  : majorityBias === 'bearish'
                    ? 'bg-bear'
                    : 'bg-fg-muted',
            )}
          />
          <h4 className="text-fg text-xs font-semibold">
            {mode === 'full'
              ? '4-Desk Committee Consensus'
              : mode === 'single'
                ? 'Specialist Desk Read'
                : `Committee Consensus · ${mode}`}
          </h4>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-fg-muted font-mono text-xs tabular-nums">
            Conviction {avgConfidence}%
          </span>
          <span
            className={cn(
              'rounded-md border px-2 py-0.5 font-mono text-xs font-semibold uppercase',
              isDisputed
                ? 'border-warn/40 bg-warn/10 text-warn'
                : majorityBias === 'bullish'
                  ? 'border-bull/40 bg-bull/10 text-bull'
                  : majorityBias === 'bearish'
                    ? 'border-bear/40 bg-bear/10 text-bear'
                    : 'border-border bg-bg-elev-2 text-fg-muted',
            )}
          >
            {isDisputed
              ? 'Mixed / Split'
              : majorityBias === 'bullish'
                ? 'Bullish Consensus'
                : majorityBias === 'bearish'
                  ? 'Bearish Consensus'
                  : 'Neutral Consensus'}
          </span>
        </div>
      </div>

      {/* 4-Column Desk Scorecard */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DESK_ORDER.map((deskId) => {
          const op = opinions.find((o) => o.agentName === deskId);
          const bias = op?.bias ?? 'neutral';
          const conf = op ? Math.round((op.confidence ?? 0.8) * 100) : null;

          return (
            <div
              key={deskId}
              className="border-border/80 bg-bg-elev-2/60 flex flex-col gap-1.5 rounded-lg border p-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-fg text-xs font-semibold">
                  {deskId === 'technical'
                    ? 'Technical'
                    : deskId === 'fundamental'
                      ? 'Macro'
                      : deskId === 'risk'
                        ? 'Risk'
                        : 'Sentiment'}
                </span>
                {conf !== null && (
                  <span className="text-fg-subtle font-mono text-xs tabular-nums">{conf}%</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'font-mono text-xs font-semibold uppercase',
                    bias === 'bullish'
                      ? 'text-bull'
                      : bias === 'bearish'
                        ? 'text-bear'
                        : 'text-fg-muted',
                  )}
                >
                  {op ? bias : 'Standby'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Segmented Conviction Distribution Bar (Clean Replacement for Tug-of-War) */}
      <div className="flex items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3 font-mono tabular-nums">
          <span className="text-bull">Bull: {biasCounts.bullish}</span>
          <span className="text-fg-muted">Neutral: {biasCounts.neutral}</span>
          <span className="text-bear">Bear: {biasCounts.bearish}</span>
        </div>
        {opinions.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-fg-muted hover:text-fg cursor-pointer touch-manipulation font-medium transition-colors"
          >
            {expanded ? 'Hide desk notes' : `Read ${opinions.length} desk rationales`}
          </button>
        )}
      </div>

      {/* Expandable Desk Rationales */}
      <AnimatePresence initial={false}>
        {expanded && opinions.length > 0 && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="border-border/70 flex flex-col gap-2 overflow-hidden border-t pt-3"
          >
            {opinions.map((op) => (
              <div
                key={op.agentName}
                className="border-border/80 bg-bg-elev-2/50 flex flex-col gap-1 rounded-lg border p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-fg text-xs font-semibold capitalize">
                    {op.agentName} Desk
                  </span>
                  <span
                    className={cn(
                      'font-mono text-xs font-semibold uppercase tabular-nums',
                      op.bias === 'bullish'
                        ? 'text-bull'
                        : op.bias === 'bearish'
                          ? 'text-bear'
                          : 'text-fg-muted',
                    )}
                  >
                    {op.bias} · {Math.round((op.confidence ?? 0.8) * 100)}%
                  </span>
                </div>
                <p className="text-fg-muted text-xs leading-relaxed">{op.reasoning}</p>
              </div>
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
