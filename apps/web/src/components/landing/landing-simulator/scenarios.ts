// SPDX-License-Identifier: Apache-2.0

// Presentation data for the landing-page interactive trade simulator.

export interface Scenario {
  id: string;
  name: string;
  tag: string;
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

export type SimulationStage = 'idle' | 'voting' | 'verdict';

export const SCENARIOS: Scenario[] = [
  {
    id: 'london-sweep',
    name: 'London Open Breakout',
    tag: 'Trend Continuation',
    symbol: 'Session Breakout',
    catalyst:
      'Overnight range swept at the London open — buyers reclaim structure as yields cool off and whales add longs.',
    action: 'BUY / LONG',
    orderType: 'LIMIT RETEST',
    entry: '2,864.20',
    invalidation: '2,846.50',
    target1: '2,884.00',
    target2: '2,908.50',
    target3: '2,936.00',
    rr: '1:3.64',
    expectedValue: '+2.88R',
    kellySize: '0.85% risk',
    techScore: 94,
    macroScore: 88,
    riskScore: 92,
    sentimentScore: 86,
    consensusScore: 90,
    bullProbability: 88,
    arbiterVerdict:
      'All 4 pillars aligned. High-probability long retest confirmed — lock 40% profit at TP1 and move your stop to breakeven.',
    txHash: 'KSL-PLAN-8F4A',
    journalSummary:
      'Setup: London Open Breakout (Long) @ 2,864.20 | Stop: 2,846.50 (0.85% Risk) | Targets: 2,884.00 / 2,908.50 / 2,936.00',
  },
  {
    id: 'pce-beat',
    name: 'Hot Inflation Reversal',
    tag: 'News Catalyst Short',
    symbol: 'Macro Reversal',
    catalyst:
      'Inflation prints hotter than expected — yields spike, previous day high rejects hard, and institutions flip net-short.',
    action: 'SELL / SHORT',
    orderType: 'BREAKDOWN',
    entry: '1.0845',
    invalidation: '1.0875',
    target1: '1.0810',
    target2: '1.0760',
    target3: '1.0715',
    rr: '1:2.95',
    expectedValue: '+2.14R',
    kellySize: '0.75% risk',
    techScore: 91,
    macroScore: 93,
    riskScore: 89,
    sentimentScore: 84,
    consensusScore: 89,
    bullProbability: 14,
    arbiterVerdict:
      'Macro shock and technical rejection agree. Clean downside room with a tight invalidation just above the failed high.',
    txHash: 'KSL-PLAN-3D7C',
    journalSummary:
      'Setup: Hot Inflation Reversal (Short) @ 1.0845 | Stop: 1.0875 (0.75% Risk) | Targets: 1.0810 / 1.0760 / 1.0715',
  },
  {
    id: 'safe-haven',
    name: 'Momentum Range Expansion',
    tag: 'High-Conviction Runner',
    symbol: 'Momentum Runner',
    catalyst:
      'Multi-day consolidation breaks upward on heavy institutional inflows while retail traders remain trapped short.',
    action: 'BUY / LONG',
    orderType: 'MOMENTUM ENTRY',
    entry: '94,250.00',
    invalidation: '92,800.00',
    target1: '96,800.00',
    target2: '98,900.00',
    target3: '101,500.00',
    rr: '1:3.48',
    expectedValue: '+2.94R',
    kellySize: '0.80% risk',
    techScore: 92,
    macroScore: 88,
    riskScore: 91,
    sentimentScore: 93,
    consensusScore: 91,
    bullProbability: 91,
    arbiterVerdict:
      'Strong whale accumulation + clean breakout retest. Volatility-adjusted stop keeps total account risk inside 0.80%.',
    txHash: 'KSL-PLAN-EE92',
    journalSummary:
      'Setup: Momentum Range Expansion (Long) @ 94,250.00 | Stop: 92,800.00 (0.80% Risk) | Targets: 96,800.00 / 98,900.00 / 101,500.00',
  },
];
