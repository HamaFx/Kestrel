// SPDX-License-Identifier: Apache-2.0

// Static data for the 4 specialist AI desks shown in the #desks 2x2 Bento Grid.
import type { ReactNode } from 'react';
import {
  IconActivityHeartbeat,
  IconChartCandle,
  IconShieldLock,
  IconWorld,
} from '@tabler/icons-react';

export type DeskSchematicKind = 'macro' | 'technical' | 'risk' | 'sentiment';

export interface DeskSpec {
  id: DeskSchematicKind;
  index: string;
  code: string;
  name: string;
  badge: string;
  bias: string;
  biasTone: 'bull' | 'brand' | 'warn';
  confidence: number;
  summary: string;
  icon: ReactNode;
  metrics: readonly { label: string; value: string }[];
}

export const DESKS: readonly DeskSpec[] = [
  {
    id: 'macro',
    index: '01',
    code: 'MACRO & RATES',
    name: 'Economy, Yields & Central Banks',
    badge: 'REAL YIELDS · DXY · FOMC',
    bias: 'BULLISH TAILWIND',
    biasTone: 'bull',
    confidence: 88,
    summary:
      'Tracks Treasury real yields, DXY momentum, and high-impact central bank releases in real time.',
    icon: <IconWorld className="size-4" />,
    metrics: [
      { label: 'US 10Y', value: '4.28% (-4.2bp)' },
      { label: 'DXY INDEX', value: '104.12 (-0.34%)' },
      { label: 'NEXT EVENT', value: 'Core PCE · 14h' },
    ],
  },
  {
    id: 'technical',
    index: '02',
    code: 'PRICE STRUCTURE',
    name: 'Multi-Timeframe Levels & Sweeps',
    badge: 'PDH/PDL · ASIAN RANGE · ATR',
    bias: 'BULLISH STRUCTURE',
    biasTone: 'bull',
    confidence: 94,
    summary:
      'Maps session liquidity sweeps, previous-day highs and lows, EMA alignment, and ATR volatility bands.',
    icon: <IconChartCandle className="size-4" />,
    metrics: [
      { label: 'REGIME', value: '4H Trend Markup' },
      { label: 'SUPPORT', value: '2,846.50 (EMA50)' },
      { label: 'ATR(14)', value: '11.80 pts' },
    ],
  },
  {
    id: 'risk',
    index: '03',
    code: 'RISK GOVERNOR',
    name: '1% Equity Cap & Position Sizing',
    badge: 'HARD VETO GATE · R:R FLOOR',
    bias: 'APPROVED ≤ 1.0%',
    biasTone: 'brand',
    confidence: 92,
    summary:
      'Computes exact stop distance and lot size while automatically vetoing any setup below 1:2.0 R:R.',
    icon: <IconShieldLock className="size-4" />,
    metrics: [
      { label: 'EQUITY RISK', value: '0.85% (Cap 1.0%)' },
      { label: 'STOP WIDTH', value: '17.50 pts (1.4x ATR)' },
      { label: 'PAYOFF RATIO', value: '1 : 3.22 R:R' },
    ],
  },
  {
    id: 'sentiment',
    index: '04',
    code: 'COT & POSITIONING',
    name: 'Institutional Flow vs. Crowd Bias',
    badge: 'CFTC COT · EXTREMES',
    bias: 'ACCUMULATION',
    biasTone: 'bull',
    confidence: 86,
    summary:
      'Contrasts weekly CFTC Managed Money futures positioning against overcrowded retail sentiment extremes.',
    icon: <IconActivityHeartbeat className="size-4" />,
    metrics: [
      { label: 'MANAGED MONEY', value: '+18,420 Net Long' },
      { label: '3Y PERCENTILE', value: '74th Percentile' },
      { label: 'CROWD BIAS', value: '64% Retail Short' },
    ],
  },
];
