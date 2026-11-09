'use client';

// SPDX-License-Identifier: Apache-2.0

// Static pipeline catalogue for the landing stepper: the 3-step workflow
// (1. Pick a Market -> 2. Ask or Run Deep Analysis -> 3. Review Levels & Risk Plan),
// their preview summaries, telemetry rows, and auto-advance cadence.
interface StepPreviewHighlight {
  label: string;
  value: string;
  tone: 'bull' | 'bear' | 'brand' | 'neutral';
}

export interface Step {
  id: number;
  label: string;
  tag: string;
  title: string;
  description: string;
  previewBadge: string;
  previewHeadline: string;
  previewHighlights: StepPreviewHighlight[];
  codeHighlighted: React.ReactNode;
  latency: string;
  telemetry: { label: string; value: string }[];
}

export const STEPS: Step[] = [
  {
    id: 1,
    label: '01',
    tag: 'STEP 1 · PICK A MARKET',
    title: '1. Pick a Market',
    description:
      'Choose Spot Gold (XAU/USD), any of 11 major Forex pairs, or 6 Crypto pairs from your watchlist. Kestrel automatically pulls multi-timeframe candles, session highs/lows, US Treasury yields, and upcoming economic releases.',
    previewBadge: 'WATCHLIST & MARKET CONTEXT',
    previewHeadline: 'XAU/USD · Spot Gold ($2,864.20 · +1.42%)',
    previewHighlights: [
      { label: 'Key Support', value: '$2,846.50 (4H Demand)', tone: 'bull' },
      { label: 'Key Resistance', value: '$2,884.00 (Weekly High)', tone: 'brand' },
      { label: 'Macro Benchmark', value: 'US10Y 4.28% (-4.2 bps)', tone: 'neutral' },
    ],
    latency: 'Step 1 of 3',
    telemetry: [
      { label: 'MARKETS COVERED', value: 'Gold · 11 FX · 6 Crypto' },
      { label: 'TIMEFRAMES LOADED', value: '15m / 1H / 4H / Daily' },
      { label: 'MACRO BENCHMARKS', value: 'US10Y · US02Y · DXY' },
    ],
    codeHighlighted: (
      <>
        <span className="text-[#6c7086]">─── STEP 1: LIVE MARKET SNAPSHOT · XAU/USD (4H) ───</span>
        {'\n'}
        <span className="text-[#94e2d5]">Selected Market:</span>{' '}
        <span className="text-[#a6e3a1]">XAU/USD ($2,864.20 · +1.42% Session)</span>
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
    tag: 'STEP 2 · ASK OR RUN DEEP ANALYSIS',
    title: '2. Ask or Run Deep Analysis',
    description:
      'Ask a direct question in plain English for a fast single-angle check, or run a deep 4-angle analysis across Economy & News, Chart & Price Levels, Risk & Trade Sizing, and Positioning & Sentiment.',
    previewBadge: '4-ANGLE PARALLEL ANALYSIS',
    previewHeadline: '4/4 Angles Evaluated · 91% Alignment',
    previewHighlights: [
      { label: 'Economy & News', value: 'Bullish (88%) · Real yields falling', tone: 'bull' },
      { label: 'Chart & Price Levels', value: 'Bullish (94%) · 4H higher low held', tone: 'bull' },
      {
        label: 'Positioning & Sentiment',
        value: 'Bullish (86%) · COT +18.4k net long',
        tone: 'bull',
      },
    ],
    latency: 'Step 2 of 3',
    telemetry: [
      { label: 'ANALYSIS MODES', value: 'Quick Question or Deep 4-Angle' },
      { label: 'ANGLES CHECKED', value: 'Economy · Chart · Risk · COT' },
      { label: 'CONFLICT CHECK', value: '4/4 Angles Aligned' },
    ],
    codeHighlighted: (
      <>
        <span className="text-[#6c7086]">─── STEP 2: 4-ANGLE DEEP ANALYSIS SUMMARY ───</span>
        {'\n'}
        <span className="text-[#89b4fa]">[ECONOMY &amp; NEWS]</span>{' '}
        <span className="text-[#f9e2af]">BULLISH (88%)</span> · Real yields compressing ahead of Fed
        {'\n'}
        <span className="text-[#a6e3a1]">[CHART &amp; LEVELS]</span>{' '}
        <span className="text-[#f9e2af]">BULLISH (94%)</span> · Asian high reclaimed at London open
        {'\n'}
        <span className="text-[#fab387]">[RISK &amp; SIZING]</span>{' '}
        <span className="text-[#f9e2af]">APPROVED (92%)</span> · 17.70 pt stop fits 1.0% risk cap
        {'\n'}
        <span className="text-[#cba6f7]">[POSITIONING]</span>{' '}
        <span className="text-[#f9e2af]">BULLISH (86%)</span> · CFTC Commercials +18.4k contracts
      </>
    ),
  },
  {
    id: 3,
    label: '03',
    tag: 'STEP 3 · REVIEW LEVELS & RISK PLAN',
    title: '3. Review Levels & Risk Plan',
    description:
      'Get a structured trade plan with an exact entry zone, ATR-buffered invalidation stop loss, position size within your 1% risk limit, and take-profit targets ready to save to your Trade Journal or arm as price alerts.',
    previewBadge: 'VERIFIED TRADE & RISK PLAN',
    previewHeadline: 'BUY / LONG XAU/USD · 1:3.22 Risk/Reward',
    previewHighlights: [
      { label: 'Entry Zone', value: '$2,862.50 – $2,864.20', tone: 'neutral' },
      { label: 'Invalidation Stop', value: '$2,846.50 (0.85% Equity Risk)', tone: 'bear' },
      { label: 'Take-Profit Targets', value: '$2,884.00 / $2,916.50 / $2,940.00', tone: 'bull' },
    ],
    latency: 'Step 3 of 3',
    telemetry: [
      { label: 'RISK GUARDRAIL', value: '0.85% Equity (≤ 1.0% Max)' },
      { label: 'REWARD / RISK', value: '1:3.22 Asymmetric Target' },
      { label: 'ONE-CLICK ACTION', value: 'Trade Journal & Price Alerts' },
    ],
    codeHighlighted: (
      <>
        <span className="text-[#6c7086]">─── STEP 3: STRUCTURED LEVELS &amp; RISK PLAN ───</span>
        {'\n'}
        <span className="text-[#94e2d5]">Directional Bias:</span>{' '}
        <span className="text-[#a6e3a1]">BUY / LONG (91% Alignment · 0.85% Risk)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Entry Zone:</span>{' '}
        <span className="text-[#f9e2af]">$2,862.50 – $2,864.20</span>
        {'\n'}
        <span className="text-[#94e2d5]">Invalidation SL:</span>{' '}
        <span className="text-[#f38ba8]">$2,846.50 (-1.0R Hard Stop · 1.5x ATR)</span>
        {'\n'}
        <span className="text-[#94e2d5]">Target 1 (1.1R):</span>{' '}
        <span className="text-[#a6e3a1]">$2,884.00 (Scale out 40% &amp; move SL to BE)</span>
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
