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

export type StrategistDeskId = 'macro' | 'quant' | 'risk' | 'arbiter';

export interface StrategistDeskConfig {
  id: StrategistDeskId;
  code: string;
  title: string;
  epithet: string;
  description: string;
  artworkPath: string;
  accentColor: string;
  analysisMode: AnalysisMode;
  defaultPrompt: string;
}

export const STRATEGIST_DESKS: Record<StrategistDeskId, StrategistDeskConfig> = {
  macro: {
    id: 'macro',
    code: 'DESK-I // HORUS',
    title: 'Macroeconomic Horizon',
    epithet: 'The All-Seeing Horizon',
    description: 'Central bank reaction functions, real yields, sovereign flows, and cross-asset correlations.',
    artworkPath: '/landing/kestrel-horus-statue.webp',
    accentColor: '#D4AF37',
    analysisMode: 'single',
    defaultPrompt: 'Conduct a macroeconomic horizon assessment on XAUUSD, evaluating real yields, central bank flows, and DXY correlation.',
  },
  quant: {
    id: 'quant',
    code: 'DESK-II // ASTROLABE',
    title: 'Quantitative Structure',
    epithet: 'The Mathematical Compass',
    description: 'Multi-timeframe liquidity sweeps, institutional order blocks, fair value gaps, and displacement footprints.',
    artworkPath: '/landing/simulator-astrolabe.webp',
    accentColor: '#7DD3FC',
    analysisMode: 'single',
    defaultPrompt: 'Map institutional order blocks, Fair Value Gaps (FVG), and session liquidity sweeps on XAUUSD 4H/15m.',
  },
  risk: {
    id: 'risk',
    code: 'DESK-III // HOPLITE',
    title: 'Quantitative Risk & Veto',
    epithet: 'The Impassable Shield',
    description: 'Immutable 1.0% portfolio drawdown ceiling, ATR-adjusted invalidation stops, and asymmetric expectancy.',
    artworkPath: '/landing/hoplite-spartan-bust.webp',
    accentColor: '#F87171',
    analysisMode: 'single',
    defaultPrompt: 'Calculate strict 1% risk-budget parameters, ATR invalidation level, and multi-tier TP targets for XAUUSD.',
  },
  arbiter: {
    id: 'arbiter',
    code: 'DESK-IV // COUNCIL',
    title: 'Arbiter Council Chamber',
    epithet: 'The Unified Syndicate',
    description: 'Full multi-agent deliberation: Macro, Quant, and Risk desks synthesizing into one decisive execution plan.',
    artworkPath: '/landing/desks-council-strategists.webp',
    accentColor: '#F4F1EA',
    analysisMode: 'full',
    defaultPrompt: 'Convene the full 4-strategist council to deliver an integrated synthesis and execution plan for XAUUSD.',
  },
};

export const STRATEGIST_DESK_LIST: StrategistDeskConfig[] = [
  STRATEGIST_DESKS.macro,
  STRATEGIST_DESKS.quant,
  STRATEGIST_DESKS.risk,
  STRATEGIST_DESKS.arbiter,
];
