'use client';

// SPDX-License-Identifier: Apache-2.0

// Static catalogue for the landing desks section: the four specialist desk
// specs, their verdicts, capabilities and auto-cycle cadence.
import { IconBuildingBank, IconChartCandle, IconRadar, IconScale } from '@tabler/icons-react';

export interface DeskSpec {
  id: string;
  name: string;
  role: string;
  badge: string;
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
    name: 'Technical Desk',
    role: 'SMC & Liquidity Architect',
    badge: 'PRICE ACTION & ORDER FLOW',
    color: 'text-bull',
    borderColor: 'border-bull/30',
    bgGlow: 'from-bull/10 to-transparent',
    sprite: <IconChartCandle className="text-bull size-5" />,
    methodology: 'Multi-Timeframe Smart Money Concepts (SMC)',
    verdict: {
      bias: 'BULLISH',
      conviction: 94,
      keyMetric: '15m FVG Re-test @ 2,860.20',
      rationale:
        'Clean liquidity sweep of Asian session lows followed by explosive displacement through the 4h bearish order block.',
    },
    features: [
      'Fair Value Gap (FVG) and Liquidity Void scanning across 15m, 1h, 4h, and Daily frames',
      'Institutional order block identification with automated premium/discount equilibrium pricing',
      'Session-open liquidity sweeps: London Silver Bullet, NY AM/PM Killzones, and Asia range fades',
      'Real-time volume delta and footprint divergence detection',
    ],
  },
  {
    id: 'macro',
    name: 'Macroeconomic Desk',
    role: 'Central Bank & Yield Strategist',
    badge: 'INTEREST RATES & CATALYSTS',
    color: 'text-info',
    borderColor: 'border-info/30',
    bgGlow: 'from-info/10 to-transparent',
    sprite: <IconBuildingBank className="text-info size-5" />,
    methodology: 'Central Bank Reaction Functions & Yield Dynamics',
    verdict: {
      bias: 'BULLISH',
      conviction: 88,
      keyMetric: 'US 10Y Yields -4.2 bps (4.28%)',
      rationale:
        'Softening PCE inflation metrics increase probability of 25 bps rate cut, compressing real yields and boosting non-yielding bullion demand.',
    },
    features: [
      'Sub-second news parsing across Bloomberg, Reuters, Dow Jones, and institutional wires',
      'Real-time US Treasury 2Y/10Y yield curve inversion and real interest rate tracking',
      'FedWatch / ECB / BOE rate cut probability matrices dynamically recalculated per speech',
      'High-impact economic catalyst event countdown with automated volatility forecasting',
    ],
  },
  {
    id: 'risk',
    name: 'Quantitative Risk Desk',
    role: '1% Mathematical Governor',
    badge: 'CAPITAL PRESERVATION & VETO',
    color: 'text-warn',
    borderColor: 'border-warn/30',
    bgGlow: 'from-warn/10 to-transparent',
    sprite: <IconScale className="text-warn size-5" />,
    methodology: 'Kelly-Adjusted Volatility Invalidation Protocol',
    verdict: {
      bias: 'BULLISH',
      conviction: 92,
      keyMetric: '1:3.22 Risk/Reward Ratio',
      rationale:
        'Strict 1.0% account drawdown constraint satisfied with ATR invalidation stop placed below the structural swing low at 2,846.50.',
    },
    features: [
      'Immutable 1.0% portfolio drawdown ceiling — automatically vetoes sub-par setups',
      'Volatility-adjusted ATR (Average True Range) stop loss placing beyond market noise',
      'Dynamic multi-tier Take-Profit cones (1:1.5 partial, 1:2.5 runner, 1:4.0 maximum extension)',
      'Asymmetric trade structure verification preventing negative expected value entries',
    ],
  },
  {
    id: 'sentiment',
    name: 'Institutional Desk',
    role: 'Whale Positioning & COT Analyst',
    badge: 'CFTC & VOLUME PROFILE',
    color: 'text-brand',
    borderColor: 'border-brand/30',
    bgGlow: 'from-brand/10 to-transparent',
    sprite: <IconRadar className="text-brand size-5" />,
    methodology: 'CFTC Commitments of Traders & Interbank Flow',
    verdict: {
      bias: 'BULLISH',
      conviction: 86,
      keyMetric: 'COT Commercial Net Long +18,420 contracts',
      rationale:
        'Major bullion banks expanding net long positioning for third consecutive week while retail traders remain 64% short at resistance.',
    },
    features: [
      'Weekly CFTC Commitments of Traders (COT) report breakdown: Commercial Hedgers vs. Non-Commercial Funds',
      'Retail sentiment contrarian index — fading crowded retail positioning traps',
      'Central bank sovereign gold reserve accumulation trends and ETF bullion inventory flows',
      'Interbank currency correlation tracking (EUR/USD, GBP/USD, USD/JPY vs. DXY basket)',
    ],
  },
];

export const CYCLE_DURATION_MS = 6000;
