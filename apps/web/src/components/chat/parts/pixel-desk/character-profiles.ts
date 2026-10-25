// SPDX-License-Identifier: Apache-2.0

// Desk identities for the 4-Desk AI Research Committee: profile copy, badge
// colours, ordering, and the shared label maps.

export type DeskId = 'technical' | 'fundamental' | 'risk' | 'sentiment';

export interface CharacterProfile {
  id: DeskId;
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

export const DESK_ORDER: DeskId[] = ['technical', 'fundamental', 'risk', 'sentiment'];

/** Compact chip labels used by the standby desk matrix. */
export const DESK_SHORT_LABELS: Record<DeskId, string> = {
  technical: 'TECH',
  fundamental: 'MACRO',
  risk: 'RISK',
  sentiment: 'FLOW',
};

/** Full desk names shown in the live status strip and scorecard. */
export const DESK_DISPLAY_NAMES: Record<DeskId, string> = {
  technical: 'Technical',
  fundamental: 'Macro',
  risk: 'Risk',
  sentiment: 'Sentiment',
};

export interface PixelAgentOpinion {
  agentName: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
}
