// SPDX-License-Identifier: Apache-2.0

// Concise stage metadata for the 3-step landing pipeline visualizer.
export interface Step {
  id: 1 | 2 | 3;
  label: string;
  tag: string;
  latency: string;
  title: string;
  description: string;
  statusBadge: string;
  figureCode: string;
  metrics: readonly { label: string; value: string; tone?: 'bull' | 'brand' }[];
}

export const STEPS: readonly Step[] = [
  {
    id: 1,
    label: '01',
    tag: 'STAGE 01 · INGEST',
    latency: '18ms',
    title: 'Lock Market & Macro Feeds',
    description:
      'Streams multi-timeframe OHLCV structure, ATR volatility, real yields, and CFTC positioning into a single snapshot.',
    statusBadge: 'DATA ENVELOPE · FRESH',
    figureCode: 'FIG 2.1 · MULTI-PROVIDER MARKET & MACRO INGESTION',
    metrics: [
      { label: 'INSTRUMENT', value: 'XAU/USD · 4H / 1H' },
      { label: 'VOLATILITY', value: 'ATR(14) 11.80 pts' },
      { label: 'MACRO FEED', value: 'US10Y 4.28% (-4.2bp)', tone: 'bull' },
    ],
  },
  {
    id: 2,
    label: '02',
    tag: 'STAGE 02 · DELIBERATE',
    latency: 'PARALLEL',
    title: 'Convene 4 Desks & Verifier Gate',
    description:
      'Macro, Technical, Risk, and COT desks score the setup in parallel before passing the deterministic 4/4 numeric gate.',
    statusBadge: '4/4 GATE · 91% ALIGNED',
    figureCode: 'FIG 2.2 · PARALLEL 4-DESK DELIBERATION & VERIFIER GATE',
    metrics: [
      { label: 'DESK ALIGNMENT', value: '4 / 4 Bullish (91%)', tone: 'bull' },
      { label: 'RISK GOVERNOR', value: '0.85% Equity (≤ 1.0%)', tone: 'brand' },
      { label: 'PAYOFF CHECK', value: '1 : 3.22 R:R Passed', tone: 'bull' },
    ],
  },
  {
    id: 3,
    label: '03',
    tag: 'STAGE 03 · DISPATCH',
    latency: 'INSTANT',
    title: 'Journal Setup & Arm Live Alerts',
    description:
      'Outputs your exact Entry, Stop Loss, and TP1–TP3 bracket with one-click Trade Journal logging and Telegram/Push alerts.',
    statusBadge: 'BRACKET ARMED · 3 CHANNELS',
    figureCode: 'FIG 2.3 · VERIFIED BRACKET & MULTI-CHANNEL ALERT DISPATCH',
    metrics: [
      { label: 'ENTRY / STOP', value: '2,864.20 / 2,846.50' },
      { label: 'TARGETS', value: '2,884.00 → 2,916.50', tone: 'bull' },
      { label: 'DISPATCH', value: 'Journal + Telegram', tone: 'brand' },
    ],
  },
];
