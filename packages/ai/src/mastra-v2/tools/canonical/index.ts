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
 * indirection). P2-01 removal: the one-release AI SDK shims were deleted on
 * 2026-11-01, so these `createTool` registrations are the only
 * implementations of the seven names.
 *
 * Phase 4 Task 2: the remaining read-only tools live in `../read-only` and are
 * merged into `nativeCanonicalTools()` below, so this module is the single
 * native tool map for read-only agents.
 */

import { nativeReadOnlyTools } from '../read-only';
import { canonicalCandlesTool } from './candles';
import { canonicalCoTTool } from './cot';
import { canonicalIndicatorsTool } from './indicators';
import { canonicalKnowledgeTool } from './knowledge';
import { canonicalMarketStructureTool } from './market-structure';
import { canonicalNewsTool } from './news';
import { canonicalPriceTool } from './price';

/**
 * Native canonical tools by their legacy registry name (the key the
 * capability manifest and the agent's domain tool filter use).
 *
 * Built lazily on first use rather than as a module-scope literal: this module
 * sits inside the canonical ↔ legacy-adapter ↔ instance ↔ tools import cycle,
 * so an eager literal reads sibling tool bindings while they may still be
 * initialising — `ReferenceError: Cannot access 'canonicalCoTTool' before
 * initialization`, which production only reports as a masked React error #441
 * with a digest. Every consumer either resolves by name or enumerates the map
 * at call time, so deferring construction is invisible to them.
 *
 * Phase 4 Task 2: the map now also carries the remaining read-only tools
 * (`../read-only`), so every manifest name resolves without a legacy
 * adaptation step.
 */
let nativeCanonicalToolsCache: Readonly<Record<string, unknown>> | null = null;

export function nativeCanonicalTools(): Readonly<Record<string, unknown>> {
  nativeCanonicalToolsCache ??= {
    get_price: canonicalPriceTool,
    get_candles: canonicalCandlesTool,
    get_indicators: canonicalIndicatorsTool,
    search_knowledge: canonicalKnowledgeTool,
    // I-03 second batch (audit 2026-10-18): news, CoT, and market structure.
    get_news: canonicalNewsTool,
    get_cot: canonicalCoTTool,
    get_market_structure: canonicalMarketStructureTool,
    // Phase 4 Task 2: every other read-only tool registers natively too.
    ...nativeReadOnlyTools(),
  };
  return nativeCanonicalToolsCache;
}

/** Resolve a native canonical tool by registry name, or null when not migrated. */
export function resolveNativeCanonicalTool(name: string): unknown | null {
  return nativeCanonicalTools()[name] ?? null;
}
