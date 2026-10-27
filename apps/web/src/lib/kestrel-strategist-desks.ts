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
 * Single canonical source of truth for the Sovereign Council's 4 Specialist
 * Desks (`DESK-I // HORUS` … `DESK-IV // SENTINEL`) and the
 * `STAGE II // ARBITER` synthesizer.
 *
 * Every `apps/web` surface (chat empty state, desk grids, docking War Room,
 * composer, dashboard deck, tool renderers) must derive its desk copy from
 * here — no local `AGENT_META`, `CHARACTER_PROFILES`, `PERSONA_LABELS`, or
 * `DESKS` duplicates. Legacy aliases (`macro`, `quant`, `economist`,
 * `technician`, `risk_manager`, `flow`, `fusion`, `decision`) resolve through
 * {@link resolveStrategistDesk} so historical payloads keep working.
 */

/** The four canonical specialist desk ids (later, adjusted by the Arbiter). */
export type CanonicalDeskId = 'fundamental' | 'technical' | 'risk' | 'sentiment';

/** Canonical ids plus the Arbiter synthesizer and the legacy aliases. */
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
  /** Roman desk code shown in every monospace telemetry label. */
  code: string;
  /** Full institutional title. */
  title: string;
  /** Short label used in compact pills and aria-labels ("Macro", "Technical", …). */
  label: string;
  /** 4–5 char chip label for dense telemetry strips (MACRO, TECH, RISK, FLOW). */
  chipLabel: string;
  /** `Redaction` serif epithet rendered as the desk signature. */
  epithet: string;
  description: string;
  /** Primary domain & metrics line (mirrors the identity matrix). */
  domainMetrics: string;
  artworkPath: string;
  /**
   * CSS color token (from `globals.css`) for the desk identity dot. Keep these
   * as `var(--color-*)` references so the Hoplite palette stays the single
   * source of truth instead of re-hardcoding hexes here.
   */
  accentColor: string;
  analysisMode: AnalysisMode;
  defaultPrompt: string;
  /** Short role tag shown in the standby matrix ("Price Action", "Governance"). */
  roleTag: string;
  /** One-line desk doctrine rendered as the strategist quote. */
  motto: string;
  /** Legacy keys that resolve to this desk. */
  aliases: readonly string[];
}

const FUNDAMENTAL_DESK: StrategistDeskConfig = {
  id: 'fundamental',
  code: 'DESK-I // HORUS',
  title: 'Macro & Rates Desk',
  label: 'Macro',
  chipLabel: 'MACRO',
  epithet: 'The All-Seeing Horizon',
  description:
    'Central bank reaction functions, real yields, sovereign flows, and cross-asset correlations.',
  domainMetrics:
    'US10Y Real Yields · Central Bank Policy · DXY Correlation · High-Impact Catalysts',
  artworkPath: '/landing/kestrel-horus-statue.webp',
  accentColor: 'var(--color-info)',
  analysisMode: 'single',
  defaultPrompt:
    'Conduct a macroeconomic horizon assessment on XAUUSD, evaluating real yields, central bank flows, and DXY correlation.',
  roleTag: 'Catalysts',
  motto: 'Rate differentials and macro catalysts drive sustained directional flow.',
  aliases: ['macro', 'economist'],
};

const TECHNICAL_DESK: StrategistDeskConfig = {
  id: 'technical',
  code: 'DESK-II // ASTROLABE',
  title: 'Technical Structure Desk',
  label: 'Technical',
  chipLabel: 'TECH',
  epithet: 'The Mathematical Compass',
  description:
    'Multi-timeframe liquidity sweeps, institutional order blocks, fair value gaps, and displacement footprints.',
  domainMetrics: '4H/1H/15m SMC Structure · Order Blocks · Fair Value Gaps (FVG) · Liquidity Sweeps',
  artworkPath: '/landing/simulator-astrolabe.webp',
  accentColor: 'var(--color-bull)',
  analysisMode: 'single',
  defaultPrompt:
    'Map institutional order blocks, Fair Value Gaps (FVG), and session liquidity sweeps on XAUUSD 4H/15m.',
  roleTag: 'Price Action',
  motto: 'Price structure and liquidity levels define the execution frame.',
  aliases: ['quant', 'technician'],
};

const RISK_DESK: StrategistDeskConfig = {
  id: 'risk',
  code: 'DESK-III // HOPLITE',
  title: 'Quantitative Risk Desk',
  label: 'Risk',
  chipLabel: 'RISK',
  epithet: 'The Impassable Shield',
  description:
    'Immutable 1.0% portfolio drawdown ceiling, ATR-adjusted invalidation stops, and asymmetric expectancy.',
  domainMetrics: 'Immutable 1.0% Drawdown Ceiling · ATR-14 Invalidation Stops · R:R Asymmetry & Veto',
  artworkPath: '/landing/hoplite-spartan-bust.webp',
  accentColor: 'var(--color-warn)',
  analysisMode: 'single',
  defaultPrompt:
    'Calculate strict 1% risk-budget parameters, ATR invalidation level, and multi-tier TP targets for XAUUSD.',
  roleTag: 'Governance',
  motto: 'Every thesis requires an explicit price invalidation level before entry.',
  aliases: ['risk_manager'],
};

