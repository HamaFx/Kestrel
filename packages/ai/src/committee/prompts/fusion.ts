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
 * Fusion (synthesizer) prompts: the request-context instructions function that
 * reads the typed opinions and peer reviews instead of build-time JSON joins
 * (audit plan §2.2), plus the deprecated build-time prompt retained for one
 * release.
 */

import type { RequestContext } from '@mastra/core/request-context';

import {
  serializeSymbolResearchPacket,
  type SymbolResearchPacket,
} from '../../mastra-v2/packets/symbol-research';
import { deskReliabilityBlock, type DeskReliabilityWeights } from '../calibration-weights';
import type { CommitteeCritique, MastraModeOpinion, ModeRequestContext } from '../types';
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
  const critiques = (requestContext.get('critiques') as CommitteeCritique[] | undefined) ?? [];
  // Phase 3 — empirical desk reliability from graded historical calls. Present
  // only when the run context loaded it (full mode with enough Brier samples).
  const deskReliability = requestContext.get('deskReliability') as
    DeskReliabilityWeights | undefined;
  const reliabilityBlock = deskReliability ? `\n\n${deskReliabilityBlock(deskReliability)}` : '';
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
  const critiqueBlock = critiques
    .map((critique) =>
      [
        `### ${critique.agentName} peer review`,
        `confirms own view: ${critique.confirms}`,
        `revised confidence: ${critique.revisedConfidence}`,
        `critique: ${critique.critique}`,
      ].join('\n'),
    )
    .join('\n\n');

  return `You are Kestrel's lead market synthesizer${packet ? ` for ${packet.symbol}` : ''}.

Use only the trusted packet and specialist opinions below. Write in clear, simple, everyday trader language that is easy for non-technical traders to scan. State where the experts agree and where they disagree, and when peer reviews are present, explain how the experts responded to each other's arguments (e.g. "3 of 4 experts lean bullish after peer review"). Disclose missing or degraded data, and use scenario language. Do not promise outcomes or invent numbers. Do not place trades. Return a concise user-facing answer with a clear bottom line, why the team agrees or disagrees, bull/base/bear scenarios, key risks, and the price level where this idea is wrong (invalidation).

${packet ? `PACKET:\n${serializedPacket(packet)}\n\n${optionalContextBlock(packet)}\n\n` : ''}SPECIALIST OPINIONS:
${opinionBlock}${critiqueBlock ? `\n\nSPECIALIST PEER REVIEWS:\n${critiqueBlock}` : ''}${reliabilityBlock}`;
}

/** @deprecated Build-time fusion prompt retained for one release (§2.2). */
export function fusionInstructions(
  packet: SymbolResearchPacket,
  opinions: MastraModeOpinion[],
): string {
  const opinionBlock = opinions.map((opinion) => JSON.stringify(opinion)).join('\n');
  return `You are Kestrel's Mastra decision synthesizer for ${packet.symbol}.

Use only the trusted packet and specialist opinions below. State agreement and disagreement, disclose missing or degraded data, and use scenario language. Do not promise outcomes or invent numbers. Do not place trades. Return a concise user-facing markdown answer with a bottom line, evidence-aware reasoning, risks, and invalidation conditions.

PACKET:
${serializeSymbolResearchPacket(packet)}

SPECIALIST OPINIONS:
${opinionBlock}`;
}
