'use client';

// SPDX-License-Identifier: Apache-2.0

// Static catalogue for the landing desks section: the four specialist desks
// explained in clear, everyday trader language alongside their classical
// engravings and live conviction verdicts.
import { IconBuildingBank, IconChartCandle, IconRadar, IconScale } from '@tabler/icons-react';

import type { BlueprintPlateId } from '@/components/brand/blueprint-plates';

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
  features: string[];
}

export const DESKS: DeskSpec[] = [
  {
    id: 'technical',
    name: 'Price Action & Trend Desk',
    role: 'Key Levels & Breakout Mapper',
    badge: 'TREND, SUPPORT & RESISTANCE',
    blueprintId: 'astrolabe',
    color: 'text-bull',
    borderColor: 'border-bull/30',
    bgGlow: 'from-bull/10 to-transparent',
    sprite: <IconChartCandle className="text-bull size-5" />,
    methodology: 'Multi-Timeframe Trend & Key Price Zones',
    verdict: {
      bias: 'BULLISH',
      conviction: 94,
      keyMetric: 'Support Held @ $2,860.20 (4H & 1H)',
      rationale:
        'Buyers stepped in strongly above the Asian session low while the 4-hour trend and momentum indicators aligned upward.',
    },
    features: [
      'Scans 15m, 1H, 4H & Daily charts at once',
      'Pinpoints support floors & breakout zones',
      'Tracks Asian, London & NY session levels',
      'Checks momentum so you never chase late',
    ],
  },
  {
    id: 'macro',
    name: 'Economy & News Desk',
    role: 'Interest Rates & Breaking News',
    badge: 'CENTRAL BANKS & MARKET CATALYSTS',
    blueprintId: 'horus',
    color: 'text-info',
    borderColor: 'border-info/30',
    bgGlow: 'from-info/10 to-transparent',
    sprite: <IconBuildingBank className="text-info size-5" />,
    methodology: 'Interest Rates, Inflation & Live News Impact',
    verdict: {
      bias: 'BULLISH',
      conviction: 88,
      keyMetric: 'US 10Y Yields Falling (-4.2 bps)',
      rationale:
        'Cooler inflation numbers and falling US bond yields weaken the Dollar and create a strong tailwind for Gold and major currencies.',
    },
    features: [
      'Reads breaking financial news in seconds',
      'Tracks US bond yields & Dollar Index live',
      'Follows Fed, ECB & BoE rate expectations',
      'Flags high-impact red-folder news events',
    ],
  },
  {
    id: 'risk',
    name: '1% Risk Shield Desk',
    role: 'Account & Stop-Loss Protector',
    badge: 'CAPITAL PROTECTION & POSITION SIZING',
    blueprintId: 'aegis',
    color: 'text-warn',
    borderColor: 'border-warn/30',
    bgGlow: 'from-warn/10 to-transparent',
    sprite: <IconScale className="text-warn size-5" />,
    methodology: 'Strict 1% Max Risk & Volatility Stop Sizing',
    verdict: {
      bias: 'BULLISH',
      conviction: 92,
      keyMetric: '1 : 3.22 Reward-to-Risk Ratio',
      rationale:
        'Stop-loss is placed safely below market noise at $2,846.50, risking under 1.0% of your account for a 3.2x reward target.',
    },
    features: [
      'Enforces a strict 1.0% max account loss rule',
      'Sizes stop-loss using real volatility (ATR)',
      'Builds 3-step Take-Profit scaling targets',
      'Warns you to stand down on bad reward/risk',
    ],
  },
  {
    id: 'sentiment',
    name: 'Big-Money Flow Desk',
    role: 'Bank & Whale Positioning Tracker',
    badge: 'INSTITUTIONAL & WHALE FLOW',
    blueprintId: 'sentinel',
    color: 'text-brand',
    borderColor: 'border-brand/30',
    bgGlow: 'from-brand/10 to-transparent',
    sprite: <IconRadar className="text-brand size-5" />,
    methodology: 'Institutional Bank Positioning & Crowd Sentiment',
    verdict: {
      bias: 'BULLISH',
      conviction: 86,
      keyMetric: 'Major Banks +18,420 Net Long Contracts',
      rationale:
        'Institutional reports show large banks and funds adding long positions for the third straight week while retail traders bet the wrong way.',
    },
    features: [
      'Tracks weekly CFTC bank positioning reports',
      'Spots when retail traders are trapped wrong',
      'Monitors big-money flows in Gold, FX & Crypto',
      'Cross-checks correlations across 18+ pairs',
    ],
  },
];

export const CYCLE_DURATION_MS = 6000;
