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

// Evidence rows for the XAUUSD conversation citation gate: the trusted packet
// plus every successful read-only tool output from this turn.

import type { XauusdResearchPacket } from '../../packets/research-types';
import type { MastraToolInvocationPart } from './legacy-tool-adapter';

export function buildConversationToolEvidence(
  packet: XauusdResearchPacket,
  toolParts: readonly MastraToolInvocationPart[],
): Array<{ name: string; resultText: string }> {
  return [
    { name: 'symbol_research_packet', resultText: JSON.stringify(packet) },
    ...toolParts
      .filter((p) => p.state === 'output-available' && p.output !== undefined)
      .map((p) => ({
        name: p.toolName,
        resultText: typeof p.output === 'string' ? p.output : JSON.stringify(p.output),
      })),
  ];
}
