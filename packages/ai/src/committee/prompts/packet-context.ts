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
 * Shared packet helpers for the committee prompts (audit plan §2.2): the
 * serialized packet string is computed once per packet object and reused by
 * the specialist, fusion, and comparison prompts in the same run.
 */

import {
  serializeSymbolResearchPacket,
  type SymbolResearchPacket,
} from '../../mastra-v2/packets/symbol-research';

/** Serialize one packet once and reuse the string across the whole run. */
const packetSerializationCache = new WeakMap<object, string>();

export function serializedPacket(packet: SymbolResearchPacket): string {
  const cached = packetSerializationCache.get(packet);
  if (cached !== undefined) return cached;
  const serialized = serializeSymbolResearchPacket(packet);
  packetSerializationCache.set(packet, serialized);
  return serialized;
}

/**
 * C-01 (audit 2026-10-18, B-05) — optional-context disclosure. Every desk and
 * the synthesizer must be told explicitly whether the fundamental/macro
 * extension was attached for this symbol, so a non-XAUUSD read can never
 * imply macro context was checked when it was not collected.
 */
export function optionalContextBlock(packet: SymbolResearchPacket): string {
  const optional = packet.optionalContext as { available?: boolean; reason?: string } | undefined;
  // Injected/test packets may predate the optionalContext field; disclose
  // nothing rather than crashing the desk prompt.
  if (!optional || typeof optional.reason !== 'string') return '';
  const { available, reason } = optional;
  return available
    ? `OPTIONAL CONTEXT: attached — ${reason}`
    : `OPTIONAL CONTEXT: unavailable — ${reason}\nIf macro/fundamental context matters to your read, state explicitly that it was not checked for this symbol; never imply it was.`;
}