const SENTIMENT_DESK: StrategistDeskConfig = {
  id: 'sentiment',
  code: 'DESK-IV // SENTINEL',
  title: 'Flow & Positioning Desk',
  label: 'Sentiment',
  chipLabel: 'FLOW',
  epithet: 'Whale Positioning',
  description:
    'CFTC Commitments of Traders, commercial hedging flows, and retail skew contrarian exhaustion reads.',
  domainMetrics:
    'CFTC Commitments of Traders (COT) · Commercial Hedging · Retail Skew Contrarian Index',
  artworkPath: '/landing/desks-council-strategists.webp',
  accentColor: 'var(--color-brand)',
  analysisMode: 'single',
  defaultPrompt:
    'Analyze CFTC Commitments of Traders (COT) institutional positioning, commercial hedging, and retail skew on XAUUSD.',
  roleTag: 'Sentiment',
  motto: 'Institutional positioning reveals whether a move is crowded or supported.',
  aliases: ['flow'],
};

const ARBITER_DESK_CONFIG: StrategistDeskConfig = {
  id: 'arbiter',
  code: 'STAGE II // ARBITER',
  title: 'Arbiter Council Synthesis',
  label: 'Consensus',
  chipLabel: 'ARBT',
  epithet: 'The Unified Syndicate',
  description:
    'Full multi-agent deliberation: all four specialist desks synthesizing into one decisive execution plan.',
  domainMetrics: 'Cross-Desk Reconciliation · Conflict Resolution · Certified Execution Blueprint',
  artworkPath: '/brand/kestrel-falcon.svg',
  accentColor: 'var(--color-brand)',
  analysisMode: 'full',
  defaultPrompt:
    'Convene the full 4-desk council to deliver an integrated synthesis and execution plan for XAUUSD.',
  roleTag: 'Synthesis',
  motto: 'The council speaks with one verified voice — or stands aside.',
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
 * The 4 Specialist Desks in canonical deliberation order:
 * HORUS (Macro) → ASTROLABE (Technical) → HOPLITE (Risk) → SENTINEL (Flow).
 */
export const FOUR_SPECIALIST_DESKS: readonly StrategistDeskConfig[] = [
  FUNDAMENTAL_DESK,
  TECHNICAL_DESK,
  RISK_DESK,
  SENTIMENT_DESK,
];

/** The `STAGE II // ARBITER` synthesizer. */
export const ARBITER_DESK: StrategistDeskConfig = ARBITER_DESK_CONFIG;

/** Canonical specialist desk ids in deliberation order. */
export const CANONICAL_DESK_ORDER: readonly CanonicalDeskId[] = [
  'fundamental',
  'technical',
  'risk',
  'sentiment',
];

/** Fallback shown when an unknown agent name reaches a desk renderer. */
export const FALLBACK_STRATEGIST_DESK: StrategistDeskConfig = {
  id: 'technical',
  code: 'DESK // SPECIALIST',
  title: 'Specialist Desk',
  label: 'Specialist',
  chipLabel: 'SPEC',
  epithet: 'Independent Lens',
  description: 'Independent specialist analysis.',
  domainMetrics: 'Independent lens',
  artworkPath: '/landing/simulator-astrolabe.webp',
  accentColor: 'var(--color-fg-muted)',
  analysisMode: 'single',
  defaultPrompt: 'Run a specialist analysis on XAUUSD.',
  roleTag: 'Specialist',
  motto: 'Independent analysis.',
  aliases: [],
};

function normalizeDeskKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Resolve any canonical id or legacy alias (`macro`, `economist`, `quant`,
 * `technician`, `risk_manager`, `flow`, `fusion`, `decision`) to its canonical
 * desk config. Unknown keys resolve to the neutral specialist fallback so call
 * sites never have to null-check.
 */
export function resolveStrategistDesk(key: string): StrategistDeskConfig {
  return findStrategistDesk(key) ?? FALLBACK_STRATEGIST_DESK;
}

/** Same as {@link resolveStrategistDesk} but `null` for unknown keys. */
export function findStrategistDesk(key: string): StrategistDeskConfig | null {
  if (!key) return null;
  const normalized = normalizeDeskKey(key);
  for (const desk of Object.values(STRATEGIST_DESKS)) {
    if (desk.id === normalized) return desk;
    if (desk.aliases.includes(normalized)) return desk;
  }
  return null;
}

/**
 * @deprecated Use {@link FOUR_SPECIALIST_DESKS} (canonical order) or
 * {@link STRATEGIST_DESKS}. Kept for the desktop dashboard deck, which renders
 * the four specialist desks under its own "Convene Full Council" CTA.
 */
export const STRATEGIST_DESK_LIST: readonly StrategistDeskConfig[] = FOUR_SPECIALIST_DESKS;
