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

import type { XauusdResearchPacket } from './research-types';

export function blockedXauusdResearchText(packet: XauusdResearchPacket): string {
  const missing =
    packet.missingData.length > 0
      ? packet.missingData.join(' ')
      : 'Required XAUUSD market data was unavailable.';
  return [
    'I stopped the XAUUSD analysis because required market evidence was unavailable.',
    missing,
    'I did not fill the missing information from memory. Please retry when the market-data providers are available.',
  ].join('\n\n');
}
