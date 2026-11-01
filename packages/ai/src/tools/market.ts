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

// PF-13 — Market data tool category.
// Imported by tools/index.ts for self-registration and also exposed
// as a sub-path export: @kestrel/ai/tools/market
//
// P2-01 removal: the natively-migrated market tools (`get_price`,
// `get_candles`, `get_indicators`, `get_market_structure`, `get_cot`) are no
// longer registered here. Their canonical Mastra registrations in
// `mastra-v2/tools/canonical/` are the only implementations; consumers
// resolve them natively (`resolveNativeCanonicalTool`) instead of through
// this legacy registry.

import { getCorrelationTool } from './get-correlation';
import { getIntermarketTool } from './get-intermarket';
import { getIntermarketResonanceTool } from './get-intermarket-resonance';
import { getSeasonalityTool } from './get-seasonality';
import { getSessionLevelsTool } from './get-session-levels';
import { toolRegistry } from './registry';

const marketTools = [
  ['get_correlation', getCorrelationTool],
  ['get_intermarket', getIntermarketTool],
  ['get_intermarket_resonance', getIntermarketResonanceTool],
  ['get_session_levels', getSessionLevelsTool],
  ['get_seasonality', getSeasonalityTool],
] as const;

/**
 * Audit plan §4.3 — explicit registration instead of import side effects.
 * `registerAllTools` calls this exactly once at boot; importing the module
 * no longer mutates the singleton registry.
 */
export function registerMarketTools(registry: typeof toolRegistry = toolRegistry): void {
  for (const [name, tool] of marketTools) {
    registry.register(name, tool);
  }
}

export { toolRegistry };
export type { ToolRegistry } from './registry';
