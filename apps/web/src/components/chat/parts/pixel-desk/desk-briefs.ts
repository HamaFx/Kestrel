// SPDX-License-Identifier: Apache-2.0

// Curated desk briefs for the standby committee launcher. Pure builders: the
// symbol and session label arrive as arguments so the data stays testable.

import { DESK_ORDER, type DeskId } from './character-profiles';

export interface DeskBrief {
  id: string;
  desk: string;
  title: string;
  detail: string;
  prompt: string;
}

export function buildDeskBriefs(symbol: string, sessionLabel: string): Record<DeskId, DeskBrief[]> {
  const s = symbol;
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
        title: `${sessionLabel} macro catalysts for ${s}`,
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
}

/** `all` shows the lead brief of each desk; a single desk shows both of its briefs. */
export function selectVisibleBriefs(
  briefs: Record<DeskId, DeskBrief[]>,
  activeDesk: 'all' | DeskId,
): DeskBrief[] {
  if (activeDesk === 'all') {
    return DESK_ORDER.map((id) => briefs[id][0]!);
  }
  return briefs[activeDesk];
}
