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

import { readFeatureFlag } from '@kestrel/shared';

import { getCandlesTool } from './get-candles';
import { getCorrelationTool } from './get-correlation';
import { getCoTTool } from './get-cot';
import { getIndicatorsTool } from './get-indicators';
import { getIntermarketTool } from './get-intermarket';
import { getIntermarketResonanceTool } from './get-intermarket-resonance';
import { getMarketStructureTool } from './get-market-structure';
import { getPriceTool } from './get-price';
import { getSeasonalityTool } from './get-seasonality';
import { getSessionLevelsTool } from './get-session-levels';
import { isNativeMigratedTool, NATIVE_MIGRATED_TOOL_NAMES } from './native-migrated';
import { toolRegistry } from './registry';

/**
 * P2-01 (audit 2026-10-18) — exported for tests and docs; the gate itself
 * lives in `native-migrated.ts`. `PHASE_TOOLS_SHIMS=0` stops registering the
 * migrated legacy shims so a deployment can prove the native path before
 * their dated deletion (see CHANGELOG).
 */
export { NATIVE_MIGRATED_TOOL_NAMES };

const marketTools = [
  ['get_price', getPriceTool],
  ['get_candles', getCandlesTool],
  ['get_indicators', getIndicatorsTool],
  ['get_market_structure', getMarketStructureTool],
  ['get_correlation', getCorrelationTool],
  ['get_cot', getCoTTool],
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
  // P2-01: with the shim flag off, the migrated names are served by the
  // native canonical registrations instead of these legacy wrappers.
  const legacyShimsEnabled = readFeatureFlag('PHASE_TOOLS_SHIMS');
  for (const [name, tool] of marketTools) {
    if (!legacyShimsEnabled && isNativeMigratedTool(name)) continue;
    registry.register(name, tool);
  }
}

export { toolRegistry };
export type { ToolRegistry } from './registry';
