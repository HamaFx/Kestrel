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

// Symbol-research packet barrel.
//
//   - schemas.ts          — evidence/packet schemas, types, timeframes
//   - indicator-memo.ts   — bounded indicator memo for one collection pass
//   - market-structure.ts — swing/range summary from the collected evidence
//   - collect.ts          — price + candles + optional macro → packet
//   - serialize.ts        — trimmed model-facing serialization
//   - prompt.ts           — read-only prompt guards

// M-02 — the generic macro extension is defined with the macro fetchers (no
// import cycle) and re-exported here alongside the packet type for callers.
export { GenericMacroExtensionSchema } from '../research-packet-macro';
export type { GenericMacroExtension } from '../research-packet-macro';

export {
  MarketStructureSummarySchema,
  SYMBOL_RESEARCH_INDICATORS,
  SYMBOL_RESEARCH_TIMEFRAMES,
  SymbolResearchInputSchema,
  SymbolResearchIndicatorRequestSchema,
  SymbolResearchPacketSchema,
  XauusdExtensionSchema,
  type SymbolResearchEvidence,
  type SymbolResearchPacket,
  type XauusdExtension,
} from './schemas';
export { computeIndicatorMemo } from './indicator-memo';
export { collectSymbolResearchPacket, type CollectSymbolResearchPacketOptions } from './collect';
export { serializeSymbolResearchPacket } from './serialize';
export { extractSymbolFromPrompt, isSafeSymbolResearchPrompt } from './prompt';
