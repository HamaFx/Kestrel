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

/**
 * B-01 (audit 2026-10-18, I-03) — native Mastra registrations for the
 * canonical chat's core market-data tools.
 *
 * The canonical agent registers these names directly (no legacy adapter
 * indirection). The legacy AI SDK modules in `src/tools/` remain the
 * stable shape for non-Mastra consumers and delegate to the same execute
 * cores, so both paths always produce identical numbers.
 */

import { canonicalCandlesTool } from './candles';
import { canonicalCoTTool } from './cot';
import { canonicalIndicatorsTool } from './indicators';
import { canonicalKnowledgeTool } from './knowledge';
import { canonicalMarketStructureTool } from './market-structure';
import { canonicalNewsTool } from './news';
import { canonicalPriceTool } from './price';

export { canonicalCandlesTool } from './candles';
export { canonicalCoTTool } from './cot';
export { canonicalIndicatorsTool } from './indicators';
export { canonicalKnowledgeTool } from './knowledge';
export { canonicalMarketStructureTool } from './market-structure';
export { canonicalNewsTool } from './news';
export { canonicalPriceTool } from './price';

/**
 * Native canonical tools by their legacy registry name (the key the
 * capability manifest and the agent's domain tool filter use).
 */
export const NATIVE_CANONICAL_TOOLS: Readonly<Record<string, unknown>> = {
  get_price: canonicalPriceTool,
  get_candles: canonicalCandlesTool,
  get_indicators: canonicalIndicatorsTool,
  search_knowledge: canonicalKnowledgeTool,
  // I-03 second batch (audit 2026-10-18): news, CoT, and market structure.
  get_news: canonicalNewsTool,
  get_cot: canonicalCoTTool,
  get_market_structure: canonicalMarketStructureTool,
};

/** Resolve a native canonical tool by registry name, or null when not migrated. */
export function resolveNativeCanonicalTool(name: string): unknown | null {
  return NATIVE_CANONICAL_TOOLS[name] ?? null;
}
