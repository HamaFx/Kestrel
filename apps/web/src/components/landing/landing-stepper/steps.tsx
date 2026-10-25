'use client';

// SPDX-License-Identifier: Apache-2.0

// Static pipeline catalogue for the landing stepper: the four research stages,
// their briefing copy, telemetry rows and auto-advance cadence.
export interface Step {
  id: number;
  label: string;
  tag: string;
  title: string;
  description: string;
  fileName: string;
  codeHighlighted: React.ReactNode;
  latency: string;
  telemetry: { label: string; value: string }[];
}

export const STEPS: Step[] = [
  {
    id: 1,
    label: '01',
    tag: 'MARKET SCAN',
    title: 'Live Price, Key Levels & Macro Context',
    description:
      'Ask about any symbol or pick from your watchlist. Kestrel pulls multi-timeframe price action, Spot Gold (XAU/USD), US Treasury yields, and the Dollar Index (DXY) automatically.',
    fileName: 'step-01-market-scan',
    latency: 'Step 1 of 4',
    telemetry: [
      { label: 'TIMEFRAMES SCANNED', value: '15m / 1H / 4H / Daily' },
      { label: 'CORRELATIONS', value: 'US10Y · US02Y · DXY' },
      { label: 'ACTIVE SESSIONS', value: 'London Fix · NY Killzone' },
    ],
    codeHighlighted: (
      <>
        <span className="text-[#6c7086]">─── MARKET CONTEXT SNAPSHOT · XAU/USD (4H) ───</span>
        {'\n'}
        <span className="text-[#94e2d5]">Spot Price:</span>{' '}
        <span className="text-[#a6e3a1]">$2,864.20 (+1.42% Session)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Key Support:</span>{' '}
        <span className="text-[#f9e2af]">$2,846.50 (4H Bullish Demand + EMA 50)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Key Resistance:</span>{' '}
        <span className="text-[#f9e2af]">$2,884.00 (Prior Weekly High)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Macro Context:</span>{' '}
        <span className="text-[#89b4fa]">US 10Y Yield 4.28% (-4.2 bps) · DXY Softening</span>
        {'\n'}
        <span className="text-[#94e2d5]">Next Red Event:</span>{' '}
        <span className="text-[#fab387]">US Core PCE in 18h 40m (Clear Window)</span>
      </>
    ),
  },
  {
    id: 2,
    label: '02',
    tag: '4-DESK DELIBERATION',
    title: '4 Specialist AI Desks Weigh In',
    description:
      'Four specialized AI desks evaluate the setup in parallel: Technicals maps Fair Value Gaps and structure, Macro reviews central bank catalysts, Risk calculates ATR stop distance, and Sentiment checks COT positioning.',
    fileName: 'step-02-committee-debate',
    latency: 'Step 2 of 4',
    telemetry: [
      { label: 'SPECIALIST DESKS', value: '4 Independent Analysts' },
      { label: 'TECHNICAL BIAS', value: 'Bullish FVG + Sweep (94%)' },
      { label: 'COT POSITIONING', value: 'Commercials Net Long' },
    ],
    codeHighlighted: (
      <>
        <span className="text-[#6c7086]">─── INDEPENDENT 4-DESK DELIBERATION SUMMARY ───</span>
        {'\n'}
        <span className="text-[#a6e3a1]">[TECHNICAL DESK]</span>{' '}
        <span className="text-[#f9e2af]">BULLISH (94%)</span> · Asia low swept into 15m FVG
        {'\n'}
        <span className="text-[#89b4fa]">[MACRO DESK]</span>{' '}
        <span className="text-[#f9e2af]">BULLISH (88%)</span> · Real yields compressing ahead of Fed
        {'\n'}
        <span className="text-[#fab387]">[RISK DESK]</span>{' '}
        <span className="text-[#f9e2af]">APPROVED (92%)</span> · 17.70 pt stop fits 1.0% risk cap
        {'\n'}
        <span className="text-[#cba6f7]">[SENTIMENT DESK]</span>{' '}
        <span className="text-[#f9e2af]">BULLISH (86%)</span> · CFTC Commercials +18.4k contracts
      </>
    ),
  },
  {
    id: 3,
    label: '03',
    tag: 'RISK GUARDRAILS',
    title: 'Conflict Check & 1% Risk Protection',
    description:
      'The Lead Arbiter checks for conflicting signals across desks (such as bullish price action right before a high-impact Fed release) and blocks setups that violate your 1% risk limit.',
    fileName: 'step-03-risk-guardrails',
    latency: 'Step 3 of 4',
    telemetry: [
      { label: 'CONFLICT CHECK', value: '4/4 Desks Aligned' },
      { label: 'RISK CEILING', value: '≤ 1.0% Account Risk' },
      { label: 'EVENT HAZARD', value: 'No Red-Folder Imminent' },
    ],
    codeHighlighted: (
      <>
        <span className="text-[#6c7086]">─── RISK GUARDRAIL & CONFLICT AUDIT ───</span>
        {'\n'}
        <span className="text-[#94e2d5]">Desk Alignment:</span>{' '}
        <span className="text-[#a6e3a1]">4 of 4 Desks Bullish (Zero Contradictions)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Stop Placement:</span>{' '}
        <span className="text-[#f9e2af]">$2,846.50 (1.5x ATR below 15m swing low)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Max Account Risk:</span>{' '}
        <span className="text-[#a6e3a1]">0.85% Equity (Within 1.0% Safety Cap)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Verdict Status:</span>{' '}
        <span className="text-[#a6e3a1]">✓ CLEARED FOR TRADE PLAN GENERATION</span>
      </>
    ),
  },
  {
    id: 4,
    label: '04',
    tag: 'CLEAR ACTION PLAN',
    title: 'Complete Trade Plan & Multi-Target Cones',
    description:
      'Delivers a structured trade card with exact Entry zones, hard Invalidation levels, and multi-tier Take-Profit targets (TP1, TP2, TP3) ready to log to your Trade Journal or arm as alerts.',
    fileName: 'step-04-trade-plan',
    latency: 'Step 4 of 4',
    telemetry: [
      { label: 'RISK / REWARD', value: '1:3.22 Asymmetric Setup' },
      { label: 'TAKE-PROFIT TIERS', value: 'TP1 (40%) · TP2 (40%) · TP3 (20%)' },
      { label: 'ONE-CLICK ACTION', value: 'Trade Journal & Price Alerts' },
    ],
    codeHighlighted: (
      <>
        <span className="text-[#6c7086]">─── FINALIZED COMMITTEE TRADE PLAN · XAU/USD ───</span>
        {'\n'}
        <span className="text-[#94e2d5]">Directional Bias:</span>{' '}
        <span className="text-[#a6e3a1]">BUY / LONG (91% Committee Conviction)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Entry Zone:</span>{' '}
        <span className="text-[#f9e2af]">$2,862.50 – $2,864.20</span>
        {'\n'}
        <span className="text-[#94e2d5]">Invalidation SL:</span>{' '}
        <span className="text-[#f38ba8]">$2,846.50 (-1.0R Hard Stop)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Target 1 (1.1R):</span>{' '}
        <span className="text-[#a6e3a1]">$2,884.00 (Scale out 40% & move SL to BE)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Target 2 (3.0R):</span>{' '}
        <span className="text-[#a6e3a1]">$2,916.50 (Scale out 40%)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Target 3 (4.3R):</span>{' '}
        <span className="text-[#a6e3a1]">$2,940.00 (Trail remaining 20% runner)</span>
      </>
    ),
  },
];

export const STAGE_INTERVAL_MS = 4800;
