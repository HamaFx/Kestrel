'use client';

// SPDX-License-Identifier: Apache-2.0

// Static catalogue for the landing desks section: the four plain-English
// analysis angles (Economy & News, Chart & Price Levels, Risk & Trade Sizing,
// Positioning & Sentiment), their sample metrics, sample questions, verdicts,
// capabilities, and auto-cycle cadence.
import { IconBuildingBank, IconChartCandle, IconRadar, IconScale } from '@tabler/icons-react';

import type { BlueprintPlateId } from '@/components/brand/blueprint-plates';

interface DeskMetric {
  label: string;
  value: string;
  status: string;
}

export interface DeskSpec {
  id: string;
  name: string;
  role: string;
  badge: string;
  blueprintId: BlueprintPlateId;
  color: string;
  borderColor: string;
  bgGlow: string;
  sprite: React.ReactNode;
  methodology: string;
  verdict: {
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    conviction: number;
    keyMetric: string;
    rationale: string;
  };
  sampleMetrics: DeskMetric[];
  sampleQuestions: string[];
  features: string[];
}

export const DESKS: DeskSpec[] = [
  {
    id: 'macro',
    name: 'Economy & News',
    role: 'Central Banks, Yields & Catalysts',
    badge: 'ECONOMY & NEWS',
    blueprintId: 'horus',
    color: 'text-info',
    borderColor: 'border-info/30',
    bgGlow: 'from-info/10 to-transparent',
    sprite: <IconBuildingBank className="text-info size-5" />,
    methodology: 'Central Bank Policy, Treasury Yields & Event Catalysts',
    verdict: {
      bias: 'BULLISH',
      conviction: 88,
      keyMetric: 'US 10Y Yields -4.2 bps (4.28%)',
      rationale:
        'Softening PCE inflation metrics increase the probability of a 25 bps rate cut, compressing real yields and supporting Spot Gold demand.',
    },
    sampleMetrics: [
      {
        label: 'US 10Y Real Yield',
        value: '4.28% (-4.2 bps)',
        status: 'Tailwind for Gold',
      },
      {
        label: 'US Dollar Index (DXY)',
        value: '104.12 (-0.34%)',
        status: 'Softening Trend',
      },
      {
        label: 'Next Red-Folder Event',
        value: 'US Core PCE (18h 40m)',
        status: 'Clear Execution Window',
      },
    ],
    sampleQuestions: [
      'How are falling US 10Y Treasury yields affecting Gold today?',
      'Are there any high-impact Fed or CPI releases in the next 24 hours?',
      'What is driving EUR/USD after the latest central bank commentary?',
    ],
    features: [
      'Real-time US Treasury 2Y/10Y yield curve and DXY Dollar Index correlation tracking',
      'Central bank rate decision and speech breakdown across the Fed, ECB, BoE, and BoJ',
      'High-impact economic calendar countdowns that flag volatility risks before entry',
      'Live financial headline synthesis filtered for Gold, Forex, and Crypto movers',
    ],
  },
  {
    id: 'technical',
    name: 'Chart & Price Levels',
    role: 'Technical Structure & Key Levels',
    badge: 'CHART & PRICE LEVELS',
    blueprintId: 'astrolabe',
    color: 'text-bull',
    borderColor: 'border-bull/30',
    bgGlow: 'from-bull/10 to-transparent',
    sprite: <IconChartCandle className="text-bull size-5" />,
    methodology: 'Multi-Timeframe Structure, Sessions & Indicators',
    verdict: {
      bias: 'BULLISH',
      conviction: 94,
      keyMetric: 'Swing Low Re-test @ 2,860.20',
      rationale:
        'Higher lows held above the Asian session low while EMA20 crossed above EMA50 on the 4H chart and RSI(14) pushed through 58.',
    },
    sampleMetrics: [
      {
        label: '4H Trend Structure',
        value: 'EMA20 > EMA50 > EMA200',
        status: 'Aligned Bullish',
      },
      {
        label: 'Support / Resistance',
        value: '2,846.50 / 2,884.00',
        status: 'Holding Above Pivot',
      },
      {
        label: 'RSI (14) & ATR (14)',
        value: '58.4 · 11.80 pts',
        status: 'Expanding Momentum',
      },
    ],
    sampleQuestions: [
      'Where are the key support and resistance levels on XAU/USD 4H?',
      'Did Gold hold the Asian session low after the London open?',
      'Is EUR/USD showing trend alignment across 1H, 4H, and Daily timeframes?',
    ],
    features: [
      'Swing high/low mapping and session ranges across 15m, 1H, 4H, and Daily charts',
      'Multi-timeframe EMA 20/50/200 alignment with trend regime confirmation',
      'Previous-day high/low (PDH/PDL), Asian range, and London/New York session levels',
      'RSI, MACD, Bollinger Bands, and ATR confluence for momentum and stop placement',
    ],
  },
  {
    id: 'risk',
    name: 'Risk & Trade Sizing',
    role: 'Position Sizing & 1% Risk Guardrail',
    badge: 'RISK & TRADE SIZING',
    blueprintId: 'aegis',
    color: 'text-warn',
    borderColor: 'border-warn/30',
    bgGlow: 'from-warn/10 to-transparent',
    sprite: <IconScale className="text-warn size-5" />,
    methodology: 'ATR Stop Placement & 1.0% Max Loss Protection',
    verdict: {
      bias: 'BULLISH',
      conviction: 92,
      keyMetric: '1:3.22 Risk/Reward Ratio',
      rationale:
        'Strict 1.0% account risk guardrail satisfied with an ATR-buffered invalidation stop placed below the 4H swing low at 2,846.50.',
    },
    sampleMetrics: [
      {
        label: 'Account Risk Allocation',
        value: '0.85% Equity (≤ 1.0% Cap)',
        status: 'Within Guardrail',
      },
      {
        label: 'Invalidation Stop Loss',
        value: '2,846.50 (1.5x ATR)',
        status: 'Outside Noise Band',
      },
      {
        label: 'Reward-to-Risk Profile',
        value: '1:3.22 Asymmetric',
        status: '+2.88R Expected Value',
      },
    ],
    sampleQuestions: [
      'What position size keeps my risk at 0.75% on XAU/USD with a stop at 2,846.50?',
      'Where should my invalidation stop sit outside 4H ATR volatility noise?',
      'Does this setup offer at least a 1:2.5 reward-to-risk ratio to the next resistance?',
    ],
    features: [
      'Strict 1.0% maximum account risk guardrail that flags oversized or low-R:R setups',
      'Volatility-adjusted ATR (Average True Range) stop-loss sizing beyond normal market noise',
      'Multi-tier Take-Profit targets (TP1 partial scale, TP2 core target, TP3 runner)',
      'Pre-trade conflict check that warns when red-folder news threatens a technical setup',
    ],
  },
  {
    id: 'sentiment',
    name: 'Positioning & Sentiment',
    role: 'CFTC COT Flow & Market Positioning',
    badge: 'POSITIONING & SENTIMENT',
    blueprintId: 'sentinel',
    color: 'text-brand',
    borderColor: 'border-brand/30',
    bgGlow: 'from-brand/10 to-transparent',
    sprite: <IconRadar className="text-brand size-5" />,
    methodology: 'CFTC Commitments of Traders & Cross-Asset Flow',
    verdict: {
      bias: 'BULLISH',
      conviction: 86,
      keyMetric: 'COT Commercial Net Long +18,420',
      rationale:
        'Institutional money managers and commercial hedgers expanded net-long positioning for the third consecutive week while retail remains crowded short.',
    },
    sampleMetrics: [
      {
        label: 'CFTC Managed Money',
        value: '+18,420 Contracts',
        status: '3-Week Net Inflow',
      },
      {
        label: 'Commercial Hedgers',
        value: '+4.2% Weekly Change',
        status: 'Net Accumulation',
      },
      {
        label: 'Cross-Asset Alignment',
        value: 'XAU vs DXY (-0.84)',
        status: 'Strong Inverse Flow',
      },
    ],
    sampleQuestions: [
      'Are institutional funds adding to net-long Gold positions in the latest COT report?',
      'Is positioning overcrowded on one side of GBP/USD right now?',
      'How is Gold correlating with real yields and the Dollar Index this week?',
    ],
    features: [
      'Weekly CFTC Commitments of Traders (COT) breakdown across Commercials and Managed Money',
      'Crowded-positioning detection to help avoid late entries into exhausted trends',
      'Sovereign gold reserve and bullion ETF flow context alongside spot price action',
      'Cross-pair currency strength tracking across EUR, GBP, JPY, AUD, and the DXY basket',
    ],
  },
];

export const CYCLE_DURATION_MS = 6000;
