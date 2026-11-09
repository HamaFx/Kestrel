/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// SPDX-License-Identifier: Apache-2.0

import type { AnalysisMode } from './analysis-mode';

/**
 * Single canonical source of truth for Kestrel's 4 specialist analysis lenses
 * (`fundamental`, `technical`, `risk`, `sentiment`) and the combined
 * `arbiter` trade plan synthesis.
 *
 * Every `apps/web` surface (chat empty state, specialist grids, sidecar dock,
 * composer, dashboard launcher, tool renderers) derives its copy from here.
 * Legacy aliases (`macro`, `quant`, `economist`, `technician`, `risk_manager`,
 * `flow`, `fusion`, `decision`) resolve through {@link resolveStrategistDesk}
 * so historical payloads keep working seamlessly.
 */

/** The four canonical specialist lens ids. */
export type CanonicalDeskId = 'fundamental' | 'technical' | 'risk' | 'sentiment';

/** Canonical ids plus the synthesizer and legacy aliases. */
export type StrategistDeskId =
  | CanonicalDeskId
  | 'arbiter'
  | 'macro'
  | 'quant'
  | 'economist'
  | 'technician'
  | 'risk_manager'
  | 'flow';

export interface StrategistDeskConfig {
  /** Canonical registry key (`fundamental`, `technical`, `risk`, `sentiment`, `arbiter`). */
  id: StrategistDeskId;
  /** Short category code shown in compact headers. */
  code: string;
  /** Clear, plain-English specialist title. */
  title: string;
  /** Short label used in compact pills and aria-labels ("Macro", "Technicals", …). */
  label: string;
  /** 4–5 char chip label for dense strips (MACRO, CHART, RISK, SENT). */
  chipLabel: string;
  /** Plain-English subtitle describing what this lens checks. */
  epithet: string;
  description: string;
  /** Key inputs checked by this lens. */
  domainMetrics: string;
  /** CSS color token (from `globals.css`) for the identity dot. */
  accentColor: string;
  analysisMode: AnalysisMode;
  defaultPrompt: string;
  /** Short role tag ("Economy", "Price Action", "Risk Control", "Positioning"). */
  roleTag: string;
  /** One-line guiding principle. */
  motto: string;
  /** Legacy keys that resolve to this lens. */
  aliases: readonly string[];
}

const FUNDAMENTAL_DESK: StrategistDeskConfig = {
  id: 'fundamental',
  code: 'MACRO & NEWS',
  title: 'Economy & News',
  label: 'Macro',
  chipLabel: 'MACRO',
  epithet: 'Interest Rates & Economic Drivers',
  description:
    'Central bank policy, interest rate expectations, inflation data, and major economic news.',
  domainMetrics: 'Central Banks · Interest Rates · USD Strength · Economic Calendar',
  accentColor: 'var(--color-info)',
  analysisMode: 'single',
  defaultPrompt:
    'Check the macroeconomic outlook for XAUUSD, including interest rates, central bank policy, and USD strength.',
  roleTag: 'Economy',
  motto: 'Interest rates and major economic news drive sustained market direction.',
  aliases: ['macro', 'economist'],
};

const TECHNICAL_DESK: StrategistDeskConfig = {
  id: 'technical',
  code: 'CHART & LEVELS',
  title: 'Chart & Price Levels',
  label: 'Technicals',
  chipLabel: 'CHART',
  epithet: 'Trend, Support & Resistance',
  description:
    'Multi-timeframe trend direction, key support and resistance zones, session highs/lows, and momentum.',
  domainMetrics: 'Trend Direction · Support & Resistance · Session Highs/Lows · RSI & ATR',
  accentColor: 'var(--color-bull)',
  analysisMode: 'single',
  defaultPrompt:
    'Map the trend direction, key support and resistance levels, and session highs/lows on XAUUSD 4H and 15m.',
  roleTag: 'Price Action',
  motto: 'Clear support, resistance, and trend alignment define high-probability entries.',
  aliases: ['quant', 'technician'],
};

const RISK_DESK: StrategistDeskConfig = {
  id: 'risk',
  code: 'RISK & SIZING',
  title: 'Risk & Trade Sizing',
  label: 'Risk',
  chipLabel: 'RISK',
  epithet: 'Stop-Loss, Targets & Position Size',
  description:
    'Safe position sizing (1% max risk), volatility-adjusted stop-loss placement, and reward-to-risk targets.',
  domainMetrics: '1% Max Risk · Volatility Stop-Loss · Profit Targets · Risk/Reward Ratio',
  accentColor: 'var(--color-warn)',
  analysisMode: 'single',
  defaultPrompt:
    'Calculate a 1% risk trade setup with volatility stop-loss and take-profit targets for XAUUSD.',
  roleTag: 'Risk Control',
  motto: 'Every trade needs a clear stop-loss and safe position size before entry.',
  aliases: ['risk_manager'],
};

