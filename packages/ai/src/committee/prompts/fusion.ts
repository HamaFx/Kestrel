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
 * Fusion (synthesizer) prompt: reads the packet and the four independent
 * verified desk opinions from the request context and instructs the synthesizer
 * to resolve cross-desk conflicts explicitly instead of averaging them away.
 */

import type { RequestContext } from '@mastra/core/request-context';

import type { SymbolResearchPacket } from '../../mastra-v2/packets/symbol-research';
import type { MastraModeOpinion, ModeRequestContext } from '../types';
import { optionalContextBlock, serializedPacket } from './packet-context';

/**
 * Instructions function for the fusion agent: reads the packet and the typed
 * opinions array from the request context instead of JSON-joining opinion
 * objects into the prompt at build time.
 */
export function fusionInstructionsForRequest({
  requestContext,
}: {
  requestContext: RequestContext<ModeRequestContext>;
}): string {
  const packet = requestContext.get('packet') as SymbolResearchPacket | undefined;
  const opinions = (requestContext.get('opinions') as MastraModeOpinion[] | undefined) ?? [];
  const opinionBlock = opinions
    .map((opinion) =>
      [
        `### ${opinion.agentName}`,
        `bias: ${opinion.bias}`,
        `confidence: ${opinion.confidence}`,
        `reasoning: ${opinion.reasoning}`,
        `details: ${JSON.stringify(opinion.rawData)}`,
      ].join('\n'),
    )
    .join('\n\n');

  return `You are Kestrel's lead market synthesizer${packet ? ` for ${packet.symbol}` : ''}.

Use only the trusted packet and the four independent specialist opinions below. The desks ran separately and did not read each other's work, so disagreement is information, not noise.

Write in clear, simple, everyday trader language that is easy for non-technical traders to scan. Your synthesis must:

1. State the bottom line first, and note how many of the four desks support it.
2. Highlight where the desks align, citing the shared evidence.
3. Explicitly surface every material disagreement between desks (for example, technical structure is bullish while fundamental or risk flags rising real yields or an upcoming high-impact release). Name the desks, give each side's strongest evidence, and adjudicate the conflict. Weigh each desk equally: do not invent confidence multipliers, rank desks, or let one desk override another without evidence from the packet.
4. Include bull/base/bear scenarios, key risks, and the price level where the idea is wrong (invalidation).
5. Disclose missing or degraded packet data.

Do not promise outcomes, invent numbers, or place trades. Because the packet data may be stale, missing, or degraded, state that clearly whenever the packet says so. Return a concise user-facing answer.

${packet ? `PACKET:\n${serializedPacket(packet)}\n\n${optionalContextBlock(packet)}\n\n` : ''}SPECIALIST OPINIONS:
${opinionBlock}`;
}
