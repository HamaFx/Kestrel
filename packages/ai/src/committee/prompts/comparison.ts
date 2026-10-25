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
 * Multi-symbol comparison fusion prompt (A-01 / B-01 / B-08): reads every
 * per-symbol packet and the per-desk opinions from the request context and
 * asks the synthesizer to compare the collected packets and explicitly note
 * divergences. F-01: blocked symbols are restated here so the synthesizer
 * discloses the gap instead of implying the symbol was analysed.
 */

import type { RequestContext } from '@mastra/core/request-context';

import type { SymbolResearchPacket } from '../../mastra-v2/packets/symbol-research';
import type { MastraModeOpinion, ModeRequestContext } from '../types';
import { optionalContextBlock, serializedPacket } from './packet-context';

/**
 * Instructions function for the multi-symbol comparison fusion.
 */
export function comparisonFusionInstructionsForRequest({
  requestContext,
}: {
  requestContext: RequestContext<ModeRequestContext>;
}): string {
  const packetRecord =
    (requestContext.get('packets') as Record<string, SymbolResearchPacket> | undefined) ?? {};
  const packets = Object.values(packetRecord);
  const opinions = (requestContext.get('opinions') as MastraModeOpinion[] | undefined) ?? [];
  const blockedSymbols =
    (requestContext.get('blockedSymbols') as string[] | undefined)?.filter(Boolean) ?? [];
  const blockedMissingData =
    (requestContext.get('blockedMissingData') as string[] | undefined)?.filter(Boolean) ?? [];
  const availableSymbols = packets.map((packet) => packet.symbol);
  const symbols = [...availableSymbols, ...blockedSymbols];
  const packetBlock = packets
    .map(
      (packet) =>
        `### ${packet.symbol}\n${serializedPacket(packet)}\n${optionalContextBlock(packet)}`,
    )
    .join('\n\n');
  const opinionBlock = opinions
    .map((opinion) =>
      [
        `### ${opinion.agentName}${opinion.symbol ? ` (${opinion.symbol})` : ''}`,
        `bias: ${opinion.bias}`,
        `confidence: ${opinion.confidence}`,
        `reasoning: ${opinion.reasoning}`,
        `details: ${JSON.stringify(opinion.rawData)}`,
      ].join('\n'),
    )
    .join('\n\n');
  const blockedBlock =
    blockedSymbols.length > 0
      ? `\n\nDATA UNAVAILABLE (blocked during collection; compare only the symbols whose packets are present and state this gap explicitly):\nData unavailable for: ${blockedSymbols.join(', ')}${
          blockedMissingData.length > 0
            ? `\nReasons:\n${blockedMissingData.map((line) => `- ${line}`).join('\n')}`
            : ''
        }`
      : '';

  return `You are Kestrel's lead market synthesizer comparing ${symbols.join(' vs ') || 'the requested symbols'}.

This comparison run collected per-symbol desk passes — the technical desk and, when enabled, the risk desk — followed by this cross-symbol synthesis. It is not a per-symbol 4-desk committee; describe it as "one desk pass per symbol, then this synthesis", never as multiple full committees.

Compare the collected packets and note divergences. Use only the trusted packets and specialist opinions below. Write in clear, simple, everyday trader language. For each available symbol give its bias and the evidence behind it, then compare them directly: relative strength, trend alignment or divergence, volatility, and what each symbol's key level or invalidation says about the other. Where the desks agree, say so; where they diverge, explain the divergence. Disclose missing or degraded data per symbol, including any symbol whose data could not be collected at all. Do not promise outcomes or invent numbers. Do not place trades. Return a concise user-facing answer with a bottom line per available symbol, the comparison, key risks, and the price level where each idea is wrong (invalidation).

PACKETS:
${packetBlock}

SPECIALIST OPINIONS:
${opinionBlock}${blockedBlock}`;
}