const SENTIMENT_DESK: StrategistDeskConfig = {
  id: 'sentiment',
  code: 'SENTIMENT',
  title: 'Positioning & Sentiment',
  label: 'Sentiment',
  chipLabel: 'SENT',
  epithet: 'Institutional Flow & Crowd Positioning',
  description:
    'Institutional trader positioning (CFTC COT), hedger activity, and whether a move is overcrowded.',
  domainMetrics: 'Institutional Positioning (COT) · Commercial Hedging · Crowd Sentiment',
  accentColor: 'var(--color-brand)',
  analysisMode: 'single',
  defaultPrompt:
    'Check institutional positioning (COT), commercial hedging, and market sentiment on XAUUSD.',
  roleTag: 'Positioning',
  motto: 'Positioning data shows whether a trend is backed by institutions or overcrowded.',
  aliases: ['flow'],
};

const ARBITER_DESK_CONFIG: StrategistDeskConfig = {
  id: 'arbiter',
  code: 'FULL REPORT',
  title: 'Deep Analysis',
  label: 'Summary',
  chipLabel: 'PLAN',
  epithet: 'Complete 4-Angle Trade Report',
  description:
    'Checks Economy, Chart Levels, Risk, and Sentiment together to build one clear, verified trade plan.',
  domainMetrics: 'Combined Verdict · Entry, Stop-Loss & Targets · Risk-Checked Plan',
  accentColor: 'var(--color-brand)',
  analysisMode: 'full',
  defaultPrompt:
    'Run a full trade analysis on XAUUSD covering economy, chart levels, risk sizing, and market sentiment.',
  roleTag: 'Full Plan',
  motto: 'All four angles checked and combined into one clear trade plan.',
  aliases: ['fusion', 'decision'],
};

/**
 * Canonical registry. `macro`/`quant` remain as reference aliases for the
 * historical keys so existing imports (`STRATEGIST_DESKS.macro`) keep
 * resolving to the same immutable desk config objects.
 */
export const STRATEGIST_DESKS: Record<StrategistDeskId, StrategistDeskConfig> = {
  fundamental: FUNDAMENTAL_DESK,
  technical: TECHNICAL_DESK,
  risk: RISK_DESK,
  sentiment: SENTIMENT_DESK,
  arbiter: ARBITER_DESK_CONFIG,
  macro: FUNDAMENTAL_DESK,
  quant: TECHNICAL_DESK,
  economist: FUNDAMENTAL_DESK,
  technician: TECHNICAL_DESK,
  risk_manager: RISK_DESK,
  flow: SENTIMENT_DESK,
};

/**
 * The 4 Specialist Lenses in canonical order:
 * Economy & News → Chart & Price Levels → Risk & Trade Sizing → Positioning & Sentiment.
 */
export const FOUR_SPECIALIST_DESKS: readonly StrategistDeskConfig[] = [
  FUNDAMENTAL_DESK,
  TECHNICAL_DESK,
  RISK_DESK,
  SENTIMENT_DESK,
];

/** The combined Deep Analysis synthesizer. */
export const ARBITER_DESK: StrategistDeskConfig = ARBITER_DESK_CONFIG;

/** Fallback shown when an unknown agent name reaches a renderer. */
export const FALLBACK_STRATEGIST_DESK: StrategistDeskConfig = {
  id: 'technical',
  code: 'ANALYSIS',
  title: 'Market Analysis',
  label: 'Analysis',
  chipLabel: 'ANLS',
  epithet: 'Focused Market Check',
  description: 'Focused market analysis.',
  domainMetrics: 'Price & market data',
  accentColor: 'var(--color-fg-muted)',
  analysisMode: 'single',
  defaultPrompt: 'Analyze XAUUSD.',
  roleTag: 'Analysis',
  motto: 'Focused market check.',
  aliases: [],
};

function normalizeDeskKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * Resolve any canonical id or legacy alias (`macro`, `economist`, `quant`,
 * `technician`, `risk_manager`, `flow`, `fusion`, `decision`) to its canonical
 * config. Unknown keys resolve to the neutral fallback so call sites never
 * have to null-check.
 */
export function resolveStrategistDesk(key: string): StrategistDeskConfig {
  return findStrategistDesk(key) ?? FALLBACK_STRATEGIST_DESK;
}

/** Same as {@link resolveStrategistDesk} but `null` for unknown keys. */
function findStrategistDesk(key: string): StrategistDeskConfig | null {
  if (!key) return null;
  const normalized = normalizeDeskKey(key);
  for (const desk of Object.values(STRATEGIST_DESKS)) {
    if (desk.id === normalized) return desk;
    if (desk.aliases.includes(normalized)) return desk;
  }
  return null;
}
