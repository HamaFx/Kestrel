// SPDX-License-Identifier: Apache-2.0

// Presentation data for the landing-page committee simulator. The simulation
// state machine lives in `index.tsx`; the cards only read from here.

export interface Scenario {
  id: string;
  name: string;
  symbol: string;
  catalyst: string;
  action: 'BUY / LONG' | 'SELL / SHORT';
  orderType: string;
  entry: string;
  invalidation: string;
  target1: string;
  target2: string;
  target3: string;
  rr: string;
  expectedValue: string;
  kellySize: string;
  techScore: number;
  macroScore: number;
  riskScore: number;
  sentimentScore: number;
  consensusScore: number;
  bullProbability: number;
  arbiterVerdict: string;
  txHash: string;
  journalSummary: string;
}

export type SimulationStage = 'idle' | 'voting' | 'verdict' | 'dispatching' | 'dispatched';

export const SCENARIOS: Scenario[] = [
  {
    id: 'london-sweep',
    name: 'London Fix Liquidity Sweep',
    symbol: 'XAU/USD',
    catalyst: 'Asia session low swept into 15m Bullish Fair Value Gap + NY Open Displacement',
    action: 'BUY / LONG',
    orderType: 'LIMIT SETUP',
    entry: '2,864.20',
    invalidation: '2,846.50',
    target1: '2,884.00',
    target2: '2,908.50',
    target3: '2,936.00',
    rr: '1:3.64',
    expectedValue: '+2.88R',
    kellySize: '0.85% equity',
    techScore: 94,
    macroScore: 88,
    riskScore: 92,
    sentimentScore: 86,
    consensusScore: 90,
    bullProbability: 88,
    arbiterVerdict:
      'Unanimous 4-Desk Consensus. Asymmetric Long Setup Confirmed. Scale 40% at TP1 and trail stop behind the 15m swing low.',
    txHash: 'KSL-XAU-8F4A21',
    journalSummary:
      'Setup: XAU/USD Long @ 2,864.20 | Stop: 2,846.50 (0.85% Risk) | Targets: 2,884.00 / 2,908.50 / 2,936.00 | Alerts Armed: Telegram, Push & Email',
  },
  {
    id: 'pce-beat',
    name: 'US Core PCE Inflation Print',
    symbol: 'EUR/USD',
    catalyst:
      'US 10Y Yields steepen +4.8 bps; Dollar Index rejects Daily 200 EMA with bearish engulfing',
    action: 'SELL / SHORT',
    orderType: 'BREAKOUT SETUP',
    entry: '1.0845',
    invalidation: '1.0875',
    target1: '1.0810',
    target2: '1.0760',
    target3: '1.0715',
    rr: '1:2.95',
    expectedValue: '+2.14R',
    kellySize: '0.75% equity',
    techScore: 91,
    macroScore: 93,
    riskScore: 89,
    sentimentScore: 84,
    consensusScore: 89,
    bullProbability: 16,
    arbiterVerdict:
      'Macro Rate Divergence Confirmed. Institutional liquidity sweep at 1.0850 tapped. Short plan validated with a strict 30-pip invalidation.',
    txHash: 'KSL-EUR-3D7C91',
    journalSummary:
      'Setup: EUR/USD Short @ 1.0845 | Stop: 1.0875 (0.75% Risk) | Targets: 1.0810 / 1.0760 / 1.0715 | Alerts Armed: Telegram, Push & Email',
  },
  {
    id: 'safe-haven',
    name: 'Geopolitical Flight to Quality',
    symbol: 'XAU/USD',
    catalyst:
      'Central Bank sovereign bullion accumulation + aggressive institutional flight to safety',
    action: 'BUY / LONG',
    orderType: 'MOMENTUM SETUP',
    entry: '2,870.00',
    invalidation: '2,852.00',
    target1: '2,900.00',
    target2: '2,945.00',
    target3: '2,990.00',
    rr: '1:4.44',
    expectedValue: '+3.72R',
    kellySize: '0.90% equity',
    techScore: 89,
    macroScore: 96,
    riskScore: 90,
    sentimentScore: 94,
    consensusScore: 92,
    bullProbability: 92,
    arbiterVerdict:
      'Institutional Whale Accumulation. Sovereign bullion ETF inflows +24 tons. Multi-target runner plan approved.',
    txHash: 'KSL-XAU-EE92B4',
    journalSummary:
      'Setup: XAU/USD Long @ 2,870.00 | Stop: 2,852.00 (0.90% Risk) | Targets: 2,900.00 / 2,945.00 / 2,990.00 | Alerts Armed: Telegram, Push & Email',
  },
];
