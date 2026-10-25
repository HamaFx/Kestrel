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

// Fresh-only cacheability predicate for the generalized packet.

import type { SymbolResearchPacket } from '../symbol-research';

/**
 * Q5 (fresh-only) cacheability for the generalized packet. A packet is
 * cacheable only when every evidence piece was fresh.
 */
export function isFreshCacheablePacket(packet: SymbolResearchPacket): boolean {
  if (packet.status !== 'ready') return false;
  if (packet.missingData.length > 0 || packet.warnings.length > 0) return false;
  if (packet.dataQuality !== 'complete') return false;
  if (packet.price?.freshness !== 'fresh') return false;
  return packet.timeframes.every(
    (evidence) => evidence.freshness === 'fresh' && evidence.quality === 'complete',
  );
}
