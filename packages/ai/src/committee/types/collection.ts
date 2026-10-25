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
 * Deterministic packet collection types: the injected collector functions and
 * the typed output of the collect-packet stage, including the A-01/F-01
 * multi-symbol comparison fields.
 */

import type { Symbol } from '@kestrel/shared';
import { z } from 'zod';

import {
  SymbolResearchPacketSchema,
  type SymbolResearchPacket,
} from '../../mastra-v2/packets/symbol-research';
import { MastraAnalysisModeSchema } from './mode';

/** Deterministic evidence packet collector injected into the workflow. */
export type CollectPacketFn = (
  symbol: Symbol,
  signal?: AbortSignal,
) => Promise<SymbolResearchPacket>;

/**
 * A-01 — deterministic multi-symbol packet collector injected into the
 * comparison graph; defaults to the cached `collectMultiSymbolPackets`.
 */
export type CollectComparisonPacketsFn = (
  symbols: readonly Symbol[],
  signal?: AbortSignal,
) => Promise<Map<Symbol, SymbolResearchPacket>>;

/** Typed output of the collect-packet stage. */
export const CollectPacketOutputSchema = z.object({
  packet: SymbolResearchPacketSchema,
  /**
   * A-01: per-symbol packets for `multi-symbol-research` runs. Absent for
   * ordinary single-symbol committee runs (the `packet` field is primary).
   * F-01: comparison runs forward only the healthy (ready) packets here.
   */
  packets: z.record(z.string(), SymbolResearchPacketSchema).optional(),
  /**
   * F-01 — symbols whose packet came back `blocked`. The comparison runs the
   * healthy subset and the fusion must disclose these gaps; only an
   * all-blocked collection fails closed.
   */
  blockedSymbols: z.array(z.string()).optional(),
  /** F-01: the blocked packets' `missingData` lines, for the fusion disclosure. */
  blockedMissingData: z.array(z.string()).optional(),
  prompt: z.string().min(1),
  mode: MastraAnalysisModeSchema,
});
export type CollectPacketOutput = z.infer<typeof CollectPacketOutputSchema>;
