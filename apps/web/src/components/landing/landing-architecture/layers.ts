// SPDX-License-Identifier: Apache-2.0

// Static specs for the four intelligence-stack layers of the landing
// architecture workbench.
import { IconArrowsSplit, IconBolt, IconCpu, IconScale } from '@tabler/icons-react';
import type { ComponentType } from 'react';

export interface LayerSpec {
  id: string;
  num: string;
  tag: string;
  title: string;
  shortDesc: string;
  fullDesc: string;
  accentColor: string;
  borderColor: string;
  glowColor: string;
  icon: ComponentType<{ className?: string }>;
  telemetry: { label: string; value: string }[];
}

export const LAYERS: LayerSpec[] = [
  {
    id: 'execution',
    num: '04',
    tag: 'APEX EXECUTION LAYER',
    title: 'Verified Trade Plans & Take-Profit Cones',
    shortDesc: 'Structured trade cards with entry, invalidation, and 3 take-profit targets.',
    fullDesc:
      'Every approved setup produces a structured trade plan with exact entry zones, hard invalidation stops, and multi-tier take-profit targets ready to save to your Trade Journal or arm as instant alerts (with direct MT5 / cTrader bridge support on our roadmap).',
    accentColor: 'text-bull',
    borderColor: 'border-bull/50',
    glowColor: 'rgba(63, 158, 61, 0.4)',
    icon: IconArrowsSplit,
    telemetry: [
      { label: 'WORKFLOW OUTPUT', value: 'Trade Journal & Price Alerts' },
      { label: 'TARGET RATIOS', value: '1:1.5 · 1:2.5 · 1:4.0 R:R' },
      { label: 'ALERT CHANNELS', value: 'Telegram · Web Push · Email' },
      { label: 'BROKER BRIDGE', value: 'MT5 / cTrader (On Roadmap)' },
    ],
  },
  {
    id: 'risk',
    num: '03',
    tag: 'SAFETY GOVERNOR LAYER',
    title: '1.0% Risk Limit & Invalidation Guardrail',
    shortDesc: 'Strict drawdown protection that flags unsafe setups before you enter.',
    fullDesc:
      'The Risk Desk enforces a strict 1.0% account risk discipline. If high-impact news is imminent or volatility requires a stop-loss wider than your risk rules allow, Kestrel warns you to stand down or reduce size.',
    accentColor: 'text-warn',
    borderColor: 'border-warn/50',
    glowColor: 'rgba(235, 140, 31, 0.4)',
    icon: IconScale,
    telemetry: [
      { label: 'PORTFOLIO CEILING', value: '≤ 1.0% Max Loss' },
      { label: 'MIN RISK / REWARD', value: '≥ 1:2.5 Asymmetric Target' },
      { label: 'CONFLICT PROTECTION', value: 'Instant Risk Warning' },
      { label: 'STOP PLACEMENT', value: 'ATR (14) Volatility Buffer' },
    ],
  },
  {
    id: 'deliberation',
    num: '02',
    tag: 'CONSENSUS SYNDICATE LAYER',
    title: '4-Desk Specialist AI Committee',
    shortDesc: 'Four specialized AI analysts evaluating independent market factors.',
    fullDesc:
      'Four specialist AI desks analyze your setup in parallel: Technicals maps price structure and Fair Value Gaps, Macro tracks central bank policy and yields, Risk calculates position sizing, and Sentiment monitors institutional COT positioning.',
    accentColor: 'text-brand',
    borderColor: 'border-brand/50',
    glowColor: 'rgba(255, 54, 22, 0.45)',
    icon: IconCpu,
    telemetry: [
      { label: 'SPECIALIST DESKS', value: '4 Parallel AI Analysts' },
      { label: 'CONSENSUS METHOD', value: 'Weighted Conviction Score' },
      { label: 'ANALYSIS MODES', value: 'Fast Scout or Convene Council' },
      { label: 'SIGNAL INTEGRITY', value: 'Cross-Checked Against Live Data' },
    ],
  },
  {
    id: 'ingestion',
    num: '01',
    tag: 'FOUNDATION DATA LAYER',
    title: 'Live Gold, Forex & Macro Market Feeds',
    shortDesc: 'Real-time price action, technical indicators, and economic calendar.',
    fullDesc:
      'Continuously tracks Spot Gold (XAU/USD), major Forex pairs, and top crypto perpetuals alongside US 2Y/10Y Treasury yields, the Dollar Index (DXY), breaking financial headlines, and red-folder economic releases.',
    accentColor: 'text-info',
    borderColor: 'border-info/50',
    glowColor: 'rgba(38, 126, 224, 0.4)',
    icon: IconBolt,
    telemetry: [
      { label: 'PRIMARY MARKETS', value: 'XAU/USD · EUR · GBP · JPY' },
      { label: 'MACRO BENCHMARKS', value: 'US10Y / US02Y · DXY Index' },
      { label: 'TECHNICAL ENGINE', value: 'RSI · EMA · MACD · ATR · FVG' },
      { label: 'CALENDAR & WIRES', value: 'Live Red-Folder Event Alerts' },
    ],
  },
];
