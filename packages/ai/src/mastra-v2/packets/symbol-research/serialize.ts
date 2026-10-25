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

// Model-facing serialization: the packet is trimmed (last 12 candles, last 3
// indicator values) before it is handed to a prompt.

import type { SymbolResearchPacket } from './schemas';

export function serializeSymbolResearchPacket(packet: SymbolResearchPacket): string {
  return JSON.stringify({
    ...packet,
    timeframes: packet.timeframes.map((evidence) => ({
      ...evidence,
      candles: evidence.candles.slice(-12),
      indicators: evidence.indicators.map((indicator) => ({
        ...indicator,
        values: indicator.values.slice(-3),
      })),
    })),
  });
}
